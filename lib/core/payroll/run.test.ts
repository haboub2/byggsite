/**
 * The run pipeline against phase 0's three hand-checked payslips
 * (fixtures/*.test.ts): the same people as rows (employments, employee_tax,
 * time_entries, absences, a schedule) through `computeRun` give the same
 * numbers to the öre. And a property test: for random months the lines sum
 * to the totals and the four reconciliation sums agree.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addDays, type IsoDate } from "../rules/index";
import { payrollRulesAt } from "../rules/payroll";
import { isWorkday } from "../../workdays";
import type { Absence } from "../hr/absence";
import type { EmploymentVersion, TaxVersion } from "../hr/schema";
import type { TimeEntry } from "../hr/time";
import { DEFAULT_PAY_ITEMS } from "./pay-items.default";
import { indexTaxTable, parseTaxTableCsv } from "./tax-tables";
import { computeRun, earningYearHistory, payItemsOn, type RunInput, type RunPerson } from "./run";
import { payDateFor, payrollSettingsSchema, runPeriods, type PayrollSettings } from "./settings";
import { accrualLines, payslipJournal, reconciliationSums, runJournal } from "./ledger";
import { salaryFile, salaryFileTotalOre } from "./bank-file";
import { journalLines, reconcile } from "./payslip";
import { agiBuild } from "./agi";
import { collectumBasis } from "./collectum";
import type { Benefit } from "./benefits";
import { computeClaim, type ApprovedClaim } from "./expenses";

const file = parseTaxTableCsv(readFileSync(join(__dirname, "fixtures", "skattetabell-manad-2026.sample.csv")));
const taxTable = { importId: "import-2026", version: file.sha256, index: indexTaxTable(file.rows) };
const defaults = payrollSettingsSchema.parse({});
const accounts = defaults.accounts;

let seq = 0;
const id = (p: string) => `${p}-${++seq}`;

function version(v: Partial<EmploymentVersion> & Pick<EmploymentVersion, "employeeId" | "form" | "payForm" | "startsOn">): EmploymentVersion {
  return {
    id: id("v"),
    contractId: id("c"),
    version: 1,
    monthlySalaryOre: null,
    hourlyRateOre: null,
    feeOre: null,
    feePeriod: null,
    decisionReference: "",
    title: "",
    workplace: "",
    workingTimePercent: 100,
    weeklyHours: null,
    scheduleId: null,
    substituteFor: "",
    probationEndsOn: null,
    endsOn: null,
    noticeDays: null,
    payDay: null,
    vacationRule: "none",
    vacationDays: 25,
    vacationPercent: null,
    atfHoursPerYear: 0,
    pensionScheme: "none",
    terms: "",
    changeReason: "",
    validFrom: v.startsOn,
    validTo: null,
    documentId: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...v,
  };
}

const taxRow = (employeeId: string, mainEmployer = true): TaxVersion => ({
  id: id("t"),
  employeeId,
  kind: "table",
  tableNo: 33,
  columnNo: 1,
  adjustmentPercent: null,
  adjustmentMonthlyChangeOre: null,
  adjustmentValidTo: null,
  mainEmployer,
  source: "a-skattsedel",
  validFrom: "2026-01-01",
  note: "",
  createdAt: "2026-01-01T00:00:00Z",
});

function entry(employeeId: string, date: IsoDate, start: string, end: string, kind: TimeEntry["kind"] = "work", status: TimeEntry["status"] = "approved"): TimeEntry {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return {
    id: id("e"),
    employeeId,
    workDate: date,
    start,
    end,
    breakMinutes: 0,
    hours: (eh * 60 + em - sh * 60 - sm) / 60,
    kind,
    projectId: null,
    shiftId: null,
    note: "",
    source: "manual",
    status,
    correctsId: null,
    submittedAt: "2026-01-01T00:00:00Z",
    approvedBy: status === "approved" ? "chef" : null,
    approvedAt: status === "approved" ? "2026-01-01T00:00:00Z" : null,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

const absence = (employeeId: string, kind: Absence["kind"], from: IsoDate, to: IsoDate, extent: Absence["extent"] = 1): Absence => ({
  id: id("a"),
  employeeId,
  kind,
  from,
  to,
  extent,
  certificateReceivedOn: null,
  sickPeriodId: null,
  note: "",
  approvedAt: "2026-01-01T00:00:00Z",
  createdAt: "2026-01-01T00:00:00Z",
});

const person = (p: Partial<RunPerson> & { id: string; name: string; birthDate: IsoDate; agreement: RunPerson["employee"]["agreement"] }): RunPerson => ({
  employee: { id: p.id, name: p.name, birthDate: p.birthDate, agreement: p.agreement, bankClearing: "8327", bankAccountMasked: "••••6789", pnrMasked: `${p.birthDate.replace(/-/g, "")}-XXXX`, endedAt: null },
  versions: [],
  tax: [taxRow(p.id)],
  timeEntries: [],
  absences: [],
  schedule: null,
  history: { yearToDateCashGrossOre: 0, yearToDateTaxOre: 0, vacationLiabilityOre: 0, vacationBasisPaidByYearOre: 0, variablePayPaidByYearOre: 0 },
  corrections: [],
  ...p,
});

function runFor(month: string, settings: Partial<PayrollSettings>, people: RunPerson[]): RunInput {
  const s = payrollSettingsSchema.parse(settings);
  const periods = runPeriods(month, s);
  const payDate = payDateFor(month, s);
  return {
    ...periods,
    payDate,
    rules: payrollRulesAt(payDate),
    payItems: payItemsOn(DEFAULT_PAY_ITEMS.map((i) => ({ ...i, validFrom: "2026-01-01" })), payDate),
    taxTable,
    settings: s,
    confirmed: { period: "2026-10-30", payDay: "2026-10-30", vacationYear: "2026-10-30", agreement: "2026-10-30", approvers: "2026-10-30", bank: "2026-10-30", accounts: "2026-10-30", pension: "2026-10-30" },
    people,
    ledgerLocked: false,
    timeLocked: false,
    today: payDate,
  };
}

test("fixture 1 through the run: månadslön 38 000 kr with five days of semester in June 2026", () => {
  const anna = person({ id: "anna", name: "Anna Andersson", birthDate: "1990-05-05", agreement: "tjanstemannaavtalet" });
  anna.versions = [version({ employeeId: "anna", form: "tillsvidare", payForm: "monthly", monthlySalaryOre: 3_800_000, startsOn: "2024-01-01", vacationRule: "sammalon", pensionScheme: "itp1" })];
  anna.absences = [absence("anna", "semester", "2026-06-08", "2026-06-12")];
  const run = computeRun(runFor("2026-06", { variablePeriod: "same" }, [anna]));
  assert.equal(run.checks.filter((c) => c.level === "block").length, 0, JSON.stringify(run.checks));
  const doc = run.payslips[0].document;
  assert.equal(doc.payDate, "2026-06-25");
  assert.deepEqual(doc.lines.map((l) => [l.code, l.amountOre]), [
    ["1010", 3_800_000],
    ["1510", 152_000],
  ]);
  assert.deepEqual(doc.lines.map((l) => l.item.flags.account), ["7210", "7282"]);
  assert.equal(doc.totals.cashGrossOre, 3_952_000);
  assert.equal(doc.totals.taxOre, 828_900);
  assert.equal(doc.totals.netOre, 3_123_100);
  assert.equal(doc.totals.employerContributionOre, 1_241_718);
  assert.equal(doc.taxTableVersion, file.sha256);
  assert.equal(run.taxTableImportId, "import-2026");
  assert.equal(reconcile(doc).ok, true);
  // Semesterlöneskuld at 2 052 kr a day: the fixture's 20 days left of 2026/27's 25, the 5 days balances.ts
  // saves from 2025/26 (nothing was taken that year), and 7 days earned April–June 2026.
  assert.equal(run.payslips[0].vacationLiabilityOre, (20 + 5 + 7) * 205_200);
});

test("fixture 2 through the run: timlön under Byggavtalet with OB, övertid and a sick period over a weekend", () => {
  const bo = person({ id: "bo", name: "Bo Byggare", birthDate: "1988-02-02", agreement: "byggavtalet" });
  bo.versions = [version({ employeeId: "bo", form: "tillsvidare", payForm: "hourly", hourlyRateOre: 21_000, startsOn: "2025-01-01", vacationRule: "procent", vacationPercent: 13, pensionScheme: "saf-lo" })];
  bo.schedule = { kind: "weekly", hours: [8, 8, 8, 8, 8, 0, 0], holidaysOff: true };
  const sick = new Set(["2026-03-12", "2026-03-13", "2026-03-16", "2026-03-17"]);
  for (let d = "2026-03-01"; d <= "2026-03-31"; d = addDays(d, 1)) {
    if (!isWorkday(d) || sick.has(d)) continue;
    if (d === "2026-03-25") bo.timeEntries = [...bo.timeEntries, entry("bo", d, "13:00", "17:00"), entry("bo", d, "18:00", "22:00")];
    else bo.timeEntries = [...bo.timeEntries, entry("bo", d, "07:00", "11:00"), entry("bo", d, "12:00", "16:00")];
  }
  bo.timeEntries = [...bo.timeEntries, entry("bo", "2026-03-24", "16:00", "18:00", "overtime")];
  bo.absences = [absence("bo", "sjuk", "2026-03-12", "2026-03-17")];

  // Paid in April for March's time (the common model), pay day the 25th → Friday 24 April.
  const run = computeRun(runFor("2026-04", {}, [bo]));
  assert.equal(run.checks.filter((c) => c.level === "block").length, 0, JSON.stringify(run.checks));
  const doc = run.payslips[0].document;
  assert.equal(doc.payDate, "2026-04-24");
  assert.deepEqual(doc.lines.map((l) => [l.code, l.amountOre]), [
    ["1100", 3_024_000],
    ["1200", 33_600],
    ["1300", 31_500],
    ["1300", 27_300],
    ["1400", 537_600],
    ["1410", -134_400],
  ]);
  assert.equal(doc.totals.cashGrossOre, 3_519_600);
  assert.equal(doc.totals.taxOre, 718_500);
  assert.equal(doc.totals.netOre, 2_801_100);
  assert.equal(doc.totals.employerContributionOre, 1_105_858);
  assert.equal(doc.totals.sickPayCostOre, 403_200);
  assert.equal(doc.bases.vacationBasisOre, 3_116_400);
  assert.equal(reconcile(doc).ok, true);
  // Procentregeln accrues 13 % of the basis and the sick days' pay (fixture: 4 924,92 kr) as semesterlöneskuld.
  assert.equal(run.payslips[0].vacationLiabilityOre, 492_492);
});

test("fixture 3 through the run: styrelsearvode 15 000 kr a quarter, not the main employer", () => {
  const board = person({ id: "board-1", name: "Styrelseledamot", birthDate: "1972-07-07", agreement: "none" });
  board.versions = [version({ employeeId: "board-1", form: "uppdrag", payForm: "fee", feeOre: 1_500_000, feePeriod: "quarter", startsOn: "2026-01-01" })];
  board.tax = [taxRow("board-1", false)];
  const run = computeRun(runFor("2026-03", {}, [board]));
  assert.equal(run.checks.filter((c) => c.level === "block").length, 0, JSON.stringify(run.checks));
  const doc = run.payslips[0].document;
  assert.equal(doc.payDate, "2026-03-25");
  assert.deepEqual(doc.lines.map((l) => [l.code, l.text, l.amountOre, l.from, l.to]), [["1600", "Styrelsearvode kv 1 2026", 1_500_000, "2026-01-01", "2026-03-31"]]);
  assert.equal(doc.tax.method, "side-income");
  assert.equal(doc.totals.taxOre, 450_000);
  assert.equal(doc.totals.netOre, 1_050_000);
  assert.equal(doc.totals.employerContributionOre, 471_300);
  assert.equal(doc.taxTableVersion, null);
  assert.equal(run.taxTableImportId, null);
  assert.deepEqual(
    journalLines(doc).map((j) => [j.account, j.debitOre, j.creditOre]),
    [
      ["7240", 1_500_000, 0],
      ["2710", 0, 450_000],
      ["2820", 0, 1_050_000],
      ["7510", 471_300, 0],
      ["2731", 0, 471_300],
    ]
  );
  // No fee in February: the quarter's fee is paid in its last month.
  assert.equal(computeRun(runFor("2026-02", {}, [board])).payslips.length, 0);
});

test("the checklist: unapproved time, missing tax data and bank account block; unconfirmed settings warn", () => {
  const p = person({ id: "p", name: "Pia", birthDate: "1995-01-01", agreement: "byggavtalet" });
  p.versions = [version({ employeeId: "p", form: "tillsvidare", payForm: "hourly", hourlyRateOre: 20_000, startsOn: "2026-01-01" })];
  p.timeEntries = [entry("p", "2026-09-07", "07:00", "16:00", "work", "submitted")];
  p.tax = [];
  p.employee = { ...p.employee, bankAccountMasked: "" };
  const input = runFor("2026-10", {}, [p]);
  const run = computeRun({ ...input, confirmed: {}, ledgerLocked: true });
  const codes = run.checks.map((c) => `${c.level}:${c.code}`);
  for (const c of ["block:ledger-locked", "block:unapproved-time", "block:tax-missing", "warn:settings"]) assert.ok(codes.includes(c), `${c} saknas i ${codes.join(", ")}`);
  assert.equal(run.checks[0].level, "block");
  assert.equal(run.payslips.length, 0);
});

test("sick pay is paid in the month of the sick days; the karensavdrag left over follows into the next month", () => {
  const p = person({ id: "s", name: "Sam", birthDate: "1985-01-01", agreement: "byggavtalet" });
  p.versions = [version({ employeeId: "s", form: "tillsvidare", payForm: "hourly", hourlyRateOre: 20_000, startsOn: "2025-01-01" })];
  p.schedule = { kind: "weekly", hours: [8, 8, 8, 8, 8, 0, 0], holidaysOff: true };
  // Half a day sick on Friday 30 October, sick again Monday 2 and Tuesday 3 November: återinsjuknande, one
  // period, one karensavdrag of 20 % × 40 h × 160 kr = 1 280 kr. October's sjuklön (4 h × 160) covers half of it.
  p.absences = [absence("s", "sjuk", "2026-10-30", "2026-10-30", 0.5), absence("s", "sjuk", "2026-11-02", "2026-11-03")];
  const oct = computeRun(runFor("2026-11", {}, [p])).payslips[0].document;
  const nov = computeRun(runFor("2026-12", {}, [p])).payslips[0].document;
  const sum = (d: typeof oct, code: string) => d.lines.filter((l) => l.code === code).reduce((s, l) => s + l.amountOre, 0);
  assert.equal(sum(oct, "1400"), 4 * 16_000);
  assert.equal(sum(oct, "1410"), -64_000);
  assert.equal(sum(nov, "1400"), 16 * 16_000);
  assert.equal(sum(nov, "1410"), -64_000);
  assert.equal(sum(oct, "1410") + sum(nov, "1410"), -128_000);
});

test("corrections come in as retro lines and are taxed as engångsbelopp", () => {
  const anna = person({ id: "anna", name: "Anna", birthDate: "1990-05-05", agreement: "tjanstemannaavtalet" });
  anna.versions = [version({ employeeId: "anna", form: "tillsvidare", payForm: "monthly", monthlySalaryOre: 3_800_000, startsOn: "2024-01-01" })];
  anna.corrections = [{ id: "corr-1", reason: "Lönehöjning", lines: [{ code: "1710", text: "Retroaktiv lön oktober", quantity: null, unit: null, unitPriceOre: null, basisOre: null, ratePercent: null, amountOre: 200_000 }] }];
  const run = computeRun(runFor("2026-11", {}, [anna]));
  const slip = run.payslips[0];
  assert.deepEqual(slip.correctionIds, ["corr-1"]);
  assert.equal(slip.document.bases.lumpSumTaxableOre, 200_000);
  assert.ok(slip.document.tax.lumpSumOre > 0);
});

/* ---------- property test ---------- */

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0) / 2 ** 32;
}

