import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ClientRow, ClientValidation } from "./analytics-types";
import { useEffect, useState } from "react";
import { DateRange } from "./analytics-types";
import { PLACEHOLDER_RE } from "@/constantes/metaDefaults";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function validateClient(
  client: Pick<ClientRow, "meta_ad_account_id" | "meta_page_id" | "ig_account_id">,
): ClientValidation {
  const paidOk = !isPlaceholderId(client.meta_ad_account_id);
  const pageOk = !isPlaceholderId(client.meta_page_id);
  const igOk = !isPlaceholderId(client.ig_account_id);
  const organicOk = pageOk || igOk;
  const missing: string[] = [];

  if (!paidOk) missing.push("Meta Ads Account ID");
  if (!pageOk) missing.push("Facebook Page ID");
  if (!igOk) missing.push("Instagram Account ID");

  return { paidOk, organicOk, anyOk: paidOk || organicOk, missing };
}

export function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  return undefined;
}

export function useSessionStorage<T>(key: string, initialValue: T) {
  const [state, setState] = useState<T>(initialValue);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const storedValue = sessionStorage.getItem(key);

    if (storedValue !== null) {
      try {
        setState(JSON.parse(storedValue));
      } catch (error) {
        console.error("Erro ao ler do sessionStorage", error);
      }
    }
  }, [key]);

  useEffect(() => {
    if (isMounted) {
      sessionStorage.setItem(key, JSON.stringify(state));
    }
  }, [key, state, isMounted]);

  return [state, setState] as const;
}
export function calculateDays(range: DateRange): string {
  const start: Date = new Date(range.from);
  const end: Date = new Date(range.to);
  let isMonth: string = "daily";

  const milliDiff: number = start.getTime() - end.getTime();

  const daysDifference = Math.abs(milliDiff) / (1000 * 3600 * 24);

  if (daysDifference > 29) isMonth = "monthly";
  else if (daysDifference < 29) isMonth = "1";
  return isMonth;
}

//clipa em 29 dias pro trafego organico n da bo, precisa ser do dia mais recente - 1 e no maximo 29 dias
export function cliplingOrganicDate(range: DateRange): DateRange {
  const daysInMiliseconds29 = 2505600000;
  let newRangeTo = "";
  let newRangeFrom = "";
  const dateToChangeToSlice = new Date();
  const dateToChangeForSlice = new Date();

  const actualTimeRange = Math.abs(new Date(range.to).getTime() - new Date(range.from).getTime());

  if (actualTimeRange > daysInMiliseconds29) {
    dateToChangeToSlice.setDate(new Date().getDate() - 15);
    dateToChangeToSlice.setDate(new Date().getDate() - 1);

    dateToChangeForSlice.setDate(new Date().getDate() - 2);
    newRangeFrom = dateToChangeToSlice.toISOString().split("T")[0];
    newRangeTo = dateToChangeForSlice.toISOString().split("T")[0];

    return { from: newRangeFrom, to: newRangeTo };
  }

  return range;
}
export function attrToArray(value: string | null | undefined): string[] {
  if (!value) return ["7d_click", "1d_view"];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function scopeKey(base: "paid" | "organic", attribution?: string | null): string {
  const attr = attribution ?? "7d_click,1d_view";

  if (attr === "7d_click,1d_view") return base;
  return `${base}:atr=${attr}`;
}

export function isPlaceholder(id: string | null | undefined): boolean {
  return isPlaceholderId(id);
}
export function isPlaceholderId(id: string | null | undefined): boolean {
  if (!id || !id.trim()) return true;
  const value = id.trim();
  return PLACEHOLDER_RE.test(value);
}
