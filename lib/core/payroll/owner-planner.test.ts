/**
 * The 3:12 planner (owner-planner.ts) against Skatteverket's examples for
 * inkomståret 2026 ("Ändrade regler i inkomstdeklarationen 2027").
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dividendRoom, ownerPlanner } from "./owner-planner";
import { payrollRulesAt } from "../rules/payroll";

const rules = payrollRulesAt("2026-12-31");

test("golden: grundbelopp 4 × 80 600 = 322 400 kr; löneunderlag 1 000 000 kr at 100 % gives (1 000 000 − 644 800) × 0,5 = 177 600 kr", () => {
  const r = dividendRoom(rules, { year: 2026, ibbOre: 8_060_000, ownershipPercent: 100, ownPayOre: 60_000_000, wageSumOre: 100_000_000 });
  assert.equal(r.grundbeloppOre, 32_240_000);
  assert.equal(r.wageSumDeductionOre, 64_480_000);
  assert.equal(r.wageBasedOre, 17_760_000);
  assert.equal(r.limitOre, 32_240_000 + 17_760_000);
  // Two owners of 50 %: 161 200 kr grundbelopp each.
  assert.equal(dividendRoom(rules, { year: 2026, ibbOre: 8_060_000, ownershipPercent: 50, ownPayOre: 0, wageSumOre: 0 }).grundbeloppOre, 16_120_000);
});

test("the share is taken of the löneunderlag before the 8 IBB deduction, and the cap is 50 × the own pay", () => {
  // 50 % of 3 000 000 = 1 500 000; − 644 800; × 0,5 = 427 600 kr; the owner earned 5 000 kr: cap 250 000 kr.
  const r = dividendRoom(rules, { year: 2026, ibbOre: 8_060_000, ownershipPercent: 50, ownPayOre: 500_000, wageSumOre: 300_000_000 });
  assert.equal(r.wageBasedBeforeCapOre, 42_760_000);
  assert.equal(r.capOre, 25_000_000);
  assert.equal(r.wageBasedOre, 25_000_000);
  assert.equal(r.capped, true);
});

test("the planner: this year from last year's pay, next year from this year's with 2026's IBB; no own pay, no wage-based room", () => {
  const p = ownerPlanner({ year: 2026, ownershipPercent: 100, ownPayLastYearOre: 0, wageSumLastYearOre: 120_000_000, ownPayYearToDateOre: 50_000_000, ownPayProjectedRestOre: 10_000_000, wageSumYearToDateOre: 150_000_000, wageSumProjectedRestOre: 30_000_000 });
  assert.equal(p.thisYear.wageBasedOre, 0);
  assert.match(p.notes.join(" "), /Utan egen lön/);
  assert.equal(p.nextYear.ibbOre, 8_340_000);
  assert.equal(p.nextYear.grundbeloppOre, 33_360_000);
  // (1 800 000 − 667 200) × 0,5 = 566 400 kr, under 50 × 600 000.
  assert.equal(p.nextYear.wageBasedOre, 56_640_000);
  assert.equal(p.ownPayThisYearOre, 60_000_000);
});
