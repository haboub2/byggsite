import { checkAdmin } from "@/lib/admin";
import { renderRotClaimXml, rotClaimFileName } from "@/lib/core/rot/claim-xml";
import { claimToXmlWithInvoices, getClaim, openClaimPersonalNumbers, PersonalNumberAccessError } from "@/lib/core/rot/store";
import { todayIso } from "@/lib/quotes/schema";

/**
 * The claim as the XML file Skatteverket's e-service imports. The personal
 * numbers are opened here and nowhere else in the claim flow, so the file is
 * for owner/admin only; the database refuses anyone else (rot_buyer_pnr, 0023).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await checkAdmin();
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });
  const { id } = await params;
  const claim = await getClaim(id);
  if (!claim) return new Response("Begäran finns inte.", { status: 404 });
  let xml: string;
  try {
    const personalNumbers = await openClaimPersonalNumbers(claim);
    xml = renderRotClaimXml(await claimToXmlWithInvoices(claim, todayIso(), personalNumbers));
  } catch (err) {
    if (err instanceof PersonalNumberAccessError) return new Response("Filen innehåller personnummer och laddas ner av en ägare eller administratör.", { status: 403 });
    return new Response(err instanceof Error ? err.message : "Filen kunde inte skapas.", { status: 422 });
  }
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${rotClaimFileName(claim.name, todayIso())}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
