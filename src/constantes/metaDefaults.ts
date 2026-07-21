import type { PaidData, OrganicData } from "@/lib/analytics-types";

export const CACHE_DURATION_IN_SECONDS = 60 * 60 * 8; // 8 hour

export const GRAPH_API = "https://graph.facebook.com/v19.0";

export const EMPTY_PAID: PaidData = {
  kpis: {
    spend: 0,
    revenue: 0,
    roas: 0,
    cpa: 0,
    ctr: 0,
    cpm: 0,
    impressions: 0,
    clicks: 0,
    reach: 0,
    frequency: 0,
    conversions: 0,
    conversionRate: 0,
  },
  timeseries: [],
  campaigns: [],
};
export const EMPTY_ORGANIC: OrganicData = {
  kpis: { newFollowers: 0, reach: 0, avgEngagement: 0, profileVisits: 0 },
  topPosts: [],
};
export const PLACEHOLDER_RE = /^(?:act_0{6,}\d{1,3}|0+\d{0,3}|10{6,}\d{1,3}|170{6,}\d{1,3})$/;
