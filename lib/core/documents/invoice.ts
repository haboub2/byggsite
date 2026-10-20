import { z } from "zod";

/**
 * The invoice document (docs/fakturering.md, grundkrav 3). One JSON object
 * shaped after EN 16931, the European e-invoice semantic model that Peppol
 * BIS Billing 3 implements. The PDF, the Peppol XML, the portal and the SIE
 * file are all rendered from this object, so they can never disagree.
 *
 * Field comments carry the EN 16931 business term (BT-n) or group (BG-n) so
 * a field can be looked up in the standard. Swedish additions that the
 * standard has no term for (ROT, F-skatt, OCR) live under `se`.
 *
 * Money is in öre (integers). Unit prices are net of VAT (BT-146), which is
 * how the standard, the ledger and a business customer think; a private
 * customer's incl.-VAT view is a rendering concern.
 */

export const DOCUMENT_SCHEMA_VERSION = 1;

export const CUSTOMER_TYPES = ["privat", "foretag", "byggforetag"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export const CUSTOMER_TYPE_LABEL: Record<CustomerType, string> = {
  privat: "Privatperson",
  foretag: "Företag",
  byggforetag: "Byggföretag (omvänd betalningsskyldighet)",
};

export const INVOICE_KINDS = ["invoice", "credit"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];
/** BT-3 invoice type code: 380 commercial invoice, 381 credit note. */
export const INVOICE_TYPE_CODE: Record<InvoiceKind, "380" | "381"> = { invoice: "380", credit: "381" };

export const VAT_CATEGORIES = ["S", "AE", "E"] as const;
export const VAT_RATES = [25, 12, 6, 0] as const;
export const LINE_KINDS = ["labor", "material", "other"] as const;
export type LineKind = (typeof LINE_KINDS)[number];
export const LINE_KIND_LABEL: Record<LineKind, string> = { labor: "Arbete", material: "Material", other: "Övrigt" };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum skrivs ÅÅÅÅ-MM-DD.");
const text = (max: number, label: string) => z.string().trim().max(max, `${label}: högst ${max} tecken.`);
const required = (max: number, label: string) => text(max, label).min(1, `${label} krävs.`);
const oreInt = z.number().int("Belopp anges i hela öre.").safe();

/** Swedish organisation number, 10 digits with optional dash: 559123-4567. */
export const ORG_NR = /^\d{6}-?\d{4}$/;
/** Swedish VAT number: SE + 12 digits (org nr + 01). */
export const VAT_NR = /^SE\d{12}$/;
/** Peppol participant id: ISO 6523 scheme code, colon, identifier (0007:5591234567, 0088:7300010000001). */
export const PEPPOL_ID = /^\d{4}:[A-Za-z0-9.\-]{1,50}$/;
/** Personal number, 10 or 12 digits with optional dash. */
export const PERSONAL_NUMBER = /^(\d{2})?\d{6}-?\d{4}$/;
/**
 * A personal number as stored once the database has encrypted it (0023):
 * birth date with century, last four hidden. The ciphertext travels next to
 * it in personalNumberSealed.
 */
export const MASKED_PERSONAL_NUMBER = /^\d{8}-XXXX$/;

/** BG-4 / BG-7: a party. */
export const partySchema = z.object({
  name: required(120, "Namn"),
  /** BT-30 / BT-47 legal registration identifier: organisationsnummer. */
  orgNr: text(13, "Organisationsnummer").refine((v) => v === "" || ORG_NR.test(v), "Organisationsnummer skrivs 559123-4567."),
  /** BT-31 / BT-48 VAT identifier. */
  vatNr: text(16, "Momsregistreringsnummer").refine((v) => v === "" || VAT_NR.test(v), "Momsregistreringsnummer skrivs SE559123456701."),
  street: text(120, "Gatuadress"),
  postalCode: text(10, "Postnummer"),
  city: text(60, "Ort"),
  /** BT-40 / BT-55 country code. */
  countryCode: z.string().length(2).default("SE"),
  email: z.union([z.literal(""), z.string().trim().email("Ange en giltig e-postadress.")]).default(""),
  phone: text(30, "Telefon").default(""),
});
export type Party = z.infer<typeof partySchema>;

/** The seller, with what the Swedish invoice prints besides the party. */
export const sellerSchema = partySchema.extend({
  /** "Godkänd för F-skatt". Not an EN 16931 term; printed on every Swedish B2B invoice. */
  fSkatt: z.boolean().default(true),
});
export type Seller = z.infer<typeof sellerSchema>;

export const buyerSchema = partySchema.extend({
  type: z.enum(CUSTOMER_TYPES),
  /** Our customer id (customers table), when the buyer is in the register. */
  customerId: z.string().uuid().nullable().default(null),
  /** BT-10 buyer reference: the person or order the buyer wants printed. */
  reference: text(80, "Er referens").default(""),
  /** BT-49 buyer electronic address for Peppol, "<scheme>:<id>", e.g. 0007:5591234567. Empty: derived from orgNr. */
  peppolId: text(60, "Peppol-id")
    .refine((v) => v === "" || PEPPOL_ID.test(v), "Peppol-id skrivs 0007:5591234567 (schema:id).")
    .optional(),
});
export type Buyer = z.infer<typeof buyerSchema>;

/** BG-25: one invoice line. */
export const invoiceLineSchema = z.object({
  /** BT-126 line identifier, unique within the document. */
  id: z.string().min(1).max(40),
  /** BT-153 item name / BT-154 description. */
  description: required(400, "Beskrivning"),
  /** BT-129 invoiced quantity. */
  quantity: z.number().finite().min(0, "Antal kan inte vara negativt.").max(1_000_000),
  /** BT-130 unit of measure, as the customer reads it: st, tim, m², lpm, dag, mån, kpl. */
  unit: text(8, "Enhet").default("st"),
  /** BT-146 item net price in öre, excl. VAT. */
  unitPriceOre: oreInt.min(0, "Pris kan inte vara negativt."),
  /** BT-151 VAT category code. */
  vatCategory: z.enum(VAT_CATEGORIES).default("S"),
  /** BT-152 VAT rate in percent. 0 for AE and E. */
  vatRate: z.number().refine((v) => (VAT_RATES as readonly number[]).includes(v), "Moms: 25, 12, 6 eller 0 %."),
  /** Labour qualifies for ROT; material and other never do. */
  kind: z.enum(LINE_KINDS).default("other"),
  /** Optional grouping heading on the PDF ("Rivning", "Tätskikt"). */
  section: text(80, "Moment").default(""),
  /** Set when the line is an approved change order (ÄTA) put on the final invoice. */
  changeOrderId: z.string().uuid().nullable().default(null),
});
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

/** A person sharing the ROT deduction. Name on the invoice, personal number only masked. */
export const rotBuyerSchema = z.object({
  name: text(120, "Namn"),
  /**
   * May be empty on a draft (copied from a quote); required to issue. Written
   * in plain text; the database replaces it with ÅÅÅÅMMDD-XXXX on save
   * (0023), so a stored document only ever holds the masked form.
   */
  personalNumber: z
    .string()
    .trim()
    .max(13)
    .refine((v) => v === "" || PERSONAL_NUMBER.test(v) || MASKED_PERSONAL_NUMBER.test(v), "Personnummer skrivs ÅÅMMDD-XXXX."),
  /** The encrypted personal number (pgcrypto, key in Supabase Vault), set by the database. Opened only for owner/admin. */
  personalNumberSealed: z.string().max(500).optional(),
  /**
   * ROT room this person has left this year, öre, as stated by the customer.
   * Null means "assume the full cap". We can never verify this; Skatteverket
   * does not expose it.
   */
  roomOre: oreInt.min(0).nullable().default(null),
});
export type RotBuyer = z.infer<typeof rotBuyerSchema>;

/** Where the work was done, as Skatteverket wants it on the claim. */
export const rotPropertySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fastighet"), designation: required(80, "Fastighetsbeteckning") }),
  z.object({
    kind: z.literal("brf"),
    orgNr: z.string().trim().regex(ORG_NR, "Föreningens organisationsnummer skrivs 769612-3456."),
    apartmentNumber: required(10, "Lägenhetsnummer"),
  }),
]);
export type RotProperty = z.infer<typeof rotPropertySchema>;

