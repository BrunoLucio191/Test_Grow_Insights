import { z } from "zod";

export const UserMetaSchema = z.object({
  username: z.string().min(3).max(20),
});

export type UserMeta = z.infer<typeof UserMetaSchema>;

//não tem schema de logar, usuarios sao adiiconados
//dentro do proprio supabae

export const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type AuthState =
  | { isAuthenticated: false }
  | {
      isAuthenticated: true;
      user: {
        email: string | undefined;
        meta: UserMeta;
      };
    };
