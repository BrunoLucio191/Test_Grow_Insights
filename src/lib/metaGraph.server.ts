import { GRAPH_API } from "./analytics.functions";

// Função de auxilio apra montar url
export async function graphGet<Type>(
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<Type> {
  const url = new URL(`${GRAPH_API}${path}`);

  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString());

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API ${res.status}: ${body.slice(0, 300)}`);
  }

  return res.json() as Promise<Type>;
}

export type MetaAction = { action_type: string; value: string };
/** Extracts numeric value for a specific action_type from a Meta actions/action_values array. */
export function extractMetaActionValue(arr: MetaAction[] | undefined, actionType: string): number {
  if (!arr) return 0;
  const hit = arr.find((a) => a.action_type === actionType);
  return hit ? parseFloat(hit.value) || 0 : 0;
}
/**
 * Eventos de conversão ordenados por prioridade — espelha o que o Gerenciador
 * de Anúncios mostra como "Resultados" na maioria dos objetivos focados em
 * conversão (compra/lead). Caímos para link_click apenas se nada acima existir.
 */
const CONVERSION_PRIORITY = [
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_conversion.purchase",
  "purchase",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.lead_grouped",
  "lead",
  "complete_registration",
  "offsite_conversion.fb_pixel_complete_registration",
  "link_click",
] as const;
/** Picks the dominant conversion type from an aggregated list of actions. */
export function pickConversionType(
  aggregated: Map<string, number>,
  override?: string | null,
): string {
  if (override && aggregated.has(override)) return override;
  for (const type of CONVERSION_PRIORITY) {
    if (aggregated.has(type) && (aggregated.get(type) ?? 0) > 0) return type;
  }
  return "link_click";
}
