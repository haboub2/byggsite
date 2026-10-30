import { test } from "node:test";
import assert from "node:assert/strict";
import type { Absence } from "../hr/absence";
import type { EmploymentVersion } from "../hr/schema";
import type { TimeEntry } from "../hr/time";
import { DEFAULT_PAY_ITEMS } from "./pay-items.default";
import type { PayslipDocument } from "./payslip";
import { certificateContent, type CertificateInput } from "./certificate";

const version = (over: Partial<EmploymentVersion>) =>
  ({ id: "v", employeeId: "x", contractId: "c1", version: 1, form: "tillsvidare", payForm: "monthly", monthlySalaryOre: 3_500_000, hourlyRateOre: null, title: "Snickare", startsOn: "2026-01-01", endsOn: null, validFrom: "2026-01-01", validTo: null, weeklyHours: 40, workingTimePercent: 100, ...over }) as EmploymentVersion;
const item = (code: string) => {
  const i = DEFAULT_PAY_ITEMS.find((x) => x.code === code);
  assert.ok(i);
  return { code: i.code, name: i.name, kind: i.kind, version: 1, flags: i.flags };
};
const slip = (periodStart: string, timeFrom: string, lines: [string, number, string?][]): PayslipDocument =>
  ({
    periodStart,
    payDate: `${periodStart.slice(0, 7)}-25`,
    lines: lines.map(([code, amountOre, from]) => ({ code, text: "", quantity: null, unit: null, unitPriceOre: null, basisOre: null, ratePercent: null, amountOre, from, item: item(code) })),
    context: { timeFrom },
  }) as unknown as PayslipDocument;
const base: Omit<CertificateInput, "versions" | "timeEntries" | "absences" | "payslips" | "to"> = {
  employee: { id: "x", name: "Erik Eriksson", pnr: "19920630-1234" },
  employer: { name: "Binaafy AB", orgNr: "559000-0000", address: "Göteborg", signer: "Ibrahim" },
  reason: "arbetsbrist",
  reasonText: "",
  today: "2026-10-30",
};

test("månadslön without reported time: the contract's hours on workdays, less sick days; pay in the salary month", () => {
  const sick: Absence = { id: "s", employeeId: "x", kind: "sjuk", from: "2026-10-05", to: "2026-10-06", extent: 1, certificateReceivedOn: null, sickPeriodId: null, note: "", approvedAt: null, createdAt: "" };
  const c = certificateContent({ ...base, versions: [version({ endsOn: "2026-10-31" })], timeEntries: [], absences: [sick], payslips: [slip("2026-10-01", "2026-09-01", [["1011", 3_500_000], ["1420", -323_077, "2026-10-05"]])], to: "2026-10-31" });
  assert.equal(c.from, "2026-01-01");
  assert.equal(c.months.length, 10);
  const oct = c.months[9];
  // 22 workdays in October 2026, two sick: 20 × 8 h worked, 16 h frånvaro.
  assert.deepEqual([oct.month, oct.employedDays, oct.workedHours, oct.absenceHours, oct.hoursFromSchedule, oct.absenceDays.sjuk, oct.payOre], ["2026-10", 31, 160, 16, true, 2, 3_176_923]);
  assert.equal(c.employments[0].form, "Tillsvidareanställning");
});

test("timlön: approved time per month, övertid apart, pay counted in the month worked; only the last twelve months", () => {
  const entry = (d: string, hours: number, kind: TimeEntry["kind"] = "work", status: TimeEntry["status"] = "approved") => ({ id: d + kind, employeeId: "x", workDate: d, hours, kind, status }) as TimeEntry;
  const c = certificateContent({
    ...base,
    versions: [version({ payForm: "hourly", monthlySalaryOre: null, hourlyRateOre: 18_000, startsOn: "2025-03-01", validFrom: "2025-03-01" })],
    timeEntries: [entry("2026-09-01", 8), entry("2026-09-02", 8), entry("2026-09-03", 6), entry("2026-09-03", 2, "overtime"), entry("2026-09-04", 8, "work", "submitted")],
    absences: [],
    payslips: [slip("2026-10-01", "2026-09-01", [["1100", 396_000], ["1300", 54_000]])],
    to: "2026-10-30",
  });
  assert.equal(c.from, "2025-10-31");
  const sep = c.months.find((m) => m.month === "2026-09");
  assert.ok(sep);
  // 22 h worked (the 2 h övertid apart, the submitted row not counted).
  assert.deepEqual([sep.workedHours, sep.overtimeHours, sep.hoursFromSchedule, sep.payOre], [22, 2, false, 450_000]);
  assert.equal(c.months.find((m) => m.month === "2026-10")?.payOre, 0);
  assert.deepEqual(c.totals, { workedHours: 22, absenceHours: 0, overtimeHours: 2, payOre: 450_000 });
});

test("semester counts as worked time, not frånvaro", () => {
  const leave: Absence = { id: "l", employeeId: "x", kind: "semester", from: "2026-10-05", to: "2026-10-09", extent: 1, certificateReceivedOn: null, sickPeriodId: null, note: "", approvedAt: null, createdAt: "" };
  const c = certificateContent({ ...base, versions: [version({})], timeEntries: [], absences: [leave], payslips: [], to: "2026-10-31" });
  const oct = c.months[c.months.length - 1];
  assert.deepEqual([oct.workedHours, oct.absenceHours, oct.absenceDays.semester], [176, 0, 5]);
});

test("a board assignment gives no certificate", () => {
  assert.throws(() => certificateContent({ ...base, versions: [version({ payForm: "fee", form: "uppdrag" })], timeEntries: [], absences: [], payslips: [], to: "2026-10-30" }), /styrelseuppdrag/);
});
