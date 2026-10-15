import { emptyCustomer, emptyTerms, newItemId, type QuoteData, type QuoteDivision, type QuoteItem } from "./schema";
import type { QuoteSettings } from "../content/schema";

/**
 * Built-in quote templates: a sensible starting point per service, with
 * example rows the admin edits or deletes. Prices are placeholders in the
 * same spirit as lib/pricing.ts. Admins can also save any quote as their
 * own template (stored in quote_templates, see lib/quotes/store.ts).
 */

export type BuiltInTemplate = {
  key: string;
  name: string;
  division: QuoteDivision;
  description: string;
  title: string;
  intro: string;
  pricesInclVat: boolean;
  rot: boolean;
  items: Omit<QuoteItem, "id">[];
  terms?: Partial<QuoteData["terms"]>;
};

const row = (
  description: string,
  qty: number,
  unit: string,
  unitPrice: number,
  kind: QuoteItem["kind"] = "labor"
): Omit<QuoteItem, "id"> => ({ description, qty, unit, unitPrice, vatRate: 25, kind });

export const builtInTemplates: BuiltInTemplate[] = [
  {
    key: "tom",
    name: "Tom offert",
    division: "bygg",
    description: "Börja från noll.",
    title: "",
    intro: "",
    pricesInclVat: true,
    rot: true,
    items: [],
  },
  {
    key: "badrum",
    name: "Badrumsrenovering",
    division: "bygg",
    description: "Rivning, tätskikt, kakel, VVS och el. Arbete och material på egna rader.",
    title: "Renovering av badrum",
    intro:
      "Tack för att vi fick komma på hembesök. Nedan följer vår offert på renovering av badrummet enligt det vi gick igenom. Arbetet utförs enligt Säker Vatten och Byggkeramikrådets branschregler, med dokumentation av tätskiktet.",
    pricesInclVat: true,
    rot: true,
    items: [
      row("Rivning av befintligt badrum, bortforsling och deponi", 1, "kpl", 12_000),
      row("Tätskikt, golv och väggar, enligt BBV", 1, "kpl", 22_000),
      row("Plattsättning golv och väggar, inkl. fog och mjukfog", 1, "kpl", 38_000),
      row("VVS: nya ledningar, golvbrunn, dusch, WC och tvättställ", 1, "kpl", 24_000),
      row("El: golvvärme, spotlights, nytt uttag, jordfelsbrytare", 1, "kpl", 14_000),
      row("Kakel och klinker enligt val", 1, "kpl", 18_000, "material"),
      row("Sanitetsporslin, blandare och duschvägg", 1, "kpl", 24_000, "material"),
      row("Övrigt material: tätskiktssystem, fix, fog, golvvärmematta", 1, "kpl", 16_000, "material"),
    ],
    terms: {
      start: "Preliminär start enligt överenskommelse. Byggtid cirka 3–5 veckor.",
      excluded:
        "Eventuella dolda fel som upptäcks vid rivning (t.ex. fuktskador i bjälklag) regleras separat efter att vi stämt av med er. Bygglov eller anmälan till BRF ingår inte.",
    },
  },
  {
    key: "kok",
    name: "Köksrenovering",
    division: "bygg",
    description: "Rivning, montering av stommar, bänkskivor, el och VVS.",
    title: "Renovering av kök",
    intro:
      "Här är vår offert på köket enligt ritningen vi gick igenom tillsammans. Vi samordnar snickeri, el och VVS så att ni har en kontaktperson genom hela projektet.",
    pricesInclVat: true,
    rot: true,
    items: [
      row("Rivning av befintligt kök och bortforsling", 1, "kpl", 8_000),
      row("Montering av köksstommar, luckor och lådor", 1, "kpl", 26_000),
      row("Montering av bänkskiva, diskho och stänkskydd", 1, "kpl", 9_000),
      row("El: nya uttag, belysning och anslutning av vitvaror", 1, "kpl", 12_000),
      row("VVS: flytt av vatten och avlopp, anslutning av diskmaskin", 1, "kpl", 9_000),
      row("Spackling och målning av väggar och tak", 1, "kpl", 7_000),
      row("Material enligt separat specifikation (stommar, luckor, bänkskiva)", 1, "kpl", 95_000, "material"),
    ],
    terms: { start: "Preliminär start enligt överenskommelse. Byggtid cirka 2–4 veckor efter att köket levererats." },
  },
  {
    key: "golv",
    name: "Golvläggning",
    division: "bygg",
    description: "Per kvadratmeter, inkl. avjämning och lister.",
    title: "Golvläggning",
    intro: "Tack för förfrågan. Nedan följer vår offert på nytt golv enligt uppmätning.",
    pricesInclVat: true,
    rot: true,
    items: [
      row("Rivning av befintligt golv och bortforsling", 40, "m²", 120),
      row("Avjämning av undergolv", 40, "m²", 180),
      row("Läggning av golv inkl. underlag", 40, "m²", 350),
      row("Golvlister, kapning och montering", 36, "lpm", 90),
      row("Golv, underlag och lister enligt val", 40, "m²", 450, "material"),
    ],
  },
  {
    key: "maleri",
    name: "Målning",
    division: "bygg",
    description: "Per rum: spackling, grundning och två strykningar.",
    title: "Målning",
    intro: "Tack för förfrågan. Nedan följer vår offert på målningsarbetet enligt det vi gick igenom.",
    pricesInclVat: true,
    rot: true,
    items: [
      row("Täckning, spackling och slipning", 3, "rum", 1_800),
      row("Grundning och två strykningar väggar och tak", 3, "rum", 3_400),
      row("Färg, spackel och förbrukningsmaterial", 3, "rum", 900, "material"),
    ],
  },
  {
    key: "lopande",
    name: "Löpande räkning",
    division: "bygg",
    description: "Timpris och uppskattat antal timmar. Material enligt faktisk kostnad.",
    title: "Arbete på löpande räkning",
    intro:
      "Nedan följer vår offert på arbete enligt löpande räkning. Antalet timmar är en uppskattning; vi stämmer av med er löpande och fakturerar faktisk tid.",
    pricesInclVat: true,
    rot: true,
    items: [
      row("Snickare, timpris", 40, "tim", 650),
      row("Material enligt faktisk kostnad (uppskattning)", 1, "kpl", 10_000, "material"),
    ],
    terms: { payment: "Faktureras varje månad efter utförd tid. Betalningsvillkor 20 dagar." },
  },
  {
    key: "tom-01",
    name: "Tom offert",
    division: "01",
    description: "Börja från noll.",
    title: "",
    intro: "",
    pricesInclVat: false,
    rot: false,
    items: [],
  },
  {
    key: "webb",
    name: "Webbplats",
    division: "01",
    description: "Fast pris per etapp: workshop, design, utveckling, lansering.",
    title: "Ny webbplats",
    intro:
      "Tack för ett bra möte. Nedan följer vårt förslag på upplägg och pris för er nya webbplats. Vi arbetar i etapper med fast pris, så att ni alltid vet vad nästa steg kostar. Ni äger all kod och allt innehåll.",
    pricesInclVat: false,
    rot: false,
    items: [
      row("Etapp 1: workshop, kravbild och sitemap", 1, "kpl", 12_000),
      row("Etapp 2: design i er grafiska profil, desktop och mobil", 1, "kpl", 28_000),
      row("Etapp 3: utveckling i Next.js, redigerbart innehåll, formulär", 1, "kpl", 55_000),
      row("Etapp 4: sökmotoroptimering, analys, lansering och utbildning", 1, "kpl", 9_000),
      row("Drift och support, per månad (tillval)", 12, "mån", 900, "other"),
    ],
    terms: {
      payment: "Varje etapp faktureras när den är godkänd av er. Betalningsvillkor 30 dagar.",
      start: "Start inom två veckor från beställning. Lansering cirka 6–8 veckor senare, beroende på när vi får innehåll och återkoppling.",
      excluded: "Domän, hosting hos tredje part, fotografering och skrivande av texter ingår inte om inte annat anges ovan.",
    },
  },
  {
    key: "portal",
    name: "Kundportal / internt system",
    division: "01",
    description: "Inloggad applikation med databas, roller och integrationer.",
    title: "Kundportal",
    intro:
      "Här är vårt förslag på en kundportal enligt den brief ni skickade. Vi bygger en första version som går att använda på riktigt, och vidareutvecklar sedan i korta etapper tillsammans med er.",
    pricesInclVat: false,
    rot: false,
    items: [
      row("Kravbild, flöden och datamodell", 1, "kpl", 18_000),
      row("Inloggning, roller och behörigheter", 1, "kpl", 22_000),
      row("Kärnfunktioner enligt brief (första version)", 1, "kpl", 95_000),
      row("Integration mot befintligt system (t.ex. Fortnox)", 1, "kpl", 24_000),
      row("Testning, driftsättning och utbildning", 1, "kpl", 14_000),
      row("Drift, övervakning och support, per månad", 12, "mån", 1_900, "other"),
    ],
    terms: {
      payment: "30 % vid beställning, 40 % vid godkänd testversion, 30 % vid driftsättning. Betalningsvillkor 30 dagar.",
      start: "Start enligt överenskommelse. Första version i drift cirka 8–12 veckor efter start.",
    },
  },
  {
    key: "automation",
    name: "Automation",
    division: "01",
    description: "Koppla ihop system och ta bort manuella steg.",
    title: "Automation av arbetsflöde",
    intro:
      "Nedan följer vårt förslag på hur vi tar bort dubbelarbetet ni beskrev. Vi börjar med det flöde som kostar mest tid i dag och mäter effekten innan vi går vidare.",
    pricesInclVat: false,
    rot: false,
    items: [
      row("Kartläggning av nuvarande flöde och datakällor", 1, "kpl", 9_000),
      row("Integration och automatisering av flödet", 1, "kpl", 32_000),
      row("Larm, loggning och felhantering", 1, "kpl", 8_000),
      row("Drift och övervakning, per månad", 12, "mån", 700, "other"),
    ],
    terms: { payment: "Faktureras vid driftsättning. Betalningsvillkor 30 dagar." },
  },
  {
    key: "timmar",
    name: "Timbank",
    division: "01",
    description: "Förbetalda timmar för utveckling och support.",
    title: "Timbank för utveckling och support",
    intro: "Nedan följer vårt förslag på en timbank. Timmarna används till utveckling, ändringar och support, och ni får en sammanställning varje månad.",
    pricesInclVat: false,
    rot: false,
    items: [row("Utveckling och support, timpris", 40, "tim", 950)],
    terms: { payment: "Faktureras i förskott. Timmarna gäller i 12 månader från fakturadatum." },
  },
];

export function templatesFor(division: QuoteDivision): BuiltInTemplate[] {
  return builtInTemplates.filter((t) => t.division === division);
}

/** A fresh quote from a built-in template, with the company's default terms filled in. */
export function quoteFromTemplate(t: BuiltInTemplate, settings: QuoteSettings, date: string): QuoteData {
  const d = t.division === "bygg" ? settings.bygg : settings.software;
  return {
    division: t.division,
    title: t.title,
    intro: t.intro || d.intro,
    customer: { ...emptyCustomer, type: t.division === "bygg" ? "privat" : "foretag" },
    items: t.items.map((i) => ({ ...i, id: newItemId() })),
    pricesInclVat: t.pricesInclVat,
    rot: t.rot,
    rotPersons: [],
    validDays: settings.validDays,
    paymentDays: settings.paymentDays,
    terms: {
      ...emptyTerms,
      payment: t.terms?.payment ?? d.payment,
      start: t.terms?.start ?? "",
      warranty: t.terms?.warranty ?? d.warranty,
      excluded: t.terms?.excluded ?? d.excluded,
      notes: t.terms?.notes ?? d.notes,
    },
    date,
    leadId: null,
  };
}
