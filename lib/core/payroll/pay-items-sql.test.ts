import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PAY_ITEMS_MIGRATION, payItemsBlock, payItemsSqlValues } from "./pay-items-sql";

test(`the pay items ${PAY_ITEMS_MIGRATION} seeds are DEFAULT_PAY_ITEMS`, () => {
  const sql = readFileSync(join(__dirname, "../../../supabase/migrations", PAY_ITEMS_MIGRATION), "utf8");
  assert.equal(payItemsBlock(sql), payItemsSqlValues());
});

test("0039's block is the register as it was then: the current one without 1830 and 1831", () => {
  const sql = readFileSync(join(__dirname, "../../../supabase/migrations/0039_payroll.sql"), "utf8");
  const then = payItemsBlock(sql);
  const now = payItemsSqlValues()
    .split("\n")
    .filter((l) => !/^\s+\('183[01]'/.test(l))
    .join("\n")
    .replace(/,$/, "");
  assert.equal(then.replace(/,$/, ""), now);
});
