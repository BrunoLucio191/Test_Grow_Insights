import { z } from "zod";

export const dateRangeSchema = z.object({
  from: z.string(),
  to: z.string(),
});
