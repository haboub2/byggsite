import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { payrollRulesAt } from "../rules/payroll";
import { employmentClocks } from "../payroll/employment-clocks";
import { CLOCK_CASES_AS_OF, clockBlock, clockCases, clockCasesSql } from "./clock-cases";
import { clockAlerts, clockRow, clocksForVersions, employmentPeriods } from "./clocks";
import type { EmploymentVersion } from "./schema";

const rules = payrollRulesAt(CLOCK_CASES_AS_OF);
const repo = join(__dirname, "..", "..", "..");

test("every shared case: the reference gives what employment-clocks.test.ts asserts", () => {
  for (const c of clockCases(rules)) {
    const row = clockRow(employmentClocks(c.periods, c.asOf, rules));
    for (const [k, v] of Object.entries(c.expect ?? {})) assert.equal(row[k as keyof typeof row], v, `${c.name}: ${k}`);
  }
});

test("the SQL test runs the same cases with the reference's answers (regenerate: npx tsx supabase/tests/gen-0035-clocks.ts)", () => {
  const sql = readFileSync(join(repo, "supabase", "tests", "0035_rls.sql"), "utf8");
  assert.equal(clockBlock(sql), clockCasesSql(rules).trim());
});

test("las_rules() in 0035 has the rule book's LAS values", () => {
  const migration = readFileSync(join(repo, "supabase", "migrations", "0035_hr.sql"), "utf8");
  const m = /function public\.las_rules\([\s\S]*?as \$\$ select ([\d, ]+) \$\$/.exec(migration);
  assert.ok(m, "las_rules() not found");
  const las = rules.las;
  assert.deepEqual(m[1].split(",").map((s) => Number(s.trim())), [
    las.savaLimitDays,
    las.savaDaysPerMonth,
    las.vikariatLimitDays,
    las.windowYears,
    las.savaSameMonthThreshold,
    las.probationMaxMonths,
    las.probationNoticeDays,
  ]);
});

// The rows supabase/tests/0035_rls.sql inserts, as versions: the same answers on both sides.
let n = 0;
const version = (contractId: string, v: Partial<EmploymentVersion> & Pick<EmploymentVersion, "form" | "startsOn" | "validFrom">): EmploymentVersion => ({
  id: `v${++n}`,
  employeeId: "e",
  contractId,
  version: 1,
  payForm: "hourly",
  monthlySalaryOre: null,
  hourlyRateOre: 17500,
  feeOre: null,
  feePeriod: null,
  decisionReference: "",
  title: "",
  workplace: "",
  workingTimePercent: 100,
  weeklyHours: 40,
  substituteFor: "",
  probationEndsOn: null,
  endsOn: null,
  noticeDays: null,
  payDay: 25,
  vacationRule: "procent",
  vacationDays: 25,
  vacationPercent: 12,
  atfHoursPerYear: 0,
  pensionScheme: "none",
  terms: "",
  changeReason: "",
  validTo: null,
  documentId: null,
  createdAt: "",
  ...v,
});

test("versions become periods like employment_periods(): Anna's provanställning keeps its start across a pay rise", () => {
  const anna = [
    version("a", { form: "provanstallning", startsOn: "2026-01-15", probationEndsOn: "2026-07-14", validFrom: "2026-01-15", validTo: "2026-02-28" }),
    version("a", { version: 2, form: "provanstallning", startsOn: "2026-01-15", probationEndsOn: "2026-07-14", validFrom: "2026-03-01", validTo: "2026-07-14" }),
    version("a", { version: 3, form: "tillsvidare", startsOn: "2026-01-15", validFrom: "2026-07-15" }),
  ];
  assert.deepEqual(employmentPeriods(anna), [
    { form: "provanstallning", startsOn: "2026-01-15", endsOn: "2026-07-14" },
    { form: "tillsvidare", startsOn: "2026-07-15", endsOn: null },
  ]);
  const row = clocksForVersions(anna, "2026-06-01", rules);
  assert.equal(row.probation_starts_on, "2026-01-15");
  assert.equal(row.probation_ends_on, "2026-07-14");
  assert.equal(row.probation_notice_by, "2026-06-30");
  assert.equal(row.probation_days_left, 43);
});

test("an agreed shorter provanställning ends on its own date", () => {
  const short = [version("s", { form: "provanstallning", startsOn: "2026-01-15", probationEndsOn: "2026-04-14", validFrom: "2026-01-15" })];
  assert.equal(clocksForVersions(short, "2026-02-01", rules).probation_ends_on, "2026-04-14");
});

test("Cecilia's SÄVA chain: three in March fill the gaps, an extension by a new version adds to May", () => {
  const cecilia = [
    version("m1", { form: "sava", startsOn: "2026-03-03", endsOn: "2026-03-04", validFrom: "2026-03-03" }),
    version("m2", { form: "sava", startsOn: "2026-03-10", endsOn: "2026-03-11", validFrom: "2026-03-10" }),
    version("m3", { form: "sava", startsOn: "2026-03-20", endsOn: "2026-03-21", validFrom: "2026-03-20" }),
    version("may", { form: "sava", startsOn: "2026-05-01", endsOn: "2026-05-31", validFrom: "2026-05-01", validTo: "2026-05-14" }),
    version("may", { version: 2, form: "sava", startsOn: "2026-05-01", endsOn: "2026-06-30", validFrom: "2026-05-15" }),
  ];
  assert.equal(clocksForVersions(cecilia, "2026-10-30", rules).sava_days, 19 + 60);
});

test("a version replaced before it took effect does not count", () => {
  const replaced = [
    version("r", { form: "sava", startsOn: "2026-02-01", endsOn: "2026-12-31", validFrom: "2026-02-01", validTo: "2026-01-31" }),
    version("r", { version: 2, form: "sava", startsOn: "2026-02-01", endsOn: "2026-02-28", validFrom: "2026-02-01" }),
  ];
  assert.equal(clocksForVersions(replaced, "2026-10-30", rules).sava_days, 30);
});

test("clockAlerts: days to conversion, converted, provanställning", () => {
  const open = clockAlerts(clockRow(employmentClocks([{ form: "sava", startsOn: "2026-01-01", endsOn: null }], "2026-06-30", rules)), "2026-06-30");
  assert.equal(open.length, 1);
  assert.equal(open[0].on, "2027-01-01");
  assert.equal(open[0].daysUntil, 185);
  assert.match(open[0].detail, /blir tillsvidare 2027-01-01 \(om 185 dagar\)/);
  const done = clockAlerts(clockRow(employmentClocks([{ form: "vikariat", startsOn: "2024-01-01", endsOn: "2026-05-31" }], "2026-10-30", rules)), "2026-10-30");
  assert.equal(done[0].converted, true);
  const prov = clockAlerts(clockRow(employmentClocks([{ form: "provanstallning", startsOn: "2026-01-15", endsOn: null }], "2026-06-01", rules)), "2026-06-01");
  assert.equal(prov[0].kind, "probation");
  assert.equal(prov[0].daysUntil, 43);
  assert.deepEqual(clockAlerts(clockRow(employmentClocks([], "2026-06-01", rules)), "2026-06-01"), []);
});
