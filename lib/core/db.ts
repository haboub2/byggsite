import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";

/**
 * Which database client the core stores use. Normally the caller's session,
 * so RLS decides what they see. A job with no user (the daily cron, a
 * webhook) runs inside `asSystem()` and gets the service-role client; the
 * code in the stores stays the same.
 */

const context = new AsyncLocalStorage<{ system: true }>();

export async function getDb(): Promise<SupabaseClient> {
  if (context.getStore()?.system) return createAdminClient();
  return (await createSessionClient()) as unknown as SupabaseClient;
}

/** Run `fn` with the service-role client. Only for code paths that have authenticated themselves (cron secret, API key). */
export function asSystem<T>(fn: () => Promise<T>): Promise<T> {
  return context.run({ system: true }, fn);
}

export function isSystem(): boolean {
  return Boolean(context.getStore()?.system);
}
