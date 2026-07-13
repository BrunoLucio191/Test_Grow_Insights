import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ClientRow, ClientValidation, isPlaceholderId } from "./analytics-types";
import { useEffect, useState } from "react";

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
