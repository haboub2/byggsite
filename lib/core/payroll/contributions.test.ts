import { test } from "node:test";
import assert from "node:assert/strict";
import { sumOre } from "../money";
import { payrollRulesAt } from "../rules/payroll";
import { agiContributions, agiContributionTotal, contributionCategory, employerContributions, pensionPremium, type ContributionInput } from "./contributions";

const june = payrollRulesAt("2026-06-25");
const march = payrollRulesAt("2026-03-25");
const input = (over: Partial<ContributionInput>): ContributionInput => ({ rules: june, birthYear: 1985, payDate: "2026-06-25", baseOre: 3_500_000, expectedAnnualPayOre: 42_000_000, ...over });

test("category by birth year in income year 2026", () => {
  assert.equal(contributionCategory(june, 1937), "exempt");
  assert.equal(contributionCategory(june, 1938), "older");
  assert.equal(contributionCategory(june, 1958), "older");
  assert.equal(contributionCategory(june, 1959), "full");
  assert.equal(contributionCategory(june, 2002), "full");
  assert.equal(contributionCategory(june, 2003), "young");
  assert.equal(contributionCategory(june, 2007), "young");
  assert.equal(contributionCategory(june, 2008), "full");
  // Before 1 April the young band is not in force.
  assert.equal(contributionCategory(march, 2005), "full");
});

test("full rate: 31,42 % of 35 000 kr = 10 997 kr, split on the seven parts exactly", () => {
  const r = employerContributions(input({}));
  assert.equal(r.amountOre, 1_099_700);
  assert.equal(r.parts.alderspension, 357_350);
  assert.equal(r.parts.allmanLoneavgift, 441_700);
  assert.equal(sumOre(Object.values(r.parts)), r.amountOre);
});

test("older: only ålderspensionsavgift 10,21 %; exempt: nothing", () => {
  const r = employerContributions(input({ birthYear: 1955 }));
  assert.equal(r.amountOre, 357_350);
  assert.equal(r.parts.allmanLoneavgift, 0);
  assert.equal(employerContributions(input({ birthYear: 1936 })).amountOre, 0);
});

test("young: 20,81 % up to 25 000 kr a month, the full rate above", () => {
  // 25 000 × 20,81 % = 5 202,50; 5 000 × 31,42 % = 1 571,00 → 6 773,50 kr.
  const r = employerContributions(input({ birthYear: 2005, baseOre: 3_000_000 }));
  assert.equal(r.category, "young");
  assert.equal(r.reducedBaseOre, 2_500_000);
  assert.equal(r.fullBaseOre, 500_000);
  assert.equal(r.amountOre, 677_350);
  assert.equal(sumOre(Object.values(r.parts)), r.amountOre);
  // Ålderspensionsavgiften is never reduced.
  assert.equal(r.parts.alderspension, 306_300);
  // Paid in March: full rate.
  assert.equal(employerContributions(input({ rules: march, payDate: "2026-03-25", birthYear: 2005, baseOre: 3_000_000 })).amountOre, 942_600);
});

test("the 1 000 kr rule: nothing when the year's pay stays below 1 000 kr", () => {
  const r = employerContributions(input({ baseOre: 90_000, expectedAnnualPayOre: 99_999 }));
  assert.equal(r.category, "below-annual-threshold");
  assert.equal(r.amountOre, 0);
  assert.equal(employerContributions(input({ baseOre: 90_000, expectedAnnualPayOre: 100_000 })).amountOre, 28_278);
});

test("AGI: underlag per rate in whole kronor, öre dropped per rate, then summed", () => {
  const results = [
    employerContributions(input({ baseOre: 3_500_050 })),
    employerContributions(input({ baseOre: 2_000_075 })),
    employerContributions(input({ birthYear: 1955, baseOre: 1_500_000 })),
    employerContributions(input({ birthYear: 2005, baseOre: 3_000_000 })),
    employerContributions(input({ birthYear: 1930, baseOre: 1_000_000 })),
  ];
  const rows = agiContributions(june, results);
  // Full: per person 35 000 + 20 000 + 5 000 (young above cap) = 60 000 × 31,42 % = 18 852.
  // Older: 15 000 × 10,21 % = 1 531,50 → 1 531. Young: 25 000 × 20,81 % = 5 202,50 → 5 202.
  assert.deepEqual(
    rows.map((r) => [r.category, r.ratePercent, r.baseOre, r.amountOre]),
    [
      ["full", 31.42, 6_000_000, 1_885_200],
      ["older", 10.21, 1_500_000, 153_100],
      ["young", 20.81, 2_500_000, 520_200],
    ],
  );
  assert.equal(agiContributionTotal(rows), 2_558_500);
});

test("AGI: each person's underlag is whole kronor before the sum (ten people at 20 000,99 kr → 62 840 kr, not 62 842)", () => {
  const ten = Array.from({ length: 10 }, () => employerContributions(input({ baseOre: 2_000_099 })));
  const rows = agiContributions(june, ten);
  assert.equal(rows[0].baseOre, 20_000_000);
  assert.equal(agiContributionTotal(rows), 6_284_000);
  // The payslips' own öre amounts sum higher; the difference is a rounding entry.
  assert.equal(sumOre(ten.map((r) => r.amountOre)), 6_284_310); // 10 × 628 431
});

test("golden: Fora's SAF-LO example, 53 000 kr in a month → 2 609 kr; and what Fora charges in 2026", () => {
  // fora.se "Så beräknas pensionspremien": 52 125 × 4,5 % = 2 346; 875 × 30 % = 263.
  assert.deepEqual(pensionPremium(june, "saf-lo", 5_300_000), { belowCapOre: 234_600, aboveCapOre: 26_300, totalOre: 260_900, capOre: 5_212_500 });
  // Invoiced at 4,4 % in 2026: 2 293,50 → 2 294 + 263.
  assert.equal(pensionPremium(june, "saf-lo", 5_300_000, { charged: true }).totalOre, 255_700);
  // ITP1: 60 000 kr → 2 346 + 7 875 × 30 % = 2 362,50 → 2 363.
  assert.equal(pensionPremium(june, "itp1", 6_000_000).totalOre, 470_900);
});
