import { createServerFn } from "@tanstack/react-start";
import type { ClientRow } from "./analytics-types.ts";
import {
  USE_MOCKS,
  scopeKey,
  isPlaceholder,
  EMPTY_PAID,
  EMPTY_ORGANIC,
  CACHE_TTL_SECONDS,
} from "./analytics.functions.ts";
import { clientRangeSchema } from "./analytics.functions.ts";
import { getSupabaseServerClient } from "./supabase.ts";
import { invalidateCache, writeCache, fetchOrganicReal } from "./cache.server.ts";
import { fetchMetaAdsReal } from "./pago.server.ts";
/* eslint-disable  @typescript-eslint/no-explicit-any */
//Sync (invalidate + refetch)
export const syncClient = createServerFn({ method: "POST" })
  .inputValidator((d) => clientRangeSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; cachedAt: string }> => {
    console.log(`🟡 [syncClient] 1. Iniciando sync manual para o cliente: ${data.clientId}`);

    // 1. CHECAGEM DE SEGURANÇA (RLS): O usuário tem permissão para esse cliente?
    const supabaseAuth = getSupabaseServerClient();
    const { data: clientRow, error: authError } = await supabaseAuth
      .from("clients")
      .select("*")
      .eq("id", data.clientId)
      .single();

    if (authError || !clientRow) {
      console.error("❌ [syncClient] 2. Bloqueado pelo RLS ou cliente inexistente:", authError);
      throw new Error("Você não tem permissão para sincronizar este cliente.");
    }

    console.log("🟢 [syncClient] 2. Permissão validada pelo RLS. Limpando cache antigo...");
    await invalidateCache(data.clientId);

    console.log("🟡 [syncClient] 3. Disparando requisições para a API da Meta...");

    // 2. EXECUÇÃO COM LOGS DE ERRO
    const results = await Promise.allSettled([
      (async () => {
        if (USE_MOCKS) return;
        console.log("   -> [syncClient] Buscando Meta Ads...");
        const paid = await fetchMetaAdsReal(clientRow as ClientRow, data.range);
        await writeCache(data.clientId, "paid", data.range, paid);
        console.log("   ✅ [syncClient] Meta Ads salvo no cache!");
      })(),
      (async () => {
        if (USE_MOCKS) return;
        console.log("   -> [syncClient] Buscando Orgânico...");
        const organic = await fetchOrganicReal(clientRow as ClientRow, data.range);
        await writeCache(data.clientId, "organic", data.range, organic);
        console.log("   ✅ [syncClient] Orgânico salvo no cache!");
      })(),
    ]);

    // 3. VERIFICANDO SE A META REJEITOU ALGO
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(
          `❌ [syncClient] 4. Erro na Promise ${index === 0 ? "Ads" : "Orgânico"}:`,
          result.reason,
        );
      }
    });

    console.log("✅ [syncClient] 5. Processo de sincronização finalizado.");
    return { ok: true, cachedAt: new Date().toISOString() };
  });

async function syncScope(
  clientId: string,
  scope: "paid" | "organic", // <--- Mudei aqui!
  range: { from: string; to: string },
  attribution?: string | null,
): Promise<string> {
  const supabaseAuth = getSupabaseServerClient();
  const sk = scope === "paid" ? scopeKey("paid", attribution) : "organic";

  await invalidateCache(clientId, sk);
  if (USE_MOCKS) return new Date().toISOString();

  const { data: c, error: authError } = await supabaseAuth
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (authError || !c) throw new Error("Cliente não encontrado ou sem permissão");

  const row = c as ClientRow;

  try {
    if (scope === "paid") {
      if (isPlaceholder(row.meta_ad_account_id)) {
        await writeCache(clientId, sk, range, EMPTY_PAID);
      } else {
        const attr = attribution ?? row.attribution_window ?? "7d_click,1d_view";
        const paid = await fetchMetaAdsReal(row, range, attr);
        await writeCache(clientId, sk, range, paid);
      }
    } else {
      if (isPlaceholder(row.meta_page_id) && isPlaceholder(row.ig_account_id)) {
        await writeCache(clientId, "organic", range, EMPTY_ORGANIC);
      } else {
        const organic = await fetchOrganicReal(row, range);
        await writeCache(clientId, "organic", range, organic);
      }
    }
    return new Date().toISOString();
  } catch (err: any) {
    console.error(`❌ [syncScope] Erro (${scope}):`, err.message || err);
    throw new Error(err.message || "Erro desconhecido ao conectar com a Meta.");
  }
}

export const syncPaid = createServerFn({ method: "POST" })
  .inputValidator((d) => clientRangeSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; cachedAt: string }> => {
    const cachedAt = await syncScope(data.clientId, "paid", data.range, data.attribution);
    return { ok: true, cachedAt };
  });

export const syncOrganic = createServerFn({ method: "POST" })
  .inputValidator((d) => clientRangeSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; cachedAt: string }> => {
    const cachedAt = await syncScope(data.clientId, "organic", data.range);
    return { ok: true, cachedAt };
  });

export type CacheStatus = {
  paid: { fetchedAt: string | null; expiresAt: string | null };
  organic: { fetchedAt: string | null; expiresAt: string | null };
  ttlSeconds: number;
};

export const getCacheStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => clientRangeSchema.parse(d))
  .handler(async ({ data }): Promise<CacheStatus> => {
    const supabaseAuth = getSupabaseServerClient();
    const { data: rows } = await supabaseAuth
      .from("meta_cache")
      .select("scope, fetched_at")
      .eq("client_id", data.clientId)
      .eq("range_from", data.range.from)
      .eq("range_to", data.range.to);

    const paidScope = scopeKey("paid", data.attribution);
    const build = (scope: string) => {
      const row = rows?.find((r) => r.scope === scope);
      if (!row) return { fetchedAt: null, expiresAt: null };
      const fetchedAt = row.fetched_at;
      const expiresAt = new Date(
        new Date(fetchedAt).getTime() + CACHE_TTL_SECONDS * 1000,
      ).toISOString();
      return { fetchedAt, expiresAt };
    };

    return {
      paid: build(paidScope),
      organic: build("organic"),
      ttlSeconds: CACHE_TTL_SECONDS,
    };
  });
