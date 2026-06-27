import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2, Target, DollarSign, MousePointerClick, Eye, Repeat, TrendingUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCampaignDetail } from "@/lib/analytics.functions";
import type { Campaign, DateRange, AttributionWindow } from "@/lib/analytics-types";

const fmt = (n: number, opts: Intl.NumberFormatOptions = {}) =>
  new Intl.NumberFormat("pt-BR", opts).format(n);
const brl = (n: number) => fmt(n, { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (n: number) => `${fmt(n, { maximumFractionDigits: 2 })}%`;

type Props = {
  clientId: string;
  campaign: Campaign | null;
  range: DateRange;
  attribution?: AttributionWindow;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};


function MiniStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function CampaignDetailDialog({ clientId, campaign, range, attribution, open, onOpenChange }: Props) {
  const fn = useServerFn(fetchCampaignDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["campaign-detail", clientId, campaign?.id, range.from, range.to, attribution],
    queryFn: () => fn({ data: { clientId, campaignId: campaign!.id, range, attribution } }),
    enabled: open && !!campaign && !campaign.id.startsWith("group:"),
  });


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {campaign?.name ?? "Campanha"}
            {campaign && (
              <Badge
                variant="outline"
                className={
                  campaign.status === "ACTIVE"
                    ? "border-[color:var(--success)]/40 bg-[color:var(--success)]/10 text-[color:var(--success)]"
                    : campaign.status === "PAUSED"
                      ? "border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 text-[color:var(--warning)]"
                      : "border-border bg-muted text-muted-foreground"
                }
              >
                {campaign.status}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {campaign?.objective ?? ""} · Conversão usada:{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              {data?.campaign.conversionType ?? campaign?.conversionType ?? "—"}
            </code>
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando detalhes…
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              <MiniStat label="Gasto" value={brl(data.campaign.spent)} icon={DollarSign} />
              <MiniStat label="Receita" value={brl(data.campaign.revenue)} icon={TrendingUp} />
              <MiniStat label="ROAS" value={`${fmt(data.campaign.roas, { maximumFractionDigits: 2 })}x`} icon={TrendingUp} />
              <MiniStat label="Resultados" value={fmt(data.campaign.results)} icon={Target} />
              <MiniStat label="CPA" value={data.campaign.cpa > 0 ? brl(data.campaign.cpa) : "—"} icon={Target} />
              <MiniStat label="Cliques" value={fmt(data.campaign.clicks)} icon={MousePointerClick} />
              <MiniStat label="CTR" value={pct(data.campaign.ctr)} icon={MousePointerClick} />
            </div>

            {/* Timeseries */}
            <div className="rounded-lg border border-border/60 bg-background/40 p-4">
              <div className="mb-2 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold">Evolução diária</h4>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.timeseries} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={10} />
                    <YAxis yAxisId="left" stroke="var(--color-chart-1)" fontSize={10} />
                    <YAxis yAxisId="right" orientation="right" stroke="var(--color-chart-2)" fontSize={10} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-popover)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line yAxisId="left" type="monotone" dataKey="spend" name="Gasto" stroke="var(--color-chart-1)" strokeWidth={2} dot={false} />
                    <Line yAxisId="left" type="monotone" dataKey="revenue" name="Receita" stroke="var(--color-chart-3)" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="roas" name="ROAS" stroke="var(--color-chart-2)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Ads */}
            {data.ads.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-background/40">
                <div className="border-b border-border/60 p-4 pb-2">
                  <h4 className="text-sm font-semibold">Anúncios ({data.ads.length})</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/60 text-left uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Anúncio</th>
                        <th className="px-3 py-2 text-right font-medium">Gasto</th>
                        <th className="px-3 py-2 text-right font-medium">Result.</th>
                        <th className="px-3 py-2 text-right font-medium">CPA</th>
                        <th className="px-3 py-2 text-right font-medium">ROAS</th>
                        <th className="px-3 py-2 text-right font-medium">CTR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ads
                        .slice()
                        .sort((a, b) => b.spend - a.spend)
                        .map((a) => (
                          <tr key={a.id} className="border-b border-border/40 last:border-0">
                            <td className="px-3 py-2 font-medium">{a.name}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{brl(a.spend)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmt(a.results)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{a.cpa > 0 ? brl(a.cpa) : "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{a.roas > 0 ? `${fmt(a.roas, { maximumFractionDigits: 2 })}x` : "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{pct(a.ctr)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Breakdowns */}
            <div className="grid gap-4 md:grid-cols-2">
              <BreakdownCard title="Idade · Gênero" icon={<Eye className="h-4 w-4" />} rows={data.ageGender} />
              <BreakdownCard title="Dispositivo" icon={<Repeat className="h-4 w-4" />} rows={data.device} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BreakdownCard({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  rows: Array<{ key: string; spend: number; results: number; revenue: number }>;
}) {
  const sorted = rows.slice().sort((a, b) => b.spend - a.spend).slice(0, 10);
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </div>
      {sorted.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Sem dados</p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sorted} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={10} />
              <YAxis type="category" dataKey="key" stroke="var(--color-muted-foreground)" fontSize={10} width={100} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                }}
                formatter={(v: number) => brl(v)}
              />
              <Bar dataKey="spend" name="Gasto" fill="var(--color-chart-1)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