test("property: lines sum to totals, the journal balances and the four reconciliation sums agree", () => {
  const rand = lcg(20261030);
  for (let round = 0; round < 25; round++) {
    const people: RunPerson[] = [];
    const n = 1 + Math.floor(rand() * 4);
    for (let i = 0; i < n; i++) {
      const pid = `p${round}-${i}`;
      const agreement = rand() < 0.5 ? "byggavtalet" : "tjanstemannaavtalet";
      const p = person({ id: pid, name: `Person ${i}`, birthDate: `${1960 + Math.floor(rand() * 45)}-03-03`, agreement });
      if (rand() < 0.5) {
        p.versions = [version({ employeeId: pid, form: "tillsvidare", payForm: "monthly", monthlySalaryOre: 2_500_000 + Math.floor(rand() * 4_000_000), startsOn: "2025-01-01", vacationRule: "sammalon" })];
      } else {
        p.versions = [version({ employeeId: pid, form: rand() < 0.5 ? "sava" : "tillsvidare", payForm: "hourly", hourlyRateOre: 15_000 + Math.floor(rand() * 15_000), startsOn: "2025-01-01", vacationRule: "procent", vacationPercent: 12 })];
        for (let d = "2026-09-01"; d <= "2026-09-30"; d = addDays(d, 1)) if (isWorkday(d) && rand() < 0.7) p.timeEntries = [...p.timeEntries, entry(pid, d, "07:00", rand() < 0.2 ? "19:00" : "16:00")];
        p.schedule = { kind: "weekly", hours: [8, 8, 8, 8, 8, 0, 0], holidaysOff: true };
      }
      if (rand() < 0.4) {
        const from = `2026-09-${String(1 + Math.floor(rand() * 25)).padStart(2, "0")}`;
        p.absences = [absence(pid, "sjuk", from, addDays(from, Math.floor(rand() * 6)))];
      }
      if (rand() < 0.2) p.absences = [...p.absences, absence(pid, "tjanstledig", "2026-09-28", "2026-09-29")];
      people.push(p);
    }
    const run = computeRun(runFor("2026-10", {}, people));
    assert.equal(run.checks.filter((c) => c.level === "block").length, 0, JSON.stringify(run.checks.filter((c) => c.level === "block")));
    for (const s of run.payslips) {
      const t = s.document.totals;
      const lineSum = s.document.lines.reduce((a, l) => a + l.amountOre, 0);
      assert.equal(lineSum, t.cashGrossOre + t.taxFreeReimbursementOre + t.benefitOre + t.netAdjustmentOre);
      assert.equal(reconcile(s.document).ok, true, reconcile(s.document).problems.join(" "));
    }
    const journal = runJournal(run.payslips, accounts);
    assert.equal(journal.debitOre, journal.creditOre);
    const accruals = accrualLines(run.payslips, accounts);
    assert.equal(
      accruals.reduce((a, l) => a + l.debitOre, 0),
      accruals.reduce((a, l) => a + l.creditOre, 0)
    );
    const bank = salaryFile({
      messageId: `LON-${round}`,
      createdAt: "2026-10-20T10:00:00",
      executionDate: run.payslips[0].document.payDate,
      period: "2026-10",
      debtor: { name: "Binaafy AB", orgNr: "559123-4567", iban: "SE4550000000058398257466", bic: "ESSESESS" },
      payments: run.payslips.map((s, i) => ({ reference: `L${i + 1}`, name: s.document.employeeName, clearing: "8327", account: "9123456789", amountOre: s.document.totals.netOre })),
    });
    const sums = reconciliationSums({ docs: run.payslips.map((s) => s.document), journal: payslipJournal(run.payslips.map((s) => s.document), accounts), bankTotalOre: salaryFileTotalOre(bank.xml), netAccount: accounts.net });
    assert.equal(sums.ok, true, JSON.stringify(sums));
  }
});

