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

const clientRangeSchema = z.object({
  clientId: z.string().uuid(),
  range: dateRangeSchema,
});

// Default: use real Meta API. Set USE_MOCKS=true to force synthetic data.
const USE_MOCKS = (process.env.USE_MOCKS ?? "false") === "true";

// Cache TTL: how long a cached response is considered fresh (seconds).
const CACHE_TTL_SECONDS = 60 * 60; // 1 hour

const GRAPH_API = "https://graph.facebook.com/v19.0";

function isPlaceholder(id: string | null | undefined): boolean {
  return isPlaceholderId(id);
}

const EMPTY_PAID: PaidData = {
  kpis: { spend: 0, roas: 0, cpa: 0, ctr: 0, cpm: 0 },
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
      .select("id, name, meta_ad_account_id, meta_page_id, ig_account_id")
      .order("name", { ascending: true });
    if (error) {
      console.error("listClients error:", error);
      return [];
    }
    return data ?? [];
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

function sumAction(actions: Array<{ action_type: string; value: string }> | undefined, types: string[]): number {
  if (!actions) return 0;
  return actions
    .filter((a) => types.includes(a.action_type))
    .reduce((s, a) => s + Number(a.value || 0), 0);
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

  // 1. Account-level daily timeseries
  const daily = await graphGet<{ data: any[] }>(
    `/${account}/insights`,
    {
      time_range: timeRange,
      time_increment: "1",
      fields: "spend,impressions,clicks,ctr,cpm,actions,action_values",
      level: "account",
    },
    token,
  );

  const timeseries: TimeSeriesPoint[] = daily.data.map((d: any) => {
    const spend = Number(d.spend || 0);
    const revenue = sumAction(d.action_values, ["purchase", "omni_purchase"]);
    return {
      date: d.date_start,
      spend,
      roas: spend > 0 ? +(revenue / spend).toFixed(2) : 0,
    };
  });

  // 2. Aggregate KPIs for the whole period
  const totals = await graphGet<{ data: any[] }>(
    `/${account}/insights`,
    {
      time_range: timeRange,
      fields: "spend,impressions,clicks,ctr,cpm,actions,action_values",
      level: "account",
    },
    token,
  );
  const t = totals.data[0] ?? {};
  const spend = Number(t.spend || 0);
  const revenue = sumAction(t.action_values, ["purchase", "omni_purchase"]);
  const conversions = sumAction(t.actions, ["purchase", "omni_purchase", "lead", "complete_registration"]);

  // 3. Campaign breakdown
  const camps = await graphGet<{ data: any[] }>(
    `/${account}/insights`,
    {
      time_range: timeRange,
      fields: "campaign_id,campaign_name,spend,actions,objective",
      level: "campaign",
      limit: "50",
    },
    token,
  );
  const campMeta = await graphGet<{ data: any[] }>(
    `/${account}/campaigns`,
    { fields: "id,name,status,daily_budget,lifetime_budget,objective", limit: "50" },
    token,
  );
  const statusById = new Map(campMeta.data.map((c) => [c.id, c]));

  const campaigns: Campaign[] = camps.data.map((c: any) => {
    const meta = statusById.get(c.campaign_id) ?? {};
    const budget = Number(meta.daily_budget || meta.lifetime_budget || 0) / 100;
    return {
      id: c.campaign_id,
      name: c.campaign_name,
      status: (meta.status as Campaign["status"]) ?? "ACTIVE",
      budget,
      spent: Number(c.spend || 0),
      results: sumAction(c.actions, ["purchase", "omni_purchase", "lead", "complete_registration"]),
      objective: c.objective ?? meta.objective ?? "—",
    };
  });

  return {
    kpis: {
      spend,
      roas: spend > 0 ? +(revenue / spend).toFixed(2) : 0,
      cpa: conversions > 0 ? +(spend / conversions).toFixed(2) : 0,
      ctr: Number(t.ctr || 0),
      cpm: Number(t.cpm || 0),
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

  // Facebook Page insights
  if (client.meta_page_id) {
    try {
      const fb = await graphGet<{ data: any[] }>(
        `/${client.meta_page_id}/insights`,
        {
          metric: "page_impressions_unique,page_fan_adds,page_views_total,page_post_engagements",
          since: range.from,
          until: range.to,
        },
        token,
      );
      for (const m of fb.data) {
        const total = (m.values ?? []).reduce((s: number, v: any) => s + Number(v.value || 0), 0);
        if (m.name === "page_impressions_unique") reach += total;
        if (m.name === "page_fan_adds") newFollowers += total;
        if (m.name === "page_views_total") profileVisits += total;
        if (m.name === "page_post_engagements") {
          engagementSum += total;
          engagementCount += 1;
        }
      }
      // FB top posts
      const posts = await graphGet<{ data: any[] }>(
        `/${client.meta_page_id}/posts`,
        {
          fields: "id,message,full_picture,created_time,likes.summary(true),comments.summary(true),insights.metric(post_impressions_unique)",
          since: range.from,
          until: range.to,
          limit: "10",
        },
        token,
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
      console.error("FB organic fetch failed:", e);
    }
  }

  // Instagram insights
  if (client.ig_account_id) {
    try {
      const ig = await graphGet<{ data: any[] }>(
        `/${client.ig_account_id}/insights`,
        {
          metric: "reach,profile_views,follower_count",
          period: "day",
          since: range.from,
          until: range.to,
        },
        token,
      );
      for (const m of ig.data) {
        const total = (m.values ?? []).reduce((s: number, v: any) => s + Number(v.value || 0), 0);
        if (m.name === "reach") reach += total;
        if (m.name === "profile_views") profileVisits += total;
        if (m.name === "follower_count") newFollowers += total;
      }
      // IG top media
      const media = await graphGet<{ data: any[] }>(
        `/${client.ig_account_id}/media`,
        {
          fields: "id,caption,media_url,thumbnail_url,like_count,comments_count,timestamp,insights.metric(reach)",
          limit: "10",
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
      console.error("IG organic fetch failed:", e);
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
});

export const updateClient = createServerFn({ method: "POST" })
  .inputValidator((d) => updateClientSchema.parse(d))
  .handler(async ({ data }): Promise<ClientRow> => {
    const patch: {
      name?: string;
      meta_ad_account_id?: string | null;
      meta_page_id?: string | null;
      ig_account_id?: string | null;
      updated_at: string;
    } = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.meta_ad_account_id !== undefined)
      patch.meta_ad_account_id = data.meta_ad_account_id || null;
    if (data.meta_page_id !== undefined)
      patch.meta_page_id = data.meta_page_id || null;
    if (data.ig_account_id !== undefined)
      patch.ig_account_id = data.ig_account_id || null;

    const { data: row, error } = await supabaseAdmin
      .from("clients")
      .update(patch)
      .eq("id", data.clientId)
      .select("id, name, meta_ad_account_id, meta_page_id, ig_account_id")
      .single();
    if (error) throw new Error(error.message);
    await invalidateCache(data.clientId);
    return row as ClientRow;
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
      .select("id, name, meta_ad_account_id, meta_page_id, ig_account_id")
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
