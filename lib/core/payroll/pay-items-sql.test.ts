import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { payItemsBlock, payItemsSqlValues } from "./pay-items-sql";

test("the pay items 0039 seeds are DEFAULT_PAY_ITEMS", () => {
  const sql = readFileSync(join(__dirname, "../../../supabase/migrations/0039_payroll.sql"), "utf8");
  assert.equal(payItemsBlock(sql), payItemsSqlValues());
});
