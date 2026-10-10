"use server";

import { revalidatePath } from "next/cache";
import { checkAdmin } from "@/lib/admin";
import { CONTENT_KEYS, contentSchemas, type ContentKey, type ContentMap } from "@/lib/content/schema";
import { getHistoryVersion, saveContent } from "@/lib/content/store";

export type ContentActionState = {
  ok?: boolean;
  error?: string;
  /** Field errors keyed by dotted path, e.g. "byggStats.0.value". */
  fieldErrors?: Record<string, string>;
  savedAt?: string;
};

const isKey = (k: unknown): k is ContentKey => CONTENT_KEYS.includes(k as ContentKey);

async function persist(key: ContentKey, data: unknown, savedBy: string | null): Promise<ContentActionState> {
  const parsed = contentSchemas[key].safeParse(data);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return { error: "Några fält behöver rättas innan det går att spara.", fieldErrors };
  }
  try {
    await saveContent(key, parsed.data as ContentMap[typeof key], savedBy);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte spara." };
  }
  // Every page can show company details, prices or warranties: refresh them all.
  revalidatePath("/", "layout");
  return { ok: true, savedAt: new Date().toISOString() };
}

/** Save one content block. The form posts the whole block as JSON. */
export async function saveContentBlock(_prev: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet. Logga in igen." };

  const key = formData.get("key");
  if (!isKey(key)) return { error: "Okänt innehåll." };

  let data: unknown;
  try {
    data = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Formuläret kunde inte läsas. Ladda om sidan och försök igen." };
  }
  return persist(key, data, check.email);
}

/** Save an earlier version again, so it becomes the current one (and itself undoable). */
export async function restoreContentVersion(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  const key = formData.get("key");
  const id = String(formData.get("id") ?? "");
  if (!isKey(key) || !id) return;
  const data = await getHistoryVersion(key, id);
  if (data) await persist(key, data, check.email);
}
