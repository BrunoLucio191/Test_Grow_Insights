import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { listClients, syncClient } from "@/lib/analytics.functions";
import { ClientSidebar } from "@/components/begrow/ClientSidebar";
import { DashboardHeader } from "@/components/begrow/DashboardHeader";
import { PaidTab } from "@/components/begrow/PaidTab";
import { OrganicTab } from "@/components/begrow/OrganicTab";
import { AiTab } from "@/components/begrow/AiTab";
import { Toaster } from "@/components/ui/sonner";
import type { DateRange } from "@/lib/analytics-types";
import { TrendingUp, Radio, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
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

function defaultRange(): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 13);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function Dashboard() {
  const qc = useQueryClient();
  const fn = useServerFn(listClients);
  const syncFn = useServerFn(syncClient);
  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: () => fn(),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (clients?.length && !selectedId) setSelectedId(clients[0].id);
  }, [clients, selectedId]);

  const selected = clients?.find((c) => c.id === selectedId) ?? null;

  const onSync = async () => {
    if (!selectedId) return;
    setSyncing(true);
    try {
      await syncFn({ data: { clientId: selectedId, range } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["paid", selectedId] }),
        qc.invalidateQueries({ queryKey: ["organic", selectedId] }),
      ]);
      toast.success("Dados sincronizados com a Meta");
    } catch (e: any) {
      toast.error(`Falha na sincronização: ${e?.message ?? "erro desconhecido"}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Toaster />
      <ClientSidebar
        clients={clients ?? []}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      <main className="flex-1 overflow-x-hidden">
        {isLoading || !selected ? (
          <div className="p-8">
            <Skeleton className="h-12 w-64" />
            <div className="mt-8 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          </div>
        ) : (
          <>
            <DashboardHeader
              clientName={selected.name}
              range={range}
              onRangeChange={setRange}
              onSync={onSync}
              syncing={syncing}
            />
            <div className="px-6 py-6">
              <Tabs defaultValue="paid" className="space-y-6">
                <TabsList className="bg-card/60">
                  <TabsTrigger value="paid" className="gap-2">
                    <TrendingUp className="h-4 w-4" /> Tráfego Pago
                  </TabsTrigger>
                  <TabsTrigger value="organic" className="gap-2">
                    <Radio className="h-4 w-4" /> Orgânico
                  </TabsTrigger>
                  <TabsTrigger value="ai" className="gap-2">
                    <Sparkles className="h-4 w-4" /> AI Optimizer
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="paid">
                  <PaidTab clientId={selected.id} range={range} />
                </TabsContent>
                <TabsContent value="organic">
                  <OrganicTab clientId={selected.id} range={range} />
                </TabsContent>
                <TabsContent value="ai">
                  <AiTab clientId={selected.id} clientName={selected.name} range={range} />
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
