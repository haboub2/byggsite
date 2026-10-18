import { z } from "zod";

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

export const DOCUMENT_KINDS = ["quote", "invoice", "rot", "certificate", "warranty", "care", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  quote: "Offert",
  invoice: "Faktura",
  rot: "ROT-underlag",
  certificate: "Intyg",
  warranty: "Garantibevis",
  care: "Skötselråd",
  other: "Övrigt",
};

/** Phases suggested when a project is created; the admin edits them freely. */
export const DEFAULT_PHASES = ["Uppstart", "Rivning", "El och VVS", "Tätskikt", "Kakel och klinker", "Montering", "Slutbesiktning"];

const text = (max: number, label: string) => z.string().trim().min(1, `${label} saknas.`).max(max, `${label}: högst ${max} tecken.`);
const optionalText = (max: number, label: string) => z.string().trim().max(max, `${label}: högst ${max} tecken.`);
const optionalDate = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum skrivs 2026-10-15.")]);

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
  starts_on: optionalDate,
  ends_on: optionalDate,
});
export type ProjectForm = z.infer<typeof projectFormSchema>;

export const phaseFormSchema = z.object({
  name: text(80, "Fasens namn"),
  starts_on: optionalDate,
  ends_on: optionalDate,
});

export const updateFormSchema = z.object({
  body: optionalText(3000, "Text"),
  photos: z.array(z.string().min(1).max(300)).max(20, "Högst 20 foton per uppdatering."),
}).refine((u) => u.body || u.photos.length, { message: "Skriv något eller lägg till ett foto.", path: ["body"] });

export const documentFormSchema = z.object({
  kind: z.enum(DOCUMENT_KINDS),
  title: text(120, "Rubrik"),
  path: z.string().min(1, "Ingen fil laddades upp.").max(300),
});

export type PortalProject = ProjectForm & {
  id: string;
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
  starts_on: string | null;
  ends_on: string | null;
  done_at: string | null;
};

export type ProjectUpdate = {
  id: string;
  project_id: string;
  body: string;
  photos: string[];
  created_by: string | null;
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

/** Everything one project page needs. */
export type ProjectBundle = {
  project: PortalProject;
  phases: ProjectPhase[];
  updates: ProjectUpdate[];
  documents: ProjectDocument[];
  members: ProjectMember[];
};

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
