/** Long-form content for /01/tjanster and /01/case. Same pattern as
 *  lib/services-content.ts — placeholder-quality but real, specific copy. */

export type SoftwareArea = {
  slug: string;
  title: string;
  body: string;
  fitsIf: string[];
  engagement: { label: string; body: string };
};

export const softwareAreas: SoftwareArea[] = [
  {
    slug: "webb",
    title: "Webb & portaler",
    body: "Publika sajter och inloggade kundportaler — snabba, mätbara och byggda så att ni själva kan ändra innehåll utan att vänta på en utvecklare för varje textrad.",
    fitsIf: [
      "Er nuvarande sajt är långsam, svår att uppdatera, eller inte mobilanpassad",
      "Ni vill ha en kundportal där användare loggar in och ser sin egen data",
      "SEO och synlighet i sökmotorer är viktigt för verksamheten",
    ],
    engagement: {
      label: "2–8 veckor",
      body: "Från platsbesök till lanserad sajt. Vi bygger på Next.js med ett CMS ni själva kan redigera i, och sätter upp analys och sökmotoroptimering som en del av leveransen.",
    },
  },
  {
    slug: "automation",
    title: "Automation & integrationer",
    body: "Koppla ihop system som idag inte pratar med varandra. Om någon i teamet kopierar data mellan Excel, mejl och ett affärssystem varje vecka, är det ett automationsproblem, inte en personalfråga.",
    fitsIf: [
      "Samma information matas in manuellt på flera ställen",
      "Ni väntar på rapporter som borde kunna genereras automatiskt",
      "Två system (t.ex. bokföring och CRM) behöver synka data",
    ],
    engagement: {
      label: "1–4 veckor per integration",
      body: "Vi kartlägger flödet, bygger integrationen (API, webhook eller schemalagd synk), och testar mot verklig data innan den sätts i produktion.",
    },
  },
  {
    slug: "interna-system",
    title: "Interna system",
    body: "Verktyg för offert, planering och uppföljning — formade efter hur ni faktiskt jobbar, inte efter hur ett generiskt SaaS-verktyg tror att alla jobbar.",
    fitsIf: [
      "Ett standardverktyg täcker 80 % av behovet men saknar det som spelar roll för er",
      "Ni har flera Excel-ark som borde vara ett system med behörigheter och historik",
      "Verksamheten har vuxit ur sina nuvarande rutiner",
    ],
    engagement: {
      label: "4–12 veckor",
      body: "Vi börjar med det smalaste möjliga verktyget som löser det akuta problemet, sätter det i drift, och bygger vidare utifrån hur det faktiskt används.",
    },
  },
];

export const softwareCases = [
  {
    slug: "byggly-01-sajten",
    title: "Byggly 01 — den här sajten",
    client: "Byggly (intern)",
    summary:
      "Byggly bytte från en statisk enkelsidig sajt till en Next.js-applikation med två avdelningar, redigerbart innehåll och strukturerad data för sökmotorer.",
    situation:
      "Byggly hade en enkel enkelsidig sajt utan möjlighet att lägga till fler sidor, ingen strukturerad data för sökmotorer, och inget sätt för ägaren att uppdatera innehåll utan att koda.",
    insats:
      "01 byggde om sajten i Next.js med separata avdelningar för bygg och mjukvara, förberedde en Supabase-databas för innehåll, leads och bildhantering, och satte upp schema.org-data för varje tjänstesida så att sökmotorer förstår vad Byggly faktiskt erbjuder.",
    resultat: [
      { label: "9", desc: "indexerbara tjänstesidor, upp från 0" },
      { label: "2", desc: "avdelningar på samma domän, tydligt separerade" },
      { label: "1", desc: "kodbas som ägaren kan bygga vidare på själv" },
    ],
    stack: ["Next.js", "Supabase", "Vercel"],
  },
];
