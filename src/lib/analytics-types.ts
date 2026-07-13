export type DateRange = { from: string; to: string };

export type PaidKpis = {
  spend: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpm: number;
  impressions: number;
  clicks: number;
  reach: number;
  frequency: number;
  conversions: number;
  conversionRate: number; // conversions / clicks * 100
};

export type TimeSeriesPoint = {
  date: string;
  spend: number;
  revenue: number;
  roas: number;
};

export type Campaign = {
  id: string;
  status: "ACTIVE" | "PAUSED" | "ENDED";
  name: string;
  budget: number;
  spent: number;
  results: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpm: number;
  impressions: number;
  clicks: number;
  objective: string;
  conversionType: string;
  inline_link_clicks?: number;
};

export type PaidData = {
  kpis: PaidKpis;
  timeseries: TimeSeriesPoint[];
  campaigns: Campaign[];
};

export type BreakdownRow = {
  key: string;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  revenue: number;
};

export type AdRow = {
  id: string;
  link?: string | null;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  results: number;
  revenue: number;
  cpa: number;
  roas: number;
  thumbnail?: string;
  inline_link_clicks?: number;
};

export type CampaignDetail = {
  campaign: Campaign;
  timeseries: TimeSeriesPoint[];
  ads: AdRow[];
  ageGender: BreakdownRow[];
  device: BreakdownRow[];
};

export type OrganicKpis = {
  newFollowers: number;
  reach: number;
  avgEngagement: number;
  profileVisits: number;
};

export type TopPost = {
  id: string;
  platform: "instagram" | "facebook";
  caption: string;
  thumbnail: string;
  likes: number;
  comments: number;
  reach: number;
  postedAt: string;
};

export type OrganicData = {
  kpis: OrganicKpis;
  topPosts: TopPost[];
};

export type AttributionWindow = "7d_click,1d_view" | "1d_click,1d_view" | "7d_click" | "1d_click";

export const ATTRIBUTION_OPTIONS: { value: AttributionWindow; label: string }[] = [
  { value: "7d_click,1d_view", label: "7d_clique + 1d_view (padrão Meta)" },
  { value: "1d_click,1d_view", label: "1d_clique + 1d_view" },
  { value: "7d_click", label: "7d_clique apenas" },
  { value: "1d_click", label: "1d_clique apenas" },
];

export const DEFAULT_ATTRIBUTION: AttributionWindow = "7d_click,1d_view";

export type ClientRow = {
  id: string;
  name: string;
  meta_ad_account_id: string | null;
  meta_page_id: string | null;
  ig_account_id: string | null;
  conversion_event?: string | null;
  meta_access_token?: string | null;
  attribution_window?: AttributionWindow | null;
};

export type CampaignGroup = {
  id: string;
  client_id: string;
  name: string;
  campaign_ids: string[];
};

// Detect seed/placeholder IDs used in local/demo clients so we don't hit Meta with fake IDs.
const PLACEHOLDER_RE = /^(?:act_0{6,}\d{1,3}|0+\d{0,3}|10{6,}\d{1,3}|170{6,}\d{1,3})$/;
export function isPlaceholderId(id: string | null | undefined): boolean {
  if (!id || !id.trim()) return true;
  const value = id.trim();
  return PLACEHOLDER_RE.test(value);
}

export type ClientValidation = {
  paidOk: boolean;
  organicOk: boolean;
  anyOk: boolean;
  missing: string[];
};
