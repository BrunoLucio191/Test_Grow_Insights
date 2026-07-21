import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardHeader } from "../components/begrow/DashboardHeader";
import { PaidTab } from "../components/begrow/PaidTab";
import OrganicTab from "../components/begrow/OrganicTab";
import { TrendingUp, Radio } from "lucide-react";
import { type DateRange, type AttributionWindow, ClientRow } from "@/lib/analytics-types";
import { buscarLinkCompartilhavel } from "../serverFunctions/shared-links.server";
import { PaidData, PaidKpis, TopPost } from "@/lib/analytics-types";
import { Loader2 } from "lucide-react";
import { useDarkMode } from "@/hooks/dark-theme";

export const Route = createFileRoute("/shared/$token")({
  component: Dashboard,
  head: () => ({
    meta: [{ title: "Dashboard Compartilhado — BeGrow OS" }],
  }),
});
interface SharedDashboardPayload {
  paidData: PaidData;
  organic_data: {
    kpis: PaidKpis;
    topPosts: TopPost[];
  };
  meta: {
    clientId: string;
    clientName: string;
    range: { from: string; to: string };
    attribution: AttributionWindow;
  };
}

function Dashboard() {
  const queryClient = useQueryClient();

  const { token } = Route.useParams();
  const buscarLinkFn = useServerFn(buscarLinkCompartilhavel);

  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [attribution, setAttribution] = useState<AttributionWindow>("7d_click,1d_view");
  const { theme } = useDarkMode();

  const {
    data: rawSnapshot,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["shared-snapshot", token],
    queryFn: () => buscarLinkFn({ data: token }),
  });

  const snapshot = rawSnapshot as SharedDashboardPayload | undefined;

  useEffect(() => {
    if (snapshot && snapshot.meta) {
      const { paidData, organic_data, meta } = snapshot;

      setRange(meta.range);
      setAttribution(meta.attribution);

      queryClient.setQueryData(
        ["paid", meta.clientId, meta.range.from, meta.range.to, meta.attribution],
        paidData,
      );

      // Alimenta o cache do Orgânico
      queryClient.setQueryData(["organic_kpis", meta.clientId], organic_data.kpis);
      queryClient.setQueryData(["organic_posts", meta.clientId], organic_data.topPosts);
    }
  }, [snapshot, queryClient]);

  if (isLoading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  if (error || !snapshot)
    return <div className="p-12 text-destructive">Link inválido, inexistente ou expirado.</div>;

  const mockClient: ClientRow = {
    id: snapshot.meta?.clientId,
    name: snapshot.meta?.clientName || "Cliente Compartilhado",
    meta_ad_account_id: null,
    meta_page_id: null,
    ig_account_id: null,
    conversion_event: null,
    attribution_window: null,
  };
  return (
    <div className="flex h-screen overflow-hidden bg-background w-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="relative z-30">
          <DashboardHeader
            client={mockClient}
            range={range}
            onRangeChange={() => {}}
            attribution={attribution}
            onAttributionChange={() => {}}
            onSync={async () => {}}
            onOpenSettings={() => {}}
            syncing={false}
            syncProgress={{ paid: "idle", organic: "idle" }}
            cacheStatus={null}
            isShared={true}
            sideBarOff={false}
            toggleSideBar={() => {}}
            buttonTabOff={false}
            theme={theme}
            toggleTheme={() => {}}
          />
        </div>

        <div className="relative z-10 px-6 py-6 flex-1 overflow-y-auto">
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
                clientId={snapshot.meta.clientId}
                clientName={mockClient.name}
                range={range}
                attribution={attribution}
              />
            </TabsContent>

            <TabsContent value="organic">
              {/* Mesma coisa aqui */}
              <OrganicTab clientId={snapshot.meta.clientId} range={range} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
