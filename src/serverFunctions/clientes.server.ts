import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ClientRow } from "../lib/analytics-types.ts";
import { getSupabaseServerClient } from "../lib/supabase.ts";
import { invalidateCache } from "./cache.server.ts";
import { updateClientSchema } from "@/zod/updateClient.ts";
import { ClienteUpdatePayload } from "../lib/analytics-types.ts";

// Database operations related to clients.
export const getMetaToken = createServerFn({ method: "GET" })
  .validator((d) => z.object({ clientName: z.string() }).parse(d))
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
  .validator((d) => z.object({ name: z.string().trim().min(1).max(120) }).parse(d))
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
  .validator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const supabaseAuth = getSupabaseServerClient();

    await supabaseAuth.from("meta_cache").delete().eq("client_id", data.clientId);

    const { error } = await supabaseAuth.from("clients").delete().eq("id", data.clientId);

    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const updateClient = createServerFn({ method: "POST" })
  .validator((d) => updateClientSchema.parse(d))
  .handler(async ({ data: validatedInput }): Promise<ClientRow> => {
    const fieldsToUpdate: ClienteUpdatePayload = {
      updated_at: new Date().toISOString(),
    };

    if (validatedInput.name !== undefined) fieldsToUpdate.name = validatedInput.name;

    if (validatedInput.meta_ad_account_id !== undefined)
      fieldsToUpdate.meta_ad_account_id = validatedInput.meta_ad_account_id || null;

    if (validatedInput.meta_page_id !== undefined)
      fieldsToUpdate.meta_page_id = validatedInput.meta_page_id || null;

    if (validatedInput.ig_account_id !== undefined)
      fieldsToUpdate.ig_account_id = validatedInput.ig_account_id || null;

    if (validatedInput.meta_access_token !== undefined)
      fieldsToUpdate.meta_access_token = validatedInput.meta_access_token || null;

    if (validatedInput.conversion_event !== undefined)
      fieldsToUpdate.conversion_event = validatedInput.conversion_event || null;

    if (validatedInput.attribution_window !== undefined)
      fieldsToUpdate.attribution_window = validatedInput.attribution_window || null;

    const supabaseAuth = getSupabaseServerClient();

    const { data: row, error } = await supabaseAuth
      .from("clients")
      .update(fieldsToUpdate)
      .eq("id", validatedInput.clientId)
      .select(
        "id, name, meta_ad_account_id, meta_page_id, ig_account_id, meta_access_token, conversion_event, attribution_window",
      )
      .single();
    if (error) throw new Error(error.message);
    await invalidateCache(validatedInput.clientId);
    return row as ClientRow;
  });
