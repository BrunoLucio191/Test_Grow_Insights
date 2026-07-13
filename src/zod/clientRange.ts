import { attributionSchema } from "./attribution";
import { dateRangeSchema } from "./dateRange";
import { z } from "zod";

export const clientRangeSchema = z.object({
  clientId: z.string().uuid(),
  range: dateRangeSchema,
  attribution: attributionSchema,
});
