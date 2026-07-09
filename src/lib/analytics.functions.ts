import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ClientRow, PaidData, OrganicData } from "./analytics-types";
import { isPlaceholderId } from "./analytics-types";
import { getSupabaseServerClient } from "../lib/supabase";
import { invalidateCache } from "./cache.server";

export const dateRangeSchema = z.object({
  from: z.string(),
  to: z.string(),
});

export const attributionSchema = z
  .enum(["7d_click,1d_view", "1d_click,1d_view", "7d_click", "1d_click"])
  .optional()
  .nullable();

export const clientRangeSchema = z.object({
  clientId: z.string().uuid(),
  range: dateRangeSchema,
  attribution: attributionSchema,
});

/**
 * Converts a comma-separated attribution string into an array of strings.
 * Handles whitespace trimming and filters out empty or falsy entries to ensure data integrity.
 *
 * @param value - The raw attribution string (e.g., "7d_click, 1d_view") or null/undefined.
 * @returns An array of cleaned attribution strings. Returns the default configuration if input is empty.
 */

export function attrToArray(value: string | null | undefined): string[] {
  if (!value) return ["7d_click", "1d_view"];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Generates a unique cache key for database storage (meta_cache).
 * * - If the attribution is the default ("7d_click,1d_view"), it returns only
 * the base name ("paid" or "organic") for backward compatibility.
 * - Otherwise, it appends the attribution suffix to ensure that data
 * with different conversion windows is stored in distinct cache records.
 * * @param base - The data scope (paid or organic).
 * @param attribution - The optional attribution window configuration.
 * @returns A formatted string to be used as a cache key.
 */

export function scopeKey(base: "paid" | "organic", attribution?: string | null): string {
  const attr = attribution ?? "7d_click,1d_view";

  if (attr === "7d_click,1d_view") return base; // backward compatible
  return `${base}:atr=${attr}`;
}

// Default: use real Meta API. Set USE_MOCKS=true to force synthetic data.
export const USE_MOCKS = (process.env.USE_MOCKS ?? "false") === "true";

// Cache TTL: how long a cached response is considered fresh (seconds).
export const CACHE_TTL_SECONDS = 60 * 60; // 1 hour

export const GRAPH_API = "https://graph.facebook.com/v19.0";

export function isPlaceholder(id: string | null | undefined): boolean {
  return isPlaceholderId(id);
}

export const EMPTY_PAID: PaidData = {
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
export const EMPTY_ORGANIC: OrganicData = {
  kpis: { newFollowers: 0, reach: 0, avgEngagement: 0, profileVisits: 0 },
  topPosts: [],
};

/* -------------------- Client admin: update IDs + test connection -------------------- */
const updateClientSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  meta_ad_account_id: z.string().trim().max(60).nullable().optional(),
  meta_page_id: z.string().trim().max(60).nullable().optional(),
  ig_account_id: z.string().trim().max(60).nullable().optional(),
  meta_access_token: z.string().nullable().optional(),
  conversion_event: z.string().trim().max(80).nullable().optional(),
  attribution_window: z
    .enum(["7d_click,1d_view", "1d_click,1d_view", "7d_click", "1d_click"])
    .nullable()
    .optional(),
});

export const updateClient = createServerFn({ method: "POST" })
  .inputValidator((d) => updateClientSchema.parse(d))
  .handler(async ({ data }): Promise<ClientRow> => {
    console.log(" BACKEND RECEBEU:", data);
    const patch: {
      name?: string;
      meta_ad_account_id?: string | null;
      meta_page_id?: string | null;
      ig_account_id?: string | null;
      meta_access_token?: string | null; // CORREÇÃO 1: Aqui o tipo é 'string', não 'data...'
      conversion_event?: string | null;
      attribution_window?: string | null;
      updated_at: string;
    } = { updated_at: new Date().toISOString() };

    if (data.name !== undefined) patch.name = data.name;
    if (data.meta_ad_account_id !== undefined)
      patch.meta_ad_account_id = data.meta_ad_account_id || null;
    if (data.meta_page_id !== undefined) patch.meta_page_id = data.meta_page_id || null;
    if (data.ig_account_id !== undefined) patch.ig_account_id = data.ig_account_id || null;

    // CORREÇÃO 2: Alimentando o patch com o dado que veio do frontend
    if (data.meta_access_token !== undefined)
      patch.meta_access_token = data.meta_access_token || null;

    if (data.conversion_event !== undefined) patch.conversion_event = data.conversion_event || null;
    if (data.attribution_window !== undefined)
      patch.attribution_window = data.attribution_window || null;

    console.log("====================================");
    console.log("🔥 DADO QUE SERÁ ENVIADO AO SUPABASE:", patch);
    console.log("====================================");
    const supabaseAuth = getSupabaseServerClient();

    const { data: row, error } = await supabaseAuth
      .from("clients")
      .update(patch)
      .eq("id", data.clientId)
      .select(
        "id, name, meta_ad_account_id, meta_page_id, ig_account_id, meta_access_token, conversion_event, attribution_window",
      )
      .single();

    if (error) throw new Error(error.message);

    await invalidateCache(data.clientId);
    return row as ClientRow;
  });

//Campaign Groups -------------------- */
export const listCampaignGroups = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<import("./analytics-types").CampaignGroup[]> => {
    const supabaseAuth = getSupabaseServerClient();

    // --- TESTE DE AUTENTICAÇÃO ---
    // Verifica qual usuário está enviando a requisição para bater com a tabela client_users
    const { data: authData, error: authError } = await supabaseAuth.auth.getUser();

    if (authError) {
      console.error(authError.message);
    } else {
      console.log(authData.user?.id);
    }
    // -----------------------------

    const { data: rows, error } = await supabaseAuth
      .from("campaign_groups")
      .select("id, client_id, name, campaign_ids")
      .eq("client_id", data.clientId)
      .order("name", { ascending: true });

    if (error) {
      console.error(error);
      return [];
    }

    return (rows as import("./analytics-types").CampaignGroup[]) ?? [];
  });

export const upsertCampaignGroup = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        clientId: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
        campaignIds: z.array(z.string().min(1)).min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<import("./analytics-types").CampaignGroup> => {
    const supabaseAuth = getSupabaseServerClient();

    const payload = {
      client_id: data.clientId,
      name: data.name,
      campaign_ids: data.campaignIds,
      updated_at: new Date().toISOString(),
    };

    const query = data.id
      ? supabaseAuth.from("campaign_groups").update(payload).eq("id", data.id)
      : supabaseAuth.from("campaign_groups").insert(payload);

    const { data: row, error } = await query.select("id, client_id, name, campaign_ids").single();
    if (error) throw new Error(error.message);
    return row as import("./analytics-types").CampaignGroup;
  });

export const deleteCampaignGroup = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const supabaseAuth = getSupabaseServerClient();

    const { error } = await supabaseAuth.from("campaign_groups").delete().eq("id", data.id);

    if (error) throw new Error(error.message);

    return { ok: true };
  });
