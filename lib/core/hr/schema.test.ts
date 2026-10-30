import { test } from "node:test";
import assert from "node:assert/strict";
import { employeeInputSchema, employmentInputSchema, luhnOk, maxProbationEnd, normalizePnr, pnrBirthDate, supersededTaxRows, taxInputSchema, taxOn, versionsOn, type EmploymentVersion, type TaxVersion } from "./schema";

const today = "2026-10-30";

test("personnummer: ten or twelve digits, century, Luhn, samordningsnummer", () => {
  assert.equal(normalizePnr("850412-1230", today), "198504121230");
  assert.equal(normalizePnr("19850412-1230", today), "198504121230");
  assert.equal(normalizePnr("198504121230", today), "198504121230");
  // Born 2010: ten digits give the 2000s, not 1910.
  assert.equal(normalizePnr("100101-1236", today)?.slice(0, 4), "2010");
  // "+" means 100 or older.
  assert.equal(normalizePnr("250101+1239", today)?.slice(0, 4), "1925");
  assert.equal(normalizePnr("850412-1232", today), null, "wrong check digit");
  assert.equal(normalizePnr("850230-1234", today), null, "30 February");
  assert.equal(normalizePnr("12345", today), null);
  assert.equal(luhnOk("8504121230"), true);
  // Samordningsnummer: day + 60.
  assert.equal(pnrBirthDate("198504721237"), "1985-04-12");
  assert.equal(normalizePnr("850472-1237", today), "198504721237");
});

test("a person: optional pnr, normalised; bank account needs a clearing number", () => {
  const ok = employeeInputSchema(today).parse({ name: "Anna", pnr: "850412-1230" });
  assert.equal(ok.pnr, "198504121230");
  assert.equal(employeeInputSchema(today).parse({ name: "Ledamot" }).pnr, null);
  const bad = employeeInputSchema(today).safeParse({ name: "Anna", pnr: "850412-1232", bankAccount: "123456789" });
  assert.equal(bad.success, false);
  const paths = bad.success ? [] : bad.error.issues.map((i) => i.path.join("."));
  assert.deepEqual(paths.sort(), ["bankClearing", "pnr"]);
});

const employment = (v: Record<string, unknown>) => employmentInputSchema.safeParse({ startsOn: "2026-11-01", vacationRule: "sammalon", payForm: "monthly", monthlySalary: "35 000", ...v });
const errors = (r: ReturnType<typeof employment>) => (r.success ? [] : r.error.issues.map((i) => i.path.join(".")));

test("employment: pay by pay form, kronor to öre", () => {
  const r = employment({ form: "tillsvidare" });
  assert.ok(r.success);
  assert.equal(r.data.monthlySalary, 3_500_000);
  const hourly = employment({ form: "sava", payForm: "hourly", hourlyRate: "185,50", monthlySalary: "", endsOn: "2026-11-30", vacationRule: "procent", vacationPercent: "12" });
  assert.ok(hourly.success, JSON.stringify(errors(hourly)));
  assert.equal(hourly.data.hourlyRate, 18_550);
  assert.deepEqual(errors(employment({ form: "tillsvidare", monthlySalary: "" })), ["monthlySalary"]);
});

