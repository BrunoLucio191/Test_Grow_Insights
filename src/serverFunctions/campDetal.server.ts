import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type {
  ClientRow,
  Campaign,
  AdRow,
  ConnectionCheck,
  ConnectionTest,
} from "../lib/analytics-types.ts";
import { attrToArray, isPlaceholder } from "@/lib/utils.ts";
import { getSupabaseServerClient } from "../lib/supabase.ts";
import {
  graphGet,
  MetaAction,
  pickConversionType,
  extractMetaActionValue,
} from "./metaGraph.server.ts";
import { CampaignDetail } from "../lib/analytics-types.ts";
import { getMetaToken } from "./clientes.server.ts";
import { dateRangeSchema } from "@/zod/dateRange.ts";
import { attributionSchema } from "@/zod/attribution.ts";
import { calculateDays } from "../lib/utils.ts";
/* eslint-disable  @typescript-eslint/no-explicit-any */

// Campaign detail (drill-down)
function extractPostLink(creative: any): string | null {
  if (!creative) return null;

  if (creative.instagram_permalink_url) {
    return creative.instagram_permalink_url;
  }

  if (creative.effective_object_story_id) {
    const parts = creative.effective_object_story_id.split("_");

    if (parts.length === 2) {
      const pageId = parts[0];
      const postId = parts[1];
      return `https://www.facebook.com/${pageId}/posts/${postId}`;
    }
  }

  return null;
}

