import { z } from "zod";
import { MASKED_PERSONAL_NUMBER, PERSONAL_NUMBER } from "../core/documents/invoice";

/**
 * A quote ("offert") written from /admin and sent to a customer as a PDF.
 * Shared by the editor (client) and the store (server), so both validate
 * the same way. Money is in kronor; whether a unit price includes VAT is
 * decided per quote (pricesInclVat) — see lib/quotes/math.ts.
 */

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Utkast",
  sent: "Skickad",
  accepted: "Accepterad",
  declined: "Avböjd",
};

/**
 * What kind of price the quote states (konsumenttjänstlagen 36–37 §§). A
 * consumer must be able to see which: a fast pris is what is invoiced; an
 * ungefärlig prisuppgift may be exceeded by at most 15 % (36 § 2 st), apart
 * from ÄTA the customer approved; löpande räkning is invoiced on actual time
 * and the figure on the quote is an estimate. The invoice issue step checks
 * invoices against this (app/admin/invoice-actions.ts).
 */
export const PRICE_TYPES = ["fast", "ungefarlig", "lopande"] as const;
export type PriceType = (typeof PRICE_TYPES)[number];
export const PRICE_TYPE_LABEL: Record<PriceType, string> = {
  fast: "Fast pris",
  ungefarlig: "Ungefärligt pris",
  lopande: "Löpande räkning",
};
/** Konsumenttjänstlagen 36 § 2 st: an approximate price may be exceeded by at most 15 %. */
export const KTJL_APPROX_TOLERANCE = 0.15;

/** The standard contract the quote refers to, printed under Villkor. */
export const STANDARD_TERMS = ["none", "hantverkarformularet17", "abs18", "ab04", "abt06"] as const;
export type StandardTerms = (typeof STANDARD_TERMS)[number];
export const STANDARD_TERMS_LABEL: Record<StandardTerms, string> = {
  none: "Inga standardvillkor",
  hantverkarformularet17: "Hantverkarformuläret 17 (konsument)",
  abs18: "ABS 18 (konsument, småhus)",
  ab04: "AB 04 (företag, utförandeentreprenad)",
  abt06: "ABT 06 (företag, totalentreprenad)",
};
export const STANDARD_TERMS_TEXT: Record<Exclude<StandardTerms, "none">, string> = {
  hantverkarformularet17: "För uppdraget gäller Hantverkarformuläret 17 med Konsumentverkets och branschens allmänna bestämmelser, utöver vad som sägs i denna offert. Konsumenttjänstlagen gäller alltid till er förmån.",
  abs18: "För uppdraget gäller Allmänna bestämmelser för småhusentreprenader, ABS 18, utöver vad som sägs i denna offert. Konsumenttjänstlagen gäller alltid till er förmån.",
  ab04: "För entreprenaden gäller Allmänna bestämmelser för byggnads-, anläggnings- och installationsentreprenader, AB 04, utöver vad som sägs i denna offert.",
  abt06: "För entreprenaden gäller Allmänna bestämmelser för totalentreprenader, ABT 06, utöver vad som sägs i denna offert.",
};

/** Distansavtalslagen 2 kap. 10 §: the consumer's ångerfrist in days. */
export const WITHDRAWAL_DAYS = 14;

export type QuoteDivision = "bygg" | "01";
export const QUOTE_DIVISION_LABEL: Record<QuoteDivision, string> = { bygg: "Bygg", "01": "Software" };

export const VAT_RATES = [25, 12, 6, 0] as const;
export const ITEM_KINDS = ["labor", "material", "other"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  labor: "Arbete",
  material: "Material",
  other: "Övrigt",
};
export const UNITS = ["st", "tim", "m²", "lpm", "liter", "dag", "mån", "kpl"] as const;

const text = (max: number, label: string) =>
  z.string().trim().min(1, `${label} krävs.`).max(max, `${label}: högst ${max} tecken.`);
