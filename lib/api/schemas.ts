import { z } from "zod";
import { customerSchema } from "../core/customers/schema";
import { INVOICE_KINDS, buyerSchema, invoiceDocumentSchema, invoiceLineSchema, referencesSchema, rotPropertySchema, rotSchema } from "../core/documents/invoice";
import { INVOICE_LIST_TABS, INVOICE_STATUSES } from "../core/invoices/store-types";
import { DUE_RULES } from "../core/plans/schema";
import { ROT_CATEGORIES } from "../core/rot/claim-xml";
import { EVENT_TYPES, type AggregateType } from "../core/events";
import { AGREEMENTS, EMPLOYMENT_FORMS, PAY_FORMS, PENSION_SCHEMES, VACATION_RULES } from "../core/hr/schema";
import { TIME_KINDS, TIME_STATUSES } from "../core/hr/time";
import { ABSENCE_KINDS } from "../core/hr/absence";

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

/* ---------- employees (phase 6) ---------- */

export const employeeResourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  /** Alltid maskerat, ÅÅÅÅMMDD-XXXX; tomt när inget personnummer finns. Hela numret lämnar aldrig API:t. */
  personalNumber: z.string().regex(/^(\d{8}-XXXX)?$/).describe("Alltid maskerat, ÅÅÅÅMMDD-XXXX. Hela numret lämnar aldrig API:t."),
  birthDate: isoDate.nullable(),
  agreement: z.enum(AGREEMENTS).describe("Personens kollektivavtal: byggavtalet, tjanstemannaavtalet eller none."),
  isOwner: z.boolean(),
  isBoardMember: z.boolean(),
  startedOn: isoDate.nullable().describe("Första anställningens första dag."),
  endedOn: isoDate.nullable().describe("Dagen personen lämnade, null medan personen är kvar."),
  employment: z
    .object({
      form: z.enum(EMPLOYMENT_FORMS),
      payForm: z.enum(PAY_FORMS),
      title: z.string(),
      monthlySalaryOre: ore.nullable(),
      hourlyRateOre: ore.nullable(),
      feeOre: ore.nullable(),
      workingTimePercent: z.number(),
      startsOn: isoDate,
      endsOn: isoDate.nullable(),
      vacationRule: z.enum(VACATION_RULES),
      vacationDays: z.number().int(),
      pensionScheme: z.enum(PENSION_SCHEMES),
      validFrom: isoDate,
    })
    .nullable()
    .describe("Anställningsversionen som gäller i dag, null utan anställning."),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const employeeListQuerySchema = z.object({
  q: z.string().trim().max(100).optional().describe("Namn eller e-post."),
  includeEnded: z.coerce.boolean().default(false).describe("Ta med personer som lämnat."),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/* ---------- time entries and absences (phase 6) ---------- */

export const timeEntryResourceSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  date: isoDate,
  start: z.string().nullable().describe("TT:MM, null för en rad med bara timmar."),
  end: z.string().nullable(),
  breakMinutes: z.number().int(),
  hours: z.number().describe("Negativt bara på en rättelse som vänder en godkänd rad."),
  kind: z.enum(TIME_KINDS),
  projectId: z.string().uuid().nullable(),
  note: z.string(),
  status: z.enum(TIME_STATUSES),
  correctsId: z.string().uuid().nullable(),
  submittedAt: z.string().nullable(),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const timeEntryListQuerySchema = z.object({
  from: isoDate.describe("Första dag (arbetsdatum)."),
  to: isoDate.describe("Sista dag."),
  employeeId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  status: z.enum(TIME_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Tiden skrivs TT:MM.");

export const timeEntryCreateSchema = z
  .object({
    employeeId: z.string().uuid(),
    date: isoDate,
    start: clock.optional().describe("Med start och slut räknas timmarna; annars anges hours."),
    end: clock.optional(),
    breakMinutes: z.number().int().min(0).max(600).default(0),
    hours: z.number().min(0.25).max(24).optional().describe("Timmar när start och slut inte anges."),
    kind: z.enum(TIME_KINDS).default("work"),
    projectId: z.string().uuid().nullable().default(null),
    note: z.string().trim().max(500).default(""),
  })
  .refine((v) => (v.start !== undefined) === (v.end !== undefined), { message: "Ange både start och slut, eller bara hours.", path: ["end"] })
  .refine((v) => v.start !== undefined || v.hours !== undefined, { message: "Ange start och slut, eller hours.", path: ["hours"] });
export type TimeEntryCreate = z.infer<typeof timeEntryCreateSchema>;

export const absenceResourceSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  kind: z.enum(ABSENCE_KINDS),
  from: isoDate,
  to: isoDate.nullable().describe("Null: sjuk och inte tillbaka än."),
  extent: z.number().describe("1, 0.75, 0.5 eller 0.25 av dagen."),
  certificateReceivedOn: isoDate.nullable(),
  sickPeriodId: z.string().uuid().nullable().describe("Sjukfallet raden hör till (återinsjuknande inom fem dagar fortsätter samma)."),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const absenceListQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  employeeId: z.string().uuid().optional(),
  kind: z.enum(ABSENCE_KINDS).optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

/* ---------- payslips and pay runs (phase 6) ---------- */

export const PAY_RUN_STATUSES = ["draft", "calculated", "approved", "paid", "booked", "closed"] as const;

export const payRunResourceSchema = z.object({
  id: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/).describe("Lönemånaden, ÅÅÅÅ-MM."),
  periodStart: isoDate,
  periodEnd: isoDate,
  timeFrom: isoDate.describe("Perioden tid och frånvaro hämtas från."),
  timeTo: isoDate,
  payDate: isoDate,
  agiPeriod: z.string().describe("Månaden arbetsgivardeklarationen gäller (lönedagens månad)."),
  status: z.enum(PAY_RUN_STATUSES),
  payslipCount: z.number().int().nullable(),
  grossOre: ore.nullable().describe("Summa kontant bruttolön."),
  taxOre: ore.nullable(),
  netOre: ore.nullable(),
  employerContributionOre: ore.nullable(),
  computedAt: z.string().nullable(),
  approvedAt: z.string().nullable(),
  bookedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const payRunListQuerySchema = z.object({
  status: z.enum(PAY_RUN_STATUSES).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional().describe("Körningar med lönemånad i året."),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const payslipLineResourceSchema = z.object({
  code: z.string().describe("Lönearten."),
  name: z.string(),
  kind: z.string(),
  text: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  unitPriceOre: ore.nullable(),
  amountOre: ore,
  taxable: z.boolean(),
  agiBox: z.string().nullable(),
  account: z.string(),
  from: isoDate.nullable(),
  to: isoDate.nullable(),
});

export const payslipResourceSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  employeeId: z.string().uuid(),
  employeeName: z.string(),
  number: z.number().int().nullable().describe("Numret i serien L när lönebeskedet är godkänt."),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  payDate: isoDate,
  status: z.enum(["calculated", "approved"]).describe("Bara godkända lönebesked är frysta och har PDF."),
  cashGrossOre: ore,
  benefitOre: ore,
  taxFreeReimbursementOre: ore,
  taxOre: ore,
  netAdjustmentOre: ore,
  netOre: ore,
  employerContributionOre: ore,
  contributionRatePercent: z.number(),
  contributionBaseOre: ore,
  pensionScheme: z.enum(["saf-lo", "itp1", "none"]).nullable(),
  pensionPremiumOre: ore,
  vacationLiabilityOre: ore,
  lines: z.array(payslipLineResourceSchema),
  hasPdf: z.boolean(),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const payslipListQuerySchema = z.object({
  runId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Lönemånaden."),
  limit: z.coerce.number().int().min(1).max(2000).default(200),
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
