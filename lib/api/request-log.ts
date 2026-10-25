import { randomBytes } from "node:crypto";

/**
 * The API request log (api_requests, 0029_api_usage.sql). One row per call
 * made with a key: method, path, status, duration, the client's
 * Idempotency-Key and our request id. Never the body, the query string
 * (it can hold names and search terms) or the key. Kept 90 days; the cron
 * prunes it. Demo mode keeps the latest rows in memory.
 */

export const API_LOG_RETENTION_DAYS = 90;

export type ApiRequestLog = {
  orgId: string;
  keyId: string | null;
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  idempotencyKey: string | null;
  createdAt: string;
};

/** "req_" + 24 hex characters. Sent as X-Request-Id on every response. */
export function newRequestId(): string {
  return `req_${randomBytes(12).toString("hex")}`;
}

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

/** The row for a finished call: only the path, a known method, sane lengths. */
export function requestLogEntry(input: {
  orgId: string;
  keyId: string | null;
  requestId: string;
  request: Request;
  status: number;
  startedAt: number;
  finishedAt: number;
}): ApiRequestLog {
  const url = new URL(input.request.url);
  const method = input.request.method.toUpperCase();
  const idem = input.request.headers.get("idempotency-key")?.trim() ?? "";
  return {
    orgId: input.orgId,
    keyId: input.keyId,
    requestId: input.requestId,
    method: METHODS.has(method) ? method : "GET",
    path: url.pathname.slice(0, 300),
    status: input.status,
    durationMs: Math.max(0, Math.round(input.finishedAt - input.startedAt)),
    idempotencyKey: method !== "GET" && idem ? idem.slice(0, 128) : null,
    createdAt: new Date(input.finishedAt).toISOString(),
  };
}

/** The row as api_requests takes it. */
export function toRow(e: ApiRequestLog) {
  return {
    org_id: e.orgId,
    key_id: e.keyId,
    request_id: e.requestId,
    method: e.method,
    path: e.path,
    status: e.status,
    duration_ms: e.durationMs,
    idempotency_key: e.idempotencyKey,
    created_at: e.createdAt,
  };
}

export type KeyUsage = { keyId: string | null; calls: number; errors: number; lastAt: string | null };

/** Calls and errors (status 400 and up) per key since `since`, like api_request_stats(). */
export function summarizeRequests(rows: readonly ApiRequestLog[], since: string): KeyUsage[] {
  const by = new Map<string | null, KeyUsage>();
  for (const r of rows) {
    if (r.createdAt < since) continue;
    const u = by.get(r.keyId) ?? { keyId: r.keyId, calls: 0, errors: 0, lastAt: null };
    u.calls++;
    if (r.status >= 400) u.errors++;
    if (!u.lastAt || r.createdAt > u.lastAt) u.lastAt = r.createdAt;
    by.set(r.keyId, u);
  }
  return [...by.values()];
}

/** Demo mode's log: the newest `max` rows, newest first. */
export class MemoryRequestLog {
  readonly rows: ApiRequestLog[] = [];
  constructor(private readonly max = 1000) {}

  add(e: ApiRequestLog): void {
    this.rows.unshift(e);
    if (this.rows.length > this.max) this.rows.length = this.max;
  }

  list(filter: { keyId?: string; limit?: number } = {}): ApiRequestLog[] {
    return this.rows.filter((r) => !filter.keyId || r.keyId === filter.keyId).slice(0, filter.limit ?? 200);
  }

  prune(days = API_LOG_RETENTION_DAYS, now = Date.now()): number {
    const cutoff = new Date(now - days * 86_400_000).toISOString();
    const before = this.rows.length;
    const kept = this.rows.filter((r) => r.createdAt >= cutoff);
    this.rows.splice(0, this.rows.length, ...kept);
    return before - kept.length;
  }
}
