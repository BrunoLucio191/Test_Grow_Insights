import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  DollarSign,
  TrendingUp,
  Target,
  MousePointerClick,
  Eye,
  Users,
  Repeat,
  Percent,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchMetaAdsData } from "@/lib/analytics.functions";
import type { DateRange, Campaign } from "@/lib/analytics-types";
import { KpiCard } from "./KpiCard";
import { CampaignDetailDialog } from "./CampaignDetailDialog";

const fmt = (n: number, opts: Intl.NumberFormatOptions = {}) =>
  new Intl.NumberFormat("pt-BR", opts).format(n);
const brl = (n: number) => fmt(n, { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (n: number) => `${fmt(n, { maximumFractionDigits: 2 })}%`;

export function PaidTab({ clientId, range }: { clientId: string; range: DateRange }) {
  const fn = useServerFn(fetchMetaAdsData);
  const { data, isLoading } = useQuery({
    queryKey: ["paid", clientId, range.from, range.to],
    queryFn: () => fn({ data: { clientId, range } }),
  });

  const [selected, setSelected] = useState<Campaign | null>(null);

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Primary KPIs */}
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Valor Investido" value={brl(data.kpis.spend)} icon={DollarSign} />
        <KpiCard label="Receita" value={brl(data.kpis.revenue)} icon={TrendingUp} />
        <KpiCard label="ROAS" value={`${fmt(data.kpis.roas, { maximumFractionDigits: 2 })}x`} icon={TrendingUp} />
        <KpiCard label="Resultados" value={fmt(data.kpis.conversions)} icon={Target} />
        <KpiCard label="CPA" value={brl(data.kpis.cpa)} icon={Target} />
      </div>

      {/* Secondary KPIs */}
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Impressões" value={fmt(data.kpis.impressions)} icon={Eye} />
        <KpiCard label="Cliques" value={fmt(data.kpis.clicks)} icon={MousePointerClick} />
        <KpiCard label="CTR" value={pct(data.kpis.ctr)} icon={MousePointerClick} />
        <KpiCard label="CPM" value={brl(data.kpis.cpm)} icon={Eye} />
        <KpiCard label="Alcance" value={fmt(data.kpis.reach)} icon={Users} />
        <KpiCard
          label="Frequência"
          value={fmt(data.kpis.frequency, { maximumFractionDigits: 2 })}
          icon={Repeat}
        />
      </div>

      <Card className="border-border/60 bg-card/60 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Investimento, Receita e ROAS</h3>
            <p className="text-sm text-muted-foreground">Evolução diária no período</p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div className="flex items-center justify-end gap-2">
              <Percent className="h-3 w-3" />
              Taxa de conversão: <span className="font-semibold text-foreground">{pct(data.kpis.conversionRate)}</span>
            </div>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.timeseries} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis yAxisId="left" stroke="var(--color-chart-1)" fontSize={11} />
              <YAxis yAxisId="right" orientation="right" stroke="var(--color-chart-2)" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line yAxisId="left" type="monotone" dataKey="spend" name="Investido (R$)" stroke="var(--color-chart-1)" strokeWidth={2.5} dot={false} />
              <Line yAxisId="left" type="monotone" dataKey="revenue" name="Receita (R$)" stroke="var(--color-chart-3)" strokeWidth={2.5} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="roas" name="ROAS (x)" stroke="var(--color-chart-2)" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="border-border/60 bg-card/60">
        <div className="border-b border-border/60 p-6 pb-4">
          <h3 className="text-base font-semibold">Campanhas</h3>
          <p className="text-sm text-muted-foreground">
            {data.campaigns.length} campanhas · clique para ver detalhes
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Campanha</th>
                <th className="px-4 py-3 font-medium">Objetivo</th>
                <th className="px-4 py-3 text-right font-medium">Gasto</th>
                <th className="px-4 py-3 text-right font-medium">Resultados</th>
                <th className="px-4 py-3 text-right font-medium">CPA</th>
                <th className="px-4 py-3 text-right font-medium">ROAS</th>
                <th className="px-4 py-3 text-right font-medium">CTR</th>
                <th className="w-8 px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer border-b border-border/40 last:border-0 transition-colors hover:bg-muted/30"
                  onClick={() => setSelected(c)}
                >
                  <td className="px-4 py-4">
                    <Badge
                      variant="outline"
                      className={
                        c.status === "ACTIVE"
                          ? "border-[color:var(--success)]/40 bg-[color:var(--success)]/10 text-[color:var(--success)]"
                          : c.status === "PAUSED"
                            ? "border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 text-[color:var(--warning)]"
                            : "border-border bg-muted text-muted-foreground"
                      }
                    >
                      {c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-4 font-medium text-foreground">{c.name}</td>
                  <td className="px-4 py-4 text-xs text-muted-foreground">{c.objective}</td>
                  <td className="px-4 py-4 text-right tabular-nums">{brl(c.spent)}</td>
                  <td className="px-4 py-4 text-right tabular-nums font-semibold">{fmt(c.results)}</td>
                  <td className="px-4 py-4 text-right tabular-nums">{c.cpa > 0 ? brl(c.cpa) : "—"}</td>
                  <td className="px-4 py-4 text-right tabular-nums">
                    {c.roas > 0 ? `${fmt(c.roas, { maximumFractionDigits: 2 })}x` : "—"}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums">{pct(c.ctr)}</td>
                  <td className="px-2 py-4 text-muted-foreground">
                    <ChevronRight className="h-4 w-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <CampaignDetailDialog
        clientId={clientId}
        campaign={selected}
        range={range}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
      />
    </div>
  );
}
