import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createElement } from "react";
import { payrollRulesAt } from "../core/rules/payroll";
import { DEFAULT_PAY_ITEMS } from "../core/payroll/pay-items.default";
import { assemblePayslip } from "../core/payroll/payslip";

/** @react-pdf is ESM only; see invoice-pdf.test.ts for why it is loaded this way. */
async function load() {
  const renderer = await import("@react-pdf/renderer");
  const require = createRequire(__filename);
  const path = require.resolve("@react-pdf/renderer");
  require.cache[path] ??= { id: path, filename: path, loaded: true, exports: renderer } as NodeJS.Module;
  return { renderToBuffer: renderer.renderToBuffer, ...(await import("./PayslipPdf")) };
}

test("a payslip renders to a one-page PDF", async () => {
  const { PayslipPdf, renderToBuffer } = await load();
  const doc = assemblePayslip({
    employee: { id: "e1", name: "Anna Lindqvist", birthYear: 1990 },
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    payDate: "2026-11-25",
    rules: payrollRulesAt("2026-11-25"),
    payItems: DEFAULT_PAY_ITEMS,
    lines: [
      { code: "1010", text: "Månadslön", quantity: 1, unit: "mån", unitPriceOre: 3_800_000, basisOre: null, ratePercent: null, amountOre: 3_800_000 },
      { code: "1421", text: "Sjukavdrag 2026-10-12–2026-10-13", quantity: 16, unit: "h", unitPriceOre: -21_923, basisOre: null, ratePercent: null, amountOre: -350_768 },
      { code: "1401", text: "Sjuklön 80 % 2026-10-12–2026-10-13", quantity: 16, unit: "h", unitPriceOre: 17_538, basisOre: 21_923, ratePercent: 80, amountOre: 280_608 },
      { code: "1411", text: "Karensavdrag 20 % av veckosjuklön", quantity: null, unit: null, unitPriceOre: null, basisOre: 701_520, ratePercent: 20, amountOre: -140_304 },
    ],
    tax: { kind: "table", tableNo: 33, columnNo: 1, adjustment: { mode: "percent", percent: 28, validTo: "2026-12-31" }, mainEmployer: true, source: "a-skattsedel" },
    taxTable: null,
    expectedAnnualPayOre: 45_600_000,
    hasRegularSalary: true,
  });
  doc.context = {
    timeFrom: "2026-10-01",
    timeTo: "2026-10-31",
    taxTableImportId: null,
    pnrMasked: "19900505-XXXX",
    group: "salaried",
    yearToDate: { cashGrossOre: 41_000_000, taxOre: 11_000_000 },
    vacation: { rule: "sammalon", remainingDays: 18, liabilityOre: 4_000_000, liabilityChangeOre: 10_000 },
    pension: { scheme: "itp1", premiumOre: 171_000 },
    correctionIds: [],
  };
  const pdf = await renderToBuffer(
    createElement(PayslipPdf, { doc, number: 12, employer: { name: "Binaafy AB", orgNr: "559123-4567", street: "Exempelgatan 1", postalCode: "411 01", city: "Göteborg" }, logo: null }) as Parameters<typeof renderToBuffer>[0]
  );
  if (process.env.PAYSLIP_PDF_OUT) writeFileSync(join(process.env.PAYSLIP_PDF_OUT, "lonebesked.pdf"), pdf);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const pages = (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
  assert.equal(pages, 1);
});
