import { User } from "@/lib/analytics-types";
import { getSupabaseServerClient } from "@/lib/supabase";
import { createServerFn } from "@tanstack/react-start";

export const getUser = createServerFn({ method: "GET" }).handler(async (): Promise<User> => {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (user == null) {
    throw new Error(`Error ${user} is null`);
  }

  const { data, error: err } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", user.id);

  if (data == null) throw new Error(`Error ${data} is null`);

  return { display_name: data[0].display_name } as User;
});

export const verificarSessao = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = getSupabaseServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user || error) {
    return { isValido: false, erro: error?.message };
  }
  return { isValido: true, user };
});
