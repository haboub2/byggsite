/**
 * The standard löneartsregister as the SQL values that 0039_payroll.sql
 * seeds every organisation with (payroll_seed_org). The migration holds a
 * copy between the BEGIN/END markers; pay-items-sql.test.ts fails if it
 * drifts from DEFAULT_PAY_ITEMS. Regenerate the block with
 * `npx tsx -e 'console.log(require("./lib/core/payroll/pay-items-sql.ts").payItemsSqlValues())'`.
 */

import { DEFAULT_PAY_ITEMS } from "./pay-items.default";

export const PAY_ITEMS_BLOCK_BEGIN = "-- BEGIN pay items";
export const PAY_ITEMS_BLOCK_END = "-- END pay items";

const q = (s: string | null) => (s === null ? "null" : `'${s.replace(/'/g, "''")}'`);

/** One `(code, name, kind, taxable, tax_mode, avgift, semester, pension, agi_box, account, counter_account, fora)` row per item. */
export function payItemsSqlValues(): string {
  return DEFAULT_PAY_ITEMS.map((i) => {
    const f = i.flags;
    return `    (${[
      q(i.code),
      q(i.name),
      q(i.kind),
      f.taxable,
      q(f.taxMode),
      f.subjectToEmployerContribution,
      f.vacationPayBasis,
      f.pensionReportable,
      q(f.agiBox),
      q(f.account),
      q(f.counterAccount),
      q(f.foraCategory),
    ].join(", ")})`;
  }).join(",\n");
}

/** The block between the markers in a migration's text. */
export function payItemsBlock(sql: string): string {
  const from = sql.indexOf(PAY_ITEMS_BLOCK_BEGIN);
  const to = sql.indexOf(PAY_ITEMS_BLOCK_END);
  if (from < 0 || to < from) throw new Error("Markeringarna för lönearterna saknas i migrationen.");
  return sql.slice(sql.indexOf("\n", from) + 1, to).trimEnd();
}
