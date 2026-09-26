import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Image slots. A slot resolves, in order, to:
 *   1. a file with that name in public/images/ (jpg, jpeg, png, webp, avif),
 *   2. a licensed stock photo from Unsplash (see STOCK below),
 *   3. nothing — the slot renders a labelled placeholder.
 * Real photos of our own work always win: drop a file in the folder and it
 * replaces the stock photo everywhere the slot is used.
 */

const DIR = path.join(process.cwd(), "public", "images");
const EXTS = ["avif", "webp", "jpg", "jpeg", "png"];

/** Unsplash photo IDs (Unsplash License: free for commercial use, no
 *  attribution required). Mood images only — never used for projects, team
 *  or cases, which must show our own work. Photo page: unsplash.com/photos/<id>. */
const STOCK: Record<string, string> = {
  "hero-bygg": "1774477178005-bff823e43be8",
  "hero-software": "1611269154421-4e27233ac5c7",
  "totalrenovering-hero": "1762545352529-1e624dad0548",
  "badrum-hero": "1661107259637-4e1c55462428",
  "kok-hero": "1721824288165-c1210e6e9898",
  "tillbyggnad-hero": "1704307023984-813727deade9",
  "tak-hero": "1602193230408-1260b7393bf6",
  "golv-hero": "1648624219254-1adcd4e49bc6",
  "maleri-hero": "1693985120993-e9b203ce7631",
  "el-vvs-hero": "1694827893591-af9b80361599",
  "projektledning-hero": "1503387837-b154d5074bd2",
  "webb-hero": "1601656269222-fda862e6dc7d",
  "automation-hero": "1544197150-b99a580bb7a8",
  "interna-system-hero": "1778074762022-c33cc42f79ae",
  "about-workshop": "1590880795696-20c7dfadacde",
  "band-bygg": "1780689978569-9a281be2e4ec",
  "band-software": "1683322499436-f4383dd59f5a",
  "detail-pencil": "1659930087003-2d64e33181f7",
  "detail-chisel": "1497219055242-93359eeed651",
  "detail-timber": "1590635022668-81cc8696a19d",
  "detail-dashboard": "1551288049-bebda4e38f71",
  "detail-sketch": "1764740109279-c7a8abd78821",
};

export function resolveImage(slot: string): string | null {
  for (const ext of EXTS) {
    if (fs.existsSync(path.join(DIR, `${slot}.${ext}`))) return `/images/${slot}.${ext}`;
  }
  const id = STOCK[slot];
  return id ? `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=2400&q=80` : null;
}

export function hasImage(slot: string): boolean {
  return resolveImage(slot) !== null;
}

/** Alt text per slot. Describes the scene; never claims the photo is our work. */
export const imageAlt: Record<string, string> = {
  "hero-bygg": "Fåtölj och golvlampa i ljuset från ett stort fönster",
  "hero-software": "Enkelt skrivbord i trä vid en ljus vägg",
  "totalrenovering-hero": "Öppen planlösning med kök och matplats i trä",
  "badrum-hero": "Badrum i natursten med kommod i ek",
  "kok-hero": "Kök i svart och ek vid ett fönster",
  "tillbyggnad-hero": "Trähus med stora glaspartier mot ett trädäck",
  "tak-hero": "Mörkt falsat plåttak mot en grå himmel",
  "golv-hero": "Solljus över breda golvplankor",
  "maleri-hero": "Vägg som målas med roller",
  "el-vvs-hero": "Kopparrör i en öppen vägg",
  "projektledning-hero": "Ritning som tas fram med skalstock och penna",
  "webb-hero": "Bildskärm på ett ljust skrivbord",
  "automation-hero": "Nätverkskabel ansluten till en switch",
  "interna-system-hero": "Två personer på ett bygge går igenom ritningar på en surfplatta",
  "about-workshop": "Snickeriverkstad i dagsljus",
  "band-bygg": "Mörkt trähus i ett dynlandskap",
  "band-software": "Kablar i ett serverrack",
  "detail-pencil": "Blyertsmarkering på en träbräda",
  "detail-chisel": "Stämjärn som formar trä",
  "detail-timber": "Sågat virke i stapel",
  "detail-dashboard": "Instrumentpanel med diagram på en skärm",
  "detail-sketch": "Laptop och ritningar på ett skrivbord",
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
