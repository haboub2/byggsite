import "server-only";
import { randomBytes } from "node:crypto";
import { createClient } from "../supabase/server";
import { currentOrgId, DEMO_ORG_ID } from "../core/org/current";
import { WEBHOOK_EVENT_TYPES, type Actor } from "../core/events";
import { isDemo } from "../leads";
import { API_SCOPES, generateApiKey, type ApiScope } from "./keys";
import { webhookUrlProblem } from "./webhooks";
import { demoApiState, registerDemoApiKey } from "./demo";
import { summarizeRequests, type ApiRequestLog, type KeyUsage } from "./request-log";

/**
 * API keys and webhook endpoints as the admin page manages them, with the
 * session so RLS (api_keys_admin, webhook_endpoints_admin: owner/admin)
 * decides. The key itself is returned once from createApiKey and never
 * stored; the webhook secret is stored, since every delivery is signed with it.
 * The request log (api_requests) is read the same way. Demo mode keeps keys
 * and the log in memory (lib/api/demo.ts) and has no webhooks.
 */

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdBy: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  ratePerMinute: number;
  ratePerDay: number;
};
export type WebhookRow = { id: string; url: string; events: string[]; active: boolean; createdAt: string; secretHint: string };
export type DeliveryRow = { id: string; url: string; type: string; attempt: number; status: number | null; deliveredAt: string | null; failedAt: string | null; nextAttemptAt: string; createdAt: string };

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  if (isDemo())
    return [...demoApiState().keys.values()]
      .map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes, createdBy: null, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt, revokedAt: k.revokedAt, ratePerMinute: k.limits.perMinute, ratePerDay: k.limits.perDay }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, prefix, scopes, created_by, created_at, last_used_at, revoked_at, rate_per_minute, rate_per_day")
    .eq("org_id", await currentOrgId())
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Kunde inte hämta nycklarna: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    scopes: r.scopes,
    createdBy: r.created_by,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    revokedAt: r.revoked_at,
    ratePerMinute: r.rate_per_minute,
    ratePerDay: r.rate_per_day,
  }));
}

export async function createApiKey(name: string, scopes: ApiScope[], actor: Actor): Promise<{ id: string; token: string }> {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new Error("Ge nyckeln ett namn, t.ex. vad den används till.");
  const valid = scopes.filter((s) => (API_SCOPES as readonly string[]).includes(s));
  if (!valid.length) throw new Error("Välj minst en behörighet.");
  const org = await currentOrgId();
  const key = generateApiKey(process.env.NODE_ENV === "production" ? "live" : "test");
  if (isDemo()) return { id: registerDemoApiKey(key.token, { orgId: DEMO_ORG_ID, name: clean, scopes: valid }).id, token: key.token };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({ org_id: org, name: clean, prefix: key.prefix, key_hash: key.hash, scopes: valid, created_by: actor.name })
    .select("id")
    .single();
  if (error) throw new Error(`Kunde inte skapa nyckeln: ${error.message}`);
  await supabase.from("events").insert({ org_id: org, aggregate_type: "api_key", aggregate_id: data.id, type: "api_key.created", data: { name: clean, prefix: key.prefix, scopes: valid.join(",") }, actor });
  return { id: data.id as string, token: key.token };
}

export async function revokeApiKey(id: string, actor: Actor): Promise<void> {
  if (isDemo()) {
    const key = [...demoApiState().keys.values()].find((k) => k.id === id && !k.revokedAt);
    if (!key) throw new Error("Nyckeln finns inte eller är redan återkallad.");
    key.revokedAt = new Date().toISOString();
    return;
  }
  const org = await currentOrgId();
  const supabase = await createClient();
  const { data, error } = await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("org_id", org).is("revoked_at", null).select("id, name");
  if (error) throw new Error(`Kunde inte återkalla: ${error.message}`);
  if (!data?.length) throw new Error("Nyckeln finns inte eller är redan återkallad.");
  await supabase.from("events").insert({ org_id: org, aggregate_type: "api_key", aggregate_id: id, type: "api_key.revoked", data: { name: data[0].name }, actor });
}

