import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ClientRow } from "./analytics-types.ts";
import { graphGet } from "./metaGraph.server.ts";
import { getSupabaseServerClient } from "./supabase.ts";

//Logica para lidar com clientes
export const listClients = createServerFn({ method: "GET" }).handler(
  async (): Promise<ClientRow[]> => {
    const supabaseAuth = getSupabaseServerClient();

    const { data, error } = await supabaseAuth
      .from("clients")
      .select(
        "id, name, meta_ad_account_id, meta_page_id, ig_account_id, conversion_event, attribution_window",
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
        "id, name, meta_ad_account_id, meta_page_id, ig_account_id, conversion_event, attribution_window",
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

//TODO: arrumar isso para que o token seja salvo no banco de dados
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