test("history: OB and övertid count in the intjänandeår they were earned, not the one they were paid in", () => {
  const bo = person({ id: "bo", name: "Bo", birthDate: "1988-02-02", agreement: "byggavtalet" });
  bo.versions = [version({ employeeId: "bo", form: "tillsvidare", payForm: "hourly", hourlyRateOre: 20_000, startsOn: "2025-01-01", vacationRule: "procent", vacationPercent: 13 })];
  bo.schedule = { kind: "weekly", hours: [8, 8, 8, 8, 8, 0, 0], holidaysOff: true };
  // Evening work on Tuesday 10 March 2026 (OB), paid in April under the common model.
  bo.timeEntries = [entry("bo", "2026-03-10", "18:00", "22:00")];
  const april = computeRun(runFor("2026-04", {}, [bo])).payslips[0].document;
  assert.equal(april.context?.timeFrom, "2026-03-01");
  const ob = april.lines.filter((l) => l.item.kind === "ob").reduce((s, l) => s + l.amountOre, 0);
  assert.ok(ob > 0);
  // The intjänandeår 2025-04-01 – 2026-03-31 gets March's work; 2026/27 does not, though the pay date is in April.
  assert.deepEqual(earningYearHistory([april], "2025-04-01", "2026-04-01"), { vacationBasisOre: april.bases.vacationBasisOre, variablePayOre: ob });
  assert.deepEqual(earningYearHistory([april], "2026-04-01", "2027-04-01"), { vacationBasisOre: 0, variablePayOre: 0 });
  // Månadslön belongs to its own month: April's salary is in 2026/27.
  const anna = person({ id: "anna", name: "Anna", birthDate: "1990-05-05", agreement: "tjanstemannaavtalet" });
  anna.versions = [version({ employeeId: "anna", form: "tillsvidare", payForm: "monthly", monthlySalaryOre: 3_000_000, startsOn: "2024-01-01", vacationRule: "sammalon" })];
  const salary = computeRun(runFor("2026-04", {}, [anna])).payslips[0].document;
  assert.equal(earningYearHistory([salary], "2026-04-01", "2027-04-01").vacationBasisOre, 3_000_000);
  assert.equal(earningYearHistory([salary], "2025-04-01", "2026-04-01").vacationBasisOre, 0);
});

