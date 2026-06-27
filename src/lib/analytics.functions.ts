import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { mockPaid, mockOrganic } from "./analytics-mocks";
import type {
  ClientRow,
  PaidData,
  OrganicData,
  Campaign,
  TimeSeriesPoint,
  TopPost,
} from "./analytics-types";
import { isPlaceholderId } from "./analytics-types";

const dateRangeSchema = z.object({
  from: z.string(),
  to: z.string(),
});

const attributionSchema = z
  .enum(["7d_click,1d_view", "1d_click,1d_view", "7d_click", "1d_click"])
  .optional()
  .nullable();

const clientRangeSchema = z.object({
  clientId: z.string().uuid(),
  range: dateRangeSchema,
  attribution: attributionSchema,
});

function attrToArray(value: string | null | undefined): string[] {
  if (!value) return ["7d_click", "1d_view"];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function scopeKey(base: Scope, attribution?: string | null): string {
  const attr = attribution ?? "7d_click,1d_view";
  if (attr === "7d_click,1d_view") return base; // backward compatible
  return `${base}:atr=${attr}` as Scope;
}


// Default: use real Meta API. Set USE_MOCKS=true to force synthetic data.
const USE_MOCKS = (process.env.USE_MOCKS ?? "false") === "true";

// Cache TTL: how long a cached response is considered fresh (seconds).
const CACHE_TTL_SECONDS = 60 * 60; // 1 hour

const GRAPH_API = "https://graph.facebook.com/v19.0";

function isPlaceholder(id: string | null | undefined): boolean {
  return isPlaceholderId(id);
}

const EMPTY_PAID: PaidData = {
  kpis: {
    spend: 0,
    revenue: 0,
    roas: 0,
    cpa: 0,
    ctr: 0,
    cpm: 0,
    impressions: 0,
    clicks: 0,
    reach: 0,
    frequency: 0,
    conversions: 0,
    conversionRate: 0,
  },
  timeseries: [],
  campaigns: [],
};
const EMPTY_ORGANIC: OrganicData = {
  kpis: { newFollowers: 0, reach: 0, avgEngagement: 0, profileVisits: 0 },
  topPosts: [],
};

/* -------------------- Clients -------------------- */

export const listClients = createServerFn({ method: "GET" }).handler(
  async (): Promise<ClientRow[]> => {
    const { data, error } = await supabaseAdmin
      .from("clients")
      .select("id, name, meta_ad_account_id, meta_page_id, ig_account_id, conversion_event")
      .order("name", { ascending: true });
    if (error) {
      console.error("listClients error:", error);
      return [];
    }
    return (data as ClientRow[]) ?? [];
  },
);

export const createClient = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ name: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ data }): Promise<ClientRow> => {
    const { data: row, error } = await supabaseAdmin
      .from("clients")
      .insert({ name: data.name })
      .select("id, name, meta_ad_account_id, meta_page_id, ig_account_id, conversion_event")
      .single();
    if (error) throw new Error(error.message);
    return row as ClientRow;
  });

export const deleteClient = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await supabaseAdmin.from("meta_cache").delete().eq("client_id", data.clientId);
    const { error } = await supabaseAdmin.from("clients").delete().eq("id", data.clientId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const importMetaAccounts = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ imported: number; total: number; skipped: number }> => {
    const token = process.env.META_ACCESS_TOKEN;
    if (!token) throw new Error("META_ACCESS_TOKEN não configurado");

    const res = await graphGet<{ data: Array<{ name: string; account_id: string }> }>(
      "/me/adaccounts",
      { fields: "name,account_id", limit: "100" },
      token,
    );
    const accounts = res.data ?? [];

    const { data: existing } = await supabaseAdmin
      .from("clients")
      .select("meta_ad_account_id");
    const have = new Set(
      (existing ?? [])
        .map((r) => r.meta_ad_account_id)
        .filter((v): v is string => !!v),
    );

    const toInsert: Array<{ name: string; meta_ad_account_id: string }> = [];
    for (const a of accounts) {
      const id = a.account_id.startsWith("act_") ? a.account_id : `act_${a.account_id}`;
      if (have.has(id)) continue;
      toInsert.push({ name: a.name || id, meta_ad_account_id: id });
    }

    let imported = 0;
    if (toInsert.length > 0) {
      const { error, data } = await supabaseAdmin
        .from("clients")
        .insert(toInsert)
        .select("id");
      if (error) throw new Error(error.message);
      imported = data?.length ?? 0;
    }
    return { imported, total: accounts.length, skipped: accounts.length - imported };
  },
);

/* -------------------- Cache helpers -------------------- */

type Scope = "paid" | "organic";

