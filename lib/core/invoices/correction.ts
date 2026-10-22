import { z } from "zod";
import type { InvoiceDocument } from "../documents/invoice";

/**
 * Ändringsfaktura (docs/fakturering.md, läge 2026-10-22). An issued invoice
 * is never changed; a wrong name, address, reference, heading, text or line
 * description is corrected with a new invoice of kind "correction" that
 * repeats the whole content with the corrected details and refers to the
 * original's number (momslagen 17 kap. 22 §, Skatteverket 2024-06-11,
 * dnr 8-2900380). Amounts, VAT, ROT, terms and dates cannot change this way;
 * that is a credit note and a new invoice ("Rätta belopp").
 *
 * Pure functions, shared by the store, the form's live preview and the
 * tests. The database checks the same amount basis again in
 * issue_correction_invoice() (0025).
 */

const text = (max: number, label: string) => z.string().trim().max(max, `${label}: högst ${max} tecken.`);
const required = (max: number, label: string) => text(max, label).min(1, `${label} krävs.`);

/** What staff may change on an issued invoice. Everything else is kept from the invoice being corrected. */
export const correctionEditsSchema = z.object({
  buyer: z.object({
    name: required(120, "Kundens namn"),
    street: required(120, "Gatuadress"),
    postalCode: required(10, "Postnummer"),
    city: required(60, "Ort"),
    reference: text(80, "Er referens"),
  }),
  orderReference: text(80, "Ert ordernummer"),
  ourReference: text(80, "Vår referens"),
  title: text(160, "Rubrik"),
  note: text(2000, "Text"),
  lines: z.array(z.object({ id: z.string().min(1).max(40), description: required(400, "Benämning") })).max(200),
});
export type CorrectionEdits = z.infer<typeof correctionEditsSchema>;

/** The editable details of a document, as the form starts. */
export function correctionEditsOf(doc: InvoiceDocument): CorrectionEdits {
  return {
    buyer: { name: doc.buyer.name, street: doc.buyer.street, postalCode: doc.buyer.postalCode, city: doc.buyer.city, reference: doc.buyer.reference },
    orderReference: doc.references.orderReference ?? "",
    ourReference: doc.references.ourReference,
    title: doc.title,
    note: doc.note,
    lines: doc.lines.map((l) => ({ id: l.id, description: l.description })),
  };
}

/** `base` with the edits applied to the editable fields only. Unknown line ids are ignored. */
export function applyCorrectionEdits(base: InvoiceDocument, edits: CorrectionEdits): InvoiceDocument {
  const descriptions = new Map(edits.lines.map((l) => [l.id, l.description.trim()]));
  const orderReference = edits.orderReference.trim();
  const references = { ...base.references, ourReference: edits.ourReference.trim() };
  if (orderReference) references.orderReference = orderReference;
  else delete references.orderReference;
  return {
    ...base,
    title: edits.title.trim(),
    note: edits.note.trim(),
    buyer: {
      ...base.buyer,
      name: edits.buyer.name.trim(),
      street: edits.buyer.street.trim(),
      postalCode: edits.buyer.postalCode.trim(),
      city: edits.buyer.city.trim(),
      reference: edits.buyer.reference.trim(),
    },
    references,
    lines: base.lines.map((l) => ({ ...l, description: descriptions.get(l.id) || l.description })),
  };
}

const FIELDS: { label: string; get: (d: InvoiceDocument) => string }[] = [
  { label: "kundens namn", get: (d) => d.buyer.name },
  { label: "kundens gatuadress", get: (d) => d.buyer.street },
  { label: "kundens postnummer", get: (d) => d.buyer.postalCode },
  { label: "kundens ort", get: (d) => d.buyer.city },
  { label: "er referens", get: (d) => d.buyer.reference },
  { label: "ert ordernummer", get: (d) => d.references.orderReference ?? "" },
  { label: "vår referens", get: (d) => d.references.ourReference },
  { label: "rubriken", get: (d) => d.title },
  { label: "texten", get: (d) => d.note },
];

