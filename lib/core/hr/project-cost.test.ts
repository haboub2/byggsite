import { test } from "node:test";
import assert from "node:assert/strict";
import { payrollRulesAt } from "../rules/payroll";
import { contributionPercent, internalHourlyCost, projectCostFor, type CostBasis } from "./project-cost";

const basis = (over: Partial<CostBasis>): CostBasis => ({
  entryId: "t1",
  employeeName: "Erik Eriksson",
  birthDate: "1992-06-30",
  workDate: "2026-10-19",
  hours: 8,
  kind: "work",
  projectId: "p1",
  correctsId: null,
  payForm: "monthly",
  monthlySalaryOre: 3_200_000,
  hourlyRateOre: null,
  weeklyHours: 40,
  workingTimePercent: 100,
  correctedHourlyRateOre: null,
  ...over,
});

test("månadslön: 32 000 kr at 40 h/week is 184,62 kr/h, plus 31,42 % avgifter", () => {
  // 3 200 000 × 12 / (52 × 40) = 18 461,54 → 18 462 öre; 18 462 × 31,42 % = 5 800,76 → 5 801; 24 263 öre/h.
  const c = internalHourlyCost(basis({}));
  assert.deepEqual(c, { hourlyPayOre: 18_462, contributionPercent: 31.42, costOre: 24_263 });
  const row = projectCostFor(basis({}));
  assert.deepEqual(row, { entryId: "t1", hours: 8, hourlyRateOre: 24_263, amountOre: 194_104, description: "Erik Eriksson 2026-10-19, 8 h arbete" });
});

test("timlön for someone born 2005 in October 2026: the young people's 20,81 %", () => {
  // 18 000 × 20,81 % = 3 745,8 → 3 746; 21 746 öre/h; 4,5 h = 97 857.
  const b = basis({ payForm: "hourly", hourlyRateOre: 18_000, monthlySalaryOre: null, birthDate: "2005-02-01", hours: 4.5, kind: "overtime" });
  assert.equal(internalHourlyCost(b).costOre, 21_746);
  assert.equal(projectCostFor(b)?.amountOre, 97_857);
  assert.equal(projectCostFor(b)?.description, "Erik Eriksson 2026-10-19, 4,5 h övertid");
});

test("the birth year decides the rate: older 10,21 %, born 1937 or earlier nothing, unknown the full rate", () => {
  const rules = payrollRulesAt("2026-10-19");
  assert.equal(contributionPercent(rules, 1955), 10.21);
  assert.equal(contributionPercent(rules, 1936), 0);
  assert.equal(contributionPercent(rules, null), 31.42);
  assert.equal(contributionPercent(rules, 1992), 31.42);
  // Before 2026-04-01 there is no young people's reduction.
  assert.equal(contributionPercent(payrollRulesAt("2026-03-15"), 2005), 31.42);
  const older = basis({ payForm: "hourly", hourlyRateOre: 20_000, monthlySalaryOre: null, birthDate: "1955-03-03" });
  assert.equal(internalHourlyCost(older).costOre, 22_042);
});

test("part time månadslön without weekly hours: 40 h at the contract's percent", () => {
  // 50 %: 20 h/week. 1 600 000 × 12 / (52 × 20) = 18 461,54 → 18 462, the same hourly pay as full time.
  const c = internalHourlyCost(basis({ monthlySalaryOre: 1_600_000, weeklyHours: null, workingTimePercent: 50 }));
  assert.equal(c.hourlyPayOre, 18_462);
});

test("a reversal takes the reversed row's rate and negates its amount", () => {
  const row = projectCostFor(basis({ entryId: "r1", hours: -8, correctsId: "t1", correctedHourlyRateOre: 24_263 }));
  assert.deepEqual(row, { entryId: "r1", hours: -8, hourlyRateOre: 24_263, amountOre: -194_104, description: "Rättelse: Erik Eriksson 2026-10-19, −8 h arbete" });
  // Half öre round away from zero both ways, as round() in SQL: 0,5 h × 3 öre = 1,5 → 2.
  assert.equal(projectCostFor(basis({ hours: -0.5, correctedHourlyRateOre: 3 }))?.amountOre, -2);
  assert.equal(projectCostFor(basis({ hours: 0.5, payForm: "hourly", hourlyRateOre: 3, birthDate: "1936-01-01" }))?.amountOre, 2);
});

test("no project, beredskap: no cost; no pay that day: refused with a reason", () => {
  assert.equal(projectCostFor(basis({ projectId: null })), null);
  assert.equal(projectCostFor(basis({ kind: "on_call" })), null);
  assert.ok(projectCostFor(basis({ kind: "travel" })));
  assert.throws(() => projectCostFor(basis({ payForm: null, monthlySalaryOre: null })), /ingen anställning med lön den 2026-10-19/);
});
