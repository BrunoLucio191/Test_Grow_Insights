import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

function createSupabaseBrowserClient() {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("[Supabase] Missing environment variables for Browser Client.");
  }

  return createBrowserClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!);
}

let _supabase: ReturnType<typeof createSupabaseBrowserClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseBrowserClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseBrowserClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
