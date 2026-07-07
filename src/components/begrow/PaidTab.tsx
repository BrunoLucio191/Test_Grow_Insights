import { Fragment, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
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
  ChevronDown,
  Download,
  Loader2,
  Columns3,
  Link2,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listCampaignGroups,
  upsertCampaignGroup,
  deleteCampaignGroup,
} from "@/lib/campGroup.server";
import { fetchMetaAdsData } from "../../lib/pago.server";
import type {
  DateRange,
  Campaign,
  AttributionWindow,
  CampaignGroup,
  PaidData,
} from "@/lib/analytics-types";
import { KpiCard } from "./KpiCard";
import { CampaignDetailDialog } from "./CampaignDetailDialog";
import { exportCampaignPdf } from "@/lib/pdf-export";

const fmt = (n: number, opts: Intl.NumberFormatOptions = {}) =>
  new Intl.NumberFormat("pt-BR", opts).format(n);
const brl = (n: number) => fmt(n, { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (n: number) => `${fmt(n, { maximumFractionDigits: 2 })}%`;

const META_OBJECTIVES: Record<string, string> = {
  OUTCOME_SALES: "Vendas",
  OUTCOME_LEADS: "Cadastros",
  OUTCOME_TRAFFIC: "Tráfego",
  OUTCOME_ENGAGEMENT: "Engajamento",
  OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_APP_PROMOTION: "Promoção de App",
  // Fallbacks úteis caso o cliente tenha campanhas antigas rodando:
  CONVERSIONS: "Conversões",
  LINK_CLICKS: "Cliques no Link",
  POST_ENGAGEMENT: "Engajamento com Publicação",
};

type KpiKey =
  | "spend"
  | "revenue"
  | "roas"
  | "conversions"
  | "cpa"
  | "impressions"
  | "clicks"
  | "ctr"
  | "cpm"
  | "reach"
  | "frequency"
  | "conversionRate";

const KPI_DEFS: {
  key: KpiKey;
  label: string;
  icon: any;
  render: (k: PaidData["kpis"]) => string;
}[] = [
  { key: "spend", label: "Valor Investido", icon: DollarSign, render: (k) => brl(k.spend) },
  { key: "revenue", label: "Receita", icon: TrendingUp, render: (k) => brl(k.revenue) },
  {
    key: "roas",
    label: "ROAS",
    icon: TrendingUp,
    render: (k) => `${fmt(k.roas, { maximumFractionDigits: 2 })}x`,
  },
  { key: "conversions", label: "Resultados", icon: Target, render: (k) => fmt(k.conversions) },
  { key: "cpa", label: "CPA", icon: Target, render: (k) => brl(k.cpa) },
  { key: "impressions", label: "Impressões", icon: Eye, render: (k) => fmt(k.impressions) },
  { key: "clicks", label: "Cliques", icon: MousePointerClick, render: (k) => fmt(k.clicks) },
  { key: "ctr", label: "CTR", icon: MousePointerClick, render: (k) => pct(k.ctr) },
  { key: "cpm", label: "CPM", icon: Eye, render: (k) => brl(k.cpm) },
  { key: "reach", label: "Alcance", icon: Users, render: (k) => fmt(k.reach) },
  {
    key: "frequency",
    label: "Frequência",
    icon: Repeat,
    render: (k) => fmt(k.frequency, { maximumFractionDigits: 2 }),
  },
  {
    key: "conversionRate",
    label: "Conv. Rate",
    icon: Percent,
    render: (k) => pct(k.conversionRate),
  },
];

type ColKey =
  | "status"
  | "name"
  | "objective"
  | "spend"
  | "results"
  | "revenue"
  | "cpa"
  | "roas"
  | "ctr"
  | "cpm"
  | "impressions"
  | "clicks";

const COL_DEFS: { key: ColKey; label: string; align?: "right" }[] = [
  { key: "status", label: "Status" },
  { key: "name", label: "Campanha" },
  { key: "objective", label: "Objetivo" },
  { key: "spend", label: "Gasto", align: "right" },
  { key: "results", label: "Resultados", align: "right" },
  { key: "revenue", label: "Receita", align: "right" },
  { key: "cpa", label: "CPA", align: "right" },
  { key: "roas", label: "ROAS", align: "right" },
  { key: "ctr", label: "CTR", align: "right" },
  { key: "cpm", label: "CPM", align: "right" },
  { key: "impressions", label: "Impressões", align: "right" },
  { key: "clicks", label: "Cliques", align: "right" },
];

const DEFAULT_KPIS: KpiKey[] = [
  "spend",
  "revenue",
  "roas",
  "conversions",
  "cpa",
  "impressions",
  "clicks",
  "ctr",
  "cpm",
  "reach",
  "frequency",
];
const DEFAULT_COLS: ColKey[] = [
  "status",
  "name",
  "objective",
  "spend",
  "results",
  "cpa",
  "roas",
  "ctr",
];

function loadPref<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function savePref<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.log(error);
  }
}