/* ---------- phase 5 ---------- */

test("phase 5: the board's quarterly fee runs through the run and the AGI (011 and 023, 30 % tax), nothing between quarters", () => {
  const board = person({ id: "board-1", name: "Styrelseledamot", birthDate: "1972-07-07", agreement: "none" });
  board.versions = [version({ employeeId: "board-1", form: "uppdrag", payForm: "fee", feeOre: 1_500_000, feePeriod: "quarter", startsOn: "2026-01-01", decisionReference: "Årsstämma 2025-12-15 § 8" })];
  board.tax = [taxRow("board-1", false)];
  const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
  const paid = months.map((m) => computeRun(runFor(m, {}, [board])).payslips.length);
  assert.deepEqual(paid, [0, 0, 1, 0, 0, 1]);
  const run = computeRun(runFor("2026-06", {}, [board]));
  const doc = run.payslips[0].document;
  assert.equal(doc.lines[0].text, "Styrelsearvode kv 2 2026");
  const agi = agiBuild("2026-06", [{ payslipId: "l1", runId: "r6", employeeId: "board-1", document: doc }]);
  assert.deepEqual(agi.problems, []);
  assert.deepEqual(agi.people[0].boxes, { "001": 450_000, "011": 1_500_000, "012": 0, "013": 0, "018": 0, "023": 1_500_000, "131": 0 });
  assert.equal(agi.totals.contributionsOre, 471_300); // 31,42 % × 15 000
  assert.equal(doc.context?.pension.scheme, "none");
});

