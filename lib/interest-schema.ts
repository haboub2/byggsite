import { z } from "zod";
import { toCsv } from "./csv";

/**
 * The interest form on /fakturering (components/InterestForm.tsx) and its
 * table, product_interest (supabase/migrations/0027_product_interest.sql).
 * Pure: shared by the server action, the admin view and the tests.
 */

export const VOLUMES = ["under-10", "10-50", "over-50"] as const;
export type Volume = (typeof VOLUMES)[number];
export const VOLUME_LABEL: Record<Volume, string> = {
  "under-10": "Under 10",
  "10-50": "10–50",
  "over-50": "Över 50",
};

export const TOOLS = ["fortnox", "visma", "word-excel", "annat"] as const;
export type Tool = (typeof TOOLS)[number];
export const TOOL_LABEL: Record<Tool, string> = {
  fortnox: "Fortnox",
  visma: "Visma",
  "word-excel": "Word/Excel",
  annat: "Annat",
};

const optionalText = (max: number, message: string) => z.string().trim().max(max, message).optional().default("");

export const interestSchema = z.object({
  company: z.string().trim().min(1, "Ange företagets namn.").max(200, "Företagsnamnet är för långt."),
  name: z.string().trim().min(1, "Ange ditt namn.").max(200, "Namnet är för långt."),
  email: z.string().trim().max(320, "E-postadressen är för lång.").email("Ange en giltig e-postadress."),
  phone: optionalText(50, "Telefonnumret är för långt."),
  volume: z.enum(VOLUMES, { message: "Välj ungefär hur många fakturor ni skickar i månaden." }),
  currentTool: z.enum(TOOLS, { message: "Välj vad ni fakturerar med i dag." }),
  currentToolOther: optionalText(200, "Beskrivningen av verktyget är för lång."),
  priority: optionalText(2000, "Texten är för lång, högst 2 000 tecken."),
  consent: z
    .string({ message: "Kryssa i att vi får kontakta dig." })
    .refine((v) => v === "on", { message: "Kryssa i att vi får kontakta dig." }),
});

export type InterestInput = z.infer<typeof interestSchema>;

/** Read the form's fields from FormData; unknown keys are ignored. */
export function interestFromForm(form: FormData): Record<string, string | undefined> {
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };
  return {
    company: get("company"),
    name: get("name"),
    email: get("email"),
    phone: get("phone"),
    volume: get("volume"),
    currentTool: get("currentTool"),
    currentToolOther: get("currentToolOther"),
    priority: get("priority"),
    consent: get("consent"),
  };
}

export type InterestSource = {
  page?: string | null;
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
};

/** A stored registration, as product_interest returns it. */
export type InterestRow = {
  id: string;
  created_at: string;
  company: string;
  name: string;
  email: string;
  phone: string | null;
  volume: Volume;
  current_tool: Tool;
  current_tool_other: string | null;
  priority: string | null;
  source: InterestSource | null;
  consent_at: string;
};

/** "Annat: Bokio" when the visitor named the tool, else the label. */
export function toolText(tool: Tool, other: string | null | undefined): string {
  return tool === "annat" && other ? `Annat: ${other}` : other ? `${TOOL_LABEL[tool]} (${other})` : TOOL_LABEL[tool];
}

/** Label/value pairs for the notification mail, in form order. */
export function interestRows(input: InterestInput): [string, string][] {
  return [
    ["Företag", input.company],
    ["Namn", input.name],
    ["E-post", input.email],
    ["Telefon", input.phone || "–"],
    ["Fakturor per månad", VOLUME_LABEL[input.volume]],
    ["Fakturerar i dag med", toolText(input.currentTool, input.currentToolOther)],
    ["Viktigast", input.priority || "–"],
  ];
}

/** The admin's key figures: how many, how many lately, how large, how many from Fortnox. */
export function interestStats(rows: InterestRow[], now = Date.now()) {
  const monthAgo = now - 30 * 86_400_000;
  return {
    total: rows.length,
    recent: rows.filter((r) => new Date(r.created_at).getTime() >= monthAgo).length,
    large: rows.filter((r) => r.volume === "over-50").length,
    fortnox: rows.filter((r) => r.current_tool === "fortnox").length,
  };
}

/** "2026-10-22 14:05" in Swedish time. */
export function stockholmTime(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** All registrations as CSV for Excel (lib/csv.ts), newest first as given. */
export function interestCsv(rows: InterestRow[]): string {
  return toCsv(
    ["Datum", "Företag", "Namn", "E-post", "Telefon", "Fakturor per månad", "Fakturerar i dag med", "Viktigast", "Sida", "Källa"],
    rows.map((r) => [
      stockholmTime(r.created_at),
      r.company,
      r.name,
      r.email,
      r.phone ?? "",
      VOLUME_LABEL[r.volume] ?? r.volume,
      TOOL_LABEL[r.current_tool] ? toolText(r.current_tool, r.current_tool_other) : r.current_tool,
      r.priority ?? "",
      r.source?.page ?? "",
      r.source?.utm_source ?? r.source?.referrer ?? "",
    ])
  );
}