/* -------- Grouping helpers -------- */

function aggregateCampaigns(items: Campaign[], groupName: string, groupId: string): Campaign {
  const spent = items.reduce((s, c) => s + c.spent, 0);
  const revenue = items.reduce((s, c) => s + c.revenue, 0);
  const results = items.reduce((s, c) => s + c.results, 0);
  const impressions = items.reduce((s, c) => s + c.impressions, 0);
  const clicks = items.reduce((s, c) => s + c.clicks, 0);
  const inline_link_clicks = items.reduce((s, c) => s + (c.inline_link_clicks ?? c.clicks), 0);
  return {
    id: `group:${groupId}`,
    name: groupName,
    status: items.some((c) => c.status === "ACTIVE") ? "ACTIVE" : (items[0]?.status ?? "PAUSED"),
    budget: items.reduce((s, c) => s + (c.budget || 0), 0),
    spent: +spent.toFixed(2),
    results: +results.toFixed(0),
    revenue: +revenue.toFixed(2),
    roas: spent > 0 ? +(revenue / spent).toFixed(2) : 0,
    cpa: results > 0 ? +(spent / results).toFixed(2) : 0,
    ctr: impressions > 0 ? +((inline_link_clicks / impressions) * 100).toFixed(2) : 0,
    cpm: impressions > 0 ? +((spent / impressions) * 1000).toFixed(2) : 0,
    impressions,
    clicks,
    objective: "Grupo",
    conversionType: items[0]?.conversionType ?? "—",
    inline_link_clicks,
  };
}

/* -------- Main component -------- */

