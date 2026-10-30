/**
 * The LAS clock cases that both implementations must agree on: the
 * TypeScript reference (lib/core/payroll/employment-clocks.ts) and the
 * database's las_clocks() (supabase/migrations/0035_hr.sql). The cases are
 * the ones in employment-clocks.test.ts, same inputs, plus its random
 * SÄVA patterns.
 *
 * `clockCasesSql()` renders them as calls in supabase/tests/0035_rls.sql
 * with the reference's answer as the expected row; clock-parity.test.ts
 * fails when the committed block differs from a fresh rendering, so a
 * change to the reference shows up as a diff in the SQL test to run again.
 */

import { addDays } from "../rules/index";
import { addMonths, employmentClocks, type EmploymentPeriod } from "../payroll/employment-clocks";
import { clockRow, type ClockRow } from "./clocks";
import type { PayrollRuleSet } from "../rules/payroll";

export type ClockCase = {
  name: string;
  periods: EmploymentPeriod[];
  asOf: string;
  /** What employment-clocks.test.ts asserts for the case, checked against the reference. */
  expect?: Partial<ClockRow>;
};

const sava = (startsOn: string, endsOn: string | null): EmploymentPeriod => ({ form: "sava", startsOn, endsOn });
const vik = (startsOn: string, endsOn: string | null): EmploymentPeriod => ({ form: "vikariat", startsOn, endsOn });
const prov = (startsOn: string, endsOn: string | null): EmploymentPeriod => ({ form: "provanstallning", startsOn, endsOn });

/** Two six-day SÄVA a month from January 2024 (the gap rule needs three). */
function twoJobsAMonth(months: number): EmploymentPeriod[] {
  const jobs: EmploymentPeriod[] = [];
  for (let m = 0; m < months; m++) {
    const first = addMonths("2024-01-01", m);
    jobs.push(sava(first, addDays(first, 5)), sava(addDays(first, 14), addDays(first, 19)));
  }
  return jobs;
}

/** The property test's deterministic random SÄVA patterns (same seed, same generator). */
export function randomSavaPatterns(): EmploymentPeriod[][] {
  let seed = 7;
  const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
  const patterns: EmploymentPeriod[][] = [];
  for (let n = 0; n < 12; n++) {
    const jobs: EmploymentPeriod[] = [];
    let d = "2025-01-01";
    while (d < "2027-06-30") {
      const length = 1 + Math.floor(random() * (random() < 0.2 ? 60 : 8));
      jobs.push(sava(d, addDays(d, length - 1)));
      d = addDays(d, length + Math.floor(random() * 6));
    }
    patterns.push(jobs);
  }
  return patterns;
}

