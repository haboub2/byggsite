import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PAY_ITEMS } from "./pay-items.default";

test("pay item codes are unique and every item has an account", () => {
  const codes = DEFAULT_PAY_ITEMS.map((i) => i.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const i of DEFAULT_PAY_ITEMS) {
    assert.match(i.flags.account, /^\d{4}$/, i.code);
    assert.match(i.flags.counterAccount, /^\d{4}$/, i.code);
  }
});

test("flags are consistent: no tax mode without taxable, benefits against 7399, tax-free items outside every basis", () => {
  for (const i of DEFAULT_PAY_ITEMS) {
    const f = i.flags;
    if (!f.taxable) {
      assert.equal(f.taxMode, "none", i.code);
      assert.equal(f.subjectToEmployerContribution, false, i.code);
      assert.equal(f.vacationPayBasis, false, i.code);
    }
    if (i.kind === "benefit") assert.equal(f.counterAccount, "7399", i.code);
    if (i.kind === "sick_pay" || i.kind === "vacation_pay") assert.equal(f.vacationPayBasis, false, i.code);
  }
});

test("collective and white-collar pay land on 70xx and 72xx", () => {
  const byName = (name: string) => DEFAULT_PAY_ITEMS.find((i) => i.name === name)!;
  assert.equal(byName("Timlön").flags.account, "7010");
  assert.equal(byName("Månadslön").flags.account, "7210");
  assert.equal(byName("Lön VD").flags.account, "7220");
  assert.equal(byName("Styrelsearvode").flags.account, "7240");
  assert.equal(byName("Sjuklön").flags.account, "7081");
  assert.equal(byName("Sjuklön tjänsteman").flags.account, "7281");
  assert.equal(byName("Styrelsearvode").flags.pensionReportable, false);
  assert.equal(byName("Semesterersättning slutlön").flags.taxMode, "lump_sum");
});
