import { test } from "node:test";
import assert from "node:assert/strict";
import type { Employee, EmploymentVersion } from "../core/hr/schema";
import type { TimeEntry } from "../core/hr/time";
import type { Absence } from "../core/hr/absence";
import type { PayRun, StoredPayslip } from "../core/payroll/run-store";
import { absenceResource, employeeResource, maskedPersonalNumber, payRunResource, payslipResource, timeEntryResource } from "./hr-resources";
import { absenceResourceSchema, employeeResourceSchema, payRunResourceSchema, payslipResourceSchema, timeEntryCreateSchema, timeEntryResourceSchema } from "./schemas";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const employee: Employee = {
  id: ID(1),
  orgId: ID(9),
  name: "Anna Andersson",
  email: "anna@demo.se",
  phone: "070-1234567",
  street: "Storgatan 1",
  postalCode: "411 01",
  city: "Göteborg",
  pnrMasked: "19900505-XXXX",
  birthDate: "1990-05-05",
  bankClearing: "8327",
  bankAccountMasked: "••••6789",
  userId: ID(7),
  isOwner: false,
  isBoardMember: false,
  agreement: "tjanstemannaavtalet",
  emergencyContact: "Bo 070-0000000",
  notes: "intern anteckning",
  endedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
};

const version = (v: Partial<EmploymentVersion>): EmploymentVersion => ({
  id: ID(2),
  employeeId: ID(1),
  contractId: ID(3),
  version: 1,
  form: "tillsvidare",
  payForm: "monthly",
  monthlySalaryOre: 3_800_000,
  hourlyRateOre: null,
  feeOre: null,
  feePeriod: null,
  decisionReference: "",
  title: "Projektledare",
  workplace: "",
  workingTimePercent: 100,
  weeklyHours: 40,
  scheduleId: null,
  substituteFor: "",
  probationEndsOn: null,
  startsOn: "2024-01-01",
  endsOn: null,
  noticeDays: null,
  payDay: null,
  vacationRule: "sammalon",
  vacationDays: 25,
  vacationPercent: null,
  atfHoursPerYear: 0,
  pensionScheme: "itp1",
  terms: "",
  changeReason: "",
  validFrom: "2024-01-01",
  validTo: null,
  documentId: null,
  createdAt: "2024-01-01T00:00:00Z",
  ...v,
});

test("employee: masked personnummer, no bank account, address, notes or user id; the version in force", () => {
  const v1 = version({ validTo: "2025-12-31", monthlySalaryOre: 3_500_000 });
  const v2 = version({ id: ID(4), version: 2, validFrom: "2026-01-01" });
  const r = employeeResource(employee, [v1, v2], "2026-10-30");
  assert.equal(r.personalNumber, "19900505-XXXX");
  assert.equal(r.employment?.monthlySalaryOre, 3_800_000);
  assert.equal(r.employment?.validFrom, "2026-01-01");
  assert.equal(r.startedOn, "2024-01-01");
  const json = JSON.stringify(r);
  for (const secret of ["6789", "8327", "Storgatan", "anteckning", ID(7), "Bo 070"]) assert.ok(!json.includes(secret), secret);
  assert.equal(employeeResourceSchema.safeParse(r).success, true);
  assert.equal(employeeResource(employee, [], "2026-10-30").employment, null);
  // A contract that has not started yet is not "in force".
  assert.equal(employeeResource(employee, [version({ startsOn: "2027-01-01", validFrom: "2027-01-01" })], "2026-10-30").employment, null);
});

test("masked personnummer from the shapes the stores hold", () => {
  assert.equal(maskedPersonalNumber("19900505-XXXX"), "19900505-XXXX");
  assert.equal(maskedPersonalNumber("199005052387"), "19900505-XXXX");
  assert.equal(maskedPersonalNumber("9005052387"), "19900505-XXXX");
  assert.equal(maskedPersonalNumber(""), "");
  assert.equal(maskedPersonalNumber("skräp"), "");
});

test("time entry and absence resources validate against their schemas", () => {
  const t: TimeEntry = {
    id: ID(10),
    employeeId: ID(1),
    workDate: "2026-10-05",
    start: "07:00",
    end: "16:00",
    breakMinutes: 60,
    hours: 8,
    kind: "work",
    projectId: ID(11),
    shiftId: null,
    note: "",
    source: "manual",
    status: "approved",
    correctsId: null,
    submittedAt: "2026-10-05T16:00:00Z",
    approvedBy: "chef@demo.se",
    approvedAt: "2026-10-06T08:00:00Z",
    createdAt: "2026-10-05T07:00:00Z",
  };
  const tr = timeEntryResource(t);
  assert.equal(tr.date, "2026-10-05");
  assert.equal(timeEntryResourceSchema.safeParse(tr).success, true);
  assert.ok(!("approvedBy" in tr), "who approved stays internal");
  const a: Absence = { id: ID(12), employeeId: ID(1), kind: "sjuk", from: "2026-10-12", to: null, extent: 1, certificateReceivedOn: null, sickPeriodId: ID(13), note: "", approvedAt: null, createdAt: "2026-10-12T07:00:00Z" };
  assert.equal(absenceResourceSchema.safeParse(absenceResource(a)).success, true);
});

