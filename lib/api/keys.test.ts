import { test } from "node:test";
import assert from "node:assert/strict";
import { bearerToken, generateApiKey, hasScope, hashApiKey, isApiKeyFormat } from "./keys";

test("generated keys have the format, a stable hash and a recognisable prefix", () => {
  const k = generateApiKey("live");
  assert.ok(isApiKeyFormat(k.token), k.token);
  assert.equal(k.prefix, k.token.slice(0, 12));
  assert.equal(k.hash, hashApiKey(k.token));
  assert.equal(k.hash.length, 64);
  assert.notEqual(generateApiKey("live").token, k.token);
  assert.ok(generateApiKey("test").token.startsWith("bf_test_"));
});

test("format check rejects anything else", () => {
  assert.equal(isApiKeyFormat("bf_live_short"), false);
  assert.equal(isApiKeyFormat("sk_live_" + "a".repeat(32)), false);
  assert.equal(isApiKeyFormat("bf_live_" + "a".repeat(32)), true);
});

test("bearer token parsing", () => {
  assert.equal(bearerToken("Bearer abc"), "abc");
  assert.equal(bearerToken("bearer abc"), "abc");
  assert.equal(bearerToken("Basic abc"), null);
  assert.equal(bearerToken(null), null);
});

test("scopes: admin implies all, write implies read, payroll is implied by nothing else", () => {
  assert.equal(hasScope(["read"], "read"), true);
  assert.equal(hasScope(["read"], "write"), false);
  assert.equal(hasScope(["write"], "read"), true);
  assert.equal(hasScope(["admin"], "write"), true);
  assert.equal(hasScope([], "read"), false);
  assert.equal(hasScope(["read", "write"], "payroll"), false, "an invoicing key sees no salaries");
  assert.equal(hasScope(["payroll"], "payroll"), true);
  assert.equal(hasScope(["payroll"], "read"), false);
  assert.equal(hasScope(["admin"], "payroll"), true);
  assert.equal(hasScope(["payroll"], ["payroll", "write"]), false, "creating time needs write too");
  assert.equal(hasScope(["payroll", "write"], ["payroll", "write"]), true);
  assert.equal(hasScope(["admin"], ["payroll", "write"]), true);
});
