import { z } from "zod";
import { ROT_RATE } from "../rot";
import { isIsoDate } from "../workdays";

/**
 * Kundportalen "Mitt projekt" (docs/kundportal.md): the data model shared by
 * /admin/projekt and /mitt-projekt. Tables in supabase/migrations/0010_portal.sql.
 */

export const PROJECT_STATUSES = ["active", "done", "warranty"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "Pågår",
  done: "Klart",
  warranty: "Garantitid",
};

export const DOCUMENT_KINDS = ["quote", "invoice", "rot", "certificate", "warranty", "care", "report", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  quote: "Offert",
  invoice: "Faktura",
  rot: "ROT-underlag",
  certificate: "Intyg",
  warranty: "Garantibevis",
  care: "Skötselråd",
  report: "Projektdokumentation",
  other: "Övrigt",
};

export const CHANGE_ORDER_STATUSES = ["pending", "approved", "declined"] as const;
export type ChangeOrderStatus = (typeof CHANGE_ORDER_STATUSES)[number];
export const CHANGE_ORDER_STATUS_LABEL: Record<ChangeOrderStatus, string> = {
  pending: "Väntar på svar",
  approved: "Godkänd",
  declined: "Avböjd",
};

const text = (max: number, label: string) => z.string().trim().min(1, `${label} saknas.`).max(max, `${label}: högst ${max} tecken.`);
const optionalText = (max: number, label: string) => z.string().trim().max(max, `${label}: högst ${max} tecken.`);
const optionalDate = z.union([z.literal(""), z.string().refine(isIsoDate, "Datum skrivs 2026-10-15.")]);
/** Working days in half-day steps, as typed ("1,5" or "1.5"). */
const halfDays = (label: string, min = 0) =>
  z.preprocess(
    (v) => (v === undefined || v === null ? 0 : typeof v === "string" ? v.trim().replace(",", ".") || "0" : v),
    z.coerce
      .number({ invalid_type_error: `${label} skrivs i dagar, t.ex. 1,5.` })
      .min(min, min > 0 ? `${label}: minst ${String(min).replace(".", ",")} dag.` : `${label} kan inte vara negativ.`)
      .max(999, `${label}: högst 999 dagar.`)
      .refine((d) => Number.isInteger(d * 2), `${label} anges i hela eller halva dagar.`)
  );

/** What the admin edits on the project itself. */
export const projectFormSchema = z.object({
  title: text(120, "Projektnamn"),
  address: optionalText(160, "Adress"),
  customer_name: optionalText(120, "Kund"),
  status: z.enum(PROJECT_STATUSES),
  current_phase: optionalText(80, "Aktuell fas"),
  this_week: optionalText(1000, "Den här veckan"),
  next_step: optionalText(500, "Nästa steg"),
  contact_name: optionalText(80, "Kontaktperson"),
  contact_phone: optionalText(20, "Telefon"),
});
export type ProjectForm = z.infer<typeof projectFormSchema>;

/**
 * The whole timeline as the admin saves it: start date, Saturday switch and
 * the phases in order. Dates are never typed; lib/portal/timeline.ts
 * computes them. A phase without id is new; an existing one left out is removed.
 */
export const timelineFormSchema = z.object({
  starts_on: optionalDate,
  works_saturdays: z.boolean(),
  phases: z
    .array(
      z.object({
        id: z.string().max(60).nullable(),
        name: text(80, "Fasens namn"),
        duration_days: halfDays("Varaktigheten"),
        photo_required: z.boolean().default(false),
      })
    )
    .max(60, "Högst 60 faser."),
});
export type TimelineForm = z.infer<typeof timelineFormSchema>;

/** "Försening": days and a reason the customer reads word for word. */
export const delayFormSchema = z.object({
  days: halfDays("Förseningen", 0.5),
  reason: text(300, "Orsaken"),
});

export const updateFormSchema = z.object({
  body: optionalText(3000, "Text"),
  photos: z.array(z.string().min(1).max(300)).max(20, "Högst 20 foton per uppdatering."),
  phase_id: z.string().max(60).nullable(),
  day: z.string().refine(isIsoDate, "Datum skrivs 2026-10-15."),
}).refine((u) => u.body || u.photos.length, { message: "Skriv något eller lägg till ett foto.", path: ["body"] });

/** A photo edited in the documentation: caption, report switch, phase and day. */
export const photoEditSchema = z.object({
  caption: optionalText(300, "Bildtexten"),
  in_report: z.boolean(),
  phase_id: z.string().max(60).nullable(),
  day: z.string().refine(isIsoDate, "Datum skrivs 2026-10-15."),
});
export type PhotoEdit = z.infer<typeof photoEditSchema>;

/** The day's note edited afterwards: its text, phase and day. */
export const noteEditSchema = z.object({
  body: optionalText(3000, "Texten"),
  phase_id: z.string().max(60).nullable(),
  day: z.string().refine(isIsoDate, "Datum skrivs 2026-10-15."),
});
export type NoteEdit = z.infer<typeof noteEditSchema>;

/** A phase's summary or the project's "Slutdokumentation". */
export const summarySchema = optionalText(6000, "Texten");

export const phaseTemplateFormSchema = z.object({
  name: text(80, "Mallens namn"),
  job_type: optionalText(40, "Jobbtyp"),
});

export const documentFormSchema = z.object({
  kind: z.enum(DOCUMENT_KINDS),
  title: text(120, "Rubrik"),
  path: z.string().min(1, "Ingen fil laddades upp.").max(300),
});

