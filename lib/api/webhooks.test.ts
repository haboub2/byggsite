import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_WEBHOOK_ATTEMPTS, nextAttemptAt, signWebhook, verifyWebhook, webhookPayload, webhookUrlProblem } from "./webhooks";
import { isWebhookEvent, WEBHOOK_EVENT_TYPES } from "../core/events";

test("signature: known value, and it verifies", () => {
  const body = '{"id":"e1","type":"invoice.paid"}';
  const sig = signWebhook("hemlig", body, 1_790_000_000);
  // HMAC-SHA256("hemlig", "1790000000.<body>"), computed independently with node:crypto and frozen here.
  assert.equal(sig, "t=1790000000,v1=91bca377d96dc2a6703dd67969422c915a8b0f93fad6caa68ead8dde1b0bce7b");
  assert.equal(verifyWebhook("hemlig", body, sig, 1_790_000_100), true);
});

test("signature: changed body, wrong secret, old timestamp and junk fail", () => {
  const body = '{"a":1}';
  const sig = signWebhook("s", body, 1000);
  assert.equal(verifyWebhook("s", '{"a":2}', sig, 1000), false);
  assert.equal(verifyWebhook("t", body, sig, 1000), false);
  assert.equal(verifyWebhook("s", body, sig, 1000 + 301), false);
  assert.equal(verifyWebhook("s", body, "v1=abc", 1000), false);
  assert.equal(verifyWebhook("s", body, null, 1000), false);
});

test("signature changes with the timestamp", () => {
  assert.notEqual(signWebhook("s", "x", 1).split("v1=")[1], signWebhook("s", "x", 2).split("v1=")[1]);
});

test("backoff doubles and stops after the last attempt", () => {
  const t0 = new Date("2026-10-20T06:00:00Z");
  assert.equal(nextAttemptAt(1, t0)!.toISOString(), "2026-10-20T06:01:00.000Z");
  assert.equal(nextAttemptAt(2, t0)!.toISOString(), "2026-10-20T06:02:00.000Z");
  assert.equal(nextAttemptAt(5, t0)!.toISOString(), "2026-10-20T06:16:00.000Z");
  assert.equal(nextAttemptAt(MAX_WEBHOOK_ATTEMPTS - 1, t0)!.getTime() - t0.getTime(), 64 * 60_000);
  assert.equal(nextAttemptAt(MAX_WEBHOOK_ATTEMPTS, t0), null);
});

test("payload shape", () => {
  const p = webhookPayload({ id: "e", type: "invoice.issued", created_at: "2026-10-20T06:00:00Z", data: { number: "10005" }, aggregate_type: "invoice", aggregate_id: "i" });
  assert.deepEqual(p, { id: "e", type: "invoice.issued", created_at: "2026-10-20T06:00:00Z", data: { number: "10005" }, aggregate: { type: "invoice", id: "i" } });
});

test("endpoint URLs", () => {
  assert.equal(webhookUrlProblem("https://httpbin.org/post", true), null);
  assert.ok(webhookUrlProblem("http://example.se/hook", true));
  assert.equal(webhookUrlProblem("http://localhost:4000/hook", false), null);
  assert.ok(webhookUrlProblem("https://localhost/hook", true));
  assert.ok(webhookUrlProblem("inte en adress", false));
});

test("payroll events are webhook events (phase 6); internal ones are not", () => {
  for (const t of ["payslip.approved", "payroll.run_approved", "payroll.run_closed", "time.approved", "expense.approved"] as const) assert.equal(isWebhookEvent(t), true, t);
  for (const t of ["payroll.run_calculated", "employee.pnr_revealed", "payslip.pdf_created", "time.submitted", "expense.paid"] as const) assert.equal(isWebhookEvent(t), false, t);
});

test("is_webhook_event() in 0043 has the same list as WEBHOOK_EVENT_TYPES", () => {
  const sql = readFileSync(join(__dirname, "../../supabase/migrations/0043_product.sql"), "utf8");
  const fn = /create or replace function public\.is_webhook_event[\s\S]*?\$\$;/.exec(sql)?.[0] ?? "";
  const listed = [...fn.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(listed, [...WEBHOOK_EVENT_TYPES].sort());
});

test("payroll webhook payloads carry ids and sums, never a document", () => {
  const p = webhookPayload({ id: "e", type: "payslip.approved", created_at: "2026-11-21T10:00:00Z", data: { payslipId: "p", runId: "r", number: 7, period: "2026-11", netOre: 2_900_000 }, aggregate_type: "employee", aggregate_id: "emp" });
  assert.deepEqual(Object.keys(p.data).sort(), ["netOre", "number", "payslipId", "period", "runId"]);
  assert.equal(p.aggregate.type, "employee");
});
