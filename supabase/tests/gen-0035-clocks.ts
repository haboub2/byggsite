/**
 * Writes the LAS clock cases into supabase/tests/0035_rls.sql, between the
 * BEGIN/END clock cases markers, with the TypeScript reference's answers
 * (lib/core/hr/clock-cases.ts). Run after changing the reference or the
 * cases: npx tsx supabase/tests/gen-0035-clocks.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { payrollRulesAt } from "../../lib/core/rules/payroll";
import { CLOCK_CASES_AS_OF, clockCasesSql, replaceClockBlock } from "../../lib/core/hr/clock-cases";

const file = join(__dirname, "0035_rls.sql");
const before = readFileSync(file, "utf8");
const after = replaceClockBlock(before, clockCasesSql(payrollRulesAt(CLOCK_CASES_AS_OF)));
writeFileSync(file, after);
console.log(before === after ? "0035_rls.sql är redan aktuell." : "0035_rls.sql uppdaterad.");
