import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClient } from "@/lib/supabase";
import { AuthState, SignInSchema, UserMetaSchema } from "./auth.schema";
import { create } from "domain";

export const signIn = createServerFn()
  .inputValidator(SignInSchema)
  .handler(async ({ data }) => {
    const { error } = await getSupabaseServerClient().auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      return { error: error.message };
    }
  });

export const signOut = createServerFn().handler(async () => {
  await getSupabaseServerClient().auth.signOut();
});

export const getUser = createServerFn().handler<AuthState>(async () => {
  const supabase = getSupabaseServerClient();

  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return { isAuthenticated: false };
  }

  return {
    isAuthenticated: true,
    user: {
      email: data.user.email,
      meta: { username: data.user.user_metadata.username },
    },
  };
});
