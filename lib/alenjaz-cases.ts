import { emptyCase, type Case } from "./case-schema";

/**
 * Software cases brought over from the Alenjaz portfolio (al-enjaz.vercel.app/en/work),
 * rewritten in Swedish. They are drafts: nothing here shows on the site until
 * someone opens the case in /admin, adds a cover photo and publishes it.
 *
 * Used by the local demo store (lib/cases.ts) and by `npm run db:import-cases`,
 * which adds them to Supabase without touching cases that already exist.
 * The Binaafy case is left out because the site already has it (binaafy-sajten).
 */
const draft = (sort: number, c: Partial<Case> & Pick<Case, "slug" | "title" | "client" | "summary">): Case => ({
  ...emptyCase(sort),
  featured: false,
  published: false,
  ...c,
});

export const alenjazCases: Case[] = [
  draft(100, {
    slug: "auto-bazar-app",
    title: "Auto Bazar — appen",
    client: "Auto Bazar",
    area: "plattformar",
    platform: "app",
    country: "Syrien",
    year: 2026,
    summary: "Marknadsplatsens app för iPhone och Android, med chatt i realtid, bevakade sökningar och lokala betalsätt.",
    situation:
      "Marknadsplatsen behövde riktiga appar för iPhone och Android, med chatt, notiser och betalningar. Det på en marknad där de flesta internationella betaltjänster inte finns.",
    solution:
      "Vi byggde en app som finns i både App Store och Google Play. Köpare och säljare chattar i realtid, får en notis när något de bevakar dyker upp, och bokar och betalar med lokala betalsätt. I bakgrunden håller en automation varumärket aktivt i sociala medier varje dag.",
    metrics: [
      { value: "2", label: "appbutiker: App Store och Google Play" },
      { value: "5", label: "kategorier" },
      { value: "AR+EN", label: "helt tvåspråkig" },
      { value: "24/7", label: "automatiska notiser och inlägg" },
    ],
    features: [
      "Chatt i realtid mellan köpare och säljare",
      "Notiser för bevakade sökningar",
      "Lokala betalsätt",
      "Bokningar och premiumannonser",
      "Inloggning med Apple och Google",
      "Automatiska inlägg i sociala medier",
    ],
    stack: ["Flutter"],
    appStore: "https://apps.apple.com/us/app/id6769161259",
    playStore: "https://play.google.com/store/apps/details?id=com.elenjaz.haboub",
  }),
  draft(110, {
    slug: "auto-bazar-webb",
    title: "Auto Bazar — marknadsplatsen",
    client: "Auto Bazar",
    area: "plattformar",
    platform: "web",
    country: "Syrien",
    year: 2026,
    url: "https://autobazarsyria.com",
    summary: "En tvåspråkig marknadsplats för bilar, delar, bostäder och uthyrning, byggd för svaga uppkopplingar och för att synas på Google.",
    situation:
      "Köpare och säljare i Syrien var utspridda i grupper på sociala medier, utan ett ställe att lita på för bilar, delar, bostäder och uthyrning. Auto Bazar behövde en snabb marknadsplats med arabiska först, som fungerar även på svag uppkoppling.",
    solution:
      "Vi designade och byggde en tvåspråkig marknadsplats där vem som helst kan lägga upp eller hitta en annons på några minuter. Den har smart sökning, ett steg-för-steg-flöde för att sälja och en översikt för säljare. Sajten installeras på telefonen som en app och byggdes för att ranka på Google från första dagen.",
    metrics: [
      { value: "5", label: "kategorier på en marknadsplats" },
      { value: "14", label: "provinser i Syrien" },
      { value: "AR+EN", label: "helt tvåspråkig" },
      { value: "PWA", label: "installeras som en app" },
    ],
    features: [
      "Bilar, delar, bostäder och uthyrning på ett ställe",
      "Sök på stad, märke och modell",
      "En annons på några minuter, steg för steg",
      "Översikt för säljare med bokningar och bevakningar",
      "Notiser direkt, och fungerar utan uppkoppling",
      "Byggd för att hittas på Google",
    ],
    stack: ["Next.js", "React", "TypeScript"],
    appStore: "https://apps.apple.com/us/app/id6769161259",
    playStore: "https://play.google.com/store/apps/details?id=com.elenjaz.haboub",
  }),
  draft(120, {
    slug: "ostazi",
    title: "Ostazi",
    client: "Ostazi",
    area: "plattformar",
    platform: "web",
    country: "Saudiarabien",
    year: 2026,
    url: "https://ostazi-lovat.vercel.app",
    summary: "En plattform för privatlektioner som kopplar ihop elever i Saudiarabien med granskade lärare.",
    situation:
      "Föräldrar i Saudiarabien har svårt att hitta en lärare de kan lita på. Förmedlingen som skulle lösa det drevs med kalkylark, WhatsApp-trådar och betalningar som fördes för hand.",
    solution:
      "Vi byggde en plattform för föräldrar, lärare och förmedlingen. Föräldrar hittar och bokar en granskad lärare och betalar direkt. Lärare sköter sitt schema, och förmedlingen matchar och betalar ut från en och samma översikt. Lektionerna sker över video.",
    metrics: [
      { value: "3", label: "portaler i en produkt" },
      { value: "8", label: "ämnen, bland annat Qudurat och Tahsili" },
      { value: "AR", label: "arabiska först" },
    ],
    features: [
      "Lärarprofiler och bokning direkt",
      "Lektionspaket som betalas i förväg",
      "Lärarportal för schema och anteckningar",
      "Föräldraportal med läxor och ombokning",
      "Översikt för matchning och utbetalningar",
      "Inloggning utan lösenord",
    ],
    stack: ["Next.js", "React"],
  }),
  draft(130, {
    slug: "fastighetsplattform",
    title: "Fastighetsplattform med eget CRM",
    client: "Abu Shafiq Real Estate",
    area: "interna-system",
    platform: "web",
    country: "Syrien",
    year: 2026,
    summary: "En tvåspråkig fastighetssajt med sök och filter, och ett internt system där mäklarkontoret sköter annonser och köpare från telefonen.",
    situation:
      "Ett upptaget mäklarkontor hade sina objekt, köparnas önskemål och alla samtal på papper och i WhatsApp. Det fanns ingen sajt att visa objekten för nya kunder.",
    solution:
      "Vi byggde en fastighetssajt med bra sökning och ett internt system där kontoret lägger upp objekt och bilder, håller koll på vad varje köpare letar efter och svarar på förfrågningar. Allt går att sköta från telefonen.",
    metrics: [
      { value: "14", label: "provinser att söka i" },
      { value: "11", label: "typer av fastigheter" },
      { value: "PWA", label: "installeras som en app" },
    ],
    features: [
      "Sök på typ, område och pris",
      "Bildgallerier med WhatsApp-knapp",
      "Enkel hantering av annonser",
      "Köparförfrågningar med knappar för samtal och WhatsApp",
      "Installeras på telefonen som en app",
    ],
    stack: ["Next.js", "React"],
  }),
  draft(140, {
    slug: "hhm-kabelverlegung",
    title: "HHM Kabelverlegung",
    client: "HHM Kabelverlegung",
    area: "webb",
    platform: "web",
    country: "Tyskland",
    year: 2024,
    url: "https://hhm-kabelverlegung.de",
    summary: "En tyskspråkig företagssajt för en kabel- och infrastrukturentreprenör, med en egen admin där ägaren uppdaterar allt själv.",
    situation:
      "En tysk entreprenör inom kabelförläggning behövde en trovärdig sajt för att vinna uppdrag från företag och kommuner, och ett sätt att uppdatera den utan att ringa en utvecklare.",
    solution:
      "Vi byggde en snabb företagssajt på tyska som gör besökare till förfrågningar. Till den hör en privat admin där ägaren kan ändra varje del av sajten utan hjälp.",
    metrics: [
      { value: "DE", label: "byggd för den tyska marknaden" },
      { value: "100 %", label: "av innehållet redigerbart av ägaren" },
    ],
    features: ["Tydlig översikt över tjänsterna", "Kontaktformulär direkt till inkorgen", "Privat admin för att uppdatera sajten"],
  }),
  draft(150, {
    slug: "walla-matchning",
    title: "Walla Matchning",
    client: "Walla Matchning AB",
    area: "webb",
    platform: "web",
    country: "Sverige",
    year: 2026,
    url: "https://www.wallajobb.se",
    summary: "Ett eget WordPress-tema för en bemannings- och rekryteringsbyrå i Halmstad, som teamet redigerar själva utan sidbyggare.",
    situation:
      "Byrån hade en gammal och långsam sajt som var svår att redigera och som inte talade tydligt till vare sig arbetssökande eller arbetsgivare.",
    solution:
      "Vi byggde en snabb WordPress-sajt i byråns egen identitet, med tydliga vägar för arbetssökande och för arbetsgivare. Teamet kan ändra allt själva, utan utvecklare.",
    metrics: [
      { value: "8", label: "sidor klara från första dagen" },
      { value: "0", label: "utvecklare behövs för ändringar" },
    ],
    features: [
      "Egna vägar för arbetssökande och arbetsgivare",
      "CV- och kontaktformulär direkt till inkorgen",
      "Allt redigerbart av teamet",
      "Snabb, lätt och enkel att underhålla",
    ],
    stack: ["WordPress"],
  }),
  draft(160, {
    slug: "mawqef",
    title: "Mawqef — digital parkering",
    client: "Mawqef",
    area: "plattformar",
    platform: "both",
    status: "dev",
    country: "Syrien",
    year: 2026,
    summary: "En plattform för gatuparkering i Syrien: förare betalar med en QR-kod, kontrollanter kollar bilar på sekunder och kommunen ser intäkterna på en karta.",
    situation:
      "Gatuparkering i syriska städer sköts med kontanter, papperslappar och gissningar. Kommunen har ingen överblick och förarna ingen bekvämlighet.",
    solution:
      "En hel plattform för digital parkering. Förare skannar en QR-kod och betalar från sin plånbok i appen, kontrollanter kollar en bil på några sekunder, och kommunen sköter zoner, priser och intäkter live på en karta.",
    metrics: [
      { value: "3", label: "appar, en plattform" },
      { value: "QR", label: "skanna och betala" },
      { value: "Live", label: "intäkter på en karta" },
    ],
    features: [
      "Förarapp med QR-parkering och digital plånbok",
      "Kontrollantapp som kollar registreringsnummer på sekunder",
      "Översikt för kommunen med zoner på en karta",
      "Utskrivbara zonskyltar med QR-koder",
      "Lokala sätt att fylla på och värdekort",
    ],
    stack: ["Flutter", "Next.js"],
  }),
];
