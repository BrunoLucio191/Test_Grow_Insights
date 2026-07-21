import { z } from "zod";

export const updateClientSchema = z.object({
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