test("phase 5: bilförmån (Skatteverket's 2026 car) and 21 lunches on a payslip, booked 7385/7382 against 7399, AGI 013/012, outside Collectum", () => {
  const eva = person({ id: "eva", name: "Eva Ek", birthDate: "1984-04-04", agreement: "tjanstemannaavtalet" });
  eva.versions = [version({ employeeId: "eva", form: "tillsvidare", payForm: "monthly", monthlySalaryOre: 4_000_000, startsOn: "2024-01-01", pensionScheme: "itp1" })];
  const benefit = (b: Partial<Benefit>): Benefit => ({ id: "x", employeeId: "eva", kind: "bil", description: "", validFrom: "2026-01-01", validTo: null, car: null, meals: {}, housing: null, marketValueOre: 0, employeePaymentOre: 0, ...b });
  eva.benefits = [
    benefit({ id: "bil-1", car: { registrationNumber: "ABC123", model: "Volvo V60", firstRegisteredOn: "2024-03-01", modelYear: 2024, fuel: "diesel", newCarPriceOre: 30_000_000, extraEquipmentOre: 2_200_000, vehicleTaxOre: 405_000, businessMilPerYear: 0, fuelPaidByEmployer: false, privateFuelOre: 0, fuelEmployeePaymentOre: 0 } }),
    benefit({ id: "kost-1", kind: "kost", description: "lunch", meals: { lunchOrDinner: 21 } }),
    benefit({ id: "gammal", kind: "annan", description: "Slutad", marketValueOre: 10_000, validTo: "2026-10-31" }),
  ];
  const run = computeRun(runFor("2026-11", {}, [eva]));
  assert.equal(run.checks.filter((c) => c.level === "block").length, 0, JSON.stringify(run.checks));
  const slip = run.payslips[0];
  const doc = slip.document;
  assert.deepEqual(doc.lines.map((l) => [l.code, l.amountOre, l.source?.id ?? null]), [
    ["1010", 4_000_000, null],
    ["1800", 600_300, "bil-1"],
    ["1810", 260_400, "kost-1"],
  ]);
  assert.equal(doc.totals.benefitOre, 860_700);
  assert.equal(doc.bases.tableTaxableOre, 4_860_700);
  assert.equal(doc.contributions.baseOre, 4_860_700);
  assert.equal(doc.totals.netOre, 4_000_000 - doc.totals.taxOre);
  const by: Record<string, number> = {};
  for (const j of journalLines(doc)) by[j.account] = (by[j.account] ?? 0) + j.debitOre - j.creditOre;
  assert.equal(by["7385"], 600_300);
  assert.equal(by["7382"], 260_400);
  assert.equal(by["7399"], -860_700);
  const agi = agiBuild("2026-11", [{ payslipId: "l1", runId: "r", employeeId: "eva", document: doc }]);
  assert.equal(agi.people[0].boxes["013"], 600_300);
  assert.equal(agi.people[0].boxes["012"], 260_400);
  assert.equal(agi.people[0].boxes["011"], 4_000_000);
  // ITP1 on the salary only; the premium's särskild löneskatt and the insurances in the accruals.
  assert.equal(collectumBasis("2026-11", [{ payslipId: "l1", employeeId: "eva", document: doc }])[0].payOre, 4_000_000);
  assert.equal(slip.pensionPremiumOre, 180_000);
  const acc = Object.fromEntries(accrualLines([slip], accounts).map((l) => [l.account, l.debitOre - l.creditOre]));
  assert.equal(acc["7410"], 180_000);
  assert.equal(acc["7533"], 43_668); // 24,26 % × 1 800
  assert.equal(acc["2514"], -43_668);
  assert.equal(acc["7570"], 26_600); // 0,665 % × 40 000
  assert.equal(runJournal([slip], accounts).debitOre, runJournal([slip], accounts).creditOre);
});

