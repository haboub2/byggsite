import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { payrollRulesAt } from "../rules/payroll";
import { AGI_FORMAT } from "../rules/agi-format";

const migration = readFileSync(join(__dirname, "..", "..", "..", "supabase", "migrations", "0040_authorities.sql"), "utf8");
const selected = (fn: string) => {
  const m = new RegExp(`function public\\.${fn}\\([\\s\\S]*?as \\$\\$ select (.+?) \\$\\$`).exec(migration);
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
  // The earlier cap is written into vaxa_stod_claim_store() itself.
  assert.match(migration, new RegExp(`least\\(\\(x->>'baseOre'\\)::bigint / 100 \\* 100, ${r.vaxaStod.capPerMonthEarlierOre}\\)`));
});

test("vacation_save_rules() in 0040 has semesterlagen 18 § as the rule book does", () => {
  const v = payrollRulesAt("2026-11-01").vacation;
  assert.deepEqual(selected("vacation_save_rules").map(Number), [v.minDaysTakenPerYear, v.maxSavedYears]);
});
