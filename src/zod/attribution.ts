import { z } from "zod";

export const attributionSchema = z
  .enum(["7d click,1d view", "1d click,1d view", "7d click", "1d click"])
  .optional()
  .nullable();
