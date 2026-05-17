import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { mockPaid, mockOrganic } from "./analytics-mocks";
import type { ClientRow, PaidData, OrganicData } from "./analytics-types";

const dateRangeSchema = z.object({
  from: z.string(),
  to: z.string(),
});

const clientRangeSchema = z.object({
  clientId: z.string().uuid(),
  range: dateRangeSchema,
});

// USE_MOCKS controls whether we hit Meta Graph API or return synthetic data.
// Toggle to "false" in env once META_ACCESS_TOKEN is added and Meta integration is wired.
const USE_MOCKS = (process.env.USE_MOCKS ?? "true") !== "false";

/* -------------------- Clients -------------------- */

export const listClients = createServerFn({ method: "GET" }).handler(
  async (): Promise<ClientRow[]> => {
    const { data, error } = await supabaseAdmin
      .from("clients")
      .select("id, name, meta_ad_account_id, meta_page_id, ig_account_id")
      .order("name", { ascending: true });
    if (error) {
      console.error("listClients error:", error);
      return [];
    }
    return data ?? [];
  },
);

/* -------------------- Meta Ads (Paid) -------------------- */

async function fetchMetaAdsReal(client: ClientRow, range: { from: string; to: string }): Promise<PaidData> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token || !client.meta_ad_account_id) {
    throw new Error("Missing META_ACCESS_TOKEN or meta_ad_account_id");
  }
  // Skeleton — implement Meta Graph API call here.
  // const url = `https://graph.facebook.com/v19.0/${client.meta_ad_account_id}/insights?...`;
  throw new Error("Meta Ads integration not yet implemented. Set USE_MOCKS=true.");
}

export const fetchMetaAdsData = createServerFn({ method: "POST" })
  .inputValidator((d) => clientRangeSchema.parse(d))
  .handler(async ({ data }): Promise<PaidData> => {
    if (USE_MOCKS) return mockPaid(data.clientId, data.range);
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("*")
      .eq("id", data.clientId)
      .single();
    if (!client) throw new Error("Client not found");
    return fetchMetaAdsReal(client as ClientRow, data.range);
  });

/* -------------------- Organic (FB + IG) -------------------- */

async function fetchOrganicReal(client: ClientRow): Promise<OrganicData> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("Missing META_ACCESS_TOKEN");
  throw new Error("Organic integration not yet implemented. Set USE_MOCKS=true.");
}

export const fetchOrganicData = createServerFn({ method: "POST" })
  .inputValidator((d) => clientRangeSchema.parse(d))
  .handler(async ({ data }): Promise<OrganicData> => {
    if (USE_MOCKS) return mockOrganic(data.clientId, data.range);
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("*")
      .eq("id", data.clientId)
      .single();
    if (!client) throw new Error("Client not found");
    return fetchOrganicReal(client as ClientRow);
  });

/* -------------------- AI Optimizer -------------------- */

const insightsSchema = z.object({
  clientName: z.string(),
  metrics: z.object({
    paid: z.any(),
    organic: z.any(),
  }),
});

export const generateAiInsights = createServerFn({ method: "POST" })
  .inputValidator((d) => insightsSchema.parse(d))
  .handler(async ({ data }): Promise<{ markdown: string }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return {
        markdown:
          "## Erro\nLOVABLE_API_KEY não configurada. Ative o AI Gateway nas configurações.",
      };
    }

    const prompt = `Você é um consultor sênior de mídia paga e orgânica para agências.
Analise os dados do cliente "${data.clientName}" e gere um plano de otimização em PT-BR.

## Estrutura obrigatória (em Markdown):
1. **Diagnóstico Geral** (2-3 linhas)
2. **🔥 Pontos de Estrangulamento (Tráfego Pago)** — liste 3 campanhas/métricas críticas
3. **💡 Plano de Ação - Mídia Paga** — bullets acionáveis
4. **📱 Sugestões de Criativos para o Orgânico** — 3 ideias específicas com hook + formato
5. **📈 Próximos 7 dias** — checklist priorizada

Dados:
\`\`\`json
${JSON.stringify(data.metrics, null, 2)}
\`\`\`

Seja específico, cite números reais dos dados. Não use disclaimers genéricos.`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("AI Gateway error:", res.status, text);
        if (res.status === 429)
          return { markdown: "## Limite atingido\nMuitas requisições. Tente novamente em alguns segundos." };
        if (res.status === 402)
          return { markdown: "## Créditos esgotados\nAdicione créditos em Settings → Workspace → Usage." };
        return { markdown: `## Erro ${res.status}\n${text.slice(0, 500)}` };
      }

      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content ?? "_Sem resposta da IA._";
      return { markdown: content };
    } catch (e) {
      console.error("generateAiInsights failed:", e);
      return { markdown: "## Falha\nNão foi possível gerar insights agora." };
    }
  });