/** An ÄTA as the admin writes it. Amounts are whole kronor incl. VAT. */
export const changeOrderFormSchema = z
  .object({
    title: text(120, "Rubrik"),
    description: optionalText(3000, "Beskrivning"),
    amount: z.coerce.number({ invalid_type_error: "Pris skrivs i hela kronor." }).int("Pris skrivs i hela kronor.").min(-10_000_000).max(10_000_000),
    labor_amount: z.coerce.number({ invalid_type_error: "Arbetskostnad skrivs i hela kronor." }).int("Arbetskostnad skrivs i hela kronor.").min(0).max(10_000_000),
    duration_days: halfDays("Tiden"),
  })
  .refine((c) => c.labor_amount <= Math.max(c.amount, 0), { message: "Arbetskostnaden kan inte vara större än priset.", path: ["labor_amount"] });
export type ChangeOrderForm = z.infer<typeof changeOrderFormSchema>;

export type PortalProject = ProjectForm & {
  id: string;
  /** "" until a start date is set. Phase dates and ends_on follow from it. */
  starts_on: string;
  /** The computed end, "" without a start date. */
  ends_on: string;
  /** The original end, kept once a delay or ÄTA has moved ends_on. */
  planned_ends_on: string;
  works_saturdays: boolean;
  /** "Slutdokumentation": the team's text about the finished result. */
  final_summary: string;
  /** Set by "Lås dokumentationen"; from then on the documentation is read-only. */
  archived_at: string | null;
  /** Fingerprint of the content the cached report PDF was rendered from. */
  report_hash: string | null;
  quote_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectPhase = {
  id: string;
  project_id: string;
  name: string;
  sort: number;
  /** Computed from the project start and the durations, never typed. */
  starts_on: string | null;
  ends_on: string | null;
  /** Working days, half-day steps. */
  duration_days: number;
  /** Set on a phase that an approved ÄTA added. */
  change_order_id: string | null;
  done_at: string | null;
  /** The chapter's introduction in the documentation, optional. */
  summary: string;
  /** Can't be ticked done without at least one photo (Tätskikt, El och VVS). */
  photo_required: boolean;
};

export type ProjectUpdate = {
  id: string;
  project_id: string;
  body: string;
  /** Keys of the post's photos, in order (from project_photos). */
  photos: string[];
  phase_id: string | null;
  day: string;
  created_by: string | null;
  created_at: string;
};

/** One photo, in exactly one phase and one day. */
export type ProjectPhoto = {
  id: string;
  project_id: string;
  phase_id: string | null;
  update_id: string | null;
  day: string;
  path: string;
  caption: string;
  in_report: boolean;
  sort: number;
  created_by: string | null;
  created_at: string;
};

export const SHIFT_KINDS = ["delay", "change_order"] as const;
export type ShiftKind = (typeof SHIFT_KINDS)[number];

/** A move of the end date: a delay on a phase, or the phase an approved ÄTA added. */
export type TimelineShift = {
  id: string;
  project_id: string;
  kind: ShiftKind;
  phase_id: string | null;
  change_order_id: string | null;
  days: number;
  reason: string;
  created_at: string;
  created_by: string | null;
};

/** A phase template saved from a project (built-ins live in phase-templates.ts). */
export type SavedPhaseTemplate = {
  id: string;
  name: string;
  job_type: string;
  phases: { name: string; days: number; photo?: boolean }[];
  created_at: string;
};

export type ProjectDocument = {
  id: string;
  project_id: string;
  kind: DocumentKind;
  title: string;
  path: string;
  created_at: string;
};

export type ProjectMember = {
  project_id: string;
  user_id: string;
  email: string;
  name: string;
  invited_at: string;
};

export type ChangeOrder = {
  id: string;
  project_id: string;
  number: number;
  title: string;
  description: string;
  amount: number;
  labor_amount: number;
  status: ChangeOrderStatus;
  /** Working days the extra work adds; 0 = no effect on the timeline. */
  duration_days: number;
  answered_by: string | null;
  answered_name: string | null;
  answered_at: string | null;
  created_at: string;
};

/** Everything one project page needs. */
export type ProjectBundle = {
  project: PortalProject;
  phases: ProjectPhase[];
  updates: ProjectUpdate[];
  documents: ProjectDocument[];
  members: ProjectMember[];
  changeOrders: ChangeOrder[];
  shifts: TimelineShift[];
  photos: ProjectPhoto[];
};

/** How a change order moves the ROT deduction: 30 % of its labour part,
 *  whole kronor. A negative ÄTA (less work) gives less ROT. The yearly cap
 *  is not applied here; the invoice settles that. */
export function changeOrderRot(order: Pick<ChangeOrder, "amount" | "labor_amount">): { rot: number; pay: number } {
  const labor = Number.isFinite(order.labor_amount) ? Math.trunc(order.labor_amount) : 0;
  const rot = Math.trunc(labor * ROT_RATE);
  return { rot, pay: Math.trunc(order.amount) - rot };
}

/** The change orders still waiting for the customer: drives the orange badge. */
export function pendingChangeOrders(orders: ChangeOrder[]): ChangeOrder[] {
  return orders.filter((o) => o.status === "pending");
}

/** "12 500 kr", with a minus for negative amounts. Safe on client and server. */
export function formatKr(n: number): string {
  const digits = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(n).replace(/−/g, "-");
  return `${digits} kr`;
}

/** 0–100 from the phases: done ones count fully, the current one half. */
export function progressPercent(phases: ProjectPhase[]): number {
  if (!phases.length) return 0;
  const done = phases.filter((p) => p.done_at).length;
  const current = done < phases.length ? 0.5 : 0;
  return Math.round(((done + current) / phases.length) * 100);
}

/** The first phase not yet done, if any. */
export function currentPhase(phases: ProjectPhase[]): ProjectPhase | null {
  return phases.find((p) => !p.done_at) ?? null;
}
