import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";

/**
 * Which database client the core stores use. Normally the caller's session,
 * so RLS decides what they see. A job with no user (the daily cron, an API
 * call authenticated with a key) runs inside `asSystem()` and gets the
 * service-role client; the code in the stores stays the same.
 *
 * Service role sees every organisation, so `asSystem` takes the organisation
 * the caller is acting for, and every store filters and writes with
 * `currentOrgId()` (lib/core/org/current.ts), which reads it from here.
 */

type Context = { system: true; orgId?: string };
const context = new AsyncLocalStorage<Context>();

export async function getDb(): Promise<SupabaseClient> {
  if (context.getStore()?.system) return createAdminClient();
  return (await createSessionClient()) as unknown as SupabaseClient;
}

/**
 * Run `fn` with the service-role client. Only for code paths that have
 * authenticated themselves (cron secret, API key). Pass the organisation
 * whenever the work belongs to one; without it the stores refuse to guess.
 */
export function asSystem<T>(fn: () => Promise<T>, orgId?: string): Promise<T> {
  return context.run(orgId ? { system: true, orgId } : { system: true }, fn);
}

export function isSystem(): boolean {
  return Boolean(context.getStore()?.system);
}

/** The organisation `asSystem` was given, if any. */
export function systemOrgId(): string | undefined {
  return context.getStore()?.orgId;
}