/** A value as quoted in the change text: one line, at most 80 characters. */
function quote(v: string): string {
  const one = v.replace(/\s+/g, " ").trim();
  if (!one) return "(tomt)";
  return `'${one.length > 80 ? `${one.slice(0, 79)}…` : one}'`;
}

/** Each changed detail, in reading order: "kundens namn från 'Anna Andersson' till 'Anna Anderson'". */
export function correctionChanges(before: InvoiceDocument, after: InvoiceDocument): string[] {
  const out: string[] = [];
  for (const f of FIELDS) {
    const a = f.get(before).trim();
    const b = f.get(after).trim();
    if (a !== b) out.push(`${f.label} från ${quote(a)} till ${quote(b)}`);
  }
  after.lines.forEach((line, i) => {
    const old = before.lines.find((l) => l.id === line.id);
    if (old && old.description.trim() !== line.description.trim()) out.push(`benämningen på rad ${i + 1} från ${quote(old.description)} till ${quote(line.description)}`);
  });
  return out;
}

const NOTE_MAX = 2000;

/**
 * The mandatory text on a change invoice: "Ändringsfaktura. Ersätter faktura
 * 10007. Ändrade uppgifter: kundens namn från 'X' till 'Y'." When the
 * original was corrected before, the earlier change invoice is named too.
 */
export function correctionNoteText(originalNumber: string, changes: string[], previousNumber?: string | null): string {
  const head = `Ändringsfaktura. Ersätter faktura ${originalNumber}${previousNumber ? ` och ändringsfaktura ${previousNumber}` : ""}. Ändrade uppgifter: `;
  const full = `${head}${changes.join("; ")}.`;
  if (full.length <= NOTE_MAX) return full;
  // Very many changed lines: keep what fits and say how many more.
  const kept: string[] = [];
  for (const c of changes) {
    const rest = changes.length - kept.length - 1;
    const candidate = `${head}${[...kept, c].join("; ")}; och ${rest} ändringar till.`;
    if (candidate.length > NOTE_MAX) break;
    kept.push(c);
  }
  return `${head}${kept.join("; ")}; och ${changes.length - kept.length} ändringar till.`;
}

/**
 * What decides the amounts and the tax. A change invoice must keep exactly
 * this; mirrors invoice_amount_basis() in 0025.
 */
export function amountBasis(doc: InvoiceDocument): string {
  return JSON.stringify({
    currency: doc.currency,
    dueDate: doc.dueDate,
    deliveryDate: doc.deliveryDate,
    period: doc.period,
    buyer: [doc.buyer.type, doc.buyer.orgNr, doc.buyer.vatNr],
    seller: [doc.seller.orgNr, doc.seller.vatNr],
    reverseCharge: doc.se.reverseCharge,
    rot: doc.se.rot ? [doc.se.rot.deductionOre, doc.se.rot.buyers.length] : null,
    lines: doc.lines.map((l) => [l.id, l.quantity, l.unitPriceOre, l.unit, l.vatCategory, l.vatRate, l.kind, l.changeOrderId]),
  });
}

export type CorrectionDraft = { document: InvoiceDocument; changes: string[] };

/**
 * The change invoice for `base` (the original, or its latest change invoice)
 * with `edits` applied, ready to be issued with the next number. Throws with
 * a Swedish message when nothing changed or the edits would touch amounts.
 */
export function correctionDocument(
  base: InvoiceDocument,
  edits: CorrectionEdits,
  input: { originalNumber: string; previousNumber?: string | null; issueDate: string }
): CorrectionDraft {
  const after = applyCorrectionEdits(base, edits);
  const changes = correctionChanges(base, after);
  if (changes.length === 0) throw new Error("Inga uppgifter är ändrade.");
  if (amountBasis(after) !== amountBasis(base)) throw new Error("En ändringsfaktura får inte ändra belopp, moms, ROT, villkor eller förfallodag. Använd Rätta belopp.");
  return {
    changes,
    document: {
      ...after,
      kind: "correction",
      number: null,
      issueDate: input.issueDate,
      correctionNote: correctionNoteText(input.originalNumber, changes, input.previousNumber),
      references: { ...after.references, precedingInvoiceNumber: input.originalNumber },
    },
  };
}
