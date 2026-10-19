import { test } from "node:test";
import assert from "node:assert/strict";
import { idempotencyKeySchema, replayDecision, requestHash } from "./idempotency";

test("keys are validated", () => {
  assert.equal(idempotencyKeySchema.safeParse("order-2026-10-19-0001").success, true);
  assert.equal(idempotencyKeySchema.safeParse("short").success, false);
  assert.equal(idempotencyKeySchema.safeParse("has space in it").success, false);
});

test("the request hash changes with method, path or body", () => {
  const a = requestHash("POST", "/api/v1/invoices", '{"a":1}');
  assert.equal(a, requestHash("post", "/api/v1/invoices", '{"a":1}'));
  assert.notEqual(a, requestHash("POST", "/api/v1/invoices", '{"a":2}'));
  assert.notEqual(a, requestHash("POST", "/api/v1/customers", '{"a":1}'));
});

test("replay decision", () => {
  const hash = requestHash("POST", "/x", "{}");
  assert.equal(replayDecision(null, hash), "fresh");
  assert.equal(replayDecision({ status: 201, response: {}, requestHash: hash }, hash), "replay");
  assert.equal(replayDecision({ status: 201, response: {}, requestHash: "other" }, hash), "conflict");
});
