import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { payrollRulesAt } from "../rules/payroll";
import { internalHourlyCost, type CostBasis } from "./project-cost";

const repo = join(__dirname, "..", "..", "..");

test("employer_contribution_rules() in 0038 has the rule book's arbetsgivaravgifter", () => {
  const migration = readFileSync(join(repo, "supabase", "migrations", "0038_time_fixes.sql"), "utf8");
  const m = /function public\.employer_contribution_rules\([\s\S]*?as \$\$ select (.+?) \$\$/.exec(migration);
  assert.ok(m, "employer_contribution_rules() not found");
  const v = m[1].split(",").map((s) => s.trim().replace(/^date '(.*)'$/, "$1"));
  const c = payrollRulesAt("2026-04-01").employerContributions;
  assert.ok(c.young);
  assert.deepEqual(v.slice(0, 8).map(Number), [c.fullPercent, c.olderReduced.percent, c.olderReduced.bornFrom, c.olderReduced.bornTo, c.exemptBornUpTo, c.young.percent, c.young.bornFrom, c.young.bornTo]);
  // The reduction starts with the rule set that has it; the day before there is none. Its end (2027-09-30, lag 2026:100) is past the 2026 rules.
  assert.equal(v[8], "2026-04-01");
  assert.equal(payrollRulesAt("2026-03-31").employerContributions.young, null);
  assert.equal(v[9], "2027-09-30");
});

test("time_hourly_cost_ore() cases in 0037_time.sql give the same öre as internalHourlyCost()", () => {
  const sql = readFileSync(join(repo, "supabase", "tests", "0037_time.sql"), "utf8");
  const lines = [...sql.matchAll(/^select pg_temp\.prov_cost\((.+)\);$/gm)].map((x) => x[1]);
  assert.ok(lines.length >= 6, "the cases are missing");
  for (const line of lines) {
    const [name, pay, monthly, hourly, weekly, pct, birth, on, expected] = line.split(/,\s*(?=(?:[^']*'[^']*')*[^']*$)/).map((s) => s.trim());
    const str = (s: string) => (s === "null" ? null : s.replace(/^'|'$/g, ""));
    const num = (s: string) => (s === "null" ? null : Number(s));
    const basis: CostBasis = {
      entryId: "x",
      employeeName: str(name) ?? "",
      birthDate: str(birth),
      workDate: str(on) as string,
      hours: 1,
      kind: "work",
      projectId: "p",
      correctsId: null,
      payForm: str(pay) as "monthly" | "hourly",
      monthlySalaryOre: num(monthly),
      hourlyRateOre: num(hourly),
      weeklyHours: num(weekly),
      workingTimePercent: num(pct),
      correctedHourlyRateOre: null,
    };
    assert.equal(internalHourlyCost(basis).costOre, Number(expected), str(name) ?? "");
  }
});
