import { GRAPH_API } from "@/constantes/metaDefaults";

// Função de auxilio para montar url (agora com Paginação Automática)
export async function graphGet<Type>(
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<Type> {
  const url = new URL(`${GRAPH_API}${path}`);

  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);

  let currentUrl: string | null = url.toString();
  let firstResponse: Record<string, unknown> | null = null;
  const accumulatedData: unknown[] = [];
  let isPaginatedList = false;

  while (currentUrl) {
    const res = await fetch(currentUrl);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Meta API ${res.status}: ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as Record<string, unknown>;

    if (!firstResponse) {
      firstResponse = json;
    }

    if (json && Array.isArray(json.data)) {
      isPaginatedList = true;
      accumulatedData.push(...json.data);
    } else {
      break;
    }

    const paging = json.paging as { next?: string } | undefined;
    if (paging && paging.next) {
      currentUrl = paging.next;
    } else {
      currentUrl = null;
    }
  }

  if (isPaginatedList && firstResponse) firstResponse.data = accumulatedData;

  return firstResponse as Type;
}

export type MetaAction = { action_type: string; value: string };
export function extractMetaActionValue(arr: MetaAction[] | undefined, actionType: string): number {
  if (!arr) return 0;
  const hit = arr.find((a) => a.action_type === actionType);
  return hit ? parseFloat(hit.value) || 0 : 0;
}

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
