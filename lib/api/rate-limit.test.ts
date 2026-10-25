import { test } from "node:test";
import assert from "node:assert/strict";
import { decisionFromRpc, MemoryRateLimiter, rateLimitHeaders } from "./rate-limit";
import { MemoryRequestLog, requestLogEntry, summarizeRequests, type ApiRequestLog } from "./request-log";

test("api_check_rate()'s answer becomes a decision; anything else is null", () => {
  const d = decisionFromRpc({ allowed: false, limit_minute: 600, remaining_minute: 0, reset_minute: 12, limit_day: 20000, remaining_day: 1400, reset_day: 3600, retry_after: 12 });
  assert.deepEqual(d, { allowed: false, limitMinute: 600, remainingMinute: 0, resetMinute: 12, limitDay: 20000, remainingDay: 1400, resetDay: 3600, retryAfter: 12 });
  assert.equal(decisionFromRpc(null), null);
  assert.equal(decisionFromRpc({ allowed: true }), null);
});

test("headers: the window closest to its limit, Retry-After only when refused", () => {
  const base = { limitMinute: 600, resetMinute: 30, limitDay: 20000, resetDay: 40000, retryAfter: 0 };
  assert.deepEqual(rateLimitHeaders({ ...base, allowed: true, remainingMinute: 599, remainingDay: 19000 }), {
    "x-ratelimit-limit": "600",
    "x-ratelimit-remaining": "599",
    "x-ratelimit-reset": "30",
  });
  assert.deepEqual(rateLimitHeaders({ ...base, allowed: true, remainingMinute: 500, remainingDay: 10 }), {
    "x-ratelimit-limit": "20000",
    "x-ratelimit-remaining": "10",
    "x-ratelimit-reset": "40000",
  });
  const refused = rateLimitHeaders({ ...base, allowed: false, remainingMinute: 0, remainingDay: 300, retryAfter: 30 });
  assert.equal(refused["retry-after"], "30");
  assert.equal(refused["x-ratelimit-remaining"], "0");
  const dayOut = rateLimitHeaders({ ...base, allowed: false, remainingMinute: 0, remainingDay: 0, retryAfter: 40000 });
  assert.equal(dayOut["x-ratelimit-limit"], "20000", "both windows empty: the day decides");
  assert.equal(dayOut["retry-after"], "40000");
});

test("memory limiter: calendar minute and UTC day, refused calls not counted", () => {
  const l = new MemoryRateLimiter();
  const t0 = Date.UTC(2026, 9, 25, 23, 59, 30);
  const limits = { perMinute: 2, perDay: 1000 };
  assert.equal(l.check("k", limits, t0).allowed, true);
  assert.equal(l.check("k", limits, t0).allowed, true);
  const refused = l.check("k", limits, t0 + 1000);
  assert.equal(refused.allowed, false);
  assert.equal(refused.retryAfter, 29);
  assert.equal(refused.remainingDay, 998, "the refused call did not count");
  const nextDay = l.check("k", limits, Date.UTC(2026, 9, 26, 0, 0, 0));
  assert.equal(nextDay.allowed, true);
  assert.equal(nextDay.remainingDay, 999, "midnight UTC starts the day over");
  assert.equal(nextDay.resetDay, 86400);
});

const entry = (over: Partial<ApiRequestLog>): ApiRequestLog => ({
  orgId: "o",
  keyId: "k1",
  requestId: "req_1",
  method: "GET",
  path: "/api/v1/invoices",
  status: 200,
  durationMs: 5,
  idempotencyKey: null,
  createdAt: "2026-10-25T12:00:00.000Z",
  ...over,
});

test("log row: path without query, Idempotency-Key only on writes, sane method", () => {
  const req = new Request("https://binaafy.se/api/v1/customers?q=Anna", { method: "POST", headers: { "idempotency-key": "  abc-12345  ", authorization: "Bearer bf_test_x" } });
  const e = requestLogEntry({ orgId: "o", keyId: "k", requestId: "req_x", request: req, status: 201, startedAt: 1000, finishedAt: 1012.6 });
  assert.deepEqual(e, { orgId: "o", keyId: "k", requestId: "req_x", method: "POST", path: "/api/v1/customers", status: 201, durationMs: 13, idempotencyKey: "abc-12345", createdAt: new Date(1012.6).toISOString() });
  const get = requestLogEntry({ orgId: "o", keyId: "k", requestId: "r", request: new Request("https://x.se/a", { headers: { "idempotency-key": "zzzzzzzz" } }), status: 200, startedAt: 0, finishedAt: 0 });
  assert.equal(get.idempotencyKey, null);
});

test("usage per key: calls and errors since a time", () => {
  const rows = [
    entry({ requestId: "1" }),
    entry({ requestId: "2", status: 422, createdAt: "2026-10-25T13:00:00.000Z" }),
    entry({ requestId: "3", status: 429 }),
    entry({ requestId: "4", keyId: "k2", status: 500 }),
    entry({ requestId: "5", createdAt: "2026-10-23T12:00:00.000Z" }),
  ];
  const u = summarizeRequests(rows, "2026-10-24T14:00:00.000Z");
  assert.deepEqual(u.find((x) => x.keyId === "k1"), { keyId: "k1", calls: 3, errors: 2, lastAt: "2026-10-25T13:00:00.000Z" });
  assert.deepEqual(u.find((x) => x.keyId === "k2"), { keyId: "k2", calls: 1, errors: 1, lastAt: "2026-10-25T12:00:00.000Z" });
});

test("memory log: newest first, filter per key, capped, pruned after the retention", () => {
  const log = new MemoryRequestLog(3);
  for (let i = 1; i <= 4; i++) log.add(entry({ requestId: String(i), keyId: i % 2 ? "a" : "b" }));
  assert.deepEqual(log.list().map((r) => r.requestId), ["4", "3", "2"]);
  assert.deepEqual(log.list({ keyId: "a" }).map((r) => r.requestId), ["3"]);
  log.add(entry({ requestId: "old", createdAt: "2026-07-01T00:00:00.000Z" }));
  assert.equal(log.prune(90, Date.parse("2026-10-25T12:00:00Z")), 1);
  assert.ok(!log.list().some((r) => r.requestId === "old"));
});
