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
