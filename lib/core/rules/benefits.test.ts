import { test } from "node:test";
import assert from "node:assert/strict";
import { benefitRulesAt, carRegimeFor, unverifiedBenefitRules, BENEFIT_RULE_SETS } from "./benefits";
import { unverifiedFormatRules } from "./agi-format";

test("every group has a source checked on a date; the unverified ones are pinned", () => {
  const set = benefitRulesAt("2026-06-01");
  assert.deepEqual(unverifiedBenefitRules(set).map((u) => u.path), ["car", "housing", "perDiem", "insurance.collective", "insurance.salaried"]);
  for (const u of unverifiedBenefitRules(set)) assert.ok(u.note.length > 20, u.path);
  assert.deepEqual(unverifiedFormatRules().map((u) => u.path), ["agi.huReplacement", "fora.file", "collectum.deadline", "collectum.file"]);
});

test("regimes by the car's first taxable day; 2027 is refused until its set is added", () => {
  const set = BENEFIT_RULE_SETS[0];
  assert.equal(carRegimeFor(set, "2018-06-30").key, "fore-2018-07");
  assert.equal(carRegimeFor(set, "2018-07-01").key, "2018-07");
  assert.equal(carRegimeFor(set, "2021-07-01").key, "2021-07");
  assert.throws(() => benefitRulesAt("2027-01-01"), /2027/);
});

test("the insurance totals are the sums of their parts", () => {
  const s = benefitRulesAt("2026-06-01").insurance;
  const sum = (p: Readonly<Record<string, number>>) => Math.round(Object.values(p).reduce((a, b) => a + b, 0) * 1000) / 1000;
  assert.equal(sum(s.collective.parts), s.collective.percent);
  assert.equal(sum(s.salaried.parts), s.salaried.percentBelowCap);
});
