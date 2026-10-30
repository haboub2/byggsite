import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { payrollRulesAt } from "../rules/payroll";
import { AGI_FORMAT } from "../rules/agi-format";
import { agiContributions, agiContributionTotal, employerContributions, type ContributionCategory } from "./contributions";
import { DEFAULT_PAY_ITEMS } from "./pay-items.default";
import type { PayslipDocument } from "./payslip";
import { agiBuild, agiIdentity, agiRecords, agiXml, checkAgiXml, diffAgi, parseAgiXml, type AgiRecord, type AgiSlip } from "./agi";

const SCHEMA_DIR = join(__dirname, "fixtures", "agi");

const item = (code: string) => {
  const i = DEFAULT_PAY_ITEMS.find((x) => x.code === code);
  assert.ok(i, code);
  return { code: i.code, name: i.name, kind: i.kind, version: 1, flags: i.flags };
};

/** A frozen payslip with the lines (pay item code, öre) and its contribution result, as run.ts stores it. */
function slip(id: string, name: string, birthYear: number, payDate: string, lines: [string, number][], taxOre: number): AgiSlip {
  const docLines = lines.map(([code, amountOre]) => ({ code, text: "", quantity: null, unit: null, unitPriceOre: null, basisOre: null, ratePercent: null, amountOre, item: item(code) }));
  const base = docLines.filter((l) => l.item.flags.subjectToEmployerContribution).reduce((s, l) => s + l.amountOre, 0);
  const contributions = employerContributions({ rules: payrollRulesAt(payDate), birthYear, payDate, baseOre: base, expectedAnnualPayOre: 50_000_000 });
  const document = { schema: 1, employeeId: id, employeeName: name, birthYear, payDate, periodStart: `${payDate.slice(0, 7)}-01`, lines: docLines, contributions, totals: { taxOre } } as unknown as PayslipDocument;
  return { payslipId: `p-${id}`, runId: "run-1", employeeId: id, document };
}

/**
 * Skatteverket's example file 15 ("olika åldrar", 2026-04): four people,
 * 487 = 18 881 kr and 497 = 28 140 kr in its HU. Person 1's 1 200 kr
 * drivmedelsförmån is 1 000 kr underlag (018 / 1,2); here it is a
 * 1 000 kr övrig förmån (012) so the underlag is the same 32 000 kr.
 */
const example15 = () => [
  slip("p1", "Alder 1 (1982)", 1982, "2026-04-24", [["1010", 2_850_000], ["1800", 250_000], ["1820", 100_000]], 930_000),
  slip("p2", "Alder 2 (1944)", 1944, "2026-04-24", [["1010", 2_535_000], ["1910", 120_000]], 759_000),
  slip("p3", "Alder 3 (1936)", 1936, "2026-04-24", [["1010", 1_670_000], ["1900", 30_000]], 325_000),
  slip("p4", "Alder 5 (2007)", 2007, "2026-04-24", [["1010", 2_580_000], ["1800", 250_000]], 800_000),
];
const PNR: Record<string, string> = { p1: "198202252386", p2: "194406098824", p3: "193603119045", p4: "200711272385" };

test("golden: Skatteverket's example 15 gives 487 = 18 881 kr and 497 = 28 140 kr", () => {
  const b = agiBuild("2026-04", example15());
  assert.deepEqual(b.problems, []);
  assert.equal(b.totals.contributionsOre, 1_888_100);
  assert.equal(b.totals.taxOre, 2_814_000);
  // Per rate: full 32 000 + 3 300 (the young person's pay above 25 000), older 25 350, young 25 000.
  assert.deepEqual(b.totals.contributionRows.map((r) => [r.category, r.ratePercent, r.baseOre, r.amountOre]), [
    ["full", 31.42, 3_530_000, 1_109_100],
    ["young", 20.81, 2_500_000, 520_200],
    ["older", 10.21, 2_535_000, 258_800],
  ]);
  const p = new Map(b.people.map((x) => [x.employeeId, x]));
  assert.deepEqual(p.get("p1")?.boxes, { "001": 930_000, "011": 2_850_000, "012": 100_000, "013": 250_000, "023": 0, "131": 0 });
  assert.equal(p.get("p2")?.ticks["050"], true, "skattefri milersättning ticks 050 (Bilersättning)");
  assert.equal(p.get("p3")?.ticks["051"], true, "skattefritt traktamente ticks 051");
  assert.deepEqual(p.get("p3")?.contributions, [], "born 1936: no avgifter");
  assert.equal(p.get("p4")?.category, "young");
});

