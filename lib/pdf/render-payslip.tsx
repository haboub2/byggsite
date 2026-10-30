import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { PayslipPdf } from "./PayslipPdf";
import { contractEmployer } from "./render-contract";
import { fileSafe } from "./invoice-file-name";
import { readPayslipPdf, type StoredPayslip } from "../core/payroll/run-store";

export type PayslipEmployer = Awaited<ReturnType<typeof contractEmployer>>;

/** The employer as the payslips name it (company settings and logo); read once per approval, not per payslip. */
export const payslipEmployer = (): Promise<PayslipEmployer> => contractEmployer();

/** The payslip as PDF bytes from its frozen document; pass the employer when rendering several. */
export async function renderPayslipPdf(slip: StoredPayslip, from?: PayslipEmployer): Promise<Buffer> {
  const { employer, logo } = from ?? (await contractEmployer());
  return renderToBuffer(<PayslipPdf doc={slip.document} number={slip.number} employer={employer} logo={logo} />);
}

/** Lonebesked-2026-11-Erik-Eriksson.pdf */
export const payslipFileName = (slip: StoredPayslip) => `Lonebesked-${slip.document.periodStart.slice(0, 7)}-${fileSafe(slip.document.employeeName, 40)}.pdf`;

/**
 * The frozen payslip PDF as the HTTP response the admin and /min-tid
 * routes give: the stored bytes checked against their hash, inline or as a
 * download, never cached.
 */
export async function payslipPdfResponse(slip: StoredPayslip, download: boolean): Promise<Response> {
  let pdf: Buffer;
  try {
    pdf = await readPayslipPdf(slip);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Kunde inte hämta PDF:en.", { status: 500 });
  }
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${payslipFileName(slip)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

