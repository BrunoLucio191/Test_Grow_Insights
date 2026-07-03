import { createMiddleware } from "@tanstack/react-start";
import { getSupabaseServerClient } from "@/lib/supabase"; // Ajuste o caminho se necessário

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const supabase = getSupabaseServerClient();

    // Pega o usuário validadndo os cookies da requisição atual
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      throw new Error("Unauthorized: Invalid session or missing cookie");
    }

    return next({
      context: {
        supabase,
        userId: data.user.id,
        user: data.user,
      },
    });
  },
);