test("the stored sums are agiContributions() over the payslips' own contribution results, to the krona", () => {
  const slips = example15();
  const direct = agiContributions(payrollRulesAt("2026-04-01"), slips.map((s) => s.document.contributions));
  const b = agiBuild("2026-04", slips);
  assert.equal(b.totals.contributionsOre, agiContributionTotal(direct));
  assert.deepEqual(b.totals.contributionRows, [...direct].sort((a, c) => c.ratePercent - a.ratePercent));
  // Each person's öre are dropped before the rates are summed, never after.
  const odd = [slip("a", "A", 1990, "2026-11-25", [["1010", 3_000_099]], 0), slip("b", "B", 1990, "2026-11-25", [["1010", 3_000_099]], 0)];
  const bb = agiBuild("2026-11", odd);
  // 2 × 30 000 kr (not 60 001,98) × 31,42 % = 18 852 kr.
  assert.equal(bb.totals.contributionsOre, 1_885_200);
  assert.deepEqual(bb.people.map((x) => x.boxes["011"]), [3_000_000, 3_000_000]);
});

function validate(xml: string): string | null {
  let dir: string;
  try {
    execFileSync("xmllint", ["--version"], { stdio: "ignore" });
    dir = mkdtempSync(join(tmpdir(), "agi-"));
  } catch {
    return null;
  }
  const file = join(dir, "agi.xml");
  writeFileSync(file, xml);
  try {
    execFileSync("xmllint", ["--noout", "--schema", join(SCHEMA_DIR, "arbetsgivardeklaration_1.1.xsd"), file], { stdio: "pipe" });
    return "ok";
  } catch (err) {
    return String((err as { stderr?: Buffer }).stderr ?? err);
  }
}

const fileInput = (records: readonly AgiRecord[], totals: { taxOre: number; contributionsOre: number }) => ({
  period: "2026-04",
  employerId: "556026-9986",
  contact: { name: "Ville Vessla", phone: "555-244454", email: "ville.vessla@foretaget.se" },
  programName: "Binaafy",
  createdAt: "2026-05-07T07:42:25",
  records,
  payeeId: (id: string) => PNR[id] ?? "",
  totals,
});

test("the file validates against Skatteverket's XSD 1.1 and reads back to the same numbers", (t) => {
  const b = agiBuild("2026-04", example15());
  const records = agiRecords(b, [], (id) => `${PNR[id].slice(0, 8)}-XXXX`);
  assert.deepEqual(records.map((r) => r.specNo), [1, 2, 3, 4]);
  const xml = agiXml(fileInput(records, b.totals));
  const v = validate(xml);
  if (v === null) t.diagnostic("xmllint saknas: XSD-valideringen hoppades över");
  else assert.equal(v, "ok", v);
  assert.deepEqual(checkAgiXml(xml, records, b.totals, "2026-04"), []);
  const parsed = parseAgiXml(xml);
  assert.equal(parsed.employerId, "165560269986");
  assert.deepEqual(parsed.hu, { "201": "165560269986", "006": "202604", "487": "18881", "497": "28140" });
  // As example 15's first IU: 011 28 500, 013 2 500, 001 9 300 (and here 012 1 000 for its drivmedel).
  assert.deepEqual(parsed.ius[0].fields, { "201": "165560269986", "215": "198202252386", "006": "202604", "570": "001", "011": "28500", "012": "1000", "013": "2500", "001": "9300" });
  assert.equal(parsed.ius[1].fields["050"], "1");
  assert.equal(parsed.ius[2].fields["051"], "1");
  // A changed number in the file is caught before it is frozen.
  assert.match(checkAgiXml(xml.replace(">28500<", ">28501<"), records, b.totals, "2026-04").join(), /ruta 011/);
});

test("a repayment (återkrav) refiles the month: 011 and the avgifter go down, 001 stays, only that person changes", (t) => {
  const v1Build = agiBuild("2026-04", example15());
  const v1 = agiRecords(v1Build, [], () => "");
  const v2Build = agiBuild("2026-04", example15(), [{ id: "r1", employeeId: "p1", period: "2026-04", payslipId: "p-p1", amountOre: 600_000, reason: "För mycket utbetalt" }]);
  const v2 = agiRecords(v2Build, v1, () => "");
  assert.deepEqual(v2.map((r) => r.specNo), [1, 2, 3, 4], "the numbers are kept, so the new IU replaces the old");
  const diff = diffAgi(v1, v2);
  assert.deepEqual(diff, [{ employeeId: "p1", name: "Alder 1 (1982)", specNo: 1, change: "changed", fields: [{ code: "011", before: 2_850_000, after: 2_250_000 }] }]);
  // 6 000 kr less underlag at 31,42 %: (35 300 − 6 000) × 31,42 % = 9 206 kr instead of 11 091.
  assert.equal(v2Build.totals.contributionsOre, 1_888_100 - 1_109_100 + 920_600);
  assert.equal(v2Build.totals.taxOre, v1Build.totals.taxOre);
  const v = validate(agiXml(fileInput(v2, v2Build.totals)));
  if (v !== null) assert.equal(v, "ok", v);
  else t.diagnostic("xmllint saknas");
});

