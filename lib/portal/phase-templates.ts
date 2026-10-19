import type { SavedPhaseTemplate } from "./schema";

/**
 * Phase lists with standard durations per job type, picked when a project
 * is created (docs/kundportal-v3.md, 1). Durations are working days in
 * half-day steps and are a starting point: the admin adjusts them per job.
 * Like the quote templates (lib/quotes/templates.ts) the built-ins live in
 * code; a project's phases can also be saved as a template of its own
 * (phase_templates, see lib/portal/store.ts). To add one, add an object.
 */

/** `photo`: the phase can't be ticked done without a photo (docs/kundportal-v3.md, 2, Kvalitet). */
export type TemplatePhase = { name: string; days: number; photo?: boolean };
export type PhaseTemplate = { key: string; job_type: string; name: string; phases: TemplatePhase[] };

/**
 * Work that is hidden once the next phase starts, so photos before it is
 * covered are the proof in a warranty case: such phases need a photo before
 * they can be ticked done. Built-in templates follow it, and so does a phase
 * the admin adds by hand with one of these names.
 */
const PHOTO_REQUIRED = /^(tätskikt|el och vvs)$/i;
export const photoRequiredByDefault = (name: string) => PHOTO_REQUIRED.test(name.trim());

const p = (name: string, days: number): TemplatePhase => (photoRequiredByDefault(name) ? { name, days, photo: true } : { name, days });

export const BUILT_IN_PHASE_TEMPLATES: PhaseTemplate[] = [
  {
    key: "badrum",
    job_type: "Badrum",
    name: "Badrum, helrenovering",
    phases: [p("Uppstart och skydd", 0.5), p("Rivning", 2), p("El och VVS", 3), p("Tätskikt", 2), p("Kakel och klinker", 5), p("Montering", 2), p("Slutbesiktning", 0.5)],
  },
  {
    key: "kok",
    job_type: "Kök",
    name: "Kök",
    phases: [p("Uppstart och skydd", 0.5), p("Rivning", 1.5), p("El och VVS", 2), p("Väggar och golv", 3), p("Köksmontering", 4), p("Bänkskiva och vitvaror", 1.5), p("Slutbesiktning", 0.5)],
  },
  {
    key: "tillbyggnad",
    job_type: "Tillbyggnad",
    name: "Tillbyggnad",
    phases: [p("Etablering", 1), p("Mark och grund", 8), p("Stomme", 8), p("Tak", 5), p("Fönster och dörrar", 2), p("El och VVS", 5), p("Invändigt", 10), p("Fasad och målning", 5), p("Slutbesiktning", 0.5)],
  },
  {
    key: "tak",
    job_type: "Tak",
    name: "Takbyte",
    phases: [p("Etablering och ställning", 1), p("Rivning av gammalt tak", 2), p("Underlag och läkt", 2), p("Takbeläggning", 4), p("Plåt och avvattning", 2), p("Slutbesiktning och nedmontering", 1)],
  },
  {
    key: "golv",
    job_type: "Golv",
    name: "Golvläggning",
    phases: [p("Uppstart och skydd", 0.5), p("Rivning av gammalt golv", 1), p("Avjämning och torktid", 2), p("Golvläggning", 3), p("Lister och avslut", 1)],
  },
  {
    key: "maleri",
    job_type: "Måleri",
    name: "Målning invändigt",
    phases: [p("Uppstart och skydd", 0.5), p("Spackling och slipning", 2), p("Grundmålning", 1), p("Färdigmålning", 2), p("Städning och avslut", 0.5)],
  },
  {
    key: "el-vvs",
    job_type: "El & VVS",
    name: "El och VVS",
    phases: [p("Uppstart", 0.5), p("Demontering", 1), p("Dragning och rör", 3), p("Montering", 2), p("Provning och besiktning", 0.5)],
  },
  {
    key: "totalrenovering",
    job_type: "Totalrenovering",
    name: "Totalrenovering",
    phases: [
      p("Etablering och skydd", 1),
      p("Rivning", 5),
      p("Stomkomplettering", 5),
      p("El och VVS", 8),
      p("Tätskikt", 2),
      p("Kakel och klinker", 6),
      p("Golv", 4),
      p("Snickerier och kök", 8),
      p("Målning", 5),
      p("Slutbesiktning", 1),
    ],
  },
  {
    key: "fritt",
    job_type: "Fritt",
    name: "Tom tidplan",
    phases: [p("Uppstart", 0.5), p("Arbete", 5), p("Slutbesiktning", 0.5)],
  },
];

/** The value a template has in a <select>: "builtin:badrum" or "saved:<uuid>". */
export const templateValue = (t: PhaseTemplate | SavedPhaseTemplate) => ("key" in t ? `builtin:${t.key}` : `saved:${t.id}`);

/** The phases behind a select value, or the empty plan if the template is gone. */
export function resolvePhaseTemplate(value: string, saved: SavedPhaseTemplate[]): TemplatePhase[] {
  if (value.startsWith("saved:")) {
    const t = saved.find((s) => s.id === value.slice(6));
    if (t) return t.phases;
  }
  const key = value.startsWith("builtin:") ? value.slice(8) : value;
  return (BUILT_IN_PHASE_TEMPLATES.find((t) => t.key === key) ?? BUILT_IN_PHASE_TEMPLATES.find((t) => t.key === "fritt")!).phases;
}

const GUESSES: [RegExp, string][] = [
  [/badrum|våtrum|dusch|wc\b|toalett/i, "badrum"],
  [/kök/i, "kok"],
  [/tillbygg|utbygg|attefall|friggebod|garage|uterum/i, "tillbyggnad"],
  [/\btak|takbyte|takläggning/i, "tak"],
  [/golv|parkett|klinker/i, "golv"],
  [/målning|måleri|tapet/i, "maleri"],
  [/\bel\b|elinstallation|vvs|rör/i, "el-vvs"],
  [/totalrenov|helrenov|lägenhet|villa/i, "totalrenovering"],
];

/** The built-in template a quote title suggests ("Badrumsrenovering" → badrum), else "fritt". */
export function guessPhaseTemplate(title: string): string {
  for (const [re, key] of GUESSES) if (re.test(title)) return `builtin:${key}`;
  return "builtin:fritt";
}
