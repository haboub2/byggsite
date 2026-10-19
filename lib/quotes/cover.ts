import type { QuoteData } from "./schema";

/**
 * The photo on the quote's cover page. A quote stores a slot from
 * lib/images.ts in `cover`: "" means "pick from the title", "none" means
 * no photo. Pure, so the editor and the PDF agree on what is shown.
 */

export const NO_COVER = "none";

export const COVER_CHOICES: { slot: string; label: string; division: "bygg" | "01" }[] = [
  { slot: "badrum-hero", label: "Badrum", division: "bygg" },
  { slot: "kok-hero", label: "Kök", division: "bygg" },
  { slot: "golv-hero", label: "Golv", division: "bygg" },
  { slot: "maleri-hero", label: "Måleri", division: "bygg" },
  { slot: "tak-hero", label: "Tak", division: "bygg" },
  { slot: "tillbyggnad-hero", label: "Tillbyggnad", division: "bygg" },
  { slot: "el-vvs-hero", label: "El och VVS", division: "bygg" },
  { slot: "totalrenovering-hero", label: "Totalrenovering", division: "bygg" },
  { slot: "projektledning-hero", label: "Projektledning", division: "bygg" },
  { slot: "hero-bygg", label: "Hem, allmänt", division: "bygg" },
  { slot: "webb-hero", label: "Webb", division: "01" },
  { slot: "interna-system-hero", label: "Portaler och system", division: "01" },
  { slot: "automation-hero", label: "Automation", division: "01" },
  { slot: "hero-software", label: "Software, allmänt", division: "01" },
];

/** The template groups in lib/quotes/templates.ts, mapped to a photo. */
const BY_GROUP: Record<string, string> = {
  Badrum: "badrum-hero",
  Kök: "kok-hero",
  Golv: "golv-hero",
  Måleri: "maleri-hero",
  Tak: "tak-hero",
  Tillbyggnad: "tillbyggnad-hero",
  "El & VVS": "el-vvs-hero",
  Totalrenovering: "totalrenovering-hero",
  Projektledning: "projektledning-hero",
  Webb: "webb-hero",
  "Portaler och system": "interna-system-hero",
  Automation: "automation-hero",
  "Support och drift": "hero-software",
};

export function coverForGroup(group: string): string {
  return BY_GROUP[group] ?? "";
}

/** Words in a title that point at a job, checked in order. */
const BY_WORD: [RegExp, string][] = [
  [/badrum|våtrum|dusch|toalett|\bwc\b/i, "badrum-hero"],
  [/kök|bänkskiv|luckor/i, "kok-hero"],
  [/tak|pann|plåt|papp/i, "tak-hero"],
  [/tillbygg|altan|trädäck|vind|kupa|balkong/i, "tillbyggnad-hero"],
  [/golv|parkett|laminat|klinker/i, "golv-hero"],
  [/mål|tapet|fasad/i, "maleri-hero"],
  [/\bel\b|vvs|elbil|laddbox|vatten|rör/i, "el-vvs-hero"],
  [/totalrenover|renovering av (hus|lägenhet|villa)/i, "totalrenovering-hero"],
  [/webb|hemsida|sajt|webbplats/i, "webb-hero"],
  [/portal|system|app/i, "interna-system-hero"],
  [/automat|integration/i, "automation-hero"],
];

/** The slot the PDF shows, or null for no photo. */
export function coverSlot(q: Pick<QuoteData, "cover" | "title" | "division">): string | null {
  if (q.cover === NO_COVER) return null;
  if (q.cover) return q.cover;
  for (const [re, slot] of BY_WORD) if (re.test(q.title)) return slot;
  return q.division === "bygg" ? "hero-bygg" : "hero-software";
}

/** The photo band before the terms: one per side, not tied to the job. */
export function bannerSlot(q: Pick<QuoteData, "division">): string {
  return q.division === "bygg" ? "band-bygg" : "band-software";
}

export const BANNER_LINE: Record<QuoteData["division"], string> = {
  bygg: "Fast pris, tydlig tidplan och ett ansvar hela vägen.",
  "01": "Byggt för att användas varje dag.",
};