async function readCache<T>(
  clientId: string,
  scope: Scope,
  range: { from: string; to: string },
  force: boolean,
): Promise<T | null> {
  if (force) return null;
  const { data } = await supabaseAdmin
    .from("meta_cache")
    .select("payload, fetched_at")
    .eq("client_id", clientId)
    .eq("scope", scope)
    .eq("range_from", range.from)
    .eq("range_to", range.to)
    .maybeSingle();
  if (!data) return null;
  const ageSec = (Date.now() - new Date(data.fetched_at).getTime()) / 1000;
  if (ageSec > CACHE_TTL_SECONDS) return null;
  return data.payload as T;
}

async function writeCache(
  clientId: string,
  scope: Scope,
  range: { from: string; to: string },
  payload: unknown,
): Promise<void> {
  const { error } = await supabaseAdmin.from("meta_cache").upsert(
    {
      client_id: clientId,
      scope,
      range_from: range.from,
      range_to: range.to,
      payload: payload as any,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "client_id,scope,range_from,range_to" },
  );
  if (error) console.error("writeCache error:", error);
}

async function invalidateCache(clientId: string, scope?: Scope) {
  let q = supabaseAdmin.from("meta_cache").delete().eq("client_id", clientId);
  if (scope) q = q.eq("scope", scope);
  const { error } = await q;
  if (error) console.error("invalidateCache error:", error);
}

/* -------------------- Meta Graph helpers -------------------- */

