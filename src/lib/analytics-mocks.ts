import type { PaidData, OrganicData, DateRange } from "./analytics-types";

// Deterministic pseudo-random so each client renders consistently
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return ((h >>> 0) % 10000) / 10000;
  };
}

export function mockPaid(clientId: string, range: DateRange): PaidData {
  const r = seeded(clientId + range.from + range.to);
  const days = 14;
  const baseSpend = 200 + r() * 800;
  const baseRoas = 2 + r() * 4;
  const timeseries = Array.from({ length: days }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return {
      date: d.toISOString().slice(5, 10),
      spend: Math.round(baseSpend * (0.7 + r() * 0.6)),
      roas: Number((baseRoas * (0.7 + r() * 0.6)).toFixed(2)),
    };
  });
  const totalSpend = timeseries.reduce((s, p) => s + p.spend, 0);
  const avgRoas = timeseries.reduce((s, p) => s + p.roas, 0) / timeseries.length;
  const objectives = ["Conversões", "Tráfego", "Engajamento", "Cadastros", "Alcance"];
  const statuses: Array<"ACTIVE" | "PAUSED" | "ENDED"> = ["ACTIVE", "ACTIVE", "ACTIVE", "PAUSED", "ENDED"];
  const campaigns = Array.from({ length: 6 }).map((_, i) => {
    const budget = Math.round(500 + r() * 4500);
    const spent = Math.round(budget * (0.3 + r() * 0.7));
    return {
      id: `c-${clientId.slice(0, 4)}-${i}`,
      status: statuses[Math.floor(r() * statuses.length)],
      name: `CMP-${(i + 1).toString().padStart(2, "0")} · ${objectives[Math.floor(r() * objectives.length)]}`,
      budget,
      spent,
      results: Math.round(spent / (5 + r() * 80)),
      objective: objectives[Math.floor(r() * objectives.length)],
    };
  });
  return {
    kpis: {
      spend: totalSpend,
      roas: Number(avgRoas.toFixed(2)),
      cpa: Number((totalSpend / Math.max(1, campaigns.reduce((s, c) => s + c.results, 0))).toFixed(2)),
      ctr: Number((1 + r() * 4).toFixed(2)),
      cpm: Number((10 + r() * 30).toFixed(2)),
    },
    timeseries,
    campaigns,
  };
}

export function mockOrganic(clientId: string, range: DateRange): OrganicData {
  const r = seeded("org-" + clientId + range.from);
  const captions = [
    "Bastidores de uma sessão estratégica com o time ✨",
    "3 erros que sabotam seus anúncios — salve este post.",
    "Antes & depois: rebranding completo entregue 🚀",
    "A pergunta que mudou nossa abordagem de funil.",
    "Caso real: como dobramos o ROAS em 28 dias.",
    "Conteúdo orgânico ainda funciona? Spoiler: sim.",
  ];
  const topPosts = Array.from({ length: 6 }).map((_, i) => ({
    id: `p-${clientId.slice(0, 4)}-${i}`,
    platform: (r() > 0.45 ? "instagram" : "facebook") as "instagram" | "facebook",
    caption: captions[i % captions.length],
    thumbnail: `https://picsum.photos/seed/${clientId.slice(0, 6)}${i}/400/400`,
    likes: Math.round(80 + r() * 4200),
    comments: Math.round(5 + r() * 280),
    reach: Math.round(800 + r() * 40000),
    postedAt: new Date(Date.now() - i * 86400000 * 2).toISOString(),
  }));
  return {
    kpis: {
      newFollowers: Math.round(50 + r() * 1200),
      reach: Math.round(5000 + r() * 90000),
      avgEngagement: Number((1 + r() * 7).toFixed(2)),
      profileVisits: Math.round(300 + r() * 6000),
    },
    topPosts,
  };
}
