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
            const cookieHeader = getRequest().headers.get("cookie") || "";
            const cookie = cookieHeader
              .split(";")
              .map((cookie) => {
                const [name, ...rest] = cookie.trim().split("=");
                return { name, value: rest.join("=") };
              })
              .filter((cookie) => cookie.name);
            return cookie;
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              const cookiesOPtions = {
                ...options,
                secure: true,
                maxAge: 86400,
                path: "/",
                sameSite: "lax" as const,
                httpOnly: true,
              };
              setCookie(name, value, cookiesOPtions);
            });
          },
        },
        cookieEncoding: "base64url",
      },
    );
  }
});