export const rotSchema = z.object({
  buyers: z.array(rotBuyerSchema).min(1, "Minst en köpare.").max(4, "Högst fyra köpare."),
  /** Null on a draft until filled in; required to issue. */
  property: rotPropertySchema.nullable().default(null),
  /**
   * Override of the computed deduction, öre. Used on part invoices when the
   * payment plan decides the labour share, or when the customer's remaining
   * room is known to be lower. Null: compute from the lines and the rules.
   */
  deductionOre: oreInt.min(0).nullable().default(null),
});
export type Rot = z.infer<typeof rotSchema>;

export const referencesSchema = z.object({
  /** Our quote number the invoice is based on ("Enligt offert 1042"). */
  quoteNumber: z.number().int().nullable().default(null),
  projectId: z.string().uuid().nullable().default(null),
  /** Payment plan step, "steg 2 av 3". */
  planStep: z.object({ step: z.number().int().min(1), of: z.number().int().min(1) }).nullable().default(null),
  /** BT-25 preceding invoice number, required on a credit note. */
  precedingInvoiceNumber: z.string().nullable().default(null),
  /** BT-10 is on the buyer; this is our contact (BT-34 seller contact). */
  ourReference: text(80, "Vår referens").default(""),
});

/** BG-16 payment instructions. The seller's accounts live here, not on the party, so a template can swap them. */
export const paymentMeansSchema = z.object({
  bankgiro: text(12, "Bankgiro").default(""),
  plusgiro: text(12, "Plusgiro").default(""),
  iban: text(34, "IBAN").default(""),
  bic: text(11, "BIC").default(""),
  swish: text(15, "Swish-nummer").default(""),
  /** BT-83 remittance information: the OCR number. Set at issue. */
  ocr: z.string().regex(/^\d+$/).nullable().default(null),
  /** BT-20 payment terms as printed ("14 dagar netto"). */
  termsText: text(200, "Betalningsvillkor").default(""),
  /** Payment terms in days, used to derive dueDate from issueDate. */
  termsDays: z.number().int().min(0).max(120).default(30),
});

