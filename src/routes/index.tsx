import { useEffect, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { syncPaid, syncOrganic, getCacheStatus } from "@/lib/syncClient";
import { listClients } from "@/lib/clientes.server";
import { ClientSidebar } from "@/components/begrow/ClientSidebar";
import { EmptyDateState } from "@/components/begrow/EmptyDateState";
import { DashboardHeader, type SyncProgress } from "@/components/begrow/DashboardHeader";
import { ClientSettingsDialog } from "@/components/begrow/ClientSettingsDialog";
import { PaidTab } from "@/components/begrow/PaidTab";
import OrganicTab from "@/components/begrow/OrganicTab";
import { Toaster } from "@/components/ui/sonner";
import { DEFAULT_ATTRIBUTION, type DateRange, type AttributionWindow } from "@/lib/analytics-types";
import { validateClient } from "@/lib/utils";
import { TrendingUp, Radio, Menu, Sidebar } from "lucide-react";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/utils";
import { useSessionStorage } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Dashboard,
  beforeLoad: ({ context }) => {
    if (!context.authState.isAuthenticated) {
      throw redirect({
        to: "/login",
      });
    }
  },
  head: () => ({
    meta: [
      { title: "BeGrow OS — Analytics & AI Insights" },
      {
        name: "description",
        content:
          "Dashboard multi-cliente para agências: tráfego pago Meta, orgânico Facebook/Instagram e otimização com IA.",
      },
    ],
  }),
});

