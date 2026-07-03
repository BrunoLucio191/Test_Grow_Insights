import { createServerFn } from "@tanstack/react-start";
import type { ClientRow, PaidData, Campaign, TimeSeriesPoint } from "./analytics-types.ts";
import { attrToArray, scopeKey, isPlaceholder, EMPTY_PAID } from "./analytics.functions.ts";
import { clientRangeSchema } from "./analytics.functions.ts";
import { getSupabaseServerClient } from "./supabase.ts";
import { readCache, writeCache } from "./cache.server.ts";
import { graphGet, MetaAction, pickConversionType } from "./metaGraph.server.ts";
import { string } from "zod";
import { DateRange } from "./analytics-types.ts";
/* eslint-disable  @typescript-eslint/no-explicit-any */
// Pago (Meta Ads)

//mapeando data em objeto pra passar range da data para a api do meta

export async function fetchMetaAdsReal(
  client: ClientRow,
  range: { from: string; to: string },
  attributionOverride?: string | null,
): Promise<PaidData> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN not set");
  if (!client.meta_ad_account_id) {
    throw new Error(`Cliente "${client.name}" sem meta_ad_account_id`);
  }
  const account = client.meta_ad_account_id.startsWith("act_")
    ? client.meta_ad_account_id
    : `act_${client.meta_ad_account_id}`;

  const timeRange = JSON.stringify({ since: range.from, until: range.to });
  console.log(`resolvendo codigo cudado do time range${timeRange}`);
  const attrChoice = attributionOverride ?? client.attribution_window ?? "7d_click,1d_view";
  const attributionWindows = JSON.stringify(attrToArray(attrChoice));

  // Single insights call: per-campaign per-day rows with raw actions/action_values.
  const insights = await graphGet<{ data: any[] }>(
    `/${account}/insights`,
    {
      time_range: timeRange,
      time_increment: "1",
      level: "campaign",
      action_attribution_windows: attributionWindows,
      fields:
        "campaign_id,campaign_name,spend,impressions,clicks,reach,frequency,ctr,cpm,actions,action_values,objective,inline_link_clicks,inline_link_click_ctr",
      limit: "500",
    },
    token,
  );

  // Per-row: accumulate raw actions per campaign so we can pick a dominant type.
  type CampAcc = {
    name: string;
    objective: string;
    spend: number;
    impressions: number;
    clicks: number;
    inline_link_clicks: number;
    reach: number;
    actionsAgg: Map<string, number>;
    valuesAgg: Map<string, number>;
    byDate: Map<
      string,
      { spend: number; actions: Map<string, number>; values: Map<string, number> }
    >;
  };
  const byCampaign = new Map<string, CampAcc>();

  for (const row of insights.data) {
    const cid = row.campaign_id;
    if (!cid) continue;
    const spend = parseFloat(row.spend) || 0;
    const impressions = parseFloat(row.impressions) || 0;
    const clicks = parseFloat(row.clicks) || 0;
    const inline_link_clicks = parseFloat(row.inline_link_clicks) || 0;
    const reach = parseFloat(row.reach) || 0;

    const acc =
      byCampaign.get(cid) ??
      ({
        name: row.campaign_name ?? "—",
        objective: row.objective ?? "—",
        spend: 0,
        impressions: 0,
        clicks: 0,
        inline_link_clicks: 0,
        reach: 0,
        actionsAgg: new Map(),
        valuesAgg: new Map(),
        byDate: new Map(),
      } as CampAcc);

    acc.spend += spend;
    acc.impressions += impressions;
    acc.clicks += clicks;
    acc.inline_link_clicks += inline_link_clicks;
    acc.reach = Math.max(acc.reach, reach); // reach is unique users; max é melhor proxy do que soma
    for (const a of (row.actions ?? []) as MetaAction[]) {
      const v = parseFloat(a.value) || 0;
      acc.actionsAgg.set(a.action_type, (acc.actionsAgg.get(a.action_type) ?? 0) + v);
    }
    for (const a of (row.action_values ?? []) as MetaAction[]) {
      const v = parseFloat(a.value) || 0;
      acc.valuesAgg.set(a.action_type, (acc.valuesAgg.get(a.action_type) ?? 0) + v);
    }

    const date = row.date_start;
    if (date) {
      const bucket = acc.byDate.get(date) ?? {
        spend: 0,
        actions: new Map<string, number>(),
        values: new Map<string, number>(),
      };
      bucket.spend += spend;

      for (const a of (row.actions ?? []) as MetaAction[]) {
        const v = parseFloat(a.value) || 0;
        bucket.actions.set(a.action_type, (bucket.actions.get(a.action_type) ?? 0) + v);
      }

      for (const a of (row.action_values ?? []) as MetaAction[]) {
        const v = parseFloat(a.value) || 0;
        bucket.values.set(a.action_type, (bucket.values.get(a.action_type) ?? 0) + v);
      }
      acc.byDate.set(date, bucket);
    }
    byCampaign.set(cid, acc);
  }

  // Campaign status / budget metadata
  const campMeta = await graphGet<{ data: any[] }>(
    `/${account}/campaigns`,
    { fields: "id,name,status,daily_budget,lifetime_budget,objective", limit: "500" },
    token,
  );
  const metaById = new Map(campMeta.data.map((c) => [c.id, c]));

  // Build per-campaign rows with the dominant conversion type chosen once.
  let totalSpend = 0;
  let totalRevenue = 0;
  let totalConversions = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalInlineLinkClicks = 0;
  let totalReach = 0;
  const dateBucket = new Map<string, { spend: number; revenue: number }>();

  const campaigns: Campaign[] = Array.from(byCampaign.entries()).map(([id, c]) => {
    //console.log(`presta atencao bem aqui jjjjjjjjjjj${JSON.stringify(c)}`);
    const meta = metaById.get(id) ?? {};
    const convType = pickConversionType(c.actionsAgg, client.conversion_event ?? null);
    const conversions = c.actionsAgg.get(convType) ?? 0;
    const revenue = c.valuesAgg.get(convType) ?? 0;
    const budget = Number(meta.daily_budget || meta.lifetime_budget || 0) / 100;
    const ctr = c.impressions > 0 ? (c.inline_link_clicks / c.impressions) * 100 : 0;
    const cpm = c.impressions > 0 ? (c.spend / c.impressions) * 1000 : 0;

    totalSpend += c.spend;
    totalRevenue += revenue;
    totalConversions += conversions;
    totalImpressions += c.impressions;
    totalClicks += c.clicks;
    totalInlineLinkClicks += c.inline_link_clicks;
    totalReach += c.reach;

    // Timeseries por dia (somando campanhas, usando o convType escolhido)
    for (const [date, b] of c.byDate.entries()) {
      const cur = dateBucket.get(date) ?? { spend: 0, revenue: 0 };
      cur.spend += b.spend;
      cur.revenue += b.values.get(convType) ?? 0;
      dateBucket.set(date, cur);
    }

    return {
      id,
      name: c.name,
      status: (meta.status as Campaign["status"]) ?? "ACTIVE",
      budget,
      spent: +c.spend.toFixed(2),
      results: +conversions.toFixed(0),
      revenue: +revenue.toFixed(2),
      roas: c.spend > 0 ? +(revenue / c.spend).toFixed(2) : 0,
      cpa: conversions > 0 ? +(c.spend / conversions).toFixed(2) : 0,
      ctr: +ctr.toFixed(2),
      cpm: +cpm.toFixed(2),
      impressions: c.impressions,
      clicks: c.clicks,
      objective: c.objective ?? meta.objective ?? "—",
      conversionType: convType,
      inline_link_clicks: c.inline_link_clicks,
    };
  });

  const timeseries: TimeSeriesPoint[] = Array.from(dateBucket.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      spend: +v.spend.toFixed(2),
      revenue: +v.revenue.toFixed(2),
      roas: v.spend > 0 ? +(v.revenue / v.spend).toFixed(2) : 0,
    }));

  return {
    kpis: {
      spend: +totalSpend.toFixed(2),
      revenue: +totalRevenue.toFixed(2),
      roas: totalSpend > 0 ? +(totalRevenue / totalSpend).toFixed(2) : 0,
      cpa: totalConversions > 0 ? +(totalSpend / totalConversions).toFixed(2) : 0,
      ctr:
        totalImpressions > 0 ? +((totalInlineLinkClicks / totalImpressions) * 100).toFixed(2) : 0,
      cpm: totalImpressions > 0 ? +((totalSpend / totalImpressions) * 1000).toFixed(2) : 0,
      impressions: totalImpressions,
      clicks: totalClicks,
      reach: totalReach,

      //TODO: arrumar frequency aqui para exibir o dato real
      frequency: totalReach > 0 ? +(totalImpressions / totalReach).toFixed(3) : 0,
      conversions: +totalConversions.toFixed(0),
      conversionRate: totalClicks > 0 ? +((totalConversions / totalClicks) * 0).toFixed(2) : 0,
    },
    timeseries,
    campaigns,
  };
}

