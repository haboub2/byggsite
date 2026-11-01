import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  assertReferenceRateKnown,
  daysBetween,
  lateInterestOre,
  lateInterestPercentAt,
  referenceRateAt,
  REFERENCE_RATES,
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
  // Riksbanken's table: 4,00 / 4,00 / 3,00 / 2,00 / 2,00 / 2,00 for 2024-01 … 2026-07.
  assert.equal(referenceRateAt("2024-09-01").percent, 4.0);
  assert.equal(referenceRateAt("2025-03-01").percent, 3.0);
  assert.equal(referenceRateAt("2025-09-01").percent, 2.0);
  assert.equal(referenceRateAt("2026-03-01").percent, 2.0);
  assert.equal(referenceRateAt("2026-08-01").percent, 2.0);
  assert.equal(lateInterestPercentAt("2026-03-01"), 10);
  assert.equal(referenceRateAt("2026-08-01").assumed, false);
  assert.equal(referenceRateAt("2027-01-01").assumed, true);
  assert.throws(() => assertReferenceRateKnown("2027-02-01"), /1 januari 2027/);
  assert.doesNotThrow(() => assertReferenceRateKnown("2026-12-31"));
});

test("the reference rate is always a whole or half percent and the table is current", () => {
  for (const r of REFERENCE_RATES) assert.equal((r.percent * 2) % 1, 0, `${r.from}: ${r.percent} är inte en hel eller halv procent`);
  const today = new Date().toISOString().slice(0, 10);
  // Fails on purpose from the first day of a half-year whose rate is not in the table:
  // look it up at riksbank.se and add the row. Reminders refuse to send until then.
  assert.equal(referenceRateAt(today).assumed, false, `Lägg in referensräntan för det halvår som börjar efter ${REFERENCE_RATES[REFERENCE_RATES.length - 1].from} i lib/core/rules/index.ts.`);
});

test("interest amount, actual/365", () => {
  // 42 500 kr, 9,75 %, 30 days → 42 500 × 0,0975 × 30 / 365 = 340,58 kr
  assert.equal(lateInterestOre(4_250_000, 9.75, 30), 34_058);
  assert.equal(lateInterestOre(4_250_000, 9.75, 0), 0);
  assert.equal(lateInterestOre(0, 9.75, 30), 0);
});

test("reminder fee: at most 60 kr, and only when agreed (lag 1981:739 2 §)", () => {
  assert.equal(rulesAt("2026-10-10").reminderFee.maxOre, 6_000);
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
