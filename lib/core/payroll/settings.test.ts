import { test } from "node:test";
import assert from "node:assert/strict";
import { agiDueFor, parsePayrollSettings, payDateFor, runDueFrom, runPeriods, unconfirmedDecisions, vacationModelFor } from "./settings";

test("defaults: the common model, the 25th, the law's semesterår, BAS accounts", () => {
  const s = parsePayrollSettings({});
  assert.equal(s.variablePeriod, "previous");
  assert.equal(s.payDay, 25);
  assert.equal(s.accounts.net, "2820");
  assert.deepEqual(vacationModelFor(s), { startMonthDay: "04-01", earning: "previous-year" });
  assert.equal(unconfirmedDecisions({}).length, 10);
  assert.deepEqual(unconfirmedDecisions({ period: "x", payDay: "x", vacationYear: "x", agreement: "x", approvers: "x", bank: "x", accounts: "x", agi: "x", vaxaStod: "x" }), ["pension"]);
  // A broken row falls back to the defaults instead of stopping the run.
  assert.equal(parsePayrollSettings({ payDay: "abc" }).payDay, 25);
});

test("pay day moves back to a workday; the run is due five workdays before", () => {
  assert.equal(payDateFor("2026-04", { payDay: 25 }), "2026-04-24");
  assert.equal(payDateFor("2026-12", { payDay: 25 }), "2026-12-23");
  assert.equal(payDateFor("2026-11", { payDay: 25 }), "2026-11-25");
  assert.equal(runDueFrom("2026-11-25"), "2026-11-18");
});

test("periods: time and absence from the month before, or the same month", () => {
  assert.deepEqual(runPeriods("2026-03", { variablePeriod: "previous" }), { periodStart: "2026-03-01", periodEnd: "2026-03-31", timeFrom: "2026-02-01", timeTo: "2026-02-28" });
  assert.deepEqual(runPeriods("2026-01", { variablePeriod: "previous" }).timeFrom, "2025-12-01");
  assert.deepEqual(runPeriods("2026-06", { variablePeriod: "same" }), { periodStart: "2026-06-01", periodEnd: "2026-06-30", timeFrom: "2026-06-01", timeTo: "2026-06-30" });
});

test("the AGI date moves to the 26th for an employer above 40 MSEK; the payment does not", () => {
  const small = parsePayrollSettings({});
  const large = parsePayrollSettings({ agi: { largeEmployer: true } });
  assert.deepEqual(agiDueFor("2026-11", small), { declareBy: "2026-12-14", payBy: "2026-12-14" });
  assert.deepEqual(agiDueFor("2026-11", large), { declareBy: "2026-12-28", payBy: "2026-12-14" });
  assert.equal(parsePayrollSettings({ pension: { foraFokId: "fok306834" } }).pension.foraFokId, "FOK306834");
});