export const invoiceDocumentSchema = z.object({
  schemaVersion: z.literal(DOCUMENT_SCHEMA_VERSION).default(DOCUMENT_SCHEMA_VERSION),
  kind: z.enum(INVOICE_KINDS).default("invoice"),
  /** Number series, e.g. "F". The number is null until the document is issued. */
  series: z.string().min(1).max(10).default("F"),
  /** BT-1 invoice number, assigned at issue, never before. */
  number: z.string().nullable().default(null),
  /** BT-5 currency. Only SEK for now; the field exists so the ledger never has to guess. */
  currency: z.literal("SEK").default("SEK"),
  /** BT-2 issue date. */
  issueDate: isoDate,
  /** BT-9 payment due date. */
  dueDate: isoDate,
  /** BT-72 actual delivery date, when it differs from the issue date (momslagen 11 kap. 8 § 7). */
  deliveryDate: isoDate.nullable().default(null),
  /** BG-14 invoicing period, for work over a period. */
  period: z.object({ start: isoDate, end: isoDate }).nullable().default(null),
  /** Heading on the PDF ("Badrumsrenovering, Bräckevägen 12"). */
  title: text(160, "Rubrik").default(""),
  /** BT-22 invoice note: the free text under the heading. */
  note: text(2000, "Text").default(""),
  references: referencesSchema.default({}),
  seller: sellerSchema,
  buyer: buyerSchema,
  lines: z.array(invoiceLineSchema).max(200, "Högst 200 rader."),
  paymentMeans: paymentMeansSchema.default({}),
  se: z
    .object({
      /** Reverse charge for building services. Decided by the buyer type; stored so the document stands alone. */
      reverseCharge: z.boolean().default(false),
      /** ROT deduction; null when it does not apply. */
      rot: rotSchema.nullable().default(null),
      /** Late-interest clause as printed. */
      lateInterestText: text(200, "Dröjsmålsränta").default(""),
    })
    .default({}),
});
export type InvoiceDocument = z.infer<typeof invoiceDocumentSchema>;

/** Whether a line's VAT is charged by the seller (S) or not (AE, E). */
export function lineChargesVat(line: Pick<InvoiceLine, "vatCategory">): boolean {
  return line.vatCategory === "S";
}

/** True when the buyer type means the invoice is issued under reverse charge. */
export function reverseChargeFor(type: CustomerType): boolean {
  return type === "byggforetag";
}

/** Private customers read prices incl. VAT; businesses excl. */
export function showsInclVat(buyer: Pick<Buyer, "type">): boolean {
  return buyer.type === "privat";
}

/**
 * What must be true before a document can be issued. Drafts may be
 * incomplete; this is the gate. Returns Swedish messages, empty when valid.
 * Covers momslagen's required content and the Swedish practice around it.
 */