export const fetchCampaignDetail = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        clientId: z.string().uuid(),
        campaignId: z.string().min(1),
        range: dateRangeSchema,
        attribution: attributionSchema,
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<CampaignDetail> => {
    const supabaseAuth = getSupabaseServerClient();

    const { data: cliente } = await supabaseAuth
      .from("clients")
      .select("*")
      .eq("id", data.clientId)
      .single();

    if (!cliente) throw new Error("Cliente não encontrado");

    const client = cliente as ClientRow;

    const [{ meta_access_token: token }] = await getMetaToken({
      data: {
        clientName: client.name,
      },
    });

    if (!token) throw new Error("meta_access_token não configurado");

    const timeRange = JSON.stringify({ since: data.range.from, until: data.range.to });
    const attrChoice = data.attribution ?? cliente.attribution_window ?? "7d_click,1d_view";
    const attributionWindows = JSON.stringify(attrToArray(attrChoice));

    const meta = await graphGet<any>(
      `/${data.campaignId}`,
      { fields: "id,name,status,daily_budget,lifetime_budget,objective" },
      token,
    );
    const timeIncrement = calculateDays(data.range);

    const daily = await graphGet<{ data: any[] }>(
      `/${data.campaignId}/insights`,
      {
        time_range: timeRange,
        time_increment: timeIncrement,
        action_attribution_windows: attributionWindows,
        fields:
          "campaign_id,campaign_name,spend,impressions,clicks,reach,frequency,ctr,cpm,actions,action_values,objective,inline_link_clicks,inline_link_click_ctr",
        limit: "500",
      },
      token,
    );

    const actionsAgg = new Map<string, number>();
    const valuesAgg = new Map<string, number>();
    let totSpend = 0,
      totImp = 0,
      totClicks = 0,
      totInlineClicks = 0,
      totReach = 0;
    for (const row of daily.data) {
      totSpend += parseFloat(row.spend) || 0;
      totImp += parseFloat(row.impressions) || 0;
      totClicks += parseFloat(row.clicks) || 0;
      totInlineClicks += parseFloat(row.inline_link_clicks) || 0;
      totReach = Math.max(totReach, parseFloat(row.reach) || 0);
      for (const a of (row.actions ?? []) as MetaAction[]) {
        actionsAgg.set(
          a.action_type,
          (actionsAgg.get(a.action_type) ?? 0) + (parseFloat(a.value) || 0),
        );
      }
      for (const a of (row.action_values ?? []) as MetaAction[]) {
        valuesAgg.set(
          a.action_type,
          (valuesAgg.get(a.action_type) ?? 0) + (parseFloat(a.value) || 0),
        );
      }
    }
    const convType = pickConversionType(actionsAgg, cliente.conversion_event ?? null);
    const conversions = actionsAgg.get(convType) ?? 0;
    const revenue = valuesAgg.get(convType) ?? 0;

    const timeseries = daily.data
      .map((row): import("../lib/analytics-types.ts").TimeSeriesPoint => {
        const spend = parseFloat(row.spend) || 0;
        const rev =
          ((row.action_values ?? []) as MetaAction[]).find((a) => a.action_type === convType)
            ?.value || "0";
        const revNum = parseFloat(rev) || 0;
        return {
          date: row.date_start,
          spend: +spend.toFixed(2),
          revenue: +revNum.toFixed(2),
          roas: spend > 0 ? +(revNum / spend).toFixed(2) : 0,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const first = daily.data[0] ?? {};
    const campaign: Campaign = {
      id: data.campaignId,
      name: first.campaign_name ?? meta.name ?? data.campaignId,
      status: (meta.status as Campaign["status"]) ?? "ACTIVE",
      budget: Number(meta.daily_budget || meta.lifetime_budget || 0) / 100,
      spent: +totSpend.toFixed(2),
      results: +conversions.toFixed(0),
      revenue: +revenue.toFixed(2),
      roas: totSpend > 0 ? +(revenue / totSpend).toFixed(2) : 0,
      cpa: conversions > 0 ? +(totSpend / conversions).toFixed(2) : 0,
      ctr: totImp > 0 ? +((totInlineClicks / totImp) * 100).toFixed(2) : 0,
      cpm: totImp > 0 ? +((totSpend / totImp) * 1000).toFixed(2) : 0,
      impressions: totImp,
      clicks: totClicks,
      objective: first.objective ?? meta.objective ?? "—",
      conversionType: convType,
      inline_link_clicks: totInlineClicks,
    };

    const ads: AdRow[] = [];
    try {
      const adMetricsPromise = await graphGet<{ data: any[] }>(
        `/${data.campaignId}/insights`,
        {
          time_range: timeRange,
          level: "ad",
          action_attribution_windows: attributionWindows,
          fields:
            "ad_id,ad_name,spend,impressions,clicks,inline_link_clicks,inline_link_click_ctr,actions,action_values",
          limit: "200",
        },
        token,
      );

      const adLinksPromise = graphGet<{ data: any[] }>(
        `/${data.campaignId}/ads`, // Note que aqui é /ads, não /insights
        {
          fields: "id,creative{effective_object_story_id,instagram_permalink_url}",
          limit: "200",
        },
        token,
      );

      const [adRows, adlinkResponse] = await Promise.all([adMetricsPromise, adLinksPromise]);

      const linksDicionario = new Map<string, string | null>();
      for (const ad of adlinkResponse.data) {
        linksDicionario.set(ad.id, extractPostLink(ad.creative));
      }

      for (const r of adRows.data) {
        const spend = parseFloat(r.spend) || 0;
        const impressions = parseFloat(r.impressions) || 0;
        const clicks = parseFloat(r.clicks) || 0;
        const inline_link_clicks = parseFloat(r.inline_link_clicks) || 0;
        const results = extractMetaActionValue(r.actions, convType);
        const rev = extractMetaActionValue(r.action_values, convType);

        const linkAnuncio = linksDicionario.get(r.ad_id) || null;
        ads.push({
          id: r.ad_id,
          link: linkAnuncio,
          name: r.ad_name ?? "—",
          spend: +spend.toFixed(2),
          impressions,
          clicks,
          ctr: impressions > 0 ? +((inline_link_clicks / impressions) * 100).toFixed(2) : 0,
          results: +results.toFixed(0),
          revenue: +rev.toFixed(2),
          cpa: results > 0 ? +(spend / results).toFixed(2) : 0,
          roas: spend > 0 ? +(rev / spend).toFixed(2) : 0,
          inline_link_clicks,
        });
      }
    } catch (e) {
      console.warn("[campaign-detail] ads falhou:", (e as Error).message);
    }

    // Breakdown helper
    const fetchBreakdown = async (
      breakdowns: string,
    ): Promise<import("../lib/analytics-types.ts").BreakdownRow[]> => {
      try {
        const r = await graphGet<{ data: any[] }>(
          `/${data.campaignId}/insights`,
          {
            time_range: timeRange,
            breakdowns,
            action_attribution_windows: attributionWindows,
            fields: "spend,impressions,clicks,actions,action_values",
            limit: "200",
          },
          token,
        );
        return (r.data ?? []).map((row) => {
          const keyParts: string[] = [];
          for (const b of breakdowns.split(",")) {
            if (row[b] != null) keyParts.push(String(row[b]));
          }
          return {
            key: keyParts.join(" · ") || "—",
            spend: +(parseFloat(row.spend) || 0).toFixed(2),
            impressions: parseFloat(row.impressions) || 0,
            clicks: parseFloat(row.clicks) || 0,
            results: +extractMetaActionValue(row.actions, convType).toFixed(0),
            revenue: +extractMetaActionValue(row.action_values, convType).toFixed(2),
          };
        });
      } catch (e) {
        console.warn(`[campaign-detail] breakdown ${breakdowns} falhou:`, (e as Error).message);
        return [];
      }
    };

    const [ageGender, device] = await Promise.all([
      fetchBreakdown("age,gender"),
      fetchBreakdown("device_platform"),
    ]);

    return { campaign, timeseries, ads, ageGender, device };
  });

async function probe(
  label: string,
  fn: () => Promise<{ detail: string }>,
): Promise<ConnectionCheck> {
  try {
    const r = await fn();
    return { ok: true, label, detail: r.detail };
  } catch (e: any) {
    const message = e?.message ?? String(e);
    const friendly = message.includes("Unsupported get request")
      ? "ID não encontrado na Meta ou sem permissão para o token atual. Verifique se o ID é real e se o token tem acesso ao ativo."
      : message;
    return { ok: false, label, error: friendly };
  }
}

export const testMetaConnection = createServerFn({ method: "POST" })
  .validator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ConnectionTest> => {
    const supabaseAuth = getSupabaseServerClient();
    const { data: cliente, error } = await supabaseAuth
      .from("clients")
      .select(
        "id, name, meta_ad_account_id, meta_page_id, ig_account_id, conversion_event, attribution_window",
      )
      .eq("id", data.clientId)
      .single();

    if (error || !cliente) throw new Error("Cliente não encontrado");

    const client = cliente as ClientRow;

    const [{ meta_access_token: token }] = await getMetaToken({
      data: {
        clientName: client.name,
      },
    });
    if (!token) {
      const err = { ok: false, error: "meta_access_token não configurado" } as const;
      return {
        tokenPresent: false,
        paid: { ...err, label: "Meta Ads" },
        page: { ...err, label: "Facebook Page" },
        instagram: { ...err, label: "Instagram" },
      };
    }

    const paid: ConnectionCheck = isPlaceholder(client.meta_ad_account_id)
      ? {
          ok: false,
          label: "Meta Ads",
          error: "ID de exemplo ou incompleto. Informe o Account ID real.",
        }
      : await probe("Meta Ads", async () => {
          const acc = client.meta_ad_account_id!.startsWith("act_")
            ? client.meta_ad_account_id!
            : `act_${client.meta_ad_account_id}`;
          const r = await graphGet<any>(
            `/${acc}`,
            { fields: "name,account_status,currency,timezone_name" },
            token,
          );
          return {
            detail: `${r.name} · ${r.currency} · status ${r.account_status} · ${r.timezone_name}`,
          };
        });

    const page: ConnectionCheck = isPlaceholder(client.meta_page_id)
      ? {
          ok: false,
          label: "Facebook Page",
          error: "ID de exemplo ou incompleto. Informe o Page ID real.",
        }
      : await probe("Facebook Page", async () => {
          const r = await graphGet<any>(
            `/${client.meta_page_id}`,
            { fields: "name,category,fan_count" },
            token,
          );
          return { detail: `${r.name} · ${r.category ?? "—"} · ${r.fan_count ?? 0} fãs` };
        });

    const instagram: ConnectionCheck = isPlaceholder(client.ig_account_id)
      ? {
          ok: false,
          label: "Instagram",
          error: "ID de exemplo ou incompleto. Informe o Instagram Account ID real.",
        }
      : await probe("Instagram", async () => {
          const r = await graphGet<any>(
            `/${client.ig_account_id}`,
            { fields: "username,followers_count,media_count" },
            token,
          );
          return {
            detail: `@${r.username} · ${r.followers_count ?? 0} seguidores · ${r.media_count ?? 0} posts`,
          };
        });

    return { tokenPresent: true, paid, page, instagram };
  });
