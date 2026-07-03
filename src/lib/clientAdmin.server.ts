import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ClientRow } from "./analytics-types";
import { invalidateCache } from "./cache.server";
import { getSupabaseServerClient } from "./supabase";

/* -------------------- Client admin: update IDs + test connection -------------------- */
const updateClientSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  meta_ad_account_id: z.string().trim().max(60).nullable().optional(),
  meta_page_id: z.string().trim().max(60).nullable().optional(),
  ig_account_id: z.string().trim().max(60).nullable().optional(),
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
      conversion_event?: string | null;
      attribution_window?: string | null;
      updated_at: string;
    } = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.meta_ad_account_id !== undefined)
      patch.meta_ad_account_id = data.meta_ad_account_id || null;
    if (data.meta_page_id !== undefined) patch.meta_page_id = data.meta_page_id || null;
    if (data.ig_account_id !== undefined) patch.ig_account_id = data.ig_account_id || null;
    if (data.conversion_event !== undefined) patch.conversion_event = data.conversion_event || null;
    if (data.attribution_window !== undefined)
      patch.attribution_window = data.attribution_window || null;

    const supabaseAuth = getSupabaseServerClient();
    const { data: row, error } = await supabaseAuth
      .from("clients")
      .update(patch)
      .eq("id", data.clientId)
      .select(
        "id, name, meta_ad_account_id, meta_page_id, ig_account_id, conversion_event, attribution_window",
      )
      .single();
    if (error) throw new Error(error.message);
    await invalidateCache(data.clientId);
    return row as ClientRow;
  });