const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label}: högst ${max} tecken.`);

const amount = z.coerce
  .number({ message: "Belopp måste vara ett tal." })
  .min(0, "Belopp kan inte vara negativt.")
  .max(50_000_000, "Belopp: högst 50 000 000 kr.");

export const quoteItemSchema = z.object({
  id: z.string().min(1).max(40),
  description: optionalText(400, "Beskrivning"),
  qty: z.coerce.number({ message: "Antal måste vara ett tal." }).min(0, "Antal kan inte vara negativt.").max(100_000),
  unit: optionalText(8, "Enhet"),
  unitPrice: amount,
  vatRate: z.coerce.number().refine((v) => (VAT_RATES as readonly number[]).includes(v), "Moms: 25, 12, 6 eller 0 %."),
  kind: z.enum(ITEM_KINDS),
  /** Work step the row belongs to, e.g. "Rivning". Rows with the same step are grouped on the PDF; empty groups by kind. */
  section: optionalText(60, "Moment"),
});
export type QuoteItem = z.infer<typeof quoteItemSchema>;

export const customerSchema = z.object({
  type: z.enum(["privat", "foretag"]),
  name: text(80, "Namn"),
  company: optionalText(80, "Företag"),
  orgNr: optionalText(13, "Organisationsnummer"),
  email: z.union([z.literal(""), z.string().trim().email("Ange en giltig e-postadress.")]),
  phone: optionalText(20, "Telefon"),
  street: optionalText(80, "Gatuadress"),
  postalCode: optionalText(7, "Postnummer"),
  city: optionalText(40, "Ort"),
  /** The customer's own reference / contact person (B2B). */
  reference: optionalText(60, "Er referens"),
});
export type QuoteCustomer = z.infer<typeof customerSchema>;

export const rotPersonSchema = z
  .object({
    name: optionalText(80, "Namn"),
    /**
     * Typed in plain text; the database replaces it with ÅÅÅÅMMDD-XXXX on
     * save (0024), the same way as on the invoice (0023). Demo mode keeps
     * plain text, so the PDF masks it as well.
     */
    personalNumber: optionalText(13, "Personnummer").refine(
      (v) => v === "" || PERSONAL_NUMBER.test(v) || MASKED_PERSONAL_NUMBER.test(v),
      "Personnummer skrivs ÅÅMMDD-XXXX."
    ),
    /** The encrypted personal number, set by the database and copied as is to the invoice. */
    personalNumberSealed: z.string().max(500).optional(),
  })
  .refine((p) => !MASKED_PERSONAL_NUMBER.test(p.personalNumber) || !!p.personalNumberSealed, {
    message: "Skriv hela personnumret igen.",
    path: ["personalNumber"],
  });
export type RotPerson = z.infer<typeof rotPersonSchema>;

export const termsSchema = z.object({
  payment: optionalText(600, "Betalningsvillkor"),
  start: optionalText(300, "Start och leverans"),
  warranty: optionalText(600, "Garanti"),
  excluded: optionalText(1200, "Ingår inte"),
  notes: optionalText(1500, "Övrigt"),
});
export type QuoteTerms = z.infer<typeof termsSchema>;

export const quoteSchema = z.object({
  division: z.enum(["bygg", "01"]),
  title: text(120, "Rubrik"),
  intro: optionalText(2000, "Inledning"),
  customer: customerSchema,
  items: z.array(quoteItemSchema).max(80, "Högst 80 rader."),
  /** True when the prices typed in are incl. VAT (natural for private customers). */
  pricesInclVat: z.boolean(),
  /** Tax deduction shown on the quote (private customers, Bygg only). */
  rot: z.boolean(),
  /** Which deduction `rot` turns on: ROT (30 %) or RUT (50 %). */
  deductionType: z.enum(["rot", "rut"]),
  /** Optional parts of the PDF. Terms left empty are left out as well. */
  show: z.object({ process: z.boolean(), band: z.boolean() }),
  /** Who shares the deduction (1–4 people). Name and personal number are optional until the quote is accepted. */
  rotPersons: z.array(rotPersonSchema).max(4, "Högst fyra personer."),
  validDays: z.coerce.number().int().min(1, "Minst 1 dag.").max(365, "Högst 365 dagar."),
  /** Payment terms in days, printed as "30 dagar". */
  paymentDays: z.coerce.number().int().min(0, "Minst 0 dagar.").max(120, "Högst 120 dagar."),
  /** Fast pris, ungefärligt pris or löpande räkning (konsumenttjänstlagen 36 §). */
  priceType: z.enum(PRICE_TYPES),
  /** Standard contract referred to under Villkor. */
  standardTerms: z.enum(STANDARD_TERMS),
  terms: termsSchema,
  /** Date on the document; defaults to when it was created. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum skrivs 2026-10-15."),
  leadId: z.string().nullable(),
  /** Cover photo, a slot from lib/images.ts: "" picks one from the title, "none" leaves it out (lib/quotes/cover.ts). */
  cover: z.string().trim().max(40),
});
export type QuoteData = z.infer<typeof quoteSchema>;

/**
 * How the quote was accepted (0046): when, by whom it was recorded, the
 * hash of the data accepted (the sent version), and whether a consumer
 * expressly asked for the work to start during the ångerfrist
 * (distansavtalslagen 2 kap. 11 § 1 st 2, 15 §).
 */
export type QuoteAcceptance = {
  at: string;
  by: string;
  hash: string;
  earlyStart: boolean;
};

/** A stored quote: the document plus what the list needs. */
export type Quote = {
  id: string;
  /** The organisation the quote belongs to (0014); null in demo mode. */
  orgId: string | null;
  number: number;
  status: QuoteStatus;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  /** sha256 of `data` as it was when the quote was sent; what the customer has (0046). */
  sent_hash: string | null;
  acceptance: QuoteAcceptance | null;
  created_by: string | null;
  data: QuoteData;
};

/**
 * Why the quote cannot be accepted today, or null. Avtalslagen 2–3 §§: an
 * acceptance after the acceptfrist is a new offer, so an expired quote gets
 * a new version instead. A consumer's quote must have gone out (with the
 * ångerrätt information in it) before an acceptance is recorded.
 */
export function acceptanceProblem(q: Pick<Quote, "status" | "sent_at" | "data">, today: string): string | null {
  if (q.status === "accepted") return "Offerten är redan accepterad.";
  if (q.status === "draft") return "Offerten är ett utkast. Markera den som skickad först, så att kunden har fått just den versionen.";
  const until = validUntilIso(q.data.date, q.data.validDays);
  if (today > until) return `Offerten gick ut ${until}. Duplicera den till ett nytt utkast med nytt datum i stället.`;
  if (q.data.customer.type === "privat" && !q.sent_at) return "Offerten till en privatperson måste vara skickad (med ångerrättsinformationen) innan den accepteras.";
  return null;
}

/** Valid-until date, same rule as lib/quotes/math.ts validUntil (kept here so the schema has no import cycle). */
export function validUntilIso(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type QuoteTemplateRecord = {
  id: string;
  name: string;
  division: QuoteDivision;
  created_at: string;
  data: QuoteData;
};

export const emptyCustomer: QuoteCustomer = {
  type: "privat",
  name: "",
  company: "",
  orgNr: "",
  email: "",
  phone: "",
  street: "",
  postalCode: "",
  city: "",
  reference: "",
};

export const emptyTerms: QuoteTerms = { payment: "", start: "", warranty: "", excluded: "", notes: "" };

/** A stored document with any fields added since it was saved filled in, so
 *  older rows keep working when the schema grows. */
export function withQuoteDefaults(raw: QuoteData): QuoteData {
  const r = raw as Partial<QuoteData> & { rotOwners?: number };
  return {
    ...raw,
    intro: r.intro ?? "",
    customer: { ...emptyCustomer, ...(r.customer ?? {}) },
    items: (r.items ?? []).map((i) => ({ ...i, section: i.section ?? "" })),
    pricesInclVat: r.pricesInclVat ?? true,
    rot: r.rot ?? false,
    deductionType: r.deductionType ?? "rot",
    show: { process: true, band: true, ...(r.show ?? {}) },
    rotPersons: r.rotPersons ?? Array.from({ length: r.rotOwners ?? 0 }, () => ({ name: "", personalNumber: "" })),
    validDays: r.validDays ?? 30,
    paymentDays: r.paymentDays ?? 30,
    priceType: r.priceType ?? "fast",
    standardTerms: r.standardTerms ?? "none",
    terms: { ...emptyTerms, ...(r.terms ?? {}) },
    leadId: r.leadId ?? null,
    cover: r.cover ?? "",
  };
}

export function newItemId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Today's date in Swedish time as YYYY-MM-DD. */
export function todayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(now);
}

export function quoteLabel(q: { number: number }): string {
  return `Offert ${q.number}`;
}
