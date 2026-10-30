import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createElement } from "react";
import type { CertificateContent } from "../core/payroll/certificate";

/** @react-pdf is ESM only; see invoice-pdf.test.ts for why it is loaded this way. */
async function load() {
  const renderer = await import("@react-pdf/renderer");
  const require = createRequire(__filename);
  const path = require.resolve("@react-pdf/renderer");
  require.cache[path] ??= { id: path, filename: path, loaded: true, exports: renderer } as NodeJS.Module;
  return { renderToBuffer: renderer.renderToBuffer, ...(await import("./EmployerCertificatePdf")), ...(await import("./YearSummaryPdf")) };
}
const pages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;

test("an arbetsgivarintyg with twelve months renders to a one-page PDF", async () => {
  const { EmployerCertificatePdf, renderToBuffer } = await load();
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: `${i < 1 ? 2025 : 2026}-${String(((i + 11) % 12) + 1).padStart(2, "0")}`,
    employedDays: 30,
    workedHours: 168,
    absenceHours: i === 9 ? 16 : 0,
    overtimeHours: i === 3 ? 6 : 0,
    hoursFromSchedule: true,
    absenceDays: i === 9 ? { sjuk: 2 } : {},
    payOre: 3_500_000,
  }));
  const content: CertificateContent = {
    employee: { id: "e", name: "Erik Eriksson", pnr: "19920630-1234" },
    employer: { name: "Binaafy AB", orgNr: "559123-4567", address: "Exempelgatan 1, 411 01 Göteborg", signer: "Ibrahim Al Haboub" },
    from: "2025-12-01",
    to: "2026-11-30",
    employments: [{ contractId: "c", form: "Tillsvidareanställning", title: "Snickare", startsOn: "2023-01-01", endsOn: "2026-11-30", payForm: "Månadslön", payOre: 3_500_000, payUnit: "mån", workingTimePercent: 100, weeklyHours: 40 }],
    months,
    totals: { workedHours: 2016, absenceHours: 16, overtimeHours: 6, payOre: 42_000_000 },
    reason: "arbetsbrist",
    reasonText: "Uppsagd 2026-10-31 med en månads uppsägningstid.",
    madeOn: "2026-11-30",
  };
  const pdf = await renderToBuffer(createElement(EmployerCertificatePdf, { content, logo: null }) as Parameters<typeof renderToBuffer>[0]);
  if (process.env.PAYSLIP_PDF_OUT) writeFileSync(join(process.env.PAYSLIP_PDF_OUT, "arbetsgivarintyg.pdf"), pdf);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal(pages(pdf), 1);
});

test("the årsbesked has one page per person", async () => {
  const { YearSummaryPdf, renderToBuffer } = await load();
  const row = (name: string) => ({ employeeId: name, name, pnrMasked: "19920630-XXXX", payslips: 12, cashGrossOre: 42_000_000, benefitOre: 0, taxFreeReimbursementOre: 120_000, taxOre: 9_800_000, netOre: 32_320_000, employerContributionOre: 13_196_400, firstPayDate: "2026-01-23", lastPayDate: "2026-12-23" });
  const pdf = await renderToBuffer(
    createElement(YearSummaryPdf, { year: 2026, rows: [row("Anna"), row("Bo")], employer: { name: "Binaafy AB", orgNr: "559123-4567", street: "Exempelgatan 1", postalCode: "411 01", city: "Göteborg" }, logo: null, madeOn: "2027-01-10" }) as Parameters<typeof renderToBuffer>[0]
  );
  if (process.env.PAYSLIP_PDF_OUT) writeFileSync(join(process.env.PAYSLIP_PDF_OUT, "arsbesked.pdf"), pdf);
  assert.equal(pages(pdf), 2);
});
