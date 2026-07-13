import { z } from "zod";

export const attributionSchema = z
  .enum(["7d_click,1d_view", "1d_click,1d_view", "7d_click", "1d_click"])
  .optional()
  .nullable();
