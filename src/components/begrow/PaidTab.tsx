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
import { DollarSign, TrendingUp, Target, MousePointerClick, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchMetaAdsData } from "@/lib/analytics.functions";
import type { DateRange } from "@/lib/analytics-types";
import { KpiCard } from "./KpiCard";

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
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Valor Investido" value={brl(data.kpis.spend)} icon={DollarSign} delta="+12% vs período anterior" trend="up" />
        <KpiCard label="ROAS" value={`${fmt(data.kpis.roas, { maximumFractionDigits: 2 })}x`} icon={TrendingUp} delta="+0.4x" trend="up" />
        <KpiCard label="CPA" value={brl(data.kpis.cpa)} icon={Target} delta="-8%" trend="up" />
        <KpiCard label="CTR" value={pct(data.kpis.ctr)} icon={MousePointerClick} delta="+0.3pp" trend="up" />
        <KpiCard label="CPM" value={brl(data.kpis.cpm)} icon={Eye} delta="+5%" trend="down" />
      </div>

      <Card className="border-border/60 bg-card/60 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Investimento vs ROAS</h3>
            <p className="text-sm text-muted-foreground">Evolução diária no período</p>
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
              <Line yAxisId="right" type="monotone" dataKey="roas" name="ROAS (x)" stroke="var(--color-chart-2)" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="border-border/60 bg-card/60">
        <div className="border-b border-border/60 p-6 pb-4">
          <h3 className="text-base font-semibold">Campanhas</h3>
          <p className="text-sm text-muted-foreground">{data.campaigns.length} campanhas no período</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Campanha</th>
                <th className="px-6 py-3 text-right font-medium">Orçamento</th>
                <th className="px-6 py-3 text-right font-medium">Gasto</th>
                <th className="px-6 py-3 text-right font-medium">Resultados</th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c) => (
                <tr key={c.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                  <td className="px-6 py-4">
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
                  <td className="px-6 py-4 font-medium text-foreground">{c.name}</td>
                  <td className="px-6 py-4 text-right tabular-nums">{brl(c.budget)}</td>
                  <td className="px-6 py-4 text-right tabular-nums">{brl(c.spent)}</td>
                  <td className="px-6 py-4 text-right tabular-nums font-semibold">{fmt(c.results)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
