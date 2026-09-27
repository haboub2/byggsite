import "server-only";
import { cache } from "react";
import { createClient as createSessionClient } from "../supabase/server";
import { createPublicClient } from "../supabase/public";
import { isSupabaseConfigured } from "../supabase/config";
import { isDemo } from "../leads";
import { defaultContent } from "./defaults";
import { CONTENT_KEYS, contentSchemas, type ContentKey, type ContentMap } from "./schema";

/**
 * Content store: Supabase `content_blocks` (one JSON row per key) merged over
 * the built-in defaults.
 *
 * - Public pages read with a cookie-less anon client, so reading content never
 *   turns a static page dynamic. RLS allows anyone to read content_blocks.
 * - Admin saves use the signed-in session, so RLS only lets admins write, and
 *   every save is also written to content_history for undo.
 * - Anything missing or invalid falls back to the defaults, so a bad row or a
 *   database outage can't take the site down.
 * - Demo mode (local dev without Supabase) keeps edits in memory.
 */

type Stored = Partial<Record<ContentKey, unknown>>;
export type HistoryEntry = { id: string; savedAt: string; savedBy: string | null };

const g = globalThis as unknown as {
  __binaafyContent?: Stored;
  __binaafyContentHistory?: ({ key: ContentKey; data: unknown } & HistoryEntry)[];
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Stored values over defaults, one level deep for the per-service maps, so a
 *  service added in code later still gets its default. */
function mergeBlock<K extends ContentKey>(key: K, stored: unknown): ContentMap[K] {
  const def = defaultContent[key];
  if (!isObj(stored)) return def;
  let merged: unknown;
  if (key === "company") {
    merged = { ...def, ...stored };
  } else if (key === "team") {
    merged = stored;
  } else if (key === "pricing") {
    const d = def as ContentMap["pricing"];
    merged = { services: { ...d.services, ...(isObj(stored.services) ? stored.services : {}) } };
  } else {
    const d = def as ContentMap["warranty"];
    merged = {
      bygg: stored.bygg ?? d.bygg,
      software: stored.software ?? d.software,
      services: { ...d.services, ...(isObj(stored.services) ? stored.services : {}) },
    };
  }
  const parsed = contentSchemas[key].safeParse(merged);
  if (!parsed.success) {
    console.error(`[content] stored "${key}" is invalid, using defaults:`, parsed.error.issues[0]);
    return def;
  }
  return parsed.data as ContentMap[K];
}

async function readStored(): Promise<Stored> {
  if (isDemo()) return g.__binaafyContent ?? {};
  if (!isSupabaseConfigured()) return {};
  try {
    const { data, error } = await createPublicClient()
      .from("content_blocks")
      .select("key, data")
      .in("key", [...CONTENT_KEYS]);
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((row) => [row.key, row.data]));
  } catch (err) {
    console.error("[content] could not read content_blocks, using defaults:", err);
    return {};
  }
}

/** All editable content, read once per request. */
export const getContent = cache(async (): Promise<ContentMap> => {
  const stored = await readStored();
  return {
    company: mergeBlock("company", stored.company),
    pricing: mergeBlock("pricing", stored.pricing),
    warranty: mergeBlock("warranty", stored.warranty),
    team: mergeBlock("team", stored.team),
  };
});

export async function saveContent<K extends ContentKey>(key: K, data: ContentMap[K], savedBy: string | null) {
  if (isDemo()) {
    g.__binaafyContent = { ...(g.__binaafyContent ?? {}), [key]: data };
    g.__binaafyContentHistory = [
      { id: crypto.randomUUID(), key, data, savedAt: new Date().toISOString(), savedBy },
      ...(g.__binaafyContentHistory ?? []),
    ];
    return;
  }
  const supabase = await createSessionClient();
  const { error } = await supabase
    .from("content_blocks")
    .upsert({ key, data }, { onConflict: "key" });
  if (error) throw new Error(`Kunde inte spara: ${error.message}`);
  const { error: histError } = await supabase.from("content_history").insert({ key, data, saved_by: savedBy });
  if (histError) console.error("[content] history insert failed:", histError);
}

export async function listHistory(key: ContentKey, limit = 8): Promise<HistoryEntry[]> {
  if (isDemo()) {
    return (g.__binaafyContentHistory ?? [])
      .filter((h) => h.key === key)
      .slice(0, limit)
      .map(({ id, savedAt, savedBy }) => ({ id, savedAt, savedBy }));
  }
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("content_history")
    .select("id, saved_at, saved_by")
    .eq("key", key)
    .order("saved_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map((r) => ({ id: r.id, savedAt: r.saved_at, savedBy: r.saved_by }));
}

export async function getHistoryVersion(key: ContentKey, id: string): Promise<unknown | null> {
  if (isDemo()) return (g.__binaafyContentHistory ?? []).find((h) => h.key === key && h.id === id)?.data ?? null;
  const supabase = await createSessionClient();
  const { data } = await supabase.from("content_history").select("data").eq("key", key).eq("id", id).maybeSingle();
  return data?.data ?? null;
}