export function PaidTab({
  clientId,
  clientName,
  range,
  attribution,
}: {
  clientId: string;
  clientName: string;
  range: DateRange;
  attribution: AttributionWindow;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(fetchMetaAdsData);
  const listGroupsFn = useServerFn(listCampaignGroups);
  const upsertGroupFn = useServerFn(upsertCampaignGroup);
  const deleteGroupFn = useServerFn(deleteCampaignGroup);

  const { data, isLoading } = useQuery({
    queryKey: ["paid", clientId, range.from, range.to, attribution],
    queryFn: () => fn({ data: { clientId, range, attribution } }),
  });

  const { data: groups } = useQuery({
    queryKey: ["campaign-groups", clientId],
    queryFn: () => listGroupsFn({ data: { clientId } }),
  });

  const [selected, setSelected] = useState<Campaign | null>(null);
  const [visibleKpis, setVisibleKpis] = useState<KpiKey[]>(() =>
    loadPref(`kpis:${clientId}`, DEFAULT_KPIS),
  );
  const [visibleCols, setVisibleCols] = useState<ColKey[]>(() =>
    loadPref(`cols:${clientId}`, DEFAULT_COLS),
  );
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [exporting, setExporting] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  const toggleKpi = (k: KpiKey) => {
    const next = visibleKpis.includes(k) ? visibleKpis.filter((x) => x !== k) : [...visibleKpis, k];
    setVisibleKpis(next);
    savePref(`kpis:${clientId}`, next);
  };
  const toggleCol = (k: ColKey) => {
    const next = visibleCols.includes(k) ? visibleCols.filter((x) => x !== k) : [...visibleCols, k];
    setVisibleCols(next);
    savePref(`cols:${clientId}`, next);
  };
  const togglePicked = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  // Compose rows: groups (aggregated) + ungrouped campaigns
  const { rows, groupedIds } = useMemo(() => {
    const allCampaigns = data?.campaigns ?? [];
    const byId = new Map(allCampaigns.map((c) => [c.id, c]));
    const groupedIds = new Set<string>();
    const groupRows: Array<{
      kind: "group";
      group: CampaignGroup;
      row: Campaign;
      children: Campaign[];
    }> = [];
    for (const g of groups ?? []) {
      const children = g.campaign_ids.map((id) => byId.get(id)).filter((c): c is Campaign => !!c);
      if (children.length === 0) continue;
      children.forEach((c) => groupedIds.add(c.id));
      groupRows.push({
        kind: "group",
        group: g,
        row: aggregateCampaigns(children, g.name, g.id),
        children,
      });
    }
    const single = allCampaigns
      .filter((c) => !groupedIds.has(c.id))
      .map((c) => ({ kind: "single" as const, row: c }));
    return { rows: [...groupRows, ...single], groupedIds };
  }, [data?.campaigns, groups]);

  const saveGroup = useMutation({
    mutationFn: () =>
      upsertGroupFn({
        data: { clientId, name: groupName.trim(), campaignIds: Array.from(picked) },
      }),
    onSuccess: () => {
      toast.success("Grupo salvo");
      setGroupDialogOpen(false);
      setGroupName("");
      setPicked(new Set());
      qc.invalidateQueries({ queryKey: ["campaign-groups", clientId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar grupo"),
  });

  const removeGroup = useMutation({
    mutationFn: (id: string) => deleteGroupFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Grupo removido");
      qc.invalidateQueries({ queryKey: ["campaign-groups", clientId] });
    },
  });

  const onExportPdf = async () => {
    if (!data) return;
    setExporting(true);
    try {
      toast.info("Gerando recomendações da IA…");

      const merged = rows.map((r) => r.row);
      await exportCampaignPdf({
        clientName,
        range,
        attribution,
        paid: data,
        chartElement: chartRef.current,
        campaigns: merged,
      });
      toast.success("PDF gerado");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar PDF");
    } finally {
      setExporting(false);
    }
  };

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

  const shownKpis = KPI_DEFS.filter((k) => visibleKpis.includes(k.key));
  const shownCols = COL_DEFS.filter((c) => visibleCols.includes(c.key));

  const renderCell = (campanha: Campaign, key: ColKey) => {
    switch (key) {
      case "status":
        return (
          <Badge
            variant="outline"
            className={
              campanha.status === "ACTIVE"
                ? "border-[color:var(--success)]/40 bg-[color:var(--success)]/10 text-[color:var(--success)]"
                : campanha.status === "PAUSED"
                  ? "border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 text-[color:var(--warning)]"
                  : "border-border bg-muted text-muted-foreground"
            }
          >
            {campanha.status}
          </Badge>
        );
      case "name":
        return (
          <span className="font-medium text-foreground">
            {campanha.name.replaceAll("[", "").replaceAll("]", "")}
          </span>
        );
      case "objective": {
        const nomeObjetivo = META_OBJECTIVES[campanha.objective] || campanha.objective;
        return <span className="text-xs text-muted-foreground">{nomeObjetivo}</span>;
      }
      case "spend":
        return brl(campanha.spent);
      case "results":
        return <span className="font-semibold">{fmt(campanha.results)}</span>;
      case "revenue":
        return brl(campanha.revenue);
      case "cpa":
        return campanha.cpa > 0 ? brl(campanha.cpa) : "—";
      case "roas":
        return campanha.roas > 0 ? `${fmt(campanha.roas, { maximumFractionDigits: 2 })}x` : "—";
      case "ctr":
        return pct(campanha.ctr);
      case "cpm":
        return brl(campanha.cpm);
      case "impressions":
        return fmt(campanha.impressions);
      case "clicks":
        return fmt(campanha.clicks);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          Atribuição: <span className="font-medium text-foreground">{attribution}</span>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Columns3 className="h-4 w-4" /> Colunas
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <div className="space-y-3">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">KPIs</p>
                  <div className="grid grid-cols-2 gap-2">
                    {KPI_DEFS.map((k) => (
                      <label key={k.key} className="flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={visibleKpis.includes(k.key)}
                          onCheckedChange={() => toggleKpi(k.key)}
                        />
                        {k.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                    Tabela de campanhas
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {COL_DEFS.map((c) => (
                      <label key={c.key} className="flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={visibleCols.includes(c.key)}
                          onCheckedChange={() => toggleCol(c.key)}
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={picked.size < 2}
            onClick={() => setGroupDialogOpen(true)}
          >
            <Link2 className="h-4 w-4" />
            Vincular ({picked.size})
          </Button>

          <Button size="sm" className="gap-2" onClick={onExportPdf} disabled={exporting}>
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      {shownKpis.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {shownKpis.map((k) => (
            <KpiCard key={k.key} label={k.label} value={k.render(data.kpis)} icon={k.icon} />
          ))}
        </div>
      )}

      {/* Chart */}
      <Card className="border-border/60 bg-card/60 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Investimento, Receita e ROAS</h3>
            <p className="text-sm text-muted-foreground">Evolução diária no período</p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div className="flex items-center justify-end gap-2">
              <Percent className="h-3 w-3" />
              Taxa de conversão:{" "}
              <span className="font-semibold text-foreground">{pct(data.kpis.conversionRate)}</span>
            </div>
          </div>
        </div>
        <div className="h-72 bg-card" ref={chartRef}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.timeseries} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
              <XAxis dataKey="date" stroke="#a1a1aa" fontSize={11} />
              <YAxis yAxisId="left" stroke="#60a5fa" fontSize={11} />
              <YAxis yAxisId="right" orientation="right" stroke="#34d399" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: "#1f2937",
                  border: "1px solid #374151",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="spend"
                name="Investido (R$)"
                stroke="#60a5fa"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="revenue"
                name="Receita (R$)"
                stroke="#a78bfa"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="roas"
                name="ROAS (x)"
                stroke="#34d399"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Groups list */}
      {(groups?.length ?? 0) > 0 && (
        <Card className="border-border/60 bg-card/60 p-4">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Grupos salvos
          </p>
          <div className="flex flex-wrap gap-2">
            {groups!.map((g) => (
              <div
                key={g.id}
                className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1 text-xs"
              >
                <Link2 className="h-3 w-3 text-primary" />
                <span className="font-medium">{g.name}</span>
                <span className="text-muted-foreground">({g.campaign_ids.length})</span>
                <button
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => removeGroup.mutate(g.id)}
                  title="Remover grupo"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Campaigns table */}
      <Card className="border-border/60 bg-card/60">
        <div className="border-b border-border/60 p-6 pb-4">
          <h3 className="text-base font-semibold">Campanhas</h3>
          <p className="text-sm text-muted-foreground">
            {rows.length} linhas · selecione para vincular · clique para ver detalhes
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="w-8 px-2 py-3" />
                {shownCols.map((c) => (
                  <th
                    key={c.key}
                    className={`px-4 py-3  font-medium ${c.align === "right" ? "text-right" : ""}`}
                  >
                    {c.label}
                  </th>
                ))}
                <th className="w-8 px-2 py-3 " />
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => {
                const isGroup = entry.kind === "group";
                const id = entry.row.id;
                const expanded = isGroup && expandedGroups.has(entry.group.id);
                return (
                  <Fragment key={id}>
                    <tr
                      key={id}
                      className="cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/30"
                      onClick={() => !isGroup && setSelected(entry.row)}
                    >
                      <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                        {isGroup ? (
                          <button
                            onClick={() => {
                              const n = new Set(expandedGroups);
                              n.has(entry.group.id)
                                ? n.delete(entry.group.id)
                                : n.add(entry.group.id);
                              setExpandedGroups(n);
                            }}
                            className="text-muted-foreground "
                          >
                            {expanded ? (
                              <ChevronDown className="h-4 w-4 " />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        ) : (
                          <Checkbox
                            checked={picked.has(id)}
                            onCheckedChange={() => togglePicked(id)}
                          />
                        )}
                      </td>
                      {shownCols.map((c) => (
                        <td
                          key={c.key}
                          className={`px-4 py-4 ${c.align === "right" ? "text-right tabular-nums" : ""} ${isGroup && c.key === "name" ? "text-primary" : ""}`}
                        >
                          {isGroup && c.key === "name" ? (
                            <span className="flex items-center gap-2 font-semibold">
                              <Link2 className="h-3 w-3" />
                              {entry.row.name}
                              <Badge variant="outline" className="text-[10px]">
                                {entry.children.length} camp.
                              </Badge>
                            </span>
                          ) : (
                            renderCell(entry.row, c.key)
                          )}
                        </td>
                      ))}
                      <td className="px-2 py-4 text-muted-foreground">
                        {!isGroup && <ChevronRight className="h-4 w-4" />}
                      </td>
                    </tr>
                    {isGroup &&
                      expanded &&
                      entry.children.map((child) => (
                        <tr
                          key={`${entry.group.id}-${child.id}`}
                          className="cursor-pointer border-b border-border/30 bg-muted/10 transition-colors hover:bg-muted/40"
                          onClick={() => setSelected(child)}
                        >
                          <td className="px-2 py-3" />
                          {shownCols.map((campanha) => (
                            <td
                              key={campanha.key}
                              className={`px-4 py-3 pl-10 text-xs  ${campanha.align === "right" ? "text-right tabular-nums" : ""}`}
                            >
                              {renderCell(child, campanha.key)}
                            </td>
                          ))}
                          <td className="px-2 py-3 text-muted-foreground">
                            <ChevronRight className="h-4 w-4" />
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <CampaignDetailDialog
        clientId={clientId}
        campaign={selected}
        range={range}
        attribution={attribution}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
      />

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular campanhas</DialogTitle>
            <DialogDescription>
              {picked.size} campanhas selecionadas serão consolidadas em um único grupo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="gname">Nome do grupo</Label>
            <Input
              id="gname"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="ex.: Black Friday — Conversão"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveGroup.mutate()}
              disabled={!groupName.trim() || saveGroup.isPending}
              className="gap-2"
            >
              {saveGroup.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