export function clockCases(rules: PayrollRuleSet): ClockCase[] {
  const cases: ClockCase[] = [
    {
      name: "SÄVA: obruten sträcka, hela månader 30, överlapp en gång",
      periods: [sava("2026-01-01", "2026-01-31"), sava("2026-01-20", "2026-02-10")],
      asOf: "2026-10-30",
      expect: { sava_days: 40, sava_limit: 360, sava_days_left: 320, sava_converted: false },
    },
    {
      name: "tolv obrutna månader är 360 och konverterar inte",
      periods: [sava("2025-03-01", "2026-02-28")],
      asOf: "2026-10-30",
      expect: { sava_days: 360, sava_converted: false, sava_converts_on: null },
    },
    { name: "tolv månader över skottdagen", periods: [sava("2027-03-01", "2028-02-29")], asOf: "2028-10-30", expect: { sava_days: 360 } },
    {
      name: "en dag till konverterar",
      periods: [sava("2025-03-01", "2026-03-01")],
      asOf: "2026-10-30",
      expect: { sava_days: 361, sava_converted: true, sava_converts_on: "2026-03-01" },
    },
    { name: "spridda dagar räknas en var: 30 månader med två jobb är 360", periods: twoJobsAMonth(30), asOf: "2026-06-30", expect: { sava_days: 360, sava_converted: false } },
    { name: "spridda dagar: den 361:a konverterar", periods: twoJobsAMonth(31), asOf: "2026-06-30", expect: { sava_converts_on: "2026-07-01" } },
    {
      name: "tre SÄVA i en kalendermånad: dagarna mellan räknas",
      periods: [sava("2026-03-03", "2026-03-04"), sava("2026-03-10", "2026-03-11"), sava("2026-03-20", "2026-03-21")],
      asOf: "2026-10-30",
      expect: { sava_days: 19 },
    },
    { name: "två SÄVA i en månad: bara dagarna", periods: [sava("2026-03-03", "2026-03-04"), sava("2026-03-20", "2026-03-21")], asOf: "2026-10-30", expect: { sava_days: 4 } },
    {
      name: "luckregeln per kalendermånad, kedja över månadsskiften",
      periods: [sava("2026-01-28", "2026-02-02"), sava("2026-02-10", "2026-02-10"), sava("2026-02-25", "2026-03-03"), sava("2026-03-20", "2026-03-20")],
      asOf: "2026-10-30",
      expect: { sava_days: 35 },
    },
    {
      name: "luckor fylls inte utanför månaden",
      periods: [sava("2026-01-05", "2026-01-05"), sava("2026-01-15", "2026-01-15"), sava("2026-01-30", "2026-01-30"), sava("2026-02-05", "2026-02-05")],
      asOf: "2026-10-30",
      expect: { sava_days: 27 },
    },
    { name: "gamla dagar faller ur femårsfönstret", periods: [sava("2021-01-01", "2021-12-31")], asOf: "2026-06-30", expect: { sava_days: 180 } },
    { name: "öppen SÄVA konverterar dagen den passerar", periods: [sava("2026-01-01", null)], asOf: "2026-06-30", expect: { sava_days: 180, sava_converts_on: "2027-01-01" } },
    { name: "bokad SÄVA som inte når gränsen", periods: [sava("2026-01-01", "2026-08-31")], asOf: "2026-06-30", expect: { sava_converts_on: null } },
    {
      name: "vikariat räknas för sig, alla vikariat tillsammans",
      periods: [vik("2024-01-01", "2024-12-31"), vik("2025-06-01", "2026-05-31"), sava("2026-06-01", "2026-06-30")],
      asOf: "2026-10-30",
      expect: { vikariat_days: 731, vikariat_limit: 730, vikariat_converted: true, sava_days: 30 },
    },
    { name: "vikariat precis två år konverterar inte", periods: [vik("2024-06-01", "2026-05-31")], asOf: "2026-10-30", expect: { vikariat_converted: false } },
    {
      name: "provanställning: sex månader, besked två veckor före",
      periods: [prov("2026-01-15", null)],
      asOf: "2026-06-01",
      expect: { probation_starts_on: "2026-01-15", probation_ends_on: "2026-07-14", probation_notice_by: "2026-06-30", probation_days_left: 43, probation_converts_on: "2026-07-15" },
    },
    { name: "provanställning från 31 augusti slutar i februari", periods: [prov("2026-08-31", null)], asOf: "2026-09-01", expect: { probation_ends_on: "2027-02-28" } },
    { name: "kortare provanställning enligt avtal", periods: [prov("2026-01-15", "2026-04-14")], asOf: "2026-02-01", expect: { probation_ends_on: "2026-04-14" } },
    { name: "ingen provanställning", periods: [sava("2026-01-01", null)], asOf: "2026-06-01", expect: { probation_ends_on: null } },
  ];

  randomSavaPatterns().forEach((jobs, n) => {
    cases.push({ name: `slumpmönster ${n}`, periods: jobs, asOf: "2025-09-30" });
    const on = employmentClocks(jobs, "2025-09-30", rules).sava.convertsOn;
    if (on) cases.push({ name: `slumpmönster ${n} bakåt`, periods: jobs, asOf: addDays(on, 40), expect: { sava_converts_on: on } });
  });
  return cases;
}

const sqlDate = (d: string | null) => (d === null ? "null" : `'${d}'`);

/** The cases as calls to prov_clock() in the SQL test, with the reference's whole row as the expectation. */
export function clockCasesSql(rules: PayrollRuleSet): string {
  return clockCases(rules)
    .map((c) => {
      const periods = c.periods.map((p) => `('${p.form}',${sqlDate(p.startsOn)},${sqlDate(p.endsOn)})`).join(",");
      const expected = JSON.stringify(clockRow(employmentClocks(c.periods, c.asOf, rules)));
      return `select pg_temp.prov_clock('${c.name.replace(/'/g, "''")}', array[${periods}]::las_period[], '${c.asOf}', '${expected}');`;
    })
    .join("\n");
}

/** The rule set the cases are computed with, as in employment-clocks.test.ts. */
export const CLOCK_CASES_AS_OF = "2026-10-30";

export const CLOCK_BLOCK_BEGIN = "-- BEGIN clock cases (npx tsx supabase/tests/gen-0035-clocks.ts)";
export const CLOCK_BLOCK_END = "-- END clock cases";

/** The generated block in the SQL test, without its markers. */
export function clockBlock(sql: string): string {
  const a = sql.indexOf(CLOCK_BLOCK_BEGIN);
  const b = sql.indexOf(CLOCK_BLOCK_END);
  if (a < 0 || b < a) throw new Error("The clock case markers are missing in 0035_rls.sql.");
  return sql.slice(a + CLOCK_BLOCK_BEGIN.length, b).trim();
}

export function replaceClockBlock(sql: string, block: string): string {
  const a = sql.indexOf(CLOCK_BLOCK_BEGIN);
  const b = sql.indexOf(CLOCK_BLOCK_END);
  if (a < 0 || b < a) throw new Error("The clock case markers are missing in 0035_rls.sql.");
  return `${sql.slice(0, a + CLOCK_BLOCK_BEGIN.length)}\n${block}\n${sql.slice(b)}`;
}
