import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ClientRow } from "./analytics-types.ts";
import { graphGet } from "./metaGraph.server.ts";
import { getSupabaseServerClient } from "./supabase.ts";
import { invalidateCache } from "./cache.server.ts";

//Logica para lidar com clientes

export const getMetaToken = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ clientName: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const supabaseAuth = getSupabaseServerClient();

    const { data: row, error } = await supabaseAuth
      .from("clients")
      .select("meta_access_token")
      .eq("name", data.clientName);

    if (error) throw error;
    return row;
  });

export const listClients = createServerFn({ method: "GET" }).handler(
  async (): Promise<ClientRow[]> => {
    const supabaseAuth = getSupabaseServerClient();

    const { data, error } = await supabaseAuth
      .from("clients")
      .select(
        "id, name, meta_ad_account_id, meta_page_id, ig_account_id, meta_access_token, conversion_event, attribution_window",
      )
      .order("name", { ascending: true });

    if (error) {
      console.error("[listClients] 4. Ocorreu um erro no banco (Provável RLS):", error);
      return [];
    }

    return (data as ClientRow[]) ?? [];
  },
);

export const createClient = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ name: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ data }): Promise<ClientRow> => {
    const supabaseAuth = getSupabaseServerClient();

    const { data: row, error } = await supabaseAuth
      .from("clients")
      .insert({ name: data.name })
      .select(
        "id, name, meta_ad_account_id, meta_page_id, ig_account_id, meta_access_token, conversion_event, attribution_window",
      )
      .single();

    if (error) throw new Error(error.message);

    return row as ClientRow;
  });

export const deleteClient = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const supabaseAuth = getSupabaseServerClient();

    await supabaseAuth.from("meta_cache").delete().eq("client_id", data.clientId);

    const { error } = await supabaseAuth.from("clients").delete().eq("id", data.clientId);

    if (error) throw new Error(error.message);

    return { ok: true };
  });

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
    const patch: {
      name?: string;
      meta_ad_account_id?: string | null;
      meta_page_id?: string | null;
      ig_account_id?: string | null;
      meta_access_token?: string | null;
      conversion_event?: string | null;
      attribution_window?: string | null;
      updated_at: string;
    } = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.meta_ad_account_id !== undefined)
      patch.meta_ad_account_id = data.meta_ad_account_id || null;
    if (data.meta_page_id !== undefined) patch.meta_page_id = data.meta_page_id || null;
    if (data.ig_account_id !== undefined) patch.ig_account_id = data.ig_account_id || null;
    if (data.meta_access_token !== undefined)
      patch.meta_access_token = data.meta_access_token || null;
    if (data.conversion_event !== undefined) patch.conversion_event = data.conversion_event || null;
    if (data.attribution_window !== undefined)
      patch.attribution_window = data.attribution_window || null;

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

//TODO: remover esse funcao de importarMetaAccounts
/*
export const importMetaAccounts = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ imported: number; total: number; skipped: number }> => {
    const token = process.env.META_ACCESS_TOKEN;
    const supabaseAuth = getSupabaseServerClient();

    if (!token) throw new Error("META_ACCESS_TOKEN não configurado");

    const res = await graphGet<{ data: Array<{ name: string; account_id: string }> }>(
      "/me/adaccounts",
      { fields: "name,account_id", limit: "100" },
      token,
    );

    const accounts = res.data ?? [];

    const { data: existing } = await supabaseAuth.from("clients").select("meta_ad_account_id");

    const have = new Set(
      (existing ?? []).map((r) => r.meta_ad_account_id).filter((v): v is string => !!v),
    );

    const toInsert: Array<{ name: string; meta_ad_account_id: string }> = [];

    for (const a of accounts) {
      const id = a.account_id.startsWith("act_") ? a.account_id : `act_${a.account_id}`;
      if (have.has(id)) continue;
      toInsert.push({ name: a.name || id, meta_ad_account_id: id });
    }

    let imported = 0;

    if (toInsert.length > 0) {
      const { error, data } = await supabaseAuth.from("clients").insert(toInsert).select("id");

      if (error) throw new Error(error.message);

      imported = data?.length ?? 0;
    }
    return { imported, total: accounts.length, skipped: accounts.length - imported };
  },
);
*/
