import "server-only";
import type { InvoiceDocument } from "../documents/invoice";
import type { Actor } from "../events";
import { addDays } from "../rules";
import { listClaims } from "../rot/store";
import { todayIso } from "../../quotes/schema";
import { formatOre } from "../money";
import { createCreditNote, createInvoice, deleteDraft, effectiveDocument, getInvoice, invoiceLabel, issueInvoice, listInvoices, supportsOffset } from "./store";

/**
 * Rätta belopp (docs/fakturering.md, läge 2026-10-22): an issued invoice
 * whose amounts are wrong is credited in full with a credit note that is
 * issued at once, and a new draft with the same customer, lines, references
 * and terms opens in the editor. The original and the credit note stay as
 * they are; the new invoice gets its own number when it is issued.
 *
 * A paid or part-paid invoice works the same way (0028): the draft is
 * marked with the original and the credit note, and when it is issued the
 * payment moves to it in the same transaction (issueInvoice, offset). The
 * new invoice then shows what is left to pay, or what to refund when it
 * came out lower than what was paid. An invoice in a ROT claim that has
 * gone to Skatteverket is stopped until the claim is withdrawn.
 */

/** Why `id` cannot be corrected this way, or null when it can. */
export async function amountCorrectionBlocker(id: string): Promise<string | null> {
  const inv = await getInvoice(id);
  if (!inv) return "Fakturan finns inte.";
  const label = invoiceLabel(inv);
  if (inv.kind === "credit") return "En kreditfaktura rättas inte så här.";
  if (inv.kind === "correction") return `${label} har inga egna belopp. Rätta faktura ${inv.document.references.precedingInvoiceNumber ?? ""} i stället.`;
  if (inv.status === "draft") return "Ett utkast ändras direkt.";
  if (inv.status === "void") return `${label} är makulerad.`;
  if (inv.status === "credited") return `${label} är redan krediterad.`;
  if (inv.document.se.rot) {
    const claim = (await listClaims()).find((c) => c.status !== "rejected" && c.items.some((i) => i.invoiceId === id));
    if (claim && (claim.status === "sent" || claim.status === "paid"))
      return `${label} finns i en ROT-begäran som redan skickats till Skatteverket. Begäran måste återkallas hos Skatteverket först.`;
    if (claim) return `${label} finns i ROT-begäran "${claim.name}". Ta bort fakturan ur begäran först.`;
  }
  if (inv.paidOre !== 0 && !(await supportsOffset()))
    return `${label} har betalningar (${formatOre(inv.paidOre, { decimals: 0, currency: true })}). Kvittningen kräver migration 0028, som inte är körd i databasen än.`;
  const credit = (await listInvoices({ customerId: inv.customerId ?? undefined })).find((x) => x.creditsInvoiceId === id);
  if (credit) return `${label} har redan en kreditfaktura (${credit.number ?? "utkast"}).`;
  return null;
}

/** The note line on the new draft. */
export function replacesLine(originalNumber: string, creditNumber: string): string {
  return `Ersätter faktura ${originalNumber}, krediterad med ${creditNumber}.`;
}

/**
 * Credit `id` in full (issued at once) and create the replacing draft.
 * `prepare` refreshes the credit note's seller block before it is frozen.
 */
export async function creditAndRedraft(
  id: string,
  actor: Actor,
  createdBy: string | null,
  prepare?: (doc: InvoiceDocument) => InvoiceDocument
): Promise<{ creditNumber: string; draftId: string }> {
  const blocked = await amountCorrectionBlocker(id);
  if (blocked) throw new Error(blocked);
  const inv = (await getInvoice(id))!;
  const base = await effectiveDocument(inv);

  const creditId = await createCreditNote(id, createdBy);
  let creditNumber: string;
  try {
    creditNumber = (await issueInvoice(creditId, actor, prepare)).number;
  } catch (err) {
    await deleteDraft(creditId).catch(() => {});
    throw err;
  }

  const today = todayIso();
  const line = replacesLine(inv.number ?? "", creditNumber);
  const note = base.note ? `${line}\n\n${base.note}`.slice(0, 2000) : line;
  const document: InvoiceDocument = {
    ...base,
    kind: "invoice",
    number: null,
    issueDate: today,
    dueDate: addDays(today, base.paymentMeans.termsDays),
    deliveryDate: base.deliveryDate,
    note,
    correctionNote: undefined,
    references: { ...base.references, precedingInvoiceNumber: null },
    paymentMeans: { ...base.paymentMeans, ocr: null },
  };
  // Before 0028 the draft is a plain invoice, as it was; the blocker has stopped paid originals then.
  const link = (await supportsOffset()) ? { replacesInvoiceId: inv.id, offsetFromCreditId: creditId } : {};
  const draftId = await createInvoice({ document, quoteId: inv.quoteId, projectId: inv.projectId, ...link }, createdBy);
  return { creditNumber, draftId };
}
