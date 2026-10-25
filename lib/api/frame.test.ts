import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { runApiFrame } from "./frame";
import { demoApiDeps, demoApiState, registerDemoApiKey, resetDemoApi } from "./demo";
import { apiJson } from "./respond";

/**
 * The API frame in demo mode: the same steps every /api/v1 route runs
 * (key → rate limit → scope → handler → headers → log), with demo mode's
 * in-memory keys, counters and log instead of the database.
 */

const ORG = "00000000-0000-4000-8000-000000000001";
const TOKEN = "bf_test_" + "A".repeat(32);
const OTHER = "bf_test_" + "B".repeat(32);
const ok = async () => apiJson({ ok: true });

function call(path = "/api/v1/invoices?q=Anna%20Andersson", init: { token?: string | null; method?: string; headers?: Record<string, string>; body?: string } = {}) {
  const headers: Record<string, string> = { ...init.headers };
  if (init.token !== null) headers.authorization = `Bearer ${init.token ?? TOKEN}`;
  return new Request(`https://binaafy.se${path}`, { method: init.method ?? "GET", headers, body: init.body });
}

/** A clock the test moves by hand: 2026-10-25 12:00:10 UTC. */
function clock(start = Date.UTC(2026, 9, 25, 12, 0, 10)) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

beforeEach(() => resetDemoApi());

test("429 after n calls in a minute, with Retry-After and X-RateLimit-Remaining", async () => {
  registerDemoApiKey(TOKEN, { orgId: ORG, limits: { perMinute: 3, perDay: 100 } });
  const c = clock();
  const deps = demoApiDeps(ORG, c.now);
  const remaining: string[] = [];
  for (let i = 0; i < 3; i++) {
    const res = await runApiFrame(call(), "read", deps, ok);
    assert.equal(res.status, 200);
    remaining.push(res.headers.get("x-ratelimit-remaining")!);
    assert.equal(res.headers.get("x-ratelimit-limit"), "3");
  }
  assert.deepEqual(remaining, ["2", "1", "0"]);

  const refused = await runApiFrame(call(), "read", deps, ok);
  assert.equal(refused.status, 429);
  assert.equal(refused.headers.get("retry-after"), "50", "the minute started at 12:00:00, so 50 s are left");
  assert.equal(refused.headers.get("x-ratelimit-remaining"), "0");
  const body = (await refused.json()) as { error: { code: string; details: { retryAfter: number } } };
  assert.equal(body.error.code, "rate_limited");
  assert.equal(body.error.details.retryAfter, 50);

  c.advance(50_000);
  const next = await runApiFrame(call(), "read", deps, ok);
  assert.equal(next.status, 200, "a new minute starts over");
  assert.equal(next.headers.get("x-ratelimit-remaining"), "2");
});

test("the day limit holds across minutes, and a refused call is not counted", async () => {
  registerDemoApiKey(TOKEN, { orgId: ORG, limits: { perMinute: 2, perDay: 3 } });
  const c = clock();
  const deps = demoApiDeps(ORG, c.now);
  assert.equal((await runApiFrame(call(), "read", deps, ok)).status, 200);
  assert.equal((await runApiFrame(call(), "read", deps, ok)).status, 200);
  assert.equal((await runApiFrame(call(), "read", deps, ok)).status, 429, "minute full");
  assert.equal((await runApiFrame(call(), "read", deps, ok)).status, 429, "still full; not counted against the day");
  c.advance(60_000);
  const third = await runApiFrame(call(), "read", deps, ok);
  assert.equal(third.status, 200, "the refused calls did not use up the day");
  assert.equal(third.headers.get("x-ratelimit-limit"), "3", "the headers describe the day now, the window closest to its limit");
  assert.equal(third.headers.get("x-ratelimit-remaining"), "0");
  c.advance(60_000);
  const refused = await runApiFrame(call(), "read", deps, ok);
  assert.equal(refused.status, 429);
  assert.equal(Number(refused.headers.get("retry-after")), (24 - 12) * 3600 - 2 * 60 - 10, "until midnight UTC");
});

test("keys are counted separately", async () => {
  registerDemoApiKey(TOKEN, { orgId: ORG, limits: { perMinute: 1 } });
  registerDemoApiKey(OTHER, { orgId: ORG, limits: { perMinute: 1 } });
  const deps = demoApiDeps(ORG, clock().now);
  assert.equal((await runApiFrame(call(), "read", deps, ok)).status, 200);
  assert.equal((await runApiFrame(call(), "read", deps, ok)).status, 429);
  assert.equal((await runApiFrame(call(undefined, { token: OTHER }), "read", deps, ok)).status, 200);
});

