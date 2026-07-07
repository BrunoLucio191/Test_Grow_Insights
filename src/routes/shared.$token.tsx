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
import { buscarLinkCompartilhavel } from "../lib/shared-links.server";
import { PaidData, PaidKpis, TopPost } from "@/lib/analytics-types";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/shared/$token")({
  component: Dashboard,
  head: () => ({
    meta: [{ title: "Dashboard Compartilhado — BeGrow OS" }],
  }),
});

interface SharedDashboardPayload {
  paidData: PaidData; // Substitua por 'PaidData' se tiver o tipo importado
  organic_data: {
    kpis: PaidKpis; // Substitua por 'OrganicKpis'
    topPosts: TopPost[]; // Substitua por 'TopPost[]'
  };
  meta: {
    clientId: string;
    clientName: string;
    range: { from: string; to: string };
    attribution: AttributionWindow;
  };
}

function Dashboard() {
  const qc = useQueryClient();

  const { token } = Route.useParams();
  const buscarLinkFn = useServerFn(buscarLinkCompartilhavel);

  // Estados locais para controlar o que o Header e as abas vão exibir
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [attribution, setAttribution] = useState<AttributionWindow>("7d_click,1d_view");

  // 3. Busca o snapshot usando o seu buscarLinkCompartilhavel
  const {
    data: rawSnapshot,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["shared-snapshot", token],
    queryFn: () => buscarLinkFn({ data: token }),
  });

  // 2. AQUI ESTÁ A MÁGICA: Avisa o TypeScript qual é o formato real do dado
  const snapshot = rawSnapshot as SharedDashboardPayload | undefined;

  // 4. MÁGICA: Alimenta o cache do React Query com o seu snapshot
  useEffect(() => {
    if (snapshot && snapshot.meta) {
      const { paidData, organic_data, meta } = snapshot;

      // Atualiza os estados da tela com as datas em que o link foi gerado
      setRange(meta.range);
      setAttribution(meta.attribution);

      // Alimenta o cache do Tráfego Pago usando a chave exata que o PaidTab espera
      qc.setQueryData(
        ["paid", meta.clientId, meta.range.from, meta.range.to, meta.attribution],
        paidData,
      );

      // Alimenta o cache do Orgânico
      qc.setQueryData(["organic_kpis", meta.clientId], organic_data.kpis);
      qc.setQueryData(["organic_posts", meta.clientId], organic_data.topPosts);
    }
  }, [snapshot, qc]);

  if (isLoading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  if (error || !snapshot)
    return <div className="p-12 text-destructive">Link inválido, inexistente ou expirado.</div>;

  // Monta um objeto de cliente fictício apenas para o Header renderizar o nome correto
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
            onRangeChange={() => {}} // Bloqueado para o cliente externo
            attribution={attribution}
            onAttributionChange={() => {}} // Bloqueado para o cliente externo
            onSync={async () => {}} // Bloqueado
            onOpenSettings={() => {}} // Bloqueado
            syncing={false}
            syncProgress={{ paid: "idle", organic: "idle" }}
            cacheStatus={null}
            isShared={true}
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
              {/* Quando o PaidTab der o useQuery interno dele, os dados já vão estar no cache esperando por ele! */}
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
