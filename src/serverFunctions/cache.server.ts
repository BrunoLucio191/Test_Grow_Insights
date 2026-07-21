import { Json } from "@/integrations/supabase/types";
import { isPlaceholder } from "@/lib/utils.ts";
import { EMPTY_ORGANIC } from "@/constantes/metaDefaults.ts";
import { CACHE_DURATION_IN_SECONDS } from "@/constantes/metaDefaults.ts";
import { clientRangeSchema } from "@/zod/clientRange.ts";
import { getSupabaseServerClient } from "../lib/supabase.ts";
import { createServerFn } from "@tanstack/react-start";
import type { ClientRow, DateRange, OrganicData, TopPost } from "../lib/analytics-types.ts";
import { graphGet } from "./metaGraph.server.ts";
import { getMetaToken } from "./clientes.server.ts";
import { cliplingOrganicDate } from "../lib/utils.ts";
import { use } from "react";
/* eslint-disable  @typescript-eslint/no-explicit-any */

//TODO: ajustar isso pra corrigir o bug do cache
export async function readCache<T>(
  clientId: string,
  scope: string,
  range: { from: string; to: string },
  force: boolean,
): Promise<T | null> {
  if (force) return null;

  const supabaseAuth = getSupabaseServerClient();

  const { data, error } = await supabaseAuth
    .from("meta_cache")
    .select("payload, fetched_at")
    .eq("client_id", clientId)
    .eq("scope", scope)
    .eq("range_from", range.from)
    .eq("range_to", range.to)
    .maybeSingle();

  if (error || !data) {
    console.log(error);
    return null;
  }

  const ageSec = (Date.now() - new Date(data.fetched_at).getTime()) / 1000;
  if (ageSec > CACHE_DURATION_IN_SECONDS) return null;

  return data.payload as T;
}
export async function writeCache(
  clientId: string,
  scope: string,
  range: DateRange,
  payload: unknown,
): Promise<void> {
  const supabaseAuth = getSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError) {
    console.error(authError);
  }

  if (!user) {
    throw new Error("Usuario não autenticado");
  }

  const { error } = await supabaseAuth.from("meta_cache").upsert(
    {
      user_id: user.id,
      client_id: clientId,
      scope,
      range_from: range.from,
      range_to: range.to,
      payload: payload as unknown as Json,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "user_id,client_id,scope,range_from,range_to" },
  );
  if (error) console.error("❌ [writeCache] error:", error);
}

export async function invalidateCache(clientId: string, scope?: string) {
  const supabaseAuth = getSupabaseServerClient();

  let q = supabaseAuth.from("meta_cache").delete().eq("client_id", clientId);

  if (scope) q = q.eq("scope", scope);

  const { error } = await q;

  if (error) console.error("[invalidateCache] error:", error);
}

