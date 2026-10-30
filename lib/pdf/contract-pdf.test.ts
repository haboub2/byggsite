import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createElement } from "react";
import { contractContent, type ContractInput } from "../core/hr/contract";
import type { EmploymentForm, EmploymentVersion } from "../core/hr/schema";
import { LOGO_DATA_URI } from "./logo";

/** @react-pdf is ESM only; see invoice-pdf.test.ts for why it is loaded this way. */
async function load() {
  const renderer = await import("@react-pdf/renderer");
  const require = createRequire(__filename);
  const path = require.resolve("@react-pdf/renderer");
  require.cache[path] ??= { id: path, filename: path, loaded: true, exports: renderer } as NodeJS.Module;
  return { renderToBuffer: renderer.renderToBuffer, ...(await import("./EmploymentContractPdf")) };
}

const version = (form: EmploymentForm): EmploymentVersion => ({
  id: "v1",
  employeeId: "e1",
  contractId: "v1",
  version: 1,
  form,
  payForm: form === "uppdrag" ? "fee" : form === "sava" || form === "vikariat" ? "hourly" : "monthly",
  monthlySalaryOre: 3_650_000,
  hourlyRateOre: 18_550,
  feeOre: 2_000_000,
  feePeriod: "year",
  decisionReference: "Årsstämma 2026-05-20, § 9",
  title: form === "uppdrag" ? "" : "Snickare",
  workplace: form === "vd" ? "Huvudkontoret, Göteborg" : "",
  workingTimePercent: 100,
  weeklyHours: 40,
  scheduleId: null,
  substituteFor: "Gustav Berg under föräldraledighet",
  probationEndsOn: "2027-04-30",
  startsOn: "2026-11-01",
  endsOn: form === "sava" ? "2026-11-30" : form === "vikariat" ? "2027-06-30" : form === "sasong" ? "2027-03-31" : null,
  noticeDays: form === "vd" ? 180 : null,
  payDay: 25,
  vacationRule: form === "uppdrag" ? "none" : form === "sava" || form === "vikariat" ? "procent" : "sammalon",
  vacationDays: form === "uppdrag" ? 0 : 25,
  vacationPercent: 13,
  atfHoursPerYear: form === "tillsvidare" ? 38 : 0,
  pensionScheme: form === "uppdrag" ? "none" : "saf-lo",
  terms: form === "vd" ? "Avgångsvederlag motsvarande sex månadslöner vid uppsägning från bolagets sida." : "",
  changeReason: "",
  validFrom: "2026-11-01",
  validTo: null,
  documentId: null,
  createdAt: "",
});

const input = (form: EmploymentForm): ContractInput => ({
  employer: { name: "Binaafy AB", orgNr: "559000-0000", street: "Uppstigen 130", postalCode: "412 80", city: "Göteborg", signer: "Ibrahim Al Haboub" },
  employee: { name: "Anna Lindqvist", street: "Bräckevägen 12", postalCode: "417 03", city: "Göteborg", agreement: form === "uppdrag" || form === "vd" ? "none" : "byggavtalet" },
  pnr12: "198504121230",
  employment: version(form),
  clocks: null,
  today: "2026-10-30",
});

const pages = (pdf: Buffer) => pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g)?.length ?? 0;

test("every form renders to a PDF of a few pages", async () => {
  const { EmploymentContractPdf, renderToBuffer } = await load();
  for (const form of ["tillsvidare", "provanstallning", "vikariat", "sava", "sasong", "vd", "uppdrag"] as const) {
    const content = contractContent(input(form));
    const pdf = await renderToBuffer(
      createElement(EmploymentContractPdf, { content, employerName: "Binaafy AB", employeeName: "Anna Lindqvist", logo: LOGO_DATA_URI, madeOn: "2026-10-30" }) as Parameters<typeof renderToBuffer>[0]
    );
    // CONTRACT_PDF_OUT=<dir> keeps the files for a look at the layout.
    if (process.env.CONTRACT_PDF_OUT) writeFileSync(join(process.env.CONTRACT_PDF_OUT, `${form}.pdf`), pdf);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-", form);
    const n = pages(pdf);
    assert.ok(n >= 1 && n <= 4, `${form}: ${n} pages`);
  }
});