test("every response has X-Request-Id, also 401", async () => {
  const deps = demoApiDeps(ORG);
  const none = await runApiFrame(call(undefined, { token: null }), "read", deps, ok);
  assert.equal(none.status, 401);
  assert.match(none.headers.get("x-request-id") ?? "", /^req_[0-9a-f]{24}$/);
  assert.equal(none.headers.get("x-ratelimit-remaining"), null, "no key, no limit to report");
  const a = await runApiFrame(call(), "read", deps, ok);
  const b = await runApiFrame(call(), "read", deps, ok);
  assert.match(a.headers.get("x-request-id") ?? "", /^req_[0-9a-f]{24}$/);
  assert.notEqual(a.headers.get("x-request-id"), b.headers.get("x-request-id"));
  assert.equal(a.headers.get("content-type"), "application/json", "the handler's own headers are kept");
  assert.equal(a.headers.get("cache-control"), "no-store");
});

test("logging: one row per call with a key, without query, body or key", async () => {
  const key = registerDemoApiKey(TOKEN, { orgId: ORG, scopes: ["read"], limits: { perMinute: 2 } });
  const deps = demoApiDeps(ORG, clock().now);
  const res = await runApiFrame(call(), "read", deps, ok);
  await runApiFrame(call("/api/v1/customers", { method: "POST", headers: { "idempotency-key": "order-4711", "content-type": "application/json" }, body: '{"name":"Anna Andersson","personalNumber":"850412-1234"}' }), "write", deps, ok);
  await runApiFrame(call(), "read", deps, ok);
  await runApiFrame(call(undefined, { token: null }), "read", deps, ok);

  const rows = demoApiState().log.list();
  assert.equal(rows.length, 3, "the call without a key belongs to no organisation and is not logged");
  const [limited, forbidden, first] = rows;
  assert.deepEqual(
    { org: first.orgId, key: first.keyId, method: first.method, path: first.path, status: first.status, idem: first.idempotencyKey, id: first.requestId },
    { org: ORG, key: key.id, method: "GET", path: "/api/v1/invoices", status: 200, idem: null, id: res.headers.get("x-request-id") }
  );
  assert.equal(forbidden.status, 403, "a read key cannot write");
  assert.equal(forbidden.method, "POST");
  assert.equal(forbidden.idempotencyKey, "order-4711");
  assert.equal(limited.status, 429);
  const text = JSON.stringify(rows);
  for (const secret of ["Anna", "850412", TOKEN, "q="]) assert.ok(!text.includes(secret), `${secret} is not in the log`);
});

test("a failing handler or key lookup is a 500 that is still logged and has a request id", async () => {
  registerDemoApiKey(TOKEN, { orgId: ORG });
  const deps = demoApiDeps(ORG, clock().now);
  const res = await runApiFrame(call(), "read", deps, async () => {
    throw new Error("boom");
  });
  assert.equal(res.status, 500);
  assert.ok(res.headers.get("x-request-id"));
  assert.equal(demoApiState().log.list()[0].status, 500);

  const broken = { ...deps, findKey: async () => Promise.reject(new Error("db down")) };
  const res2 = await runApiFrame(call(), "read", broken, ok);
  assert.equal(res2.status, 500);
  assert.ok(res2.headers.get("x-request-id"));
});

test("the limiter fails open: no decision, the call goes through without rate headers", async () => {
  registerDemoApiKey(TOKEN, { orgId: ORG });
  const deps = { ...demoApiDeps(ORG), checkRate: async () => null };
  const res = await runApiFrame(call(), "read", deps, ok);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-ratelimit-remaining"), null);
  assert.ok(res.headers.get("x-request-id"));
});

test("revoked and unknown keys: 401, a revoked key's attempt is logged", async () => {
  const key = registerDemoApiKey(TOKEN, { orgId: ORG });
  key.revokedAt = "2026-10-01T00:00:00Z";
  const deps = demoApiDeps(ORG, clock().now);
  assert.equal((await runApiFrame(call(), "read", deps, ok)).status, 401);
  assert.equal(demoApiState().log.list()[0].status, 401);
  assert.equal((await runApiFrame(call(undefined, { token: "bf_test_short" }), "read", deps, ok)).status, 401);
});

test("demo mode accepts any well-formed key the first time and remembers it", async () => {
  const deps = demoApiDeps(ORG, clock().now);
  const res = await runApiFrame(call(undefined, { token: OTHER }), "write", deps, ok);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-ratelimit-limit"), "600");
  assert.equal(demoApiState().keys.size, 1);
  assert.ok([...demoApiState().keys.values()][0].lastUsedAt);
});
