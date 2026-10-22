import { z } from "zod";
import { customerSchema } from "../core/customers/schema";
import { INVOICE_KINDS, buyerSchema, invoiceDocumentSchema, invoiceLineSchema, referencesSchema, rotSchema } from "../core/documents/invoice";
import { INVOICE_LIST_TABS, INVOICE_STATUSES } from "../core/invoices/store-types";

/**
 * The /api/v1 contract as zod: what requests are validated with and what
 * responses look like. lib/api/openapi.ts generates the OpenAPI document
 * from these, so the published contract and the validation cannot drift.
 * Field names are camelCase like the invoice document; money is integer öre.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum skrivs ÅÅÅÅ-MM-DD.");
const ore = z.number().int().describe("Belopp i öre (heltal). 68 000 kr = 6800000.");

/* ---------- customers ---------- */

export const customerCreateSchema = customerSchema.extend({
  company: customerSchema.shape.company.default(""),
  orgNr: customerSchema.shape.orgNr.default(""),
  vatNr: customerSchema.shape.vatNr.default(""),
  email: customerSchema.shape.email.default(""),
  phone: customerSchema.shape.phone.default(""),
  street: customerSchema.shape.street.default(""),
  postalCode: customerSchema.shape.postalCode.default(""),
  city: customerSchema.shape.city.default(""),
  reference: customerSchema.shape.reference.default(""),
  defaultTermsDays: z.number().int().min(0).max(120).optional().describe("Saknas: organisationens villkor för kundtypen."),
  notes: customerSchema.shape.notes.default(""),
});
export type CustomerCreate = z.infer<typeof customerCreateSchema>;

export const customerResourceSchema = z.object({
  id: z.string().uuid(),
  type: customerSchema.shape.type,
  name: z.string(),
  company: z.string(),
  orgNr: z.string(),
  vatNr: z.string(),
  email: z.string(),
  phone: z.string(),
  street: z.string(),
  postalCode: z.string(),
  city: z.string(),
  reference: z.string(),
  peppolId: z.string(),
  defaultTermsDays: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const customerListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/* ---------- invoices ---------- */

export const invoiceCreateSchema = z
  .object({
    customerId: z.string().uuid().optional().describe("En kund i registret. Anges den inte krävs buyer."),
    buyer: buyerSchema.omit({ customerId: true }).optional().describe("Köparen när kunden inte finns i registret."),
    issueDate: isoDate.optional().describe("Fakturadatum; saknas = i dag. Kan ändras tills fakturan utfärdas."),
    dueDate: isoDate.optional().describe("Förfallodatum; saknas = fakturadatum + villkoren."),
    deliveryDate: isoDate.nullable().optional(),
    period: z.object({ start: isoDate, end: isoDate }).nullable().optional(),
    title: z.string().trim().max(160).optional(),
    note: z.string().trim().max(2000).optional(),
    references: referencesSchema.partial().optional(),
    lines: z.array(invoiceLineSchema).min(1, "Minst en rad.").max(200),
    rot: rotSchema.nullable().optional().describe("ROT-avdrag, bara för privatpersoner."),
    termsDays: z.number().int().min(0).max(120).optional(),
  })
  .refine((v) => v.customerId || v.buyer, { message: "Ange customerId eller buyer.", path: ["customerId"] });
export type InvoiceCreate = z.infer<typeof invoiceCreateSchema>;

export const invoiceListQuerySchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  tab: z.enum(INVOICE_LIST_TABS).optional().describe("draft, open (obetalda), overdue (förfallna), paid, credited"),
  customerId: z.string().uuid().optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const paymentCreateSchema = z.object({
  amountOre: ore.refine((v) => v !== 0, "Beloppet kan inte vara noll."),
  method: z.enum(["bankgiro", "swish", "card", "manual"]),
  paidOn: isoDate,
  reference: z.string().trim().max(140).default(""),
  note: z.string().trim().max(500).default(""),
});

export const invoiceResourceSchema = z.object({
  id: z.string().uuid(),
  series: z.string(),
  number: z.string().nullable(),
  kind: z.enum(INVOICE_KINDS),
  status: z.enum(INVOICE_STATUSES),
  customerId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
  currency: z.literal("SEK"),
  totalOre: ore,
  vatOre: ore,
  rotOre: ore,
  payableOre: ore,
  paidOre: ore,
  issuedOn: isoDate.nullable(),
  dueOn: isoDate.nullable(),
  ocr: z.string().nullable(),
  sha256: z.string().nullable(),
  sentAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  document: invoiceDocumentSchema,
});

export const paymentResultSchema = z.object({ status: z.enum(INVOICE_STATUSES), paidOre: ore, invoice: invoiceResourceSchema });
export const issueResultSchema = z.object({ number: z.string(), ocr: z.string(), invoice: invoiceResourceSchema });

export const listOf = <T extends z.ZodTypeAny>(item: T) => z.object({ data: z.array(item) });