test("a person gone from the month gets a removal IU with their old number; a new one the next number", (t) => {
  const [p1, p2, p3, p4] = example15();
  const v1 = agiRecords(agiBuild("2026-04", [p1, p2, p3]), [], () => "");
  const build = agiBuild("2026-04", [p1, p3, p4]);
  const v2 = agiRecords(build, v1, () => "");
  assert.deepEqual(v2.map((r) => [r.employeeId, r.specNo, !!r.removed]), [["p1", 1, false], ["p3", 3, false], ["p4", 4, false], ["p2", 2, true]]);
  assert.deepEqual(diffAgi(v1, v2).map((d) => [d.employeeId, d.change]), [["p4", "added"], ["p2", "removed"]]);
  const xml = agiXml(fileInput(v2, build.totals));
  const removal = parseAgiXml(xml).ius.find((i) => i.removed);
  assert.deepEqual(removal?.fields, { "201": "165560269986", "215": "194406098824", "006": "202604", "570": "002", "205": "1" });
  assert.deepEqual(checkAgiXml(xml, v2, build.totals, "2026-04"), []);
  const v = validate(xml);
  if (v !== null) assert.equal(v, "ok", v);
  else t.diagnostic("xmllint saknas");
});

test("under 1 000 kr a year: the pay goes in 131 without avgifter; a board fee is also 023", () => {
  const s = slip("x", "Styrelse", 1970, "2026-11-25", [["1600", 80_000]], 24_000);
  (s.document.contributions as { category: ContributionCategory }).category = "below-annual-threshold";
  const b = agiBuild("2026-11", [s]);
  assert.deepEqual(b.people[0].boxes, { "001": 24_000, "011": 0, "012": 0, "013": 0, "023": 80_000, "131": 80_000 });
  assert.equal(b.totals.contributionsOre, 0);
  const fee = agiBuild("2026-11", [slip("y", "Ledamot", 1970, "2026-11-25", [["1600", 1_000_000]], 300_000)]).people[0];
  assert.deepEqual([fee.boxes["011"], fee.boxes["023"]], [1_000_000, 1_000_000]);
});

test("a negative box is refused with the reason; a payslip from another month is refused", () => {
  const b = agiBuild("2026-11", [slip("z", "Z", 1990, "2026-11-25", [["1010", 100_000], ["1710", -500_000]], 0)]);
  assert.match(b.problems.join(), /ruta 011 blir -4000 kr/);
  assert.throws(() => agiBuild("2026-10", [slip("z", "Z", 1990, "2026-11-25", [["1010", 100_000]], 0)]), /inte i 2026-10/);
});

test("identities and the schema files are the ones the rule book names", () => {
  assert.equal(agiIdentity("559000-0000"), "165590000000");
  assert.equal(agiIdentity("19820225-2386"), "198202252386");
  assert.throws(() => agiIdentity("123"));
  for (const [name, sha] of Object.entries(AGI_FORMAT.schemaFiles)) {
    assert.equal(createHash("sha256").update(readFileSync(join(SCHEMA_DIR, name))).digest("hex"), sha, name);
  }
});

test("the SQL test's month (supabase/tests/0040_authorities.sql) gives the same sums here as agi_build() there", () => {
  const slips = [
    slip("erik", "Erik Eriksson", 1992, "2026-11-25", [["1010", 3_200_050]], 645_000),
    slip("fatima", "Fatima Falk", 2004, "2026-11-25", [["1100", 3_000_000], ["1800", 150_000], ["1910", 50_000]], 540_000),
    slip("gustav", "Gustav Gran", 1950, "2026-11-25", [["1600", 1_000_000]], 300_000),
  ];
  const b = agiBuild("2026-11", slips);
  assert.equal(b.totals.contributionsOre, 1_831_900);
  assert.equal(b.totals.taxOre, 1_485_000);
  assert.deepEqual(b.totals.contributionRows, [
    { category: "full", ratePercent: 31.42, baseOre: 3_850_000, amountOre: 1_209_600 },
    { category: "young", ratePercent: 20.81, baseOre: 2_500_000, amountOre: 520_200 },
    { category: "older", ratePercent: 10.21, baseOre: 1_000_000, amountOre: 102_100 },
  ]);
  const fatima = b.people.find((p) => p.employeeId === "fatima");
  assert.deepEqual(fatima?.contributions, [
    { category: "young", ratePercent: 20.81, baseOre: 2_500_000 },
    { category: "full", ratePercent: 31.42, baseOre: 650_000 },
  ]);
  const repaid = agiBuild("2026-11", slips, [{ id: "r", employeeId: "erik", period: "2026-11", payslipId: "p-erik", amountOre: 600_000, reason: "För mycket" }]);
  assert.equal(repaid.totals.contributionsOre, 1_643_400);
  assert.equal(repaid.totals.taxOre, 1_485_000);
});

test("a run paid in the month that is approved but not closed stops the AGI, as agi_build() says it", () => {
  const b = agiBuild("2026-11", example15().map((x) => ({ ...x, document: { ...x.document, payDate: "2026-11-25" } as PayslipDocument })), [], [{ periodStart: "2026-11-01", payDate: "2026-11-25" }]);
  assert.deepEqual(b.problems, ["Körningen för november 2026 (lönedag 2026-11-25) är inte stängd; stäng den innan arbetsgivardeklarationen skapas."]);
  assert.deepEqual(agiBuild("2026-11", [], [], [{ periodStart: "2026-10-01", payDate: "2026-10-23" }]).problems, []);
});
