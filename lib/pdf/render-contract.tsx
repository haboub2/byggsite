import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { EmploymentContractPdf } from "./EmploymentContractPdf";
import { contractContent, type ContractEmployer, type ContractInput } from "../core/hr/contract";
import { getOrgSettings } from "../core/org/settings-store";
import { getQuoteProfile } from "../quotes/profile-store";
import { currentOrgId } from "../core/org/current";
import { fileSafe } from "./invoice-file-name";
import { readDocumentFile } from "../core/hr/store";
import type { EmploymentDocument } from "../core/hr/schema";

/** The employer as the contract names it: the organisation's company settings. */
export async function contractEmployer(): Promise<{ employer: ContractEmployer; logo: string | null }> {
  const org = await currentOrgId();
  const [settings, profile] = await Promise.all([getOrgSettings(org), getQuoteProfile(org).catch(() => null)]);
  const c = settings.company;
  return {
    employer: { name: c.legalName || profile?.brand || "Arbetsgivaren", orgNr: c.orgNr, street: c.street, postalCode: c.postalCode, city: c.city, signer: c.signer },
    logo: profile?.logo ?? null,
  };
}

/** The contract as PDF bytes and what it was made from. */
export async function renderContractPdf(input: ContractInput, logo: string | null) {
  const content = contractContent(input);
  const pdf = await renderToBuffer(
    <EmploymentContractPdf content={content} employerName={input.employer.name} employeeName={input.employee.name} logo={logo} madeOn={input.today} />
  );
  return { pdf, content };
}

/** Anstallningsavtal-<person>-<date>.pdf */
export function contractFileName(fileTitle: string, employeeName: string, date: string): string {
  return `${[fileTitle, fileSafe(employeeName, 40), date].filter(Boolean).join("-")}.pdf`;
}

/**
 * A frozen contract as the HTTP response both document routes give (admin
 * and /min-tid): the bytes checked against their hash, inline or as a
 * download, never cached.
 */
export async function contractPdfResponse(doc: EmploymentDocument, employeeName: string, download: boolean): Promise<Response> {
  let pdf: Buffer;
  try {
    pdf = await readDocumentFile(doc);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Kunde inte hämta PDF:en.", { status: 500 });
  }
  const name = contractFileName(doc.template === "contract-uppdrag" ? "Styrelseuppdrag" : "Anstallningsavtal", employeeName, doc.createdAt.slice(0, 10));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