test("employment: the form's own rules", () => {
  assert.deepEqual(errors(employment({ form: "vikariat" })), ["substituteFor"]);
  assert.deepEqual(errors(employment({ form: "sava" })), ["endsOn"]);
  assert.deepEqual(errors(employment({ form: "provanstallning" })), ["probationEndsOn"]);
  assert.deepEqual(errors(employment({ form: "provanstallning", probationEndsOn: "2027-05-01" })), ["probationEndsOn"]);
  assert.ok(employment({ form: "provanstallning", probationEndsOn: maxProbationEnd("2026-11-01") }).success);
  assert.equal(maxProbationEnd("2026-11-01"), "2027-04-30");
  assert.equal(maxProbationEnd("2026-08-31"), "2027-02-28");
  // A board member: arvode, no semester.
  assert.ok(employment({ form: "uppdrag", payForm: "fee", fee: "20 000", feePeriod: "year", vacationRule: "none", monthlySalary: "" }).success);
  assert.deepEqual(errors(employment({ form: "uppdrag", payForm: "fee", fee: "20 000", feePeriod: "year" })), ["vacationRule"]);
  assert.deepEqual(errors(employment({ form: "tillsvidare", payForm: "fee", fee: "1", feePeriod: "year" })), ["payForm"]);
  assert.deepEqual(errors(employment({ form: "tillsvidare", vacationRule: "none" })), ["vacationRule"]);
  // A new version says from when.
  assert.deepEqual(errors(employment({ form: "tillsvidare", contractId: "7b0f4a3e-4c56-4b1a-9a43-3b1f1f3c9e11" })), ["validFrom"]);
});

test("tax: a main employer needs table and column; jämkning needs its end date", () => {
  const ok = taxInputSchema.parse({ kind: "table", tableNo: "33", columnNo: "1", source: "a-skattsedel", validFrom: "2026-01-01" });
  assert.deepEqual([ok.tableNo, ok.columnNo, ok.mainEmployer], [33, 1, true]);
  assert.equal(taxInputSchema.safeParse({ kind: "table", source: "manual", validFrom: "2026-01-01" }).success, false);
  const side = taxInputSchema.parse({ kind: "table", mainEmployer: false, source: "manual", validFrom: "2026-01-01" });
  assert.deepEqual([side.tableNo, side.columnNo], [null, null]);
  assert.equal(taxInputSchema.safeParse({ kind: "table", tableNo: "33", adjustment: "percent", adjustmentPercent: "25", source: "manual", validFrom: "2026-01-01" }).success, false);
  const j = taxInputSchema.parse({ kind: "table", tableNo: "33", adjustment: "amount", adjustmentMonthlyChange: "-2 000", adjustmentValidTo: "2026-12-31", source: "manual", validFrom: "2026-01-01" });
  assert.equal(j.adjustmentMonthlyChangeOre, -200_000);
  const none = taxInputSchema.parse({ kind: "none", tableNo: "33", source: "manual", validFrom: "2026-01-01" });
  assert.equal(none.tableNo, null);
});

test("which version and which tax row apply on a date", () => {
  const v = (id: string, validFrom: string, validTo: string | null) => ({ id, contractId: "c", validFrom, validTo }) as EmploymentVersion;
  const versions = [v("1", "2026-01-15", "2026-02-28"), v("2", "2026-03-01", "2026-07-14"), v("3", "2026-07-15", null)];
  assert.deepEqual(versionsOn(versions, "2026-03-01").map((x) => x.id), ["2"]);
  assert.deepEqual(versionsOn(versions, "2026-01-01"), []);
  const t = (validFrom: string) => ({ validFrom }) as TaxVersion;
  assert.equal(taxOn([t("2026-01-01"), t("2026-07-01")], "2026-06-30")?.validFrom, "2026-01-01");
  assert.equal(taxOn([t("2026-07-01")], "2026-06-30"), null);
});

test("a tax row entered again for the same day corrects the earlier one (0036)", () => {
  const row = (id: string, validFrom: string, createdAt: string, tableNo: number) => ({ id, validFrom, createdAt, tableNo }) as TaxVersion;
  const wrong = row("a", "2026-11-01", "2026-10-30T08:00:00Z", 33);
  const fixed = row("b", "2026-11-01", "2026-10-30T09:00:00Z", 34);
  assert.equal(taxOn([wrong, fixed], "2026-11-15")?.tableNo, 34);
  assert.equal(taxOn([fixed, wrong], "2026-11-15")?.tableNo, 34);
  assert.deepEqual([...supersededTaxRows([wrong, fixed])], ["a"]);
});
