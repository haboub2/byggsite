import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  daysBetween,
  lateInterestOre,
  lateInterestPercentAt,
  referenceRateAt,
  retentionUntil,
  rotClaimDeadline,
  rulesAt,
  RULE_SETS,
} from "./index";

test("rule sets are ordered and dated", () => {
  for (let i = 1; i < RULE_SETS.length; i++) assert.ok(RULE_SETS[i - 1].validFrom < RULE_SETS[i].validFrom);
});

test("ROT was 50 % in 2025 and is 30 % from 2026", () => {
  assert.equal(rulesAt("2025-06-15").rot.rate, 0.5);
  assert.equal(rulesAt("2025-12-31").rot.rate, 0.5);
  assert.equal(rulesAt("2026-01-01").rot.rate, 0.3);
  assert.equal(rulesAt("2026-10-10").rot.rate, 0.3);
  assert.equal(rulesAt("2026-10-10").rot.capPerPerson, 5_000_000);
  assert.equal(rulesAt("2026-10-10").rot.combinedCapPerPerson, 7_500_000);
});

test("dates before the first set fall back to it; bad dates throw", () => {
  assert.equal(rulesAt("2024-03-01").validFrom, "2025-01-01");
  assert.throws(() => rulesAt("2026-1-1"), RangeError);
  assert.throws(() => rulesAt("10/10/2026"), RangeError);
});

test("VAT and reverse charge constants", () => {
  const r = rulesAt("2026-10-10");
  assert.deepEqual([...r.vat.rates], [25, 12, 6, 0]);
  assert.equal(r.reverseCharge.text, "Omvänd betalningsskyldighet");
  assert.equal(r.reverseCharge.vatCategory, "AE");
});

test("late interest is the reference rate plus eight points", () => {
  assert.equal(referenceRateAt("2026-03-01").percent, 1.75);
  assert.equal(referenceRateAt("2025-09-01").percent, 2.0);
  assert.equal(lateInterestPercentAt("2026-03-01"), 9.75);
  assert.equal(referenceRateAt("2026-03-01").assumed, false);
  assert.equal(referenceRateAt("2026-08-01").assumed, true);
});

test("interest amount, actual/365", () => {
  // 42 500 kr, 9,75 %, 30 days → 42 500 × 0,0975 × 30 / 365 = 340,58 kr
  assert.equal(lateInterestOre(4_250_000, 9.75, 30), 34_058);
  assert.equal(lateInterestOre(4_250_000, 9.75, 0), 0);
  assert.equal(lateInterestOre(0, 9.75, 30), 0);
});

test("reminder fee: 60 kr against businesses, nothing against consumers by default", () => {
  assert.equal(rulesAt("2026-10-10").reminderFee.businessOre, 6_000);
  assert.equal(rulesAt("2026-10-10").reminderFee.consumerOre, 0);
});

test("ROT claim deadline is 31 January the year after payment", () => {
  assert.equal(rotClaimDeadline("2026-10-16"), "2027-01-31");
  assert.equal(rotClaimDeadline("2026-01-02"), "2027-01-31");
});

test("records are kept seven years after the fiscal year", () => {
  assert.equal(retentionUntil("2026-12-31"), "2033-12-31");
});

test("date helpers", () => {
  assert.equal(daysBetween("2026-10-12", "2026-10-19"), 7);
  assert.equal(addDays("2026-10-10", 14), "2026-10-24");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
