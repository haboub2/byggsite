import { z } from "zod";

/**
 * Editable site content: what the owners change from /admin without a
 * developer. Shared by the admin forms (client) and the store (server), so
 * both validate the same way. The brand name, the logo and the ROT rules are
 * deliberately not editable.
 */

const text = (max: number, label: string) =>
  z.string().trim().min(1, `${label} krävs.`).max(max, `${label}: högst ${max} tecken.`);
const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label}: högst ${max} tecken.`);

const stat = z.object({
  value: text(14, "Siffra"),
  label: text(48, "Text"),
});

export const companySchema = z.object({
  legalName: text(80, "Företagsnamn"),
  orgNr: optionalText(11, "Organisationsnummer").refine(
    (v) => v === "" || /^\d{6}-\d{4}$/.test(v),
    "Organisationsnummer skrivs 559123-4567."
  ),
  street: text(80, "Gatuadress"),
  postalCode: text(6, "Postnummer").refine((v) => /^\d{3} ?\d{2}$/.test(v), "Postnummer skrivs 302 62."),
  city: text(40, "Ort"),
  phone: text(16, "Telefon för länkar").refine(
    (v) => /^\+\d{8,14}$/.test(v),
    "Telefon för länkar skrivs med landsnummer utan mellanslag, t.ex. +46793049737."
  ),
  phoneDisplay: text(20, "Telefon som den visas"),
  email: text(80, "E-post").email("Ange en giltig e-postadress."),
  hours: text(60, "Öppettider"),
  contactPerson: text(60, "Kontaktperson"),
  areasServed: z.array(text(40, "Område")).min(1, "Minst ett område.").max(10),
  byggStats: z.array(stat).length(3),
  softwareStats: z.array(stat).length(3),
});
export type Company = z.infer<typeof companySchema>;

const money = z.coerce
  .number({ message: "Belopp måste vara ett tal." })
  .int("Belopp i hela kronor.")
  .min(0, "Belopp kan inte vara negativt.")
  .max(5_000_000, "Belopp: högst 5 000 000 kr.");

export const priceItemSchema = z.object({
  from: text(40, "Riktpris"),
  note: optionalText(80, "Förklaring"),
  /** Example project for the ROT calculator; off for services priced per hour or by quote. */
  example: z.boolean(),
  exampleLabel: optionalText(30, "Exempelnamn"),
  labor: money,
  material: money,
});
export type PriceItem = z.infer<typeof priceItemSchema>;

export const pricingSchema = z.object({
  services: z.record(z.string(), priceItemSchema),
});
export type Pricing = z.infer<typeof pricingSchema>;

export const warrantyItemSchema = z.object({
  /** Short form for the facts band, e.g. "5 år". */
  short: text(14, "Garanti, kort"),
  /** Running text, e.g. "5 års garanti på hantverket". Replaces {garanti} in texts. */
  sentence: text(80, "Garanti, mening"),
});
export type Warranty = z.infer<typeof warrantyItemSchema>;

export const warrantySchema = z.object({
  bygg: warrantyItemSchema,
  software: warrantyItemSchema,
  services: z.record(z.string(), warrantyItemSchema),
});
export type WarrantyBlock = z.infer<typeof warrantySchema>;

export const CONTENT_KEYS = ["company", "pricing", "warranty"] as const;
export type ContentKey = (typeof CONTENT_KEYS)[number];

export const contentSchemas = {
  company: companySchema,
  pricing: pricingSchema,
  warranty: warrantySchema,
} as const;

export type ContentMap = { company: Company; pricing: Pricing; warranty: WarrantyBlock };

export const CONTENT_LABEL: Record<ContentKey, string> = {
  company: "Företaget",
  pricing: "Priser",
  warranty: "Garanti",
};

/** Put the warranty into a text that contains the {garanti} token. */
export function fillWarranty(text: string, w: Warranty): string {
  return text.replaceAll("{garanti}", w.sentence);
}