test("phase 6: drivmedelsförmån, Skatteverket's example: 1 200 kr fuel → 1 440 kr taxed, 1 200 kr avgifter, ruta 018; repaid 1 200 kr → 240 kr; repaid 1 440 kr → nothing", () => {
  const make = (privateFuelOre: number, fuelEmployeePaymentOre: number) => {
    const eva = person({ id: "eva", name: "Eva Ek", birthDate: "1984-04-04", agreement: "tjanstemannaavtalet" });
    eva.versions = [version({ employeeId: "eva", form: "tillsvidare", payForm: "monthly", monthlySalaryOre: 4_000_000, startsOn: "2024-01-01", pensionScheme: "itp1" })];
    eva.benefits = [
      {
        id: "bil-1",
        employeeId: "eva",
        kind: "bil",
        description: "",
        validFrom: "2026-01-01",
        validTo: null,
        meals: {},
        housing: null,
        marketValueOre: 0,
        employeePaymentOre: 0,
        car: { registrationNumber: "ABC123", model: "Volvo V60", firstRegisteredOn: "2024-03-01", modelYear: 2024, fuel: "diesel", newCarPriceOre: 30_000_000, extraEquipmentOre: 2_200_000, vehicleTaxOre: 405_000, businessMilPerYear: 0, fuelPaidByEmployer: true, privateFuelOre, fuelEmployeePaymentOre },
      },
    ];
    return computeRun(runFor("2026-11", {}, [eva]));
  };
  // Fuel paid by the employer but no value entered: a warning, no fuel lines.
  const none = make(0, 0);
  assert.ok(none.checks.some((c) => c.level === "warn" && /drivmedel/.test(c.text)));
  assert.deepEqual(none.payslips[0].document.lines.map((l) => l.code), ["1010", "1800"]);

  const run = make(120_000, 0);
  assert.equal(run.checks.filter((c) => c.level === "block").length, 0, JSON.stringify(run.checks));
  const doc = run.payslips[0].document;
  assert.deepEqual(doc.lines.map((l) => [l.code, l.amountOre, l.source?.id ?? null]), [
    ["1010", 4_000_000, null],
    ["1800", 600_300, "bil-1"],
    ["1830", 120_000, "bil-1"],
    ["1831", 24_000, "bil-1"],
  ]);
  // Taxed on 1,2 × 1 200 kr, avgifter on 1 200 kr; the uplift is no cash and no pension pay.
  assert.equal(doc.bases.tableTaxableOre, 4_000_000 + 600_300 + 144_000);
  assert.equal(doc.contributions.baseOre, 4_000_000 + 600_300 + 120_000);
  assert.equal(doc.totals.benefitOre, 600_300 + 144_000);
  assert.equal(doc.totals.netOre, 4_000_000 - doc.totals.taxOre);
  assert.equal(doc.bases.pensionBasisOre, 4_000_000);
  const by: Record<string, number> = {};
  for (const j of journalLines(doc)) by[j.account] = (by[j.account] ?? 0) + j.debitOre - j.creditOre;
  assert.equal(by["7385"], 600_300 + 144_000);
  assert.equal(by["7399"], -(600_300 + 144_000));
  const agi = agiBuild("2026-11", [{ payslipId: "l1", runId: "r", employeeId: "eva", document: doc }]);
  assert.equal(agi.people[0].boxes["013"], 600_300);
  assert.equal(agi.people[0].boxes["018"], 144_000);
  assert.equal(agi.people[0].contributionBaseOre, 4_720_300);
  assert.equal(agi.totals.contributionsOre, Math.floor((4_720_300 * 31.42) / 100 / 100) * 100);

  // Repaid 1 200 kr: 1 440 − 1 200 = 240 kr taxed, nothing in the avgifter base (Skatteverket's example).
  const repaid = make(120_000, 120_000).payslips[0].document;
  assert.deepEqual(repaid.lines.filter((l) => l.code.startsWith("183")).map((l) => [l.code, l.amountOre]), [["1831", 24_000]]);
  assert.equal(repaid.contributions.baseOre, 4_600_300);
  assert.equal(agiBuild("2026-11", [{ payslipId: "l1", runId: "r", employeeId: "eva", document: repaid }]).people[0].boxes["018"], 24_000);
  // Repaid the whole 1 440 kr: no fuel lines at all.
  const all = make(120_000, 144_000).payslips[0].document;
  assert.deepEqual(all.lines.map((l) => l.code), ["1010", "1800"]);
});

