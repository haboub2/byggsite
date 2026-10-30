import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { EmployerCertificatePdf } from "./EmployerCertificatePdf";
import { YearSummaryPdf, type YearSummaryPdfProps } from "./YearSummaryPdf";
import { contractEmployer } from "./render-contract";
import { fileSafe } from "./invoice-file-name";
import { readCertificatePdf, type EmployerCertificate } from "../core/payroll/authorities-store";
import type { CertificateContent } from "../core/payroll/certificate";

/** The employer as the intyg names it: company settings, the signer and the logo. */
export async function certificateEmployer(): Promise<{ employer: CertificateContent["employer"]; logo: string | null }> {
  const { employer, logo } = await contractEmployer();
  return {
    employer: { name: employer.name, orgNr: employer.orgNr, address: [employer.street, [employer.postalCode, employer.city].filter(Boolean).join(" ")].filter(Boolean).join(", "), signer: employer.signer },
    logo,
  };
}

export const renderCertificatePdf = (content: CertificateContent, logo: string | null): Promise<Buffer> => renderToBuffer(<EmployerCertificatePdf content={content} logo={logo} />);

export async function renderYearSummaryPdf(props: Omit<YearSummaryPdfProps, "employer" | "logo">): Promise<Buffer> {
  const { employer, logo } = await contractEmployer();
  return renderToBuffer(<YearSummaryPdf {...props} employer={employer} logo={logo} />);
}

/** The frozen intyg as the response both routes give (admin and /min-tid): checked against its hash, never cached. */
export async function certificatePdfResponse(c: EmployerCertificate, download: boolean): Promise<Response> {
  let pdf: Buffer;
  try {
    pdf = await readCertificatePdf(c);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Kunde inte hämta PDF:en.", { status: 500 });
  }
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="Arbetsgivarintyg-${fileSafe(c.content.employee.name, 40)}-${c.createdAt.slice(0, 10)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