test("time entry create: start and end together, or hours; the kinds of the register", () => {
  assert.equal(timeEntryCreateSchema.safeParse({ employeeId: ID(1), date: "2026-10-05", start: "07:00", end: "16:00", breakMinutes: 60 }).success, true);
  assert.equal(timeEntryCreateSchema.safeParse({ employeeId: ID(1), date: "2026-10-05", hours: 4 }).success, true);
  assert.equal(timeEntryCreateSchema.safeParse({ employeeId: ID(1), date: "2026-10-05", start: "07:00" }).success, false);
  assert.equal(timeEntryCreateSchema.safeParse({ employeeId: ID(1), date: "2026-10-05" }).success, false);
  assert.equal(timeEntryCreateSchema.safeParse({ employeeId: ID(1), date: "2026-10-05", hours: 4, kind: "lunch" }).success, false);
  assert.equal(timeEntryCreateSchema.parse({ employeeId: ID(1), date: "2026-10-05", hours: 4 }).kind, "work");
});

test("pay run and payslip resources: sums, lines with their flags, no document in full", () => {
  const run: PayRun = {
    id: ID(20),
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    timeFrom: "2026-10-01",
    timeTo: "2026-10-31",
    payDate: "2026-11-25",
    agiPeriod: "2026-11",
    status: "closed",
    checks: [],
    checksAt: null,
    ruleSetValidFrom: "2026-04-01",
    taxTableImportId: null,
    totals: { payslips: 2, grossOre: 7_000_000, taxOre: 1_500_000, netOre: 5_500_000, employerContributionOre: 2_199_400 },
    computedBy: ID(30),
    computedByName: "konsult",
    computedAt: "2026-11-20T10:00:00Z",
    approvedBy: ID(31),
    approvedByName: "ägare",
    approvedAt: "2026-11-21T10:00:00Z",
    bankFileId: ID(32),
    journalEntryId: ID(33),
    bookedAt: "2026-11-25T10:00:00Z",
    closedAt: "2026-11-26T10:00:00Z",
    createdAt: "2026-11-19T10:00:00Z",
  };
  const rr = payRunResource(run);
  assert.equal(rr.period, "2026-11");
  assert.equal(rr.payslipCount, 2);
  assert.equal(payRunResourceSchema.safeParse(rr).success, true);
  assert.ok(!("computedByName" in rr));
  assert.equal(payRunResource({ ...run, totals: {} }).grossOre, null);

  const slip: StoredPayslip = {
    id: ID(40),
    runId: ID(20),
    employeeId: ID(1),
    number: 7,
    grossOre: 3_800_000,
    taxOre: 900_000,
    netOre: 2_900_000,
    employerContributionOre: 1_193_960,
    contributionRate: 31.42,
    vacationLiabilityOre: 500_000,
    pensionPremiumOre: 171_000,
    pdfPath: "org/emp/payslip-x.pdf",
    pdfSha256: "a".repeat(64),
    approvedAt: "2026-11-21T10:00:00Z",
    createdAt: "2026-11-20T10:00:00Z",
    document: {
      schema: 1,
      employeeId: ID(1),
      employeeName: "Anna Andersson",
      birthYear: 1990,
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
      payDate: "2026-11-25",
      ruleSetValidFrom: "2026-04-01",
      taxTableVersion: "sha",
      lines: [
        {
          code: "1010",
          text: "Månadslön november 2026",
          quantity: 1,
          unit: "mån",
          unitPriceOre: 3_800_000,
          basisOre: null,
          ratePercent: null,
          amountOre: 3_800_000,
          from: "2026-11-01",
          to: "2026-11-30",
          item: { code: "1010", name: "Månadslön", kind: "salary", version: 1, flags: { taxable: true, taxMode: "table", subjectToEmployerContribution: true, vacationPayBasis: true, pensionReportable: true, agiBox: "011", account: "7210", counterAccount: "2820", foraCategory: null } },
        },
      ],
      bases: { tableTaxableOre: 3_800_000, lumpSumTaxableOre: 0, contributionBaseOre: 3_800_000, vacationBasisOre: 3_800_000, pensionBasisOre: 3_800_000, cashGrossOre: 3_800_000, taxFreeReimbursementOre: 0, benefitOre: 0, netAdjustmentOre: 0, sickPayCostOre: 0 },
      tax: { totalOre: 900_000 } as StoredPayslip["document"]["tax"],
      contributions: { category: "full", baseOre: 3_800_000, ratePercent: 31.42, amountOre: 1_193_960 } as StoredPayslip["document"]["contributions"],
      totals: { cashGrossOre: 3_800_000, taxFreeReimbursementOre: 0, benefitOre: 0, taxOre: 900_000, netAdjustmentOre: 0, netOre: 2_900_000, employerContributionOre: 1_193_960, sickPayCostOre: 0 },
      context: { timeFrom: "2026-10-01", timeTo: "2026-10-31", taxTableImportId: null, pnrMasked: "19900505-XXXX", group: "salaried", yearToDate: { cashGrossOre: 0, taxOre: 0 }, vacation: { rule: "sammalon", remainingDays: 20, liabilityOre: 500_000, liabilityChangeOre: 0 }, pension: { scheme: "itp1", premiumOre: 171_000 }, correctionIds: [] },
    },
  };
  const pr = payslipResource(slip);
  assert.equal(pr.status, "approved");
  assert.equal(pr.period, "2026-11");
  assert.equal(pr.pensionScheme, "itp1");
  assert.deepEqual(pr.lines[0], { code: "1010", name: "Månadslön", kind: "salary", text: "Månadslön november 2026", quantity: 1, unit: "mån", unitPriceOre: 3_800_000, amountOre: 3_800_000, taxable: true, agiBox: "011", account: "7210", from: "2026-11-01", to: "2026-11-30" });
  assert.equal(pr.hasPdf, true);
  assert.equal(payslipResourceSchema.safeParse(pr).success, true);
  assert.ok(!("document" in pr) && !("bases" in pr));
  assert.equal(payslipResource({ ...slip, approvedAt: null, number: null, pdfPath: null }).status, "calculated");
});