test("phase 5: milersättning 60 mil with the own car and a two-day traktamente are paid tax-free and taxable, with AGI ticks 050 and 051", () => {
  const ali = person({ id: "ali", name: "Ali Berg", birthDate: "1991-09-09", agreement: "tjanstemannaavtalet" });
  ali.versions = [version({ employeeId: "ali", form: "tillsvidare", payForm: "monthly", monthlySalaryOre: 3_500_000, startsOn: "2024-01-01" })];
  const approved = (id: string, input: Parameters<typeof computeClaim>[0], policy: Parameters<typeof computeClaim>[1], description: string): ApprovedClaim => {
    const r = computeClaim(input, policy);
    return { id, kind: input.kind, dateFrom: input.dateFrom, dateTo: input.dateTo, description, taxFreeOre: r.taxFreeOre, taxableOre: r.taxableOre, computation: r.computation };
  };
  const policy = { ...payrollSettingsSchema.parse({}).expenses, ownCarPerMilOre: 3_000 };
  ali.expenseClaims = [
    approved("mil-1", { kind: "milersattning", dateFrom: "2026-10-12", dateTo: "2026-10-12", distanceKm: 600, carType: "egen" }, policy, "Borås"),
    approved("trakt-1", { kind: "traktamente", dateFrom: "2026-10-20", dateTo: "2026-10-21", departureTime: "07:00", returnTime: "20:00", nightsWithoutLodging: 0, meals: { "2026-10-21": { breakfast: true } }, longStay: "none", farFromHome: true }, policy, "Jönköping"),
    approved("utl-1", { kind: "utlagg", dateFrom: "2026-10-14", dateTo: "2026-10-14", amountOre: 45_000, vatOre: 9_000 }, policy, "Skruv"),
    // Dated after the salary month: next run.
    approved("sen", { kind: "utlagg", dateFrom: "2026-12-02", dateTo: "2026-12-02", amountOre: 10_000, vatOre: 0 }, policy, "Senare"),
  ];
  const run = computeRun(runFor("2026-11", {}, [ali]));
  assert.equal(run.checks.filter((c) => c.level === "block").length, 0, JSON.stringify(run.checks));
  const doc = run.payslips[0].document;
  assert.deepEqual(doc.lines.map((l) => [l.code, l.amountOre]), [
    ["1010", 3_500_000],
    ["1910", 150_000],
    ["1911", 30_000],
    ["1900", 54_000],
    ["1920", 45_000],
  ]);
  assert.equal(doc.totals.taxFreeReimbursementOre, 249_000);
  assert.equal(doc.totals.cashGrossOre, 3_530_000);
  assert.equal(doc.totals.netOre, 3_530_000 + 249_000 - doc.totals.taxOre);
  assert.equal(doc.bases.pensionBasisOre, 3_500_000);
  assert.equal(doc.bases.vacationBasisOre, 3_500_000);
  const agi = agiBuild("2026-11", [{ payslipId: "l1", runId: "r", employeeId: "ali", document: doc }]);
  assert.equal(agi.people[0].boxes["011"], 3_530_000);
  assert.deepEqual(agi.people[0].ticks, { "050": true, "051": true });
  const by = Object.fromEntries(journalLines(doc).map((j) => [j.account, j.debitOre - j.creditOre]));
  assert.deepEqual([by["7331"], by["7332"], by["7321"], by["7690"]], [150_000, 30_000, 54_000, 45_000]);
  assert.equal(reconcile(doc).ok, true);
});

test("phase 5: a person with only an approved claim gets a payslip with the reimbursement", () => {
  const p = person({ id: "p", name: "Per", birthDate: "1980-01-01", agreement: "none" });
  p.versions = [version({ employeeId: "p", form: "tillsvidare", payForm: "hourly", hourlyRateOre: 20_000, startsOn: "2025-01-01" })];
  p.expenseClaims = [{ id: "u", kind: "utlagg", dateFrom: "2026-10-01", dateTo: "2026-10-01", description: "Parkering", taxFreeOre: 2_000, taxableOre: 0, computation: {} }];
  const run = computeRun(runFor("2026-11", {}, [p]));
  assert.deepEqual(run.payslips[0].document.lines.map((l) => [l.code, l.amountOre]), [["1920", 2_000]]);
  assert.equal(run.payslips[0].document.totals.netOre, 2_000);
});
