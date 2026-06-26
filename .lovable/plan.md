## Problemas atuais

**1. "Results" do Tráfego Pago divergem do Gerenciador**
O parser hoje escolhe o tipo de conversão linha-a-linha com fallback `purchase → lead → link_click`. Isso mistura tipos diferentes entre dias/campanhas e ignora os eventos reais que o Gerenciador usa, como `omni_purchase`, `offsite_conversion.fb_pixel_purchase`, `onsite_conversion.purchase`, `onsite_conversion.lead_grouped`. Também não respeita janela de atribuição (`action_attribution_windows`), o que muda o número final do Gerenciador.

**2. Orgânico vazio mesmo com IDs configurados**
Três causas:
- Facebook Page insights exige **Page Access Token**, não o user token. Hoje passamos sempre `META_ACCESS_TOKEN`.
- Métricas do IG mudaram na Graph API v19: `follower_count`, `profile_views`, `reach` agora exigem `metric_type=total_value` (ou somar `values` corretamente por período).
- `page_post_engagements` foi descontinuada em algumas versões; precisa cair pra `page_impressions` / `page_actions_post_reactions_total`.

**3. Dashboard limitado e campanhas não-clicáveis**
Falta detalhamento por campanha (anúncios, criativos, breakdown por dia, demografia).

---

## Plano

### A. Corrigir parser de conversões (Pago)

Em `src/lib/analytics.functions.ts`:

- Expandir lista de eventos de conversão para refletir o Gerenciador:
  ```text
  omni_purchase
  offsite_conversion.fb_pixel_purchase
  onsite_conversion.purchase
  purchase
  offsite_conversion.fb_pixel_lead
  onsite_conversion.lead_grouped
  lead
  ```
- Escolher **um** tipo de conversão **por campanha** (não por linha): agregar todas as actions da campanha primeiro, depois decidir o tipo dominante. Manter o mesmo tipo pra calcular `revenue` em `action_values`.
- Adicionar `action_attribution_windows: ["7d_click","1d_view"]` (padrão do Gerenciador) à chamada `/insights`.
- Adicionar campo `conversion_event` opcional na tabela `clients` (migração) pra permitir override manual por cliente quando o evento diferir.
- Incluir `impressions`, `clicks`, `reach`, `frequency` na query — substitui o proxy atual de "spend como peso" pra CTR/CPM (que está matematicamente incorreto).

### B. Corrigir Orgânico

- Buscar Page Access Token via `/me/accounts?fields=id,access_token` e usar o token correto da página em todas as chamadas FB.
- Atualizar métricas IG pra API v19: usar `metric_type=total_value` quando aplicável e somar `values[].value` corretamente.
- Trocar `page_post_engagements` por `page_impressions` + `page_actions_post_reactions_total` com fallback se a métrica não existir.
- Adicionar `try/catch` granular por métrica, logando qual falhou (hoje qualquer erro mata o bloco inteiro).
- Validar com chamada real após implementação.

### C. Dashboard expandido + campanha clicável

**Novos KPIs no `PaidTab`:**
- Impressões, Cliques únicos, Frequência, Taxa de conversão (conversions/clicks)
- Linha "Receita" no gráfico (além de Spend e ROAS)

**Tabela de campanhas:**
- Adicionar colunas: Objetivo, CTR, CPA, ROAS individual
- Linha inteira clicável → abre `CampaignDetailDialog` (novo componente)

**`CampaignDetailDialog` (novo):**
- Header: nome, status, objetivo, datas
- KPIs da campanha (spend, results, CPA, ROAS, CTR, CPM, freq)
- Mini-timeseries diária da campanha
- Tabela de Ad Sets / Anúncios (via `/{campaign_id}/insights?level=ad`)
- Breakdown por idade/gênero e por dispositivo (chamada extra com `breakdowns=age,gender` e `breakdowns=device_platform`)

**Nova server fn:** `fetchCampaignDetail({ clientId, campaignId, range })` cacheada em `meta_cache` com novo `scope: "campaign:{id}"`.

### D. Tipos & migração

- `analytics-types.ts`: adicionar campos novos (impressions, clicks, reach, frequency, revenue, conversionRate) em `PaidKpis`; novo tipo `CampaignDetail`.
- Migração SQL: adicionar coluna `conversion_event text` em `clients` (nullable, sem default — sem necessidade de GRANT extra, tabela já tem).

### E. Validação

Após implementar:
1. Chamar `fetchMetaAdsData` via `stack_modern--invoke-server-function` num cliente real e comparar Results/ROAS com print do Gerenciador.
2. Chamar `fetchOrganicData` e confirmar que retorna métricas não-zero pro cliente com IDs configurados.
3. Abrir Dialog de campanha no preview e validar drill-down.

---

## Arquivos afetados

- `src/lib/analytics.functions.ts` — parser, Page Token, novas fns
- `src/lib/analytics-types.ts` — novos campos
- `src/components/begrow/PaidTab.tsx` — KPIs extras, linha clicável
- `src/components/begrow/CampaignDetailDialog.tsx` — **novo**
- `src/components/begrow/ClientSettingsDialog.tsx` — campo "Evento de conversão" (opcional)
- Migração Supabase — coluna `conversion_event`

Sem mudanças em auth, rotas ou outras abas.
