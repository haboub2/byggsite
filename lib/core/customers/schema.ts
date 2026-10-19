import { z } from "zod";
import { CUSTOMER_TYPES, ORG_NR, VAT_NR, type Buyer } from "../documents/invoice";

/**
 * The customer register (customers table). What the invoice buyer block is
 * copied from, and what payments, reminders and ROT history hang on.
 */

const text = (max: number, label: string) => z.string().trim().max(max, `${label}: högst ${max} tecken.`);

export const customerSchema = z.object({
  type: z.enum(CUSTOMER_TYPES),
  /** Person's name, or the contact person at a company. */
  name: text(120, "Namn").min(1, "Namn krävs."),
  company: text(120, "Företag"),
  orgNr: text(13, "Organisationsnummer").refine((v) => v === "" || ORG_NR.test(v), "Organisationsnummer skrivs 559123-4567."),
  vatNr: text(16, "Momsregistreringsnummer").refine((v) => v === "" || VAT_NR.test(v), "Momsregistreringsnummer skrivs SE559123456701."),
  email: z.union([z.literal(""), z.string().trim().email("Ange en giltig e-postadress.")]),
  phone: text(30, "Telefon"),
  street: text(120, "Gatuadress"),
  postalCode: text(10, "Postnummer"),
  city: text(60, "Ort"),
  reference: text(80, "Er referens"),
  defaultTermsDays: z.coerce.number().int().min(0, "Minst 0 dagar.").max(120, "Högst 120 dagar."),
  notes: text(2000, "Anteckningar"),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export type Customer = CustomerInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export const emptyCustomer: CustomerInput = {
  type: "privat",
  name: "",
  company: "",
  orgNr: "",
  vatNr: "",
  email: "",
  phone: "",
  street: "",
  postalCode: "",
  city: "",
  reference: "",
  defaultTermsDays: 30,
  notes: "",
};

/** The name a list shows: the company for businesses, the person otherwise. */
export function customerLabel(c: Pick<CustomerInput, "type" | "name" | "company">): string {
  return c.type !== "privat" && c.company ? c.company : c.name;
}

/** The buyer block of an invoice document, from the register. */
export function customerToBuyer(c: Customer): Buyer {
  const business = c.type !== "privat";
  return {
    type: c.type,
    customerId: c.id,
    name: business && c.company ? c.company : c.name,
    orgNr: business ? c.orgNr : "",
    vatNr: business ? c.vatNr : "",
    street: c.street,
    postalCode: c.postalCode,
    city: c.city,
    countryCode: "SE",
    email: c.email,
    phone: c.phone,
    reference: business ? c.reference || c.name : "",
  };
}

/** A customer record from an invoice's or quote's buyer fields (used when creating from a quote). */
export function customerFromBuyerLike(b: {
  type: CustomerInput["type"];
  name: string;
  company?: string;
  orgNr?: string;
  vatNr?: string;
  email?: string;
  phone?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  reference?: string;
}): CustomerInput {
  return {
    ...emptyCustomer,
    type: b.type,
    name: b.name,
    company: b.company ?? "",
    orgNr: b.orgNr ?? "",
    vatNr: b.vatNr ?? "",
    email: b.email ?? "",
    phone: b.phone ?? "",
    street: b.street ?? "",
    postalCode: b.postalCode ?? "",
    city: b.city ?? "",
    reference: b.reference ?? "",
  };
}
