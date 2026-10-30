/**
 * Utlägg, milersättning and traktamente (expenses.ts) with Skatteverket's
 * 2026 amounts, and the SQL's caps (expense_rules() in 0042) kept equal to
 * the rule book.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { payrollRulesAt } from "../rules/payroll";
import { claimLines, computeClaim, mealReductionPercent, type ExpensePolicy } from "./expenses";
import { benefitRulesAt } from "../rules/benefits";
import { DEFAULT_PAY_ITEMS } from "./pay-items.default";
import { payItemByCode } from "./payslip";

const schablon: ExpensePolicy = { ownCarPerMilOre: 2_500, companyCarPerMilOre: null, companyElectricCarPerMilOre: null, perDiemFullDayOre: null, perDiemHalfDayOre: null, perDiemNightOre: null };
const trip = { kind: "traktamente" as const, dateFrom: "2026-11-10", dateTo: "2026-11-11", departureTime: "07:00", returnTime: "20:00", nightsWithoutLodging: 0, meals: {}, longStay: "none" as const, farFromHome: true };

test("milersättning: 60 mil with the own car at 30 kr/mil is 1 500 kr tax-free and 300 kr taxable", () => {
  const r = computeClaim({ kind: "milersattning", dateFrom: "2026-10-12", dateTo: "2026-10-12", distanceKm: 600, carType: "egen" }, { ...schablon, ownCarPerMilOre: 3_000 });
  assert.deepEqual([r.taxFreeOre, r.taxableOre], [150_000, 30_000]);
  const lines = claimLines({ id: "c1", kind: "milersattning", dateFrom: "2026-10-12", dateTo: "2026-10-12", description: "Borås", taxFreeOre: r.taxFreeOre, taxableOre: r.taxableOre, computation: r.computation });
  assert.deepEqual(lines.map((l) => [l.code, l.amountOre, l.quantity]), [["1910", 150_000, 60], ["1911", 30_000, null]]);
  assert.ok(lines.every((l) => l.source?.id === "c1"));
  assert.equal(payItemByCode(DEFAULT_PAY_ITEMS, "1910").flags.agiBox, "050");
  assert.equal(payItemByCode(DEFAULT_PAY_ITEMS, "1911").flags.agiBox, "011");
  // A förmånsbil on el: 9,50 kr/mil; paying less than the schablon makes all of it tax-free.
  const el = computeClaim({ kind: "milersattning", dateFrom: "2026-10-12", dateTo: "2026-10-12", distanceKm: 100, carType: "formansbil_el" }, schablon);
  assert.deepEqual([el.taxFreeOre, el.taxableOre], [9_500, 0]);
  const low = computeClaim({ kind: "milersattning", dateFrom: "2026-10-12", dateTo: "2026-10-12", distanceKm: 100, carType: "egen" }, { ...schablon, ownCarPerMilOre: 2_000 });
  assert.deepEqual([low.taxFreeOre, low.taxableOre], [20_000, 0]);
});

test("traktamente: two full days with hotel breakfast on the second day is 300 + 240 kr tax-free", () => {
  const r = computeClaim({ ...trip, meals: { "2026-11-11": { breakfast: true } } }, schablon);
  assert.deepEqual([r.taxFreeOre, r.taxableOre], [54_000, 0]);
  // The employer pays 350 kr a day: 50 kr a day is taxable.
  const more = computeClaim({ ...trip, meals: { "2026-11-11": { breakfast: true } } }, { ...schablon, perDiemFullDayOre: 35_000 });
  assert.deepEqual([more.taxFreeOre, more.taxableOre], [54_000, 10_000]);
  const lines = claimLines({ id: "t1", kind: "traktamente", dateFrom: trip.dateFrom, dateTo: trip.dateTo, description: "Jönköping", taxFreeOre: more.taxFreeOre, taxableOre: more.taxableOre, computation: more.computation });
  assert.deepEqual(lines.map((l) => [l.code, l.amountOre]), [["1900", 54_000], ["1901", 10_000]]);
  assert.equal(payItemByCode(DEFAULT_PAY_ITEMS, "1900").flags.agiBox, "051");
});

test("traktamente: half days from 12.00 and to 19.00, lunch reduced by 53 kr on a half day, a night without paid lodging", () => {
  const r = computeClaim({ ...trip, departureTime: "12:00", returnTime: "19:00", nightsWithoutLodging: 1, meals: { "2026-11-10": { lunch: true } } }, schablon);
  const days = r.computation.days as { part: string; taxFreeOre: number }[];
  assert.deepEqual(days.map((d) => [d.part, d.taxFreeOre]), [["half", 9_700], ["half", 15_000]]);
  assert.equal(r.taxFreeOre, 9_700 + 15_000 + 15_000);
});

test("traktamente: Skatteverket's reductions at 300, 210 and 150 kr", () => {
  const rules = benefitRulesAt("2026-11-10");
  const red = (normal: number, meals: Parameters<typeof mealReductionPercent>[1]) => Math.round((normal * mealReductionPercent(rules, meals)) / 100);
  assert.deepEqual([red(300, { breakfast: true, lunch: true, dinner: true }), red(300, { lunch: true, dinner: true }), red(300, { lunch: true }), red(300, { breakfast: true })], [270, 210, 105, 60]);
  assert.deepEqual([red(210, { breakfast: true, lunch: true, dinner: true }), red(210, { lunch: true, dinner: true }), red(210, { dinner: true }), red(210, { breakfast: true })], [189, 147, 74, 42]);
  assert.deepEqual([red(150, { breakfast: true, lunch: true, dinner: true }), red(150, { lunch: true, dinner: true }), red(150, { lunch: true }), red(150, { breakfast: true })], [135, 105, 53, 30]);
  const long = computeClaim({ ...trip, longStay: "after3months", meals: { "2026-11-10": { lunch: true, dinner: true } } }, schablon);
  assert.equal(long.taxFreeOre, 6_300 + 21_000);
});

test("traktamente: a day trip or a trip within 50 km is taxable pay", () => {
  const day = computeClaim({ ...trip, dateTo: trip.dateFrom }, schablon);
  assert.deepEqual([day.taxFreeOre, day.taxableOre], [0, 30_000]);
  const near = computeClaim({ ...trip, farFromHome: false }, schablon);
  assert.equal(near.taxFreeOre, 0);
  assert.equal(near.taxableOre, 60_000);
});

test("utlägg: the receipt's amount back, tax-free, line 1920", () => {
  const r = computeClaim({ kind: "utlagg", dateFrom: "2026-10-14", dateTo: "2026-10-14", amountOre: 45_000, vatOre: 9_000 }, schablon);
  assert.deepEqual([r.taxFreeOre, r.taxableOre], [45_000, 0]);
  assert.throws(() => computeClaim({ kind: "utlagg", dateFrom: "2026-10-14", dateTo: "2026-10-14", amountOre: 100, vatOre: 200 }, schablon), /Momsen/);
  const [line] = claimLines({ id: "u1", kind: "utlagg", dateFrom: "2026-10-14", dateTo: "2026-10-14", description: "Skruv", taxFreeOre: 45_000, taxableOre: 0, computation: {} });
  assert.equal(line.code, "1920");
});

test("parity: expense_rules() in 0042 holds the rule book's schabloner", () => {
  const sql = readFileSync(join(__dirname, "..", "..", "..", "supabase", "migrations", "0042_benefits_expenses.sql"), "utf8");
  const m = /as \$\$ select (\d+)::bigint, (\d+)::bigint, (\d+)::bigint, (\d+)::bigint, (\d+)::bigint, (\d+)::bigint \$\$/.exec(sql);
  assert.ok(m, "expense_rules() hittades inte");
  const e = payrollRulesAt("2026-11-25").expenses;
  assert.deepEqual(m.slice(1).map(Number), [e.mileage.ownCarPerMilOre, e.mileage.companyCarPerMilOre, e.mileage.companyElectricCarPerMilOre, e.perDiem.fullDayOre, e.perDiem.halfDayOre, e.perDiem.nightOre]);
});
