import { z } from "zod";
import { customerSchema } from "../core/customers/schema";
import { INVOICE_KINDS, buyerSchema, invoiceDocumentSchema, invoiceLineSchema, referencesSchema, rotPropertySchema, rotSchema } from "../core/documents/invoice";
import { INVOICE_LIST_TABS, INVOICE_STATUSES } from "../core/invoices/store-types";
import { DUE_RULES } from "../core/plans/schema";
import { ROT_CATEGORIES } from "../core/rot/claim-xml";
import { EVENT_TYPES, type AggregateType } from "../core/events";

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
  invoiceEmails: customerSchema.shape.invoiceEmails.describe("Fakturor till, högst 10 adresser. Tom lista eller saknas: fakturor går till email."),
  ccEmails: customerSchema.shape.ccEmails.describe("Kopia till, högst 10 adresser."),
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
  invoiceEmails: z.array(z.string()).describe("Fakturor till: adresserna fakturor och påminnelser mejlas till. Tom lista: email."),
  ccEmails: z.array(z.string()).describe("Kopia till: får fakturor och påminnelser som kopia."),
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

/* ---------- payment plans ---------- */

export const paymentPlanStepResourceSchema = z.object({
  id: z.string().uuid(),
  sort: z.number().int(),
  label: z.string(),
  phaseId: z.string().nullable(),
  percent: z.number().nullable().describe("Andel av offertens summa, 0–100. Null: fast belopp (amountOre) eller resten (slutfakturan)."),
  amountOre: ore.nullable().describe("Fast belopp inkl. moms i öre när percent är null."),
  laborShare: z.number().nullable().describe("Arbetets andel för ROT, 0–1. Null: offertens egen andel."),
  dueRule: z.enum(DUE_RULES).describe("on_start, on_phase_done, on_date, on_completion"),
  dueOn: isoDate.nullable(),
  invoiceId: z.string().uuid().nullable().describe("Fakturan som skapats för steget, när den finns."),
  createdAt: z.string(),
});

export const paymentPlanResourceSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  quoteId: z.string().uuid().nullable(),
  kind: z.enum(["fixed", "phases"]),
  createdAt: z.string(),
  steps: z.array(paymentPlanStepResourceSchema),
});

export const paymentPlanListQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/* ---------- ROT claims ---------- */

export const ROT_CLAIM_STATUSES = ["draft", "sent", "paid", "rejected"] as const;

export const rotClaimItemResourceSchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  invoiceNumber: z.string(),
  buyerName: z.string(),
  personalNumber: z
    .string()
    .regex(/^(\d{8}-XXXX)?$/)
    .describe("Alltid maskerat, ÅÅÅÅMMDD-XXXX. Hela numret lämnar aldrig API:t."),
  amountOre: ore.describe("Begärt ROT-avdrag för köparen."),
  workOre: ore.describe("Arbetskostnad inkl. moms."),
  paidOn: isoDate.describe("Dagen kunden betalade fakturan."),
  status: z.enum(["pending", "paid", "rejected"]),
  property: rotPropertySchema,
  category: z.enum(ROT_CATEGORIES),
});

export const rotClaimResourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(ROT_CLAIM_STATUSES),
  sentOn: isoDate.nullable(),
  decidedOn: isoDate.nullable(),
  requestedOre: ore.describe("Summan av raderna: det som begärs från Skatteverket."),
  paidOre: ore.describe("Det Skatteverket har betalat ut."),
  createdAt: z.string(),
  items: z.array(rotClaimItemResourceSchema),
});

export const rotClaimListQuerySchema = z.object({
  status: z.enum(ROT_CLAIM_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/* ---------- events ---------- */

export const EVENT_AGGREGATE_TYPES = ["customer", "invoice", "payment", "rot_claim", "export", "api_key", "organization", "webhook"] as const satisfies readonly AggregateType[];

export const eventResourceSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(EVENT_TYPES),
  aggregateType: z.enum(EVENT_AGGREGATE_TYPES),
  aggregateId: z.string().uuid(),
  data: z.record(z.unknown()).describe("Små fakta om ändringen: belopp i öre, nummer, mottagare. Aldrig hela dokument."),
  actor: z.object({ kind: z.enum(["user", "api_key", "system", "customer"]), name: z.string() }),
  createdAt: z.string(),
});

export const eventListQuerySchema = z.object({
  aggregateType: z.enum(EVENT_AGGREGATE_TYPES).optional(),
  aggregateId: z.string().uuid().optional(),
  type: z.enum(EVENT_TYPES).optional(),
  order: z.enum(["desc", "asc"]).default("desc").describe("desc: nyast först (standard). asc: äldst först, för att följa loggen."),
  cursor: z.string().max(200).optional().describe("nextCursor från förra sidan."),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const eventPageSchema = z.object({
  data: z.array(eventResourceSchema),
  nextCursor: z.string().nullable().describe("Skicka som cursor för nästa sida. Null: inga fler."),
});

/* ---------- payments ---------- */

export const paymentResourceSchema = z.object({
  id: z.string().uuid(),
  amountOre: ore.describe("Negativt belopp är en återbetalning."),
  currency: z.literal("SEK"),
  method: z.enum(["bankgiro", "swish", "card", "manual", "rot"]).describe("rot: Skatteverkets utbetalning av ROT-avdraget."),
  paidOn: isoDate,
  reference: z.string(),
  note: z.string(),
  createdAt: z.string(),
  allocations: z.array(z.object({ invoiceId: z.string().uuid(), amountOre: ore })).describe("Vilka fakturor betalningen gäller."),
});

export const paymentListQuerySchema = z.object({
  invoiceId: z.string().uuid().optional(),
  from: isoDate.optional().describe("Betalda från och med (paidOn)."),
  to: isoDate.optional().describe("Betalda till och med (paidOn)."),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const listOf = <T extends z.ZodTypeAny>(item: T) => z.object({ data: z.array(item) });