// Organic (FB + IG)
export async function fetchOrganicReal(
  client: ClientRow,
  range: { from: string; to: string },
): Promise<OrganicData> {
  const [{ meta_access_token: token }] = await getMetaToken({
    data: {
      clientName: client.name,
    },
  });
  if (!token) throw new Error("meta_access_token not set");

  let reach = 0;
  let profileVisits = 0;
  let newFollowers = 0;
  let engagementSum = 0;
  let engagementCount = 0;
  const topPosts: TopPost[] = [];

  // Resolver Page Access Token (FB Page insights exigem token da página, não do usuário)
  let pageToken = token;
  if (client.meta_page_id) {
    try {
      const accounts = await graphGet<{ data: Array<{ id: string; access_token: string }> }>(
        `/me/accounts`,
        { fields: "id,access_token", limit: "200" },
        token,
      );
      const match = accounts.data?.find((a) => a.id === client.meta_page_id);
      if (match?.access_token) pageToken = match.access_token;
      else
        console.warn(
          `[organic] Page token não encontrado para ${client.meta_page_id}; usando user token (provavelmente vai falhar).`,
        );
    } catch (e) {
      console.warn("[organic] /me/accounts falhou:", e);
    }
  }

  if (new Date(range.from).getTime() / 1000 - new Date(range.to).getTime() / 1000)
    console.log(Math.floor(new Date(range.from).getTime() / 1000).toString());
  // Facebook Page insights — métrica granular com try/catch individual
  if (client.meta_page_id) {
    const tryMetric = async (metric: string) => {
      try {
        const r = await graphGet<{ data: any[] }>(
          `/${client.meta_page_id}/insights`,
          {
            metric,
            since: Math.floor(new Date(range.from).getTime() / 1000).toString(),
            until: Math.floor(new Date(range.to).getTime() / 1000).toString(),
            period: "day",
          },
          pageToken,
        );
        return r.data ?? [];
      } catch (e) {
        console.warn(`[organic][fb] métrica "${metric}" falhou:`, (e as Error).message);
        return [];
      }
    };

    const sumValues = (data: any[], name: string) => {
      for (const m of data) {
        if (m.name !== name) continue;
        return (m.values ?? []).reduce((s: number, v: any) => s + Number(v.value || 0), 0);
      }
      return 0;
    };

    const [imp, fans, views, eng] = await Promise.all([
      tryMetric("page_total_media_view_unique"),
      tryMetric("page_daily_follows_unique"),
      tryMetric("page_views_total"),
      tryMetric("page_post_engagements"),
    ]);

    reach += sumValues(imp, "page_total_media_view_unique");
    newFollowers += sumValues(fans, "page_daily_follows_unique");
    profileVisits += sumValues(views, "page_views_total");
    const engTotal = sumValues(eng, "page_post_engagements");
    if (engTotal > 0) {
      engagementSum += engTotal;
      engagementCount += 1;
    }

    // FB top posts
    try {
      const posts = await graphGet<{ data: any[] }>(
        `/${client.meta_page_id}/posts`,
        {
          fields:
            "id,message,full_picture,created_time,likes.summary(true),comments.summary(true),insights.metric(page_total_media_view_unique)",
          since: range.from,
          until: range.to,
          limit: "10",
        },
        pageToken,
      );
      for (const p of posts.data ?? []) {
        topPosts.push({
          id: p.id,
          platform: "facebook",
          caption: p.message ?? "",
          thumbnail: p.full_picture ?? "",
          likes: p.likes?.summary?.total_count ?? 0,
          comments: p.comments?.summary?.total_count ?? 0,
          reach: p.insights?.data?.[0]?.values?.[0]?.value ?? 0,
          postedAt: p.created_time,
        });
      }
    } catch (e) {
      console.warn("[organic][fb] top posts falhou:", (e as Error).message);
    }
  }

  // Instagram insights (Graph API v19: total_value para reach/profile_views/follower_count)
  if (client.ig_account_id) {
    const tryIg = async (params: Record<string, string>) => {
      try {
        const r = await graphGet<{ data: unknown[] }>(
          `/${client.ig_account_id}/insights`,
          {
            ...params,
            since: Math.floor(new Date(range.from).getTime() / 1000).toString(),
            until: Math.floor(new Date(range.to).getTime() / 1000).toString(),
          },
          token,
        );
        return r.data ?? [];
      } catch (e) {
        console.log(range.from, range.to);
        console.warn(
          `[organic][ig] insights ${JSON.stringify(params)} falhou:`,
          (e as Error).message,
        );
        return [];
      }
    };

    const sumIg = (data: any[], name: string) => {
      for (const m of data) {
        if (m.name !== name) continue;
        // v19 total_value: { total_value: { value: N } }
        if (m.total_value?.value != null) return Number(m.total_value.value) || 0;
        // legacy values[]
        return (m.values ?? []).reduce((s: number, v: any) => s + Number(v.value || 0), 0);
      }
      return 0;
    };

    const [reachData, visitsData, followersData] = await Promise.all([
      tryIg({ metric: "reach", metric_type: "total_value", period: "day" }),
      tryIg({ metric: "profile_views", metric_type: "total_value", period: "day" }),
      tryIg({ metric: "follower_count", period: "day" }),
    ]);

    reach += sumIg(reachData, "reach");
    profileVisits += sumIg(visitsData, "profile_views");
    newFollowers += sumIg(followersData, "follower_count");

    // IG top media
    try {
      const media = await graphGet<{ data: any[] }>(
        `/${client.ig_account_id}/media`,
        {
          fields:
            "id,caption,media_url,thumbnail_url,like_count,comments_count,timestamp,insights.metric(reach)",
          limit: "25",
        },
        token,
      );
      for (const p of media.data ?? []) {
        const ts = p.timestamp ?? "";
        if (ts && (ts.slice(0, 10) < range.from || ts.slice(0, 10) > range.to)) continue;
        topPosts.push({
          id: p.id,
          platform: "instagram",
          caption: p.caption ?? "",
          thumbnail: p.thumbnail_url ?? p.media_url ?? "",
          likes: p.like_count ?? 0,
          comments: p.comments_count ?? 0,
          reach: p.insights?.data?.[0]?.values?.[0]?.value ?? 0,
          postedAt: ts,
        });
      }
    } catch (e) {
      console.warn("[organic][ig] media falhou:", (e as Error).message);
    }
  }

  topPosts.sort((a, b) => b.reach - a.reach);

  return {
    kpis: {
      newFollowers,
      reach,
      avgEngagement: engagementCount > 0 ? Math.round(engagementSum / engagementCount) : 0,
      profileVisits,
    },
    topPosts: topPosts.slice(0, 8),
  };
}

export const fetchOrganicData = createServerFn({ method: "POST" })
  .validator((d) => clientRangeSchema.parse(d))
  .handler(async ({ data }): Promise<OrganicData> => {
    const clippedDate = cliplingOrganicDate(data.range);

    const cached = await readCache<OrganicData>(data.clientId, "organic", data.range, false);
    if (cached) return cached;

    const supabaseAuth = getSupabaseServerClient();
    const { data: client, error: clientError } = await supabaseAuth
      .from("clients")
      .select("*")
      .eq("id", data.clientId)
      .single();

    if (clientError || !client) throw new Error("Cliente não encontrado ou sem permissão");

    const c = client as ClientRow;
    if (isPlaceholder(c.meta_page_id) && isPlaceholder(c.ig_account_id)) return EMPTY_ORGANIC;

    try {
      const fresh = await fetchOrganicReal(c, clippedDate);
      await writeCache(data.clientId, "organic", clippedDate, fresh);
      return fresh;
    } catch (error) {
      console.error("fetchOrganicReal failed:", error);
      const stale = await supabaseAuth
        .from("meta_cache")
        .select("payload")
        .eq("client_id", data.clientId)
        .eq("scope", "organic")
        .eq("range_from", clippedDate.from)
        .eq("range_to", clippedDate.to)
        .maybeSingle();
      if (stale.data) return stale.data.payload as OrganicData;
      throw error;
    }
  });