function Dashboard() {
  const queryClient = useQueryClient();
  const listClientsFunction = useServerFn(listClients);
  const syncPaidFunction = useServerFn(syncPaid);
  const syncOrganicFunction = useServerFn(syncOrganic);
  const cacheStatusFunction = useServerFn(getCacheStatus);
  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: () => listClientsFunction(),
  });
  const [selectedId, setSelectedId] = useSessionStorage<string | null>("cliente_selecionado", null);
  const [range, setRange] = useSessionStorage("meu_range", { from: "", to: "" });
  const [attribution, setAttribution] = useSessionStorage<AttributionWindow>(
    "minha_attr",
    "7d_click",
  );
  const [settingsOpen, setSettingsOpen] = useSessionStorage("menu_aberto", false);
  const [sideBarOff, setSidebarOff] = useSessionStorage("sidebar_fechada", true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    paid: "idle",
    organic: "idle",
  });

  const selected = clients?.find((client) => client.id === selectedId) ?? null;

  useEffect(() => {
    if (selected?.attribution_window) {
      setAttribution(selected.attribution_window as AttributionWindow);
    } else {
      setAttribution(DEFAULT_ATTRIBUTION);
    }
  }, [selected?.id, selected?.attribution_window, setAttribution]);

  const { data: cacheStatus } = useQuery({
    queryKey: ["cache-status", selectedId, range.from, range.to, attribution],
    queryFn: () => cacheStatusFunction({ data: { clientId: selectedId!, range, attribution } }),
    enabled: !!selectedId,
    refetchInterval: 60_000,
  });

  const onSync = async () => {
    if (!selectedId || !selected) return;
    const v = validateClient(selected);
    if (!v.anyOk) {
      toast.error("IDs incompletos. Configure os IDs Meta antes de sincronizar.", {
        action: { label: "Configurar", onClick: () => setSettingsOpen(true) },
      });
      return;
    }
    if (!v.paidOk || !v.organicOk) {
      toast.warning(
        `Faltando: ${v.missing.join(", ")} — sincronizando apenas os escopos disponíveis.`,
      );
    }

    setSyncing(true);
    setSyncProgress({
      paid: v.paidOk ? "running" : "idle",
      organic: v.organicOk ? "running" : "idle",
    });

    const runPaid = v.paidOk
      ? syncPaidFunction({ data: { clientId: selectedId, range, attribution } })
          .then(() => {
            setSyncProgress((p) => ({ ...p, paid: "done" }));
            queryClient.invalidateQueries({ queryKey: ["paid", selectedId] });
          })
          .catch((error: unknown) => {
            setSyncProgress((p) => ({ ...p, paid: "error" }));
            toast.error(`Pago: ${getErrorMessage(error) ?? "erro"}`);
          })
      : Promise.resolve();

    const runOrganic = v.organicOk
      ? syncOrganicFunction({ data: { clientId: selectedId, range } })
          .then(() => {
            setSyncProgress((p) => ({ ...p, organic: "done" }));
            queryClient.invalidateQueries({ queryKey: ["organic", selectedId] });
          })
          .catch((error: unknown) => {
            console.log(`quero saber oq isso faz${error}`);
            setSyncProgress((p) => ({ ...p, organic: "error" }));
            toast.error(`Orgânico: ${getErrorMessage(error) ?? "erro"}`);
          })
      : Promise.resolve();

    await Promise.allSettled([runPaid, runOrganic]);
    await queryClient.invalidateQueries({
      queryKey: ["cache-status", selectedId, range.from, range.to],
    });
    toast.success("Sincronização concluída");
    setSyncing(false);
    setTimeout(() => setSyncProgress({ paid: "idle", organic: "idle" }), 2500);
  };

  function handleTurnSideBarOff(): void {
    setSidebarOff((prev: boolean) => !prev);
  }

  return (
    <div className="flex relative h-screen overflow-hidden bg-background">
      <Toaster />
      <ClientSidebar
        clients={clients ?? []}
        selectedId={selectedId}
        onSelect={setSelectedId}
        isOpen={sideBarOff}
      />

      <main className="flex-1 relative z-50 flex flex-col overflow-x-hidden overflow-y-auto">
        {" "}
        {isLoading || !selected ? (
          <div className="p-8">
            <Skeleton className="h-7 w-64" />
            <div className="mt-8 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          </div>
        ) : (
          <>
            <>
              {/* 1. O HEADER (Fica no próprio quadrado, com z-30 pra sempre ficar por cima de tudo e 100% clicável) */}
              <div className="relative z-50">
                <DashboardHeader
                  client={selected}
                  range={range}
                  onRangeChange={setRange}
                  attribution={attribution}
                  onAttributionChange={setAttribution}
                  onSync={onSync}
                  onOpenSettings={() => setSettingsOpen(true)}
                  syncing={syncing}
                  syncProgress={syncProgress}
                  cacheStatus={cacheStatus ?? null}
                  toggleSideBar={handleTurnSideBarOff}
                  sideBarOff={sideBarOff}
                />
              </div>

              <ClientSettingsDialog
                client={selected}
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
              />

              <div className=" z-10 px-6 py-6 flex-1">
                {(!range.from || !range.to) && (
                  <div className="absolute  inset-0 z-20 p-6">
                    <EmptyDateState className="h-full w-full  justify-center bg-background/60 backdrop-blur-sm" />
                  </div>
                )}

                <div
                  className={cn(
                    "transition-all duration-500",
                    (!range.from || !range.to) && "pointer-events-none opacity-30 blur-[2px]",
                  )}
                >
                  <Tabs defaultValue="paid" className="space-y-6">
                    <TabsList className="bg-card/60">
                      <TabsTrigger value="paid" className="gap-2">
                        <TrendingUp className="h-4 w-4" /> Tráfego Pago
                      </TabsTrigger>
                      <TabsTrigger value="organic" className="gap-2">
                        <Radio className="h-4 w-4" /> Orgânico
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="paid">
                      <PaidTab
                        clientId={selected.id}
                        clientName={selected.name}
                        range={range}
                        attribution={attribution}
                      />
                    </TabsContent>
                    <TabsContent value="organic">
                      <OrganicTab clientId={selected.id} range={range} />
                    </TabsContent>
                    <TabsContent value="ai"></TabsContent>
                  </Tabs>
                </div>
              </div>
            </>
          </>
        )}
      </main>
    </div>
  );
}
