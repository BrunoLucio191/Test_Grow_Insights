import { useMemo, useState } from "react";
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
import {
  BarChart3,
  Columns3,
  Loader2,
  Target,
  DollarSign,
  MousePointerClick,
  Eye,
  Repeat,
  TrendingUp,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

type StatKey =
  | "spend"
  | "revenue"
  | "roas"
  | "results"
  | "cpa"
  | "clicks"
  | "ctr"
  | "cpm"
  | "impressions"
  | "budget";
type SectionKey = "chart" | "ads" | "breakdowns" | "summary";
type AdColKey = "name" | "spend" | "results" | "cpa" | "roas" | "ctr" | "impressions" | "clicks";

const STAT_DEFS: {
  key: StatKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  render: (c: Campaign) => string;
}[] = [
  { key: "spend", label: "Gasto", icon: DollarSign, render: (c) => brl(c.spent) },
  { key: "revenue", label: "Receita", icon: TrendingUp, render: (c) => brl(c.revenue) },
  {
    key: "roas",
    label: "ROAS",
    icon: TrendingUp,
    render: (c) => `${fmt(c.roas, { maximumFractionDigits: 2 })}x`,
  },
  { key: "results", label: "Resultados", icon: Target, render: (c) => fmt(c.results) },
  { key: "cpa", label: "CPA", icon: Target, render: (c) => (c.cpa > 0 ? brl(c.cpa) : "—") },
  { key: "clicks", label: "Cliques", icon: MousePointerClick, render: (c) => fmt(c.clicks) },
  { key: "ctr", label: "CTR link", icon: MousePointerClick, render: (c) => pct(c.ctr) },
  { key: "cpm", label: "CPM", icon: Eye, render: (c) => (c.cpm > 0 ? brl(c.cpm) : "—") },
  { key: "impressions", label: "Impressões", icon: Eye, render: (c) => fmt(c.impressions) },
  {
    key: "budget",
    label: "Budget",
    icon: DollarSign,
    render: (c) => (c.budget > 0 ? brl(c.budget) : "—"),
  },
];

const SECTION_DEFS: { key: SectionKey; label: string }[] = [
  { key: "summary", label: "Resumo acionável" },
  { key: "chart", label: "Evolução diária" },
  { key: "ads", label: "Tabela de anúncios" },
  { key: "breakdowns", label: "Quebras" },
];

const AD_COL_DEFS: { key: AdColKey; label: string; align?: "right" }[] = [
  { key: "name", label: "Anúncio" },
  { key: "spend", label: "Gasto", align: "right" },
  { key: "results", label: "Result.", align: "right" },
  { key: "cpa", label: "CPA", align: "right" },
  { key: "roas", label: "ROAS", align: "right" },
  { key: "ctr", label: "CTR", align: "right" },
  { key: "impressions", label: "Impressões", align: "right" },
  { key: "clicks", label: "Cliques", align: "right" },
];

const DEFAULT_STATS: StatKey[] = ["spend", "revenue", "roas", "results", "cpa", "clicks", "ctr"];
const DEFAULT_SECTIONS: SectionKey[] = ["summary", "chart", "ads", "breakdowns"];
const DEFAULT_AD_COLS: AdColKey[] = ["name", "spend", "results", "cpa", "roas", "ctr"];

function loadPref<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function savePref<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

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

export function CampaignDetailDialog({
  clientId,
  campaign,
  range,
  attribution,
  open,
  onOpenChange,
}: Props) {
  const fn = useServerFn(fetchCampaignDetail);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["campaign-detail", clientId, campaign?.id, range.from, range.to, attribution],
    queryFn: () => fn({ data: { clientId, campaignId: campaign!.id, range, attribution } }),
    enabled: open && !!campaign && !campaign.id.startsWith("group:"),
    retry: 1,
  });

  const [visibleStats, setVisibleStats] = useState<StatKey[]>(() =>
    loadPref(`campaign-detail:stats:${clientId}`, DEFAULT_STATS),
  );
  const [visibleSections, setVisibleSections] = useState<SectionKey[]>(() =>
    loadPref(`campaign-detail:sections:${clientId}`, DEFAULT_SECTIONS),
  );
  const [visibleAdCols, setVisibleAdCols] = useState<AdColKey[]>(() =>
    loadPref(`campaign-detail:ads:${clientId}`, DEFAULT_AD_COLS),
  );

  const shownStats = STAT_DEFS.filter((s) => visibleStats.includes(s.key));
  const shownAdCols = AD_COL_DEFS.filter((c) => visibleAdCols.includes(c.key));
  const currentCampaign = data?.campaign ?? campaign;

  const toggleList = <T extends string>(
    value: T,
    list: T[],
    setList: (next: T[]) => void,
    storageKey: string,
  ) => {
    const next = list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
    setList(next);
    savePref(storageKey, next);
  };

  const summary = useMemo(() => {
    if (!data) return [];
    const items: string[] = [];
    if (data.campaign.roas >= 2)
      items.push(
        `ROAS saudável (${fmt(data.campaign.roas, { maximumFractionDigits: 2 })}x), priorize escala gradual mantendo CPA controlado.`,
      );
    else if (data.campaign.spent > 0)
      items.push(
        `ROAS abaixo do ideal (${fmt(data.campaign.roas, { maximumFractionDigits: 2 })}x), revise criativos, público e evento de conversão antes de escalar.`,
      );
    if (data.campaign.ctr < 1 && data.campaign.impressions > 0)
      items.push(
        `CTR de link baixo (${pct(data.campaign.ctr)}): teste gancho inicial, oferta e chamada para ação.`,
      );
    if (data.campaign.cpa > 0)
      items.push(
        `CPA atual em ${brl(data.campaign.cpa)} para ${fmt(data.campaign.results)} resultados no período.`,
      );
    const bestAd = data.ads.slice().sort((a, b) => b.roas - a.roas || b.results - a.results)[0];
    if (bestAd)
      items.push(
        `Melhor anúncio por eficiência: ${bestAd.name} (${bestAd.roas > 0 ? `${fmt(bestAd.roas, { maximumFractionDigits: 2 })}x ROAS` : `${fmt(bestAd.results)} resultados`}).`,
      );
    return items;
  }, [data]);

  const renderAdCell = (ad: NonNullable<typeof data>["ads"][number], key: AdColKey) => {
    switch (key) {
      case "name":
        return <span className="font-medium">{ad.name}</span>;
      case "spend":
        return brl(ad.spend);
      case "results":
        return fmt(ad.results);
      case "cpa":
        return ad.cpa > 0 ? brl(ad.cpa) : "—";
      case "roas":
        return ad.roas > 0 ? `${fmt(ad.roas, { maximumFractionDigits: 2 })}x` : "—";
      case "ctr":
        return pct(ad.ctr);
      case "impressions":
        return fmt(ad.impressions);
      case "clicks":
        return fmt(ad.clicks);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
            <div>
              <DialogTitle className="flex items-center gap-2">
                {currentCampaign?.name ?? "Campanha"}
                {currentCampaign && (
                  <Badge
                    variant="outline"
                    className={
                      currentCampaign.status === "ACTIVE"
                        ? "border-[color:var(--success)]/40 bg-[color:var(--success)]/10 text-[color:var(--success)]"
                        : currentCampaign.status === "PAUSED"
                          ? "border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 text-[color:var(--warning)]"
                          : "border-border bg-muted text-muted-foreground"
                    }
                  >
                    {currentCampaign.status}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                {currentCampaign?.objective ?? ""} · Conversão usada:{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                  {data?.campaign.conversionType ?? currentCampaign?.conversionType ?? "—"}
                </code>
              </DialogDescription>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Columns3 className="h-4 w-4" /> Visualização
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                      KPIs
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {STAT_DEFS.map((s) => (
                        <label key={s.key} className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={visibleStats.includes(s.key)}
                            onCheckedChange={() =>
                              toggleList(
                                s.key,
                                visibleStats,
                                setVisibleStats,
                                `campaign-detail:stats:${clientId}`,
                              )
                            }
                          />
                          {s.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                      Seções
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {SECTION_DEFS.map((s) => (
                        <label key={s.key} className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={visibleSections.includes(s.key)}
                            onCheckedChange={() =>
                              toggleList(
                                s.key,
                                visibleSections,
                                setVisibleSections,
                                `campaign-detail:sections:${clientId}`,
                              )
                            }
                          />
                          {s.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                      Colunas dos anúncios
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {AD_COL_DEFS.map((c) => (
                        <label key={c.key} className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={visibleAdCols.includes(c.key)}
                            onCheckedChange={() =>
                              toggleList(
                                c.key,
                                visibleAdCols,
                                setVisibleAdCols,
                                `campaign-detail:ads:${clientId}`,
                              )
                            }
                          />
                          {c.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando detalhes…
          </div>
        ) : isError || !data ? (
          <div className="space-y-4 rounded-lg border border-border/60 bg-background/40 p-6">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BarChart3 className="h-4 w-4 text-primary" /> Não foi possível carregar os detalhes
              completos
            </div>
            <p className="text-sm text-muted-foreground">
              A campanha abriu com os dados já carregados na tabela. Tente atualizar o período ou
              verificar o acesso do ativo caso precise das quebras por anúncio/dispositivo.
            </p>
            {error instanceof Error && (
              <p className="text-xs text-muted-foreground">{error.message}</p>
            )}
            {currentCampaign && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {shownStats.map((s) => (
                  <MiniStat
                    key={s.key}
                    label={s.label}
                    value={s.render(currentCampaign)}
                    icon={s.icon}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              {shownStats.map((s) => (
                <MiniStat
                  key={s.key}
                  label={s.label}
                  value={s.render(data.campaign)}
                  icon={s.icon}
                />
              ))}
            </div>

            {visibleSections.includes("summary") && summary.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-background/40 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold">Resumo acionável</h4>
                </div>
                <ul className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                  {summary.map((item) => (
                    <li key={item} className="rounded-md bg-muted/30 p-3">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Timeseries */}
            {visibleSections.includes("chart") && (
              <div className="rounded-lg border border-border/60 bg-background/40 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold">Evolução diária</h4>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={data.timeseries}
                      margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={10} />
                      <YAxis yAxisId="left" stroke="var(--color-chart-1)" fontSize={10} />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="var(--color-chart-2)"
                        fontSize={10}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-popover)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="spend"
                        name="Gasto"
                        stroke="var(--color-chart-1)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="revenue"
                        name="Receita"
                        stroke="var(--color-chart-3)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="roas"
                        name="ROAS"
                        stroke="var(--color-chart-2)"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Ads */}
            {visibleSections.includes("ads") && data.ads.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-background/40">
                <div className="border-b border-border/60 p-4 pb-2">
                  <h4 className="text-sm font-semibold">Anúncios ({data.ads.length})</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/60 text-left uppercase tracking-wider text-muted-foreground">
                        {shownAdCols.map((c) => (
                          <th
                            key={c.key}
                            className={`px-3 py-2 font-medium ${c.align === "right" ? "text-right" : ""}`}
                          >
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.ads
                        .slice()
                        .sort((a, b) => b.spend - a.spend)
                        .map((a) => (
                          <tr key={a.id} className="border-b border-border/40 last:border-0">
                            {shownAdCols.map((c) => (
                              <td
                                key={c.key}
                                className={`px-3 py-2 ${c.align === "right" ? "text-right tabular-nums" : ""}`}
                              >
                                {renderAdCell(a, c.key)}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Breakdowns */}
            {visibleSections.includes("breakdowns") && (
              <div className="grid gap-4 md:grid-cols-2">
                <BreakdownCard
                  title="Idade · Gênero"
                  icon={<Eye className="h-4 w-4" />}
                  rows={data.ageGender}
                />
                <BreakdownCard
                  title="Dispositivo"
                  icon={<Repeat className="h-4 w-4" />}
                  rows={data.device}
                />
              </div>
            )}
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
  const sorted = rows
    .slice()
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10);
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
            <BarChart
              data={sorted}
              layout="vertical"
              margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={10} />
              <YAxis
                type="category"
                dataKey="key"
                stroke="var(--color-muted-foreground)"
                fontSize={10}
                width={100}
              />
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