export async function listWebhooks(): Promise<WebhookRow[]> {
  if (isDemo()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("webhook_endpoints").select("id, url, events, active, created_at, secret").eq("org_id", await currentOrgId()).order("created_at", { ascending: false });
  if (error) throw new Error(`Kunde inte hämta webhooks: ${error.message}`);
  return (data ?? []).map((r) => ({ id: r.id, url: r.url, events: r.events, active: r.active, createdAt: r.created_at, secretHint: `${String(r.secret).slice(0, 6)}…` }));
}

export async function createWebhook(url: string, events: string[], actor: Actor): Promise<{ id: string; secret: string }> {
  const problem = webhookUrlProblem(url.trim());
  if (problem) throw new Error(problem);
  const chosen = events.filter((e) => (WEBHOOK_EVENT_TYPES as readonly string[]).includes(e));
  const org = await currentOrgId();
  const secret = randomBytes(32).toString("hex");
  const supabase = await createClient();
  const { data, error } = await supabase.from("webhook_endpoints").insert({ org_id: org, url: url.trim(), events: chosen, secret }).select("id").single();
  if (error) throw new Error(`Kunde inte registrera webhooken: ${error.message}`);
  await supabase.from("events").insert({ org_id: org, aggregate_type: "webhook", aggregate_id: data.id, type: "webhook.created", data: { url: url.trim(), events: chosen.join(",") || "alla" }, actor });
  return { id: data.id as string, secret };
}

export async function removeWebhook(id: string, actor: Actor): Promise<void> {
  const org = await currentOrgId();
  const supabase = await createClient();
  const { data, error } = await supabase.from("webhook_endpoints").delete().eq("id", id).eq("org_id", org).select("url");
  if (error) throw new Error(`Kunde inte ta bort webhooken: ${error.message}`);
  if (data?.length) await supabase.from("events").insert({ org_id: org, aggregate_type: "webhook", aggregate_id: id, type: "webhook.removed", data: { url: data[0].url }, actor });
}

export async function listDeliveries(limit = 20): Promise<DeliveryRow[]> {
  if (isDemo()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("webhook_deliveries")
    .select("id, attempt, status, delivered_at, failed_at, next_attempt_at, created_at, webhook_endpoints(url), events(type)")
    .eq("org_id", await currentOrgId())
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Kunde inte hämta leveranserna: ${error.message}`);
  type Row = {
    id: string;
    attempt: number;
    status: number | null;
    delivered_at: string | null;
    failed_at: string | null;
    next_attempt_at: string;
    created_at: string;
    webhook_endpoints: { url: string } | null;
    events: { type: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    url: r.webhook_endpoints?.url ?? "",
    type: r.events?.type ?? "",
    attempt: r.attempt,
    status: r.status,
    deliveredAt: r.delivered_at,
    failedAt: r.failed_at,
    nextAttemptAt: r.next_attempt_at,
    createdAt: r.created_at,
  }));
}

/* ---------- request log ---------- */

/** The latest calls, newest first, optionally for one key. */
export async function listApiRequests(filter: { keyId?: string; limit?: number } = {}): Promise<ApiRequestLog[]> {
  const limit = Math.min(filter.limit ?? 200, 500);
  if (isDemo()) return demoApiState().log.list({ keyId: filter.keyId, limit });
  const supabase = await createClient();
  let q = supabase
    .from("api_requests")
    .select("org_id, key_id, request_id, method, path, status, duration_ms, idempotency_key, created_at")
    .eq("org_id", await currentOrgId());
  if (filter.keyId) q = q.eq("key_id", filter.keyId);
  const { data, error } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
  if (error) throw new Error(`Kunde inte hämta anropen: ${error.message}`);
  return (data ?? []).map((r) => ({
    orgId: r.org_id,
    keyId: r.key_id,
    requestId: r.request_id,
    method: r.method,
    path: r.path,
    status: r.status,
    durationMs: r.duration_ms,
    idempotencyKey: r.idempotency_key,
    createdAt: r.created_at,
  }));
}

/** Calls and errors per key over the last 24 hours (api_request_stats, RLS: owner/admin). */
export async function apiUsageLastDay(now = Date.now()): Promise<KeyUsage[]> {
  const since = new Date(now - 86_400_000).toISOString();
  if (isDemo()) return summarizeRequests(demoApiState().log.rows, since);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("api_request_stats", { p_org: await currentOrgId(), p_since: since });
  if (error) throw new Error(`Kunde inte räkna anropen: ${error.message}`);
  type Row = { key_id: string | null; calls: number | string; errors: number | string; last_at: string | null };
  return ((data ?? []) as Row[]).map((r) => ({ keyId: r.key_id, calls: Number(r.calls), errors: Number(r.errors), lastAt: r.last_at }));
}
