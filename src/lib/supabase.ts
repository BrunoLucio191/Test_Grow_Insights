import { createServerClient } from "@supabase/ssr";
import { getRequest, setCookie } from "@tanstack/react-start/server";
import { Database } from "./database.types";
import { createServerOnlyFn } from "@tanstack/react-start";

export const getSupabaseServerClient = createServerOnlyFn(() => {
  {
    return createServerClient<Database>(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            // Lê a string do cabeçalho e transforma direto no array de {name, value} do Supabase
            const cookieHeader = getRequest().headers.get("cookie") || "";
            return cookieHeader
              .split(";")
              .map((c) => {
                const [name, ...rest] = c.trim().split("=");
                return { name, value: rest.join("=") };
              })
              .filter((c) => c.name);
          },
          setAll(cookiesToSet) {
            // Usa a função NATIVA do TanStack Start, limpo e direto!
            cookiesToSet.forEach(({ name, value, options }) => {
              const cookiesOPtions = {
                ...options,
                maxAge: 60 * 24 * 30,
                path: "/",
                sameSite: "lax" as const,
              };
              setCookie(name, value, options);
            });
          },
        },
      },
    );
  }
});
