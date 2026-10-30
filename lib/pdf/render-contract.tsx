import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { EmploymentContractPdf } from "./EmploymentContractPdf";
import { contractContent, type ContractEmployer, type ContractInput } from "../core/hr/contract";
import { getOrgSettings } from "../core/org/settings-store";
import { getQuoteProfile } from "../quotes/profile-store";
import { currentOrgId } from "../core/org/current";

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

const fileSafe = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/** Anstallningsavtal-<person>-<date>.pdf */
export function contractFileName(fileTitle: string, employeeName: string, date: string): string {
  return `${[fileTitle, fileSafe(employeeName), date].filter(Boolean).join("-")}.pdf`;
}
