import z from "zod";

export const userSchema = z.object({
  displa_name: z.string(),
});
