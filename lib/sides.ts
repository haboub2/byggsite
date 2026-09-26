/* The two sides of Binaafy. Everything that changes between Bygg and
   Software on shared templates (landing, header, bridge, CTA) is read from
   here, so both sides always have the same set of fields. */

export type Side = "bygg" | "mjukvara";

type Link = { label: string; href: string };

export type SideConfig = {
  key: Side;
  label: string;
  home: string;
  word: string;
  lead: string;
  heroCta: Link;
  heroSecondary: Link;
  cta: Link;
  nav: Link[];
  hero: { image: string; dimV: string; dimH: string; caption: string };
  register: { eyebrow: string; title: string; aside: string };
  work: { eyebrow: string; title: string; all: Link };
  craft: { title: string; body: string; images: { slot: string; caption: string }[] };
  band: { slot: string; statement: string; caption: string };
  bridge: { title: string; body: string; link: Link; icon: string };
  closing: { eyebrow: string; title: string; body: string };
};

export const SIDES: Record<Side, SideConfig> = {
  bygg: {
    key: "bygg",
    label: "Bygg",
    home: "/",
    word: "hus",
    lead: "Renovering, ombyggnad och nybygg i Halmstad. Ett team, en kontaktperson, från första skiss till sista detalj.",
    heroCta: { label: "Berätta om ditt projekt", href: "/bygg/offert" },
    heroSecondary: { label: "Se våra projekt", href: "/bygg/projekt" },
    cta: { label: "Begär offert", href: "/bygg/offert" },
    nav: [
      { label: "Tjänster", href: "/bygg/tjanster" },
      { label: "Projekt", href: "/bygg/projekt" },
      { label: "Om oss", href: "/om-oss" },
      { label: "Kontakt", href: "/kontakt" },
    ],
    hero: { image: "hero-bygg", dimV: "2,7 m", dimH: "Fönsterparti", caption: "Material. Ljus. Funktion." },
    register: {
      eyebrow: "Register — vad vi gör",
      title: "Nio tjänster, ett team.",
      aside: "Välj en rad för att läsa mer. Allt görs av samma team, under samma projektansvar.",
    },
    work: { eyebrow: "Utvalda projekt", title: "Nyligen byggt i Halland.", all: { label: "Alla projekt", href: "/bygg/projekt" } },
    craft: {
      title: "Detaljerna ingen ser — förrän de saknas.",
      body: "Ett golv som ligger rakt, en fog som håller tätt, en list som möter väggen utan glipa. Det är där skillnaden syns efter tio år, och det är där vi lägger tiden.",
      images: [
        { slot: "detail-pencil", caption: "Mät två gånger" },
        { slot: "detail-chisel", caption: "Anpassa på plats" },
        { slot: "detail-timber", caption: "Rätt material" },
      ],
    },
    band: {
      slot: "band-bygg",
      statement: "Vi bygger för hur Halland ser ut i november — inte bara i juli.",
      caption: "Vind, salt och fukt. Västkustens villkor.",
    },
    bridge: {
      title: "Driver du själv ett byggföretag?",
      body: "Samma team bygger webb, automation och interna verktyg — med en byggares blick för hur en arbetsdag faktiskt ser ut.",
      link: { label: "Till Software", href: "/mjukvara" },
      icon: "code",
    },
    closing: {
      eyebrow: "En fråga, inte ett formulär",
      title: "Vad vill du bygga?",
      body: "Svar inom 24 timmar. Hembesöket är kostnadsfritt.",
    },
  },
  mjukvara: {
    key: "mjukvara",
    label: "Software",
    home: "/mjukvara",
    word: "system",
    lead: "Webb, automation och interna verktyg. Samma hantverkstänk som på byggsidan — bara i kod.",
    heroCta: { label: "Berätta om er idé", href: "/mjukvara/brief" },
    heroSecondary: { label: "Se våra case", href: "/mjukvara/case" },
    cta: { label: "Skicka brief", href: "/mjukvara/brief" },
    nav: [
      { label: "Tjänster", href: "/mjukvara/tjanster" },
      { label: "Case", href: "/mjukvara/case" },
      { label: "Om oss", href: "/om-oss" },
      { label: "Kontakt", href: "/kontakt" },
    ],
    hero: { image: "hero-software", dimV: "Flöde", dimH: "Steg 2 — portal", caption: "Struktur. Flöde. Funktion." },
    register: {
      eyebrow: "Register — vad vi gör",
      title: "Tre sätt att ta bort dubbelarbete.",
      aside: "Vi väljer aldrig teknik för teknikens skull. Varje uppdrag börjar med vad som kostar tid idag.",
    },
    work: { eyebrow: "Case", title: "Byggt och i drift.", all: { label: "Alla case", href: "/mjukvara/case" } },
    craft: {
      title: "Systemen ingen märker — förrän de slutar fungera.",
      body: "Rätt behörigheter, larm som går till rätt person, data som stämmer mellan systemen. Det syns inte i en demo, men det är det ni märker efter ett år.",
      images: [
        { slot: "detail-sketch", caption: "Skissa först" },
        { slot: "detail-dashboard", caption: "Mät det som spelar roll" },
        { slot: "automation-hero", caption: "Koppla ihop" },
      ],
    },
    band: {
      slot: "band-software",
      statement: "Det ni inte ser är det som gör att allt fungerar.",
      caption: "Integrationer, larm och backup. Inbyggt från start.",
    },
    bridge: {
      title: "Byggt av folk som bygger.",
      body: "Vår andra halva renoverar hus i Halmstad. Vi vet hur en arbetsdag på bygget ser ut — och vad ett system måste klara där.",
      link: { label: "Till Bygg", href: "/" },
      icon: "house",
    },
    closing: {
      eyebrow: "En fråga, inte ett formulär",
      title: "Vad vill ni bygga?",
      body: "Svar inom två arbetsdagar, med ett konkret förslag på upplägg.",
    },
  },
};

/** Which side a path belongs to; null for company pages shared by both. */
export function sideFromPath(pathname: string): Side | null {
  if (pathname === "/" || pathname.startsWith("/bygg")) return "bygg";
  if (pathname.startsWith("/mjukvara")) return "mjukvara";
  return null;
}

/** Where the side marker should send you: the matching section on the other side. */
export function counterpartPath(pathname: string, target: Side, projects = true): string {
  const from = sideFromPath(pathname);
  if (from === target) return pathname;
  const section = pathname.split("/")[2];
  if (target === "mjukvara") {
    if (section === "tjanster") return "/mjukvara/tjanster";
    if (section === "projekt") return "/mjukvara/case";
    if (section === "offert") return "/mjukvara/brief";
    return "/mjukvara";
  }
  if (section === "tjanster") return "/bygg/tjanster";
  if (section === "case") return projects ? "/bygg/projekt" : "/";
  if (section === "brief") return "/bygg/offert";
  return "/";
}
