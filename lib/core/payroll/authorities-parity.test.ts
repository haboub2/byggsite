import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { payrollRulesAt } from "../rules/payroll";
import { AGI_FORMAT } from "../rules/agi-format";

const read = (file: string) => readFileSync(join(__dirname, "..", "..", "..", "supabase", "migrations", file), "utf8");
const migration = read("0040_authorities.sql");
const fixes = read("0041_authorities_fixes.sql");
const selected = (fn: string, sql = migration) => {
  const m = new RegExp(`function public\\.${fn}\\([\\s\\S]*?as \\$\\$ select (.+?) \\$\\$`).exec(sql);
  assert.ok(m, `${fn}() not found`);
  return m[1].split(",").map((s) => s.trim().replace(/::\w+$/, "").replace(/^'(.*)'$/, "$1"));
};

test("agi_rules() in 0040 has the rule book's young cap, schema version and växa-stöd figures", () => {
  const r = payrollRulesAt("2026-11-01");
  assert.ok(r.employerContributions.young);
  const [cap, schema, keepBp, vaxaCap] = selected("agi_rules");
  assert.equal(Number(cap), r.employerContributions.young.capPerMonthOre);
  assert.equal(schema, AGI_FORMAT.schemaVersion);
  assert.equal(Number(keepBp), Math.round((r.employerContributions.fullPercent - r.vaxaStod.percentWithinCap) * 100));
  assert.equal(Number(vaxaCap), r.vaxaStod.capPerMonthOre);
});

test("vaxa_rules() in 0041 has both caps, the cut-off, the refund and the months the rule book and vaxa-stod.ts use", () => {
  const v = payrollRulesAt("2026-11-01").vaxaStod;
  const c = payrollRulesAt("2026-11-01").employerContributions;
  const [cap, earlier, until, keepBp, months] = selected("vaxa_rules", fixes).map((x) => x.replace(/^date '(.*)'$/, "$1"));
  assert.deepEqual([Number(cap), Number(earlier), until, Number(keepBp), Number(months)], [v.capPerMonthOre, v.capPerMonthEarlierOre, "2024-04-30", Math.round((c.fullPercent - v.percentWithinCap) * 100), v.months]);
});

test("vacation_save_rules() in 0040 has semesterlagen 18 § as the rule book does", () => {
  const v = payrollRulesAt("2026-11-01").vacation;
  assert.deepEqual(selected("vacation_save_rules").map(Number), [v.minDaysTakenPerYear, v.maxSavedYears]);
});