//pega dados do clinte do banco de dados
export const fetchMetaAdsData = createServerFn({ method: "POST" })
  .inputValidator((data) => clientRangeSchema.parse(data))
  .handler(async ({ data }): Promise<PaidData> => {
    const supabaseAuth = getSupabaseServerClient();
    //pega data do cliente do SupaBase
    const { data: client, error: clientError } = await supabaseAuth
      .from("clients")
      .select("*")
      .eq("id", data.clientId)
      .single();
    //dispara erro
    if (clientError || !client) throw new Error("Cliente não encontrado ou sem permissão");

    const cliente = client as ClientRow;
    const attr = data.attribution ?? cliente.attribution_window ?? "7d_click,1d_view";
    const sk = scopeKey("paid", attr);

    const cached = await readCache<PaidData>(data.clientId, sk, data.range, false);
    if (cached) return cached;

    if (isPlaceholder(cliente.meta_ad_account_id)) return EMPTY_PAID;

    const timeRange: DateRange = {
      from: data.range.from,
      to: data.range.to,
    };

    try {
      console.log(`testando data correta ${typeof data.range.from === "string"}`);
      const fresh = await fetchMetaAdsReal(cliente, data.range, attr);
      await writeCache(data.clientId, sk, data.range, fresh);
      return fresh;
    } catch (error) {
      console.error("fetchMetaAdsReal failed:", error);
      const stale = await supabaseAuth
        .from("meta_cache")
        .select("payload")
        .eq("client_id", data.clientId)
        .eq("scope", sk)
        .eq("range_from", data.range.from)
        .eq("range_to", data.range.to)
        .maybeSingle();
      if (stale.data) return stale.data.payload as PaidData;
      throw error;
    }
  });
