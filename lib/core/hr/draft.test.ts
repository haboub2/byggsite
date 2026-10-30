import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFormPreset, newEmploymentDraft, versionDraft } from "./draft";
import { employmentInputSchema, type EmploymentVersion } from "./schema";

test("presets follow the form and the agreement, and a draft parses", () => {
  const d = newEmploymentDraft("byggavtalet", "2026-11-01");
  assert.equal(d.pensionScheme, "saf-lo");
  const sava = applyFormPreset({ ...d, monthlySalary: "", hourlyRate: "185,50", endsOn: "2026-11-30" }, "sava", "byggavtalet");
  assert.deepEqual([sava.payForm, sava.vacationRule, sava.vacationPercent], ["hourly", "procent", "13"]);
  assert.ok(employmentInputSchema.safeParse(sava).success);
  const board = applyFormPreset({ ...d, fee: "20 000", startsOn: "2026-05-20" }, "uppdrag", "none");
  assert.deepEqual([board.payForm, board.vacationRule, board.pensionScheme, board.feePeriod], ["fee", "none", "none", "year"]);
  const parsed = employmentInputSchema.safeParse(board);
  assert.ok(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues));
  const prov = applyFormPreset({ ...d, monthlySalary: "35 000" }, "provanstallning", "byggavtalet");
  assert.equal(prov.probationEndsOn, "2027-04-30");
  assert.ok(employmentInputSchema.safeParse(prov).success);
  const back = applyFormPreset(board, "tillsvidare", "none");
  assert.deepEqual([back.payForm, back.vacationRule], ["monthly", "sammalon"]);
});

test("a version draft keeps the contract and starts from today at the earliest", () => {
  const v = { contractId: "7b0f4a3e-4c56-4b1a-9a43-3b1f1f3c9e11", form: "tillsvidare", payForm: "monthly", monthlySalaryOre: 3_550_050, hourlyRateOre: null, feeOre: null, feePeriod: null, workingTimePercent: 80, weeklyHours: 32, probationEndsOn: null, endsOn: null, noticeDays: null, payDay: 25, vacationRule: "sammalon", vacationDays: 25, vacationPercent: null, atfHoursPerYear: 0, validFrom: "2026-01-01", startsOn: "2026-01-01" } as unknown as EmploymentVersion;
  const d = versionDraft(v, "2026-10-30");
  assert.equal(d.contractId, "7b0f4a3e-4c56-4b1a-9a43-3b1f1f3c9e11");
  assert.equal(d.monthlySalary, "35 500,50");
  assert.equal(d.workingTimePercent, "80");
  assert.equal(d.validFrom, "2026-10-30");
  const parsed = employmentInputSchema.parse({ ...d, title: "", workplace: "", decisionReference: "", substituteFor: "", terms: "", pensionScheme: "none" });
  assert.equal(parsed.monthlySalary, 3_550_050);
});
