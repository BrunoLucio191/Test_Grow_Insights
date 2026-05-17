export type DateRange = { from: string; to: string };

export type PaidKpis = {
  spend: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpm: number;
};

export type TimeSeriesPoint = { date: string; spend: number; roas: number };

export type Campaign = {
  id: string;
  status: "ACTIVE" | "PAUSED" | "ENDED";
  name: string;
  budget: number;
  spent: number;
  results: number;
  objective: string;
};

export type PaidData = {
  kpis: PaidKpis;
  timeseries: TimeSeriesPoint[];
  campaigns: Campaign[];
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

export type ClientRow = {
  id: string;
  name: string;
  meta_ad_account_id: string | null;
  meta_page_id: string | null;
  ig_account_id: string | null;
};

// Detect seed/placeholder IDs (e.g. "act_000000001", "0001"). Client-safe.
const PLACEHOLDER_RE = /^(act_)?0+\d{0,3}$/;
export function isPlaceholderId(id: string | null | undefined): boolean {
  if (!id || !id.trim()) return true;
  return PLACEHOLDER_RE.test(id.trim());
}

export type ClientValidation = {
  paidOk: boolean;
  organicOk: boolean;
  anyOk: boolean;
  missing: string[];
};

export function validateClient(c: Pick<ClientRow, "meta_ad_account_id" | "meta_page_id" | "ig_account_id">): ClientValidation {
  const paidOk = !isPlaceholderId(c.meta_ad_account_id);
  const pageOk = !isPlaceholderId(c.meta_page_id);
  const igOk = !isPlaceholderId(c.ig_account_id);
  const organicOk = pageOk || igOk;
  const missing: string[] = [];
  if (!paidOk) missing.push("Meta Ads Account ID");
  if (!pageOk) missing.push("Facebook Page ID");
  if (!igOk) missing.push("Instagram Account ID");
  return { paidOk, organicOk, anyOk: paidOk || organicOk, missing };
}
