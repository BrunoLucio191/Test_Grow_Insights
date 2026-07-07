import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseServerClient } from "./supabase.ts";
import { CampaignGroup } from "./analytics-types.ts";

//Campaign Groups

export const listCampaignGroups = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<CampaignGroup[]> => {
    const supabaseAuth = getSupabaseServerClient();
    // Verifica qual usuário está enviando a requisição para bater com a tabela client_users
    const { data: authData, error: authError } = await supabaseAuth.auth.getUser();

    if (authError) {
      console.error(authError.message);
    } else {
      console.log(authData.user?.id);
    }
    const { data: rows, error } = await supabaseAuth
      .from("campaign_groups")
      .select("id, client_id, name, campaign_ids")
      .eq("client_id", data.clientId)
      .order("name", { ascending: true });

    if (error) {
      console.error(error);
      return [];
    }

    return (rows as import("./analytics-types.ts").CampaignGroup[]) ?? [];
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
  .handler(async ({ data }): Promise<import("./analytics-types.ts").CampaignGroup> => {
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
    return row as import("./analytics-types.ts").CampaignGroup;
  });

export const deleteCampaignGroup = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const supabaseAuth = getSupabaseServerClient();

    const { error } = await supabaseAuth.from("campaign_groups").delete().eq("id", data.id);

    if (error) throw new Error(error.message);

    return { ok: true };
  });