async function graphGet<T = any>(
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<T> {
  const url = new URL(`${GRAPH_API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

type MetaAction = { action_type: string; value: string };

/** Extracts numeric value for a specific action_type from a Meta actions/action_values array. */
function extractMetaActionValue(arr: MetaAction[] | undefined, actionType: string): number {
  if (!arr) return 0;
  const hit = arr.find((a) => a.action_type === actionType);
  return hit ? parseFloat(hit.value) || 0 : 0;
}

/**
 * Eventos de conversão ordenados por prioridade — espelha o que o Gerenciador
 * de Anúncios mostra como "Resultados" na maioria dos objetivos focados em
 * conversão (compra/lead). Caímos para link_click apenas se nada acima existir.
 */
const CONVERSION_PRIORITY = [
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_conversion.purchase",
  "purchase",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.lead_grouped",
  "lead",
  "complete_registration",
  "offsite_conversion.fb_pixel_complete_registration",
  "link_click",
] as const;

/** Picks the dominant conversion type from an aggregated list of actions. */
function pickConversionType(
  aggregated: Map<string, number>,
  override?: string | null,
): string {
  if (override && aggregated.has(override)) return override;
  for (const type of CONVERSION_PRIORITY) {
    if (aggregated.has(type) && (aggregated.get(type) ?? 0) > 0) return type;
  }
  return "link_click";
}

/* -------------------- Paid (Meta Ads) -------------------- */

async function fetchMetaAdsReal(
  client: ClientRow,
  range: { from: string; to: string },
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
  // Janela de atribuição padrão do Gerenciador
  const attributionWindows = JSON.stringify(["7d_click", "1d_view"]);

  // Single insights call: per-campaign per-day rows with raw actions/action_values.
  const insights = await graphGet<{ data: any[] }>(
    `/${account}/insights`,
    {
      time_range: timeRange,
      time_increment: "1",
      level: "campaign",
      action_attribution_windows: attributionWindows,
      fields:
        "campaign_id,campaign_name,spend,impressions,clicks,reach,frequency,ctr,cpm,actions,action_values,objective",
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
    reach: number;
    actionsAgg: Map<string, number>;
    valuesAgg: Map<string, number>;
    byDate: Map<string, { spend: number; actions: Map<string, number>; values: Map<string, number> }>;
  };
  const byCampaign = new Map<string, CampAcc>();

  for (const row of insights.data) {
    const cid = row.campaign_id;
    if (!cid) continue;
    const spend = parseFloat(row.spend) || 0;
    const impressions = parseFloat(row.impressions) || 0;
    const clicks = parseFloat(row.clicks) || 0;
    const reach = parseFloat(row.reach) || 0;

    const acc =
      byCampaign.get(cid) ??
      ({
        name: row.campaign_name ?? "—",
        objective: row.objective ?? "—",
        spend: 0,
        impressions: 0,
        clicks: 0,
        reach: 0,
        actionsAgg: new Map(),
        valuesAgg: new Map(),
        byDate: new Map(),
      } as CampAcc);

    acc.spend += spend;
    acc.impressions += impressions;
    acc.clicks += clicks;
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
      const bucket =
        acc.byDate.get(date) ??
        { spend: 0, actions: new Map<string, number>(), values: new Map<string, number>() };
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
  let totalReach = 0;
  const dateBucket = new Map<string, { spend: number; revenue: number }>();

  const campaigns: Campaign[] = Array.from(byCampaign.entries()).map(([id, c]) => {
    const meta = metaById.get(id) ?? {};
    const convType = pickConversionType(c.actionsAgg, client.conversion_event ?? null);
    const conversions = c.actionsAgg.get(convType) ?? 0;
    const revenue = c.valuesAgg.get(convType) ?? 0;
    const budget = Number(meta.daily_budget || meta.lifetime_budget || 0) / 100;
    const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
    const cpm = c.impressions > 0 ? (c.spend / c.impressions) * 1000 : 0;

    totalSpend += c.spend;
    totalRevenue += revenue;
    totalConversions += conversions;
    totalImpressions += c.impressions;
    totalClicks += c.clicks;
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
      ctr: totalImpressions > 0 ? +((totalClicks / totalImpressions) * 100).toFixed(2) : 0,
      cpm: totalImpressions > 0 ? +((totalSpend / totalImpressions) * 1000).toFixed(2) : 0,
      impressions: totalImpressions,
      clicks: totalClicks,
      reach: totalReach,
      frequency: totalReach > 0 ? +(totalImpressions / totalReach).toFixed(2) : 0,
      conversions: +totalConversions.toFixed(0),
      conversionRate: totalClicks > 0 ? +((totalConversions / totalClicks) * 100).toFixed(2) : 0,
    },
    timeseries,
    campaigns,
  };
}

export const fetchMetaAdsData = createServerFn({ method: "POST" })
  .inputValidator((d) => clientRangeSchema.parse(d))
  .handler(async ({ data }): Promise<PaidData> => {
    if (USE_MOCKS) return mockPaid(data.clientId, data.range);

    const cached = await readCache<PaidData>(data.clientId, "paid", data.range, false);
    if (cached) return cached;

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("*")
      .eq("id", data.clientId)
      .single();
    if (!client) throw new Error("Cliente não encontrado");
    if (isPlaceholder((client as ClientRow).meta_ad_account_id)) {
      console.warn(`[paid] cliente "${(client as ClientRow).name}" sem meta_ad_account_id real (placeholder).`);
      return EMPTY_PAID;
    }

    try {
      const fresh = await fetchMetaAdsReal(client as ClientRow, data.range);
      await writeCache(data.clientId, "paid", data.range, fresh);
      return fresh;
    } catch (e) {
      console.error("fetchMetaAdsReal failed:", e);
      // Stale fallback: ignore TTL if upstream failed
      const stale = await supabaseAdmin
        .from("meta_cache")
        .select("payload")
        .eq("client_id", data.clientId)
        .eq("scope", "paid")
        .eq("range_from", data.range.from)
        .eq("range_to", data.range.to)
        .maybeSingle();
      if (stale.data) return stale.data.payload as PaidData;
      throw e;
    }
  });

/* -------------------- Organic (FB + IG) -------------------- */

async function fetchOrganicReal(
  client: ClientRow,
  range: { from: string; to: string },
): Promise<OrganicData> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN not set");

  let reach = 0;
  let profileVisits = 0;
  let newFollowers = 0;
  let engagementSum = 0;
  let engagementCount = 0;
  const topPosts: TopPost[] = [];

  // Resolver Page Access Token (FB Page insights exigem token da página, não do usuário)
  let pageToken = token;
  if (client.meta_page_id) {
    try {
      const accounts = await graphGet<{ data: Array<{ id: string; access_token: string }> }>(
        `/me/accounts`,
        { fields: "id,access_token", limit: "200" },
        token,
      );
      const match = accounts.data?.find((a) => a.id === client.meta_page_id);
      if (match?.access_token) pageToken = match.access_token;
      else console.warn(`[organic] Page token não encontrado para ${client.meta_page_id}; usando user token (provavelmente vai falhar).`);
    } catch (e) {
      console.warn("[organic] /me/accounts falhou:", e);
    }
  }

  // Facebook Page insights — métrica granular com try/catch individual
  if (client.meta_page_id) {
    const tryMetric = async (metric: string) => {
      try {
        const r = await graphGet<{ data: any[] }>(
          `/${client.meta_page_id}/insights`,
          { metric, since: range.from, until: range.to, period: "day" },
          pageToken,
        );
        return r.data ?? [];
      } catch (e) {
        console.warn(`[organic][fb] métrica "${metric}" falhou:`, (e as Error).message);
        return [];
      }
    };

    const sumValues = (data: any[], name: string) => {
      for (const m of data) {
        if (m.name !== name) continue;
        return (m.values ?? []).reduce((s: number, v: any) => s + Number(v.value || 0), 0);
      }
      return 0;
    };

    const [imp, fans, views, eng] = await Promise.all([
      tryMetric("page_impressions_unique"),
      tryMetric("page_fan_adds"),
      tryMetric("page_views_total"),
      tryMetric("page_post_engagements"),
    ]);

    reach += sumValues(imp, "page_impressions_unique");
    newFollowers += sumValues(fans, "page_fan_adds");
    profileVisits += sumValues(views, "page_views_total");
    const engTotal = sumValues(eng, "page_post_engagements");
    if (engTotal > 0) {
      engagementSum += engTotal;
      engagementCount += 1;
    }

    // FB top posts
    try {
      const posts = await graphGet<{ data: any[] }>(
        `/${client.meta_page_id}/posts`,
        {
          fields:
            "id,message,full_picture,created_time,likes.summary(true),comments.summary(true),insights.metric(post_impressions_unique)",
          since: range.from,
          until: range.to,
          limit: "10",
        },
        pageToken,
      );
      for (const p of posts.data ?? []) {
        topPosts.push({
          id: p.id,
          platform: "facebook",
          caption: p.message ?? "",
          thumbnail: p.full_picture ?? "",
          likes: p.likes?.summary?.total_count ?? 0,
          comments: p.comments?.summary?.total_count ?? 0,
          reach: p.insights?.data?.[0]?.values?.[0]?.value ?? 0,
          postedAt: p.created_time,
        });
      }
    } catch (e) {
      console.warn("[organic][fb] top posts falhou:", (e as Error).message);
    }
  }

  // Instagram insights (Graph API v19: total_value para reach/profile_views/follower_count)
  if (client.ig_account_id) {
    const tryIg = async (params: Record<string, string>) => {
      try {
        const r = await graphGet<{ data: any[] }>(
          `/${client.ig_account_id}/insights`,
          { ...params, since: range.from, until: range.to },
          token,
        );
        return r.data ?? [];
      } catch (e) {
        console.warn(`[organic][ig] insights ${JSON.stringify(params)} falhou:`, (e as Error).message);
        return [];
      }
    };

    const sumIg = (data: any[], name: string) => {
      for (const m of data) {
        if (m.name !== name) continue;
        // v19 total_value: { total_value: { value: N } }
        if (m.total_value?.value != null) return Number(m.total_value.value) || 0;
        // legacy values[]
        return (m.values ?? []).reduce((s: number, v: any) => s + Number(v.value || 0), 0);
      }
      return 0;
    };

    const [reachData, visitsData, followersData] = await Promise.all([
      tryIg({ metric: "reach", metric_type: "total_value", period: "day" }),
      tryIg({ metric: "profile_views", metric_type: "total_value", period: "day" }),
      tryIg({ metric: "follower_count", period: "day" }),
    ]);

    reach += sumIg(reachData, "reach");
    profileVisits += sumIg(visitsData, "profile_views");
    newFollowers += sumIg(followersData, "follower_count");

    // IG top media
    try {
      const media = await graphGet<{ data: any[] }>(
        `/${client.ig_account_id}/media`,
        {
          fields:
            "id,caption,media_url,thumbnail_url,like_count,comments_count,timestamp,insights.metric(reach)",
          limit: "25",
        },
        token,
      );
      for (const p of media.data ?? []) {
        const ts = p.timestamp ?? "";
        if (ts && (ts.slice(0, 10) < range.from || ts.slice(0, 10) > range.to)) continue;
        topPosts.push({
          id: p.id,
          platform: "instagram",
          caption: p.caption ?? "",
          thumbnail: p.thumbnail_url ?? p.media_url ?? "",
          likes: p.like_count ?? 0,
          comments: p.comments_count ?? 0,
          reach: p.insights?.data?.[0]?.values?.[0]?.value ?? 0,
          postedAt: ts,
        });
      }
    } catch (e) {
      console.warn("[organic][ig] media falhou:", (e as Error).message);
    }
  }

  topPosts.sort((a, b) => b.reach - a.reach);

  return {
    kpis: {
      newFollowers,
      reach,
      avgEngagement: engagementCount > 0 ? Math.round(engagementSum / engagementCount) : 0,
      profileVisits,
    },
    topPosts: topPosts.slice(0, 8),
  };
}

export const fetchOrganicData = createServerFn({ method: "POST" })
  .inputValidator((d) => clientRangeSchema.parse(d))
  .handler(async ({ data }): Promise<OrganicData> => {
    if (USE_MOCKS) return mockOrganic(data.clientId, data.range);

    const cached = await readCache<OrganicData>(data.clientId, "organic", data.range, false);
    if (cached) return cached;

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("*")
      .eq("id", data.clientId)
      .single();
    if (!client) throw new Error("Cliente não encontrado");
    const c = client as ClientRow;
    if (isPlaceholder(c.meta_page_id) && isPlaceholder(c.ig_account_id)) {
      console.warn(`[organic] cliente "${c.name}" sem meta_page_id/ig_account_id reais (placeholder).`);
      return EMPTY_ORGANIC;
    }

    try {
      const fresh = await fetchOrganicReal(client as ClientRow, data.range);
      await writeCache(data.clientId, "organic", data.range, fresh);
      return fresh;
    } catch (e) {
      console.error("fetchOrganicReal failed:", e);
      const stale = await supabaseAdmin
        .from("meta_cache")
        .select("payload")
        .eq("client_id", data.clientId)
        .eq("scope", "organic")
        .eq("range_from", data.range.from)
        .eq("range_to", data.range.to)
        .maybeSingle();
      if (stale.data) return stale.data.payload as OrganicData;
      throw e;
    }
  });

/* -------------------- Sync (invalidate + refetch) -------------------- */

export const syncClient = createServerFn({ method: "POST" })
  .inputValidator((d) => clientRangeSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; cachedAt: string }> => {
    await invalidateCache(data.clientId);
    // Pre-warm both scopes in parallel; ignore individual errors so UI re-queries handle them.
    await Promise.allSettled([
      (async () => {
        if (USE_MOCKS) return;
        const { data: c } = await supabaseAdmin
          .from("clients")
          .select("*")
          .eq("id", data.clientId)
          .single();
        if (!c) return;
        const paid = await fetchMetaAdsReal(c as ClientRow, data.range);
        await writeCache(data.clientId, "paid", data.range, paid);
      })(),
      (async () => {
        if (USE_MOCKS) return;
        const { data: c } = await supabaseAdmin
          .from("clients")
          .select("*")
          .eq("id", data.clientId)
          .single();
        if (!c) return;
        const organic = await fetchOrganicReal(c as ClientRow, data.range);
        await writeCache(data.clientId, "organic", data.range, organic);
      })(),
    ]);
    return { ok: true, cachedAt: new Date().toISOString() };
  });

async function syncScope(
  clientId: string,
  scope: Scope,
  range: { from: string; to: string },
): Promise<string> {
  await invalidateCache(clientId, scope);
  if (USE_MOCKS) return new Date().toISOString();
  const { data: c } = await supabaseAdmin
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();
  if (!c) throw new Error("Cliente não encontrado");
  const row = c as ClientRow;
  if (scope === "paid") {
    if (isPlaceholder(row.meta_ad_account_id)) {
      await writeCache(clientId, "paid", range, EMPTY_PAID);
    } else {
      const paid = await fetchMetaAdsReal(row, range);
      await writeCache(clientId, "paid", range, paid);
    }
  } else {
    if (isPlaceholder(row.meta_page_id) && isPlaceholder(row.ig_account_id)) {
      await writeCache(clientId, "organic", range, EMPTY_ORGANIC);
    } else {
      const organic = await fetchOrganicReal(row, range);
      await writeCache(clientId, "organic", range, organic);
    }
  }
  return new Date().toISOString();
}

export const syncPaid = createServerFn({ method: "POST" })
  .inputValidator((d) => clientRangeSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; cachedAt: string }> => {
    const cachedAt = await syncScope(data.clientId, "paid", data.range);
    return { ok: true, cachedAt };
  });

export const syncOrganic = createServerFn({ method: "POST" })
  .inputValidator((d) => clientRangeSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; cachedAt: string }> => {
    const cachedAt = await syncScope(data.clientId, "organic", data.range);
    return { ok: true, cachedAt };
  });

export type CacheStatus = {
  paid: { fetchedAt: string | null; expiresAt: string | null };
  organic: { fetchedAt: string | null; expiresAt: string | null };
  ttlSeconds: number;
};

export const getCacheStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => clientRangeSchema.parse(d))
  .handler(async ({ data }): Promise<CacheStatus> => {
    const { data: rows } = await supabaseAdmin
      .from("meta_cache")
      .select("scope, fetched_at")
      .eq("client_id", data.clientId)
      .eq("range_from", data.range.from)
      .eq("range_to", data.range.to);

    const build = (scope: Scope) => {
      const row = rows?.find((r) => r.scope === scope);
      if (!row) return { fetchedAt: null, expiresAt: null };
      const fetchedAt = row.fetched_at;
      const expiresAt = new Date(
        new Date(fetchedAt).getTime() + CACHE_TTL_SECONDS * 1000,
      ).toISOString();
      return { fetchedAt, expiresAt };
    };
    return {
      paid: build("paid"),
      organic: build("organic"),
      ttlSeconds: CACHE_TTL_SECONDS,
    };
  });

/* -------------------- Client admin: update IDs + test connection -------------------- */

const updateClientSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  meta_ad_account_id: z.string().trim().max(60).nullable().optional(),
  meta_page_id: z.string().trim().max(60).nullable().optional(),
  ig_account_id: z.string().trim().max(60).nullable().optional(),
  conversion_event: z.string().trim().max(80).nullable().optional(),
});

export const updateClient = createServerFn({ method: "POST" })
  .inputValidator((d) => updateClientSchema.parse(d))
  .handler(async ({ data }): Promise<ClientRow> => {
    const patch: {
      name?: string;
      meta_ad_account_id?: string | null;
      meta_page_id?: string | null;
      ig_account_id?: string | null;
      conversion_event?: string | null;
      updated_at: string;
    } = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.meta_ad_account_id !== undefined)
      patch.meta_ad_account_id = data.meta_ad_account_id || null;
    if (data.meta_page_id !== undefined)
      patch.meta_page_id = data.meta_page_id || null;
    if (data.ig_account_id !== undefined)
      patch.ig_account_id = data.ig_account_id || null;
    if (data.conversion_event !== undefined)
      patch.conversion_event = data.conversion_event || null;

    const { data: row, error } = await supabaseAdmin
      .from("clients")
      .update(patch)
      .eq("id", data.clientId)
      .select("id, name, meta_ad_account_id, meta_page_id, ig_account_id, conversion_event")
      .single();
    if (error) throw new Error(error.message);
    await invalidateCache(data.clientId);
    return row as ClientRow;
  });

/* -------------------- Campaign detail (drill-down) -------------------- */

export const fetchCampaignDetail = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        clientId: z.string().uuid(),
        campaignId: z.string().min(1),
        range: dateRangeSchema,
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<import("./analytics-types").CampaignDetail> => {
    const token = process.env.META_ACCESS_TOKEN;
    if (!token) throw new Error("META_ACCESS_TOKEN não configurado");

    const { data: c } = await supabaseAdmin
      .from("clients")
      .select("*")
      .eq("id", data.clientId)
      .single();
    if (!c) throw new Error("Cliente não encontrado");
    const client = c as ClientRow;

    const timeRange = JSON.stringify({ since: data.range.from, until: data.range.to });
    const attributionWindows = JSON.stringify(["7d_click", "1d_view"]);

    // Daily timeseries for this campaign
    const daily = await graphGet<{ data: any[] }>(
      `/${data.campaignId}/insights`,
      {
        time_range: timeRange,
        time_increment: "1",
        action_attribution_windows: attributionWindows,
        fields:
          "campaign_id,campaign_name,spend,impressions,clicks,reach,frequency,ctr,cpm,actions,action_values,objective,status",
        limit: "500",
      },
      token,
    );

    // Pick dominant conversion type from aggregated actions across the campaign
    const actionsAgg = new Map<string, number>();
    const valuesAgg = new Map<string, number>();
    let totSpend = 0, totImp = 0, totClicks = 0, totReach = 0;
    for (const row of daily.data) {
      totSpend += parseFloat(row.spend) || 0;
      totImp += parseFloat(row.impressions) || 0;
      totClicks += parseFloat(row.clicks) || 0;
      totReach = Math.max(totReach, parseFloat(row.reach) || 0);
      for (const a of (row.actions ?? []) as MetaAction[]) {
        actionsAgg.set(a.action_type, (actionsAgg.get(a.action_type) ?? 0) + (parseFloat(a.value) || 0));
      }
      for (const a of (row.action_values ?? []) as MetaAction[]) {
        valuesAgg.set(a.action_type, (valuesAgg.get(a.action_type) ?? 0) + (parseFloat(a.value) || 0));
      }
    }
    const convType = pickConversionType(actionsAgg, client.conversion_event ?? null);
    const conversions = actionsAgg.get(convType) ?? 0;
    const revenue = valuesAgg.get(convType) ?? 0;

    const timeseries = daily.data
      .map((row): import("./analytics-types").TimeSeriesPoint => {
        const spend = parseFloat(row.spend) || 0;
        const rev =
          ((row.action_values ?? []) as MetaAction[]).find((a) => a.action_type === convType)
            ?.value || "0";
        const revNum = parseFloat(rev) || 0;
        return {
          date: row.date_start,
          spend: +spend.toFixed(2),
          revenue: +revNum.toFixed(2),
          roas: spend > 0 ? +(revNum / spend).toFixed(2) : 0,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const first = daily.data[0] ?? {};
    const campaign: Campaign = {
      id: data.campaignId,
      name: first.campaign_name ?? data.campaignId,
      status: (first.status as Campaign["status"]) ?? "ACTIVE",
      budget: 0,
      spent: +totSpend.toFixed(2),
      results: +conversions.toFixed(0),
      revenue: +revenue.toFixed(2),
      roas: totSpend > 0 ? +(revenue / totSpend).toFixed(2) : 0,
      cpa: conversions > 0 ? +(totSpend / conversions).toFixed(2) : 0,
      ctr: totImp > 0 ? +((totClicks / totImp) * 100).toFixed(2) : 0,
      cpm: totImp > 0 ? +((totSpend / totImp) * 1000).toFixed(2) : 0,
      impressions: totImp,
      clicks: totClicks,
      objective: first.objective ?? "—",
      conversionType: convType,
    };

    // Ads (creative-level)
    const ads: import("./analytics-types").AdRow[] = [];
    try {
      const adRows = await graphGet<{ data: any[] }>(
        `/${data.campaignId}/insights`,
        {
          time_range: timeRange,
          level: "ad",
          action_attribution_windows: attributionWindows,
          fields:
            "ad_id,ad_name,spend,impressions,clicks,ctr,actions,action_values",
          limit: "200",
        },
        token,
      );
      for (const r of adRows.data) {
        const spend = parseFloat(r.spend) || 0;
        const impressions = parseFloat(r.impressions) || 0;
        const clicks = parseFloat(r.clicks) || 0;
        const results = extractMetaActionValue(r.actions, convType);
        const rev = extractMetaActionValue(r.action_values, convType);
        ads.push({
          id: r.ad_id,
          name: r.ad_name ?? "—",
          spend: +spend.toFixed(2),
          impressions,
          clicks,
          ctr: impressions > 0 ? +((clicks / impressions) * 100).toFixed(2) : 0,
          results: +results.toFixed(0),
          revenue: +rev.toFixed(2),
          cpa: results > 0 ? +(spend / results).toFixed(2) : 0,
          roas: spend > 0 ? +(rev / spend).toFixed(2) : 0,
        });
      }
    } catch (e) {
      console.warn("[campaign-detail] ads falhou:", (e as Error).message);
    }

    // Breakdown helper
    const fetchBreakdown = async (
      breakdowns: string,
    ): Promise<import("./analytics-types").BreakdownRow[]> => {
      try {
        const r = await graphGet<{ data: any[] }>(
          `/${data.campaignId}/insights`,
          {
            time_range: timeRange,
            breakdowns,
            action_attribution_windows: attributionWindows,
            fields: "spend,impressions,clicks,actions,action_values",
            limit: "200",
          },
          token,
        );
        return (r.data ?? []).map((row) => {
          const keyParts: string[] = [];
          for (const b of breakdowns.split(",")) {
            if (row[b] != null) keyParts.push(String(row[b]));
          }
          return {
            key: keyParts.join(" · ") || "—",
            spend: +(parseFloat(row.spend) || 0).toFixed(2),
            impressions: parseFloat(row.impressions) || 0,
            clicks: parseFloat(row.clicks) || 0,
            results: +extractMetaActionValue(row.actions, convType).toFixed(0),
            revenue: +extractMetaActionValue(row.action_values, convType).toFixed(2),
          };
        });
      } catch (e) {
        console.warn(`[campaign-detail] breakdown ${breakdowns} falhou:`, (e as Error).message);
        return [];
      }
    };

    const [ageGender, device] = await Promise.all([
      fetchBreakdown("age,gender"),
      fetchBreakdown("device_platform"),
    ]);

    return { campaign, timeseries, ads, ageGender, device };
  });



export type ConnectionCheck = {
  ok: boolean;
  label: string;
  detail?: string;
  error?: string;
};
export type ConnectionTest = {
  tokenPresent: boolean;
  paid: ConnectionCheck;
  page: ConnectionCheck;
  instagram: ConnectionCheck;
};

async function probe(
  label: string,
  fn: () => Promise<{ detail: string }>,
): Promise<ConnectionCheck> {
  try {
    const r = await fn();
    return { ok: true, label, detail: r.detail };
  } catch (e: any) {
    const message = e?.message ?? String(e);
    const friendly = message.includes("Unsupported get request")
      ? "ID não encontrado na Meta ou sem permissão para o token atual. Verifique se o ID é real e se o token tem acesso ao ativo."
      : message;
    return { ok: false, label, error: friendly };
  }
}

export const testMetaConnection = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ConnectionTest> => {
    const token = process.env.META_ACCESS_TOKEN;
    const { data: c, error } = await supabaseAdmin
      .from("clients")
      .select("id, name, meta_ad_account_id, meta_page_id, ig_account_id, conversion_event")
      .eq("id", data.clientId)
      .single();
    if (error || !c) throw new Error("Cliente não encontrado");
    const row = c as ClientRow;

    if (!token) {
      const err = { ok: false, error: "META_ACCESS_TOKEN não configurado" } as const;
      return {
        tokenPresent: false,
        paid: { ...err, label: "Meta Ads" },
        page: { ...err, label: "Facebook Page" },
        instagram: { ...err, label: "Instagram" },
      };
    }

    const paid: ConnectionCheck = isPlaceholder(row.meta_ad_account_id)
      ? { ok: false, label: "Meta Ads", error: "ID de exemplo ou incompleto. Informe o Account ID real." }
      : await probe("Meta Ads", async () => {
          const acc = row.meta_ad_account_id!.startsWith("act_")
            ? row.meta_ad_account_id!
            : `act_${row.meta_ad_account_id}`;
          const r = await graphGet<any>(
            `/${acc}`,
            { fields: "name,account_status,currency,timezone_name" },
            token,
          );
          return {
            detail: `${r.name} · ${r.currency} · status ${r.account_status} · ${r.timezone_name}`,
          };
        });

    const page: ConnectionCheck = isPlaceholder(row.meta_page_id)
      ? { ok: false, label: "Facebook Page", error: "ID de exemplo ou incompleto. Informe o Page ID real." }
      : await probe("Facebook Page", async () => {
          const r = await graphGet<any>(
            `/${row.meta_page_id}`,
            { fields: "name,category,fan_count" },
            token,
          );
          return { detail: `${r.name} · ${r.category ?? "—"} · ${r.fan_count ?? 0} fãs` };
        });

    const instagram: ConnectionCheck = isPlaceholder(row.ig_account_id)
      ? { ok: false, label: "Instagram", error: "ID de exemplo ou incompleto. Informe o Instagram Account ID real." }
      : await probe("Instagram", async () => {
          const r = await graphGet<any>(
            `/${row.ig_account_id}`,
            { fields: "username,followers_count,media_count" },
            token,
          );
          return {
            detail: `@${r.username} · ${r.followers_count ?? 0} seguidores · ${r.media_count ?? 0} posts`,
          };
        });

    return { tokenPresent: true, paid, page, instagram };
  });

/* -------------------- AI Optimizer -------------------- */

const insightsSchema = z.object({
  clientName: z.string(),
  metrics: z.object({
    paid: z.any(),
    organic: z.any(),
  }),
});

export const generateAiInsights = createServerFn({ method: "POST" })
  .inputValidator((d) => insightsSchema.parse(d))
  .handler(async ({ data }): Promise<{ markdown: string }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return {
        markdown:
          "## Erro\nLOVABLE_API_KEY não configurada. Ative o AI Gateway nas configurações.",
      };
    }

    const prompt = `Você é um consultor sênior de mídia paga e orgânica para agências.
Analise os dados do cliente "${data.clientName}" e gere um plano de otimização em PT-BR.

## Estrutura obrigatória (em Markdown):
1. **Diagnóstico Geral** (2-3 linhas)
2. **🔥 Pontos de Estrangulamento (Tráfego Pago)** — liste 3 campanhas/métricas críticas
3. **💡 Plano de Ação - Mídia Paga** — bullets acionáveis
4. **📱 Sugestões de Criativos para o Orgânico** — 3 ideias específicas com hook + formato
5. **📈 Próximos 7 dias** — checklist priorizada

Dados:
\`\`\`json
${JSON.stringify(data.metrics, null, 2)}
\`\`\`

Seja específico, cite números reais dos dados. Não use disclaimers genéricos.`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("AI Gateway error:", res.status, text);
        if (res.status === 429)
          return { markdown: "## Limite atingido\nMuitas requisições. Tente novamente em alguns segundos." };
        if (res.status === 402)
          return { markdown: "## Créditos esgotados\nAdicione créditos em Settings → Workspace → Usage." };
        return { markdown: `## Erro ${res.status}\n${text.slice(0, 500)}` };
      }

      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content ?? "_Sem resposta da IA._";
      return { markdown: content };
    } catch (e) {
      console.error("generateAiInsights failed:", e);
      return { markdown: "## Falha\nNão foi possível gerar insights agora." };
    }
  });
