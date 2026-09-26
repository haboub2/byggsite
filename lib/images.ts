import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Image slots. Each slot is a file name (without extension) in
 * public/images/, matching docs/image-prompts.md. Drop a file with that name
 * in the folder (jpg, jpeg, png, webp or avif) and every page using the slot
 * picks it up; until then the slot renders a labelled placeholder.
 */

const DIR = path.join(process.cwd(), "public", "images");
const EXTS = ["avif", "webp", "jpg", "jpeg", "png"];

export function resolveImage(slot: string): string | null {
  for (const ext of EXTS) {
    if (fs.existsSync(path.join(DIR, `${slot}.${ext}`))) return `/images/${slot}.${ext}`;
  }
  return null;
}

/** Alt text per slot. Mood images describe the scene; they never claim to be our work. */
export const imageAlt: Record<string, string> = {
  "hero-bygg": "Ljust skandinaviskt vardagsrum med stort fönster och ekgolv",
  "hero-software": "Arbetsplats med laptop och skisser på ett ekbord",
  "bridge-site-tablet": "Surfplatta med planeringsverktyg på en byggarbetsplats",
  "about-workshop": "Snickeriverkstad med verktyg i rader på väggen",
  "about-office": "Kontor med laptop, materialprover och ritningar",
  "place-halland-coast": "Hallandskusten en mulen dag",
  "totalrenovering-hero": "Renoverad villa med öppen planlösning",
  "badrum-hero": "Renoverat badrum i kalksten och ek",
  "kok-hero": "Renoverat kök med ekluckor och kalkstensbänk",
  "tillbyggnad-hero": "Modern tillbyggnad i mörk träpanel med glaspartier",
  "tak-hero": "Nylagt plåttak på ett svenskt hus",
  "golv-hero": "Nylagt brett ekgolv i ett tomt rum",
  "maleri-hero": "Nymålat rum med kalkputsade väggar",
  "el-vvs-hero": "Prydligt installationsrum med rör och värmepump",
  "projektledning-hero": "Ritning, tumstock och materialprover på ett bord",
  "webb-hero": "Laptop, surfplatta och mobil med samma webbplats",
  "automation-hero": "Prydligt nätverksskåp med kablar",
  "interna-system-hero": "Surfplatta med planeringsverktyg i en byggbod",
};

/** Service slug → hero image slot (Bygg slugs differ from the prompt file names). */
export const serviceImage: Record<string, string> = {
  totalrenovering: "totalrenovering-hero",
  badrumsrenovering: "badrum-hero",
  koksrenovering: "kok-hero",
  tillbyggnad: "tillbyggnad-hero",
  tak: "tak-hero",
  golv: "golv-hero",
  maleri: "maleri-hero",
  "el-vvs": "el-vvs-hero",
  projektledning: "projektledning-hero",
  webb: "webb-hero",
  automation: "automation-hero",
  "interna-system": "interna-system-hero",
};