export function validateForIssue(doc: InvoiceDocument): string[] {
  const errors: string[] = [];
  if (doc.number !== null) errors.push("Dokumentet har redan ett nummer.");
  if (doc.lines.length === 0) errors.push("Fakturan måste ha minst en rad.");
  if (doc.dueDate < doc.issueDate) errors.push("Förfallodatum kan inte vara före fakturadatum.");
  if (!doc.seller.orgNr) errors.push("Säljarens organisationsnummer saknas.");
  if (!doc.seller.vatNr) errors.push("Säljarens momsregistreringsnummer saknas (momslagen).");
  if (!doc.seller.street || !doc.seller.postalCode || !doc.seller.city) errors.push("Säljarens adress är ofullständig.");
  if (!doc.buyer.street || !doc.buyer.postalCode || !doc.buyer.city) errors.push("Köparens adress är ofullständig (momslagen kräver namn och adress).");
  if (!doc.paymentMeans.bankgiro && !doc.paymentMeans.plusgiro && !doc.paymentMeans.iban && !doc.paymentMeans.swish)
    errors.push("Ange minst ett sätt att betala (bankgiro, plusgiro, IBAN eller Swish).");

  const ids = new Set<string>();
  for (const line of doc.lines) {
    if (ids.has(line.id)) errors.push(`Rad-id "${line.id}" förekommer två gånger.`);
    ids.add(line.id);
    if (line.vatCategory === "S" && line.vatRate === 0 && doc.buyer.type !== "byggforetag")
      errors.push(`Raden "${line.description}": 0 % moms kräver kategori E (undantagen) eller AE (omvänd).`);
    if (line.vatCategory !== "S" && line.vatRate !== 0) errors.push(`Raden "${line.description}": omvänd eller undantagen moms har satsen 0 %.`);
  }

  if (doc.se.reverseCharge) {
    if (doc.buyer.type !== "byggforetag") errors.push("Omvänd betalningsskyldighet gäller bara byggföretag.");
    if (!doc.buyer.vatNr) errors.push("Omvänd betalningsskyldighet kräver köparens momsregistreringsnummer.");
    if (doc.lines.some((l) => l.vatCategory === "S" && l.vatRate > 0 && l.kind !== "material"))
      errors.push("Vid omvänd betalningsskyldighet får bara ren varuförsäljning ha vanlig moms.");
  } else if (doc.buyer.type === "byggforetag") {
    errors.push("Byggföretag faktureras med omvänd betalningsskyldighet.");
  }

  if (doc.se.rot) {
    if (doc.buyer.type !== "privat") errors.push("ROT gäller bara privatpersoner.");
    if (!doc.lines.some((l) => l.kind === "labor")) errors.push("ROT kräver minst en arbetsrad.");
    if (!doc.se.rot.property) errors.push("ROT kräver fastighetsbeteckning, eller bostadsrättsföreningens organisationsnummer och lägenhetsnummer.");
    for (const b of doc.se.rot.buyers) {
      if (!b.name) errors.push("Varje ROT-köpare behöver ett namn.");
      if (!hasRotPersonalNumber(b)) errors.push(`Personnummer saknas eller är fel för ${b.name || "en köpare"}.`);
    }
  }

  if (doc.kind === "credit") {
    if (!doc.references.precedingInvoiceNumber) errors.push("En kreditfaktura måste hänvisa till fakturan den krediterar.");
  }
  return errors;
}

/** A buyer's personal number is there: in plain text, or masked with its ciphertext. */
export function hasRotPersonalNumber(b: Pick<RotBuyer, "personalNumber" | "personalNumberSealed">): boolean {
  return PERSONAL_NUMBER.test(b.personalNumber) || (MASKED_PERSONAL_NUMBER.test(b.personalNumber) && !!b.personalNumberSealed);
}

/** A new draft with sensible defaults for one seller and buyer. */
export function newInvoiceDocument(input: {
  issueDate: string;
  seller: Seller;
  buyer: Buyer;
  paymentMeans?: Partial<z.input<typeof paymentMeansSchema>>;
  series?: string;
}): InvoiceDocument {
  const buyer = buyerSchema.parse(input.buyer);
  const paymentMeans = paymentMeansSchema.parse(input.paymentMeans ?? {});
  const due = new Date(`${input.issueDate}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + paymentMeans.termsDays);
  return invoiceDocumentSchema.parse({
    issueDate: input.issueDate,
    dueDate: due.toISOString().slice(0, 10),
    series: input.series ?? "F",
    seller: input.seller,
    buyer,
    lines: [],
    paymentMeans: { ...paymentMeans, termsText: paymentMeans.termsText || `${paymentMeans.termsDays} dagar netto` },
    se: { reverseCharge: reverseChargeFor(buyer.type), rot: null },
  });
}

/** The line as it should be for this buyer: AE and 0 % under reverse charge unless it is plain goods. */
export function lineForBuyer(line: InvoiceLine, buyer: Pick<Buyer, "type">, keepVatOnGoods = false): InvoiceLine {
  if (!reverseChargeFor(buyer.type)) return line.vatCategory === "AE" ? { ...line, vatCategory: "S", vatRate: 25 } : line;
  if (keepVatOnGoods && line.kind === "material") return line;
  return { ...line, vatCategory: "AE", vatRate: 0 };
}
