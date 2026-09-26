/** Content for the Software side (/mjukvara). Same pattern as
 *  lib/services-content.ts — placeholder-quality but real, specific copy.
 *  Review facts and FAQ answers before launch. */

export type SoftwareArea = {
  slug: string;
  title: string;
  meta: string;
  seo: { title: string; description: string };
  body: string;
  fitsIf: string[];
  engagement: { label: string; body: string };
  facts: { value: string; label: string }[];
  included: string[];
  faq: { q: string; a: string }[];
};

export const softwareStats = [
  { value: "2–8 v", label: "från start till lanserad webb" },
  { value: "100 %", label: "egen kod — ni äger den" },
  { value: "0", label: "underleverantörer i mellanledet" },
  { value: "2 dagar", label: "svar på er brief" },
];

export const softwareAreas: SoftwareArea[] = [
  {
    slug: "webb",
    title: "Webb & portaler",
    meta: "Sajter och kundportaler",
    seo: {
      title: "Webbutveckling och kundportaler för företag",
      description: "Vi bygger snabba webbplatser och inloggade kundportaler i Next.js. Redigerbart innehåll, SEO från start, fast pris per etapp och kod ni äger.",
    },
    body: "Publika sajter och inloggade kundportaler — snabba, mätbara och byggda så att ni själva kan ändra innehåll utan att vänta på en utvecklare för varje textrad.",
    fitsIf: [
      "Er nuvarande sajt är långsam, svår att uppdatera, eller inte mobilanpassad",
      "Ni vill ha en kundportal där användare loggar in och ser sin egen data",
      "SEO och synlighet i sökmotorer är viktigt för verksamheten",
    ],
    engagement: {
      label: "2–8 veckor",
      body: "Från första möte till lanserad sajt. Vi bygger på Next.js med innehåll ni själva kan redigera, och sätter upp analys och sökmotoroptimering som en del av leveransen.",
    },
    facts: [
      { value: "2–8 v", label: "till lansering" },
      { value: "Fast pris", label: "per etapp" },
      { value: "100 %", label: "ni äger koden" },
      { value: "Redigerbart", label: "innehåll utan oss" },
    ],
    included: [
      "Workshop och kravbild",
      "Design i er grafiska profil",
      "Utveckling och testning",
      "Redigerbart innehåll",
      "Analys och sökmotoroptimering",
      "Drift och support",
    ],
    faq: [
      { q: "Äger vi koden?", a: "Ja, helt. Koden ligger i ert konto och ni kan ta den till vem ni vill. Ingen inlåsning." },
      { q: "Kan vi uppdatera texter och bilder själva?", a: "Ja. Allt innehåll som ändras ofta går att redigera utan att ringa oss." },
      { q: "Vad kostar drift efter lansering?", a: "En fast månadsavgift som täcker hosting, uppdateringar och mindre ändringar. Den står i offerten, så ni vet innan ni bestämmer er." },
      { q: "Kan ni ta över en befintlig sajt?", a: "Ofta ja. Vi går igenom den nuvarande lösningen först och säger rakt ut om det är billigare att bygga vidare eller börja om." },
    ],
  },
  {
    slug: "automation",
    title: "Automation & integrationer",
    meta: "Integrationer och dataflöden",
    seo: {
      title: "Automation och systemintegration",
      description: "Koppla ihop system som inte pratar med varandra: API-integrationer, synk och automatiska flöden. Testat mot verklig data, med larm om något fallerar.",
    },
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
    facts: [
      { value: "1–4 v", label: "per integration" },
      { value: "API", label: "webhook eller synk" },
      { value: "Testat", label: "mot verklig data" },
      { value: "Larm", label: "om något går fel" },
    ],
    included: [
      "Kartläggning av flödet",
      "Integration via API eller webhook",
      "Schemalagd synkronisering",
      "Felhantering och larm",
      "Test mot verklig data",
      "Dokumentation",
    ],
    faq: [
      { q: "Vilka system kan ni koppla ihop?", a: "De flesta system som har ett API eller kan exportera data. Vi bekräftar vad som går redan i kartläggningen, innan ni betalar för något." },
      { q: "Vad händer om ett av systemen byts ut?", a: "Integrationen byggs så att den delen kan bytas utan att allt annat påverkas. Det står i dokumentationen hur." },
      { q: "Vem märker om en synk slutar fungera?", a: "Vi sätter upp larm som går till oss och till en utsedd person hos er, så att ett fel upptäcks samma dag." },
    ],
  },
  {
    slug: "interna-system",
    title: "Interna system",
    meta: "Offert, planering, uppföljning",
    seo: {
      title: "Interna system — offert, planering och uppföljning",
      description: "Skräddarsydda verksamhetssystem som ersätter Excel-ark: offert, planering och uppföljning med behörigheter och historik. Smalt först, i drift på veckor.",
    },
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
    facts: [
      { value: "4–12 v", label: "till första drift" },
      { value: "Smalt", label: "först, sedan bredare" },
      { value: "Roller", label: "behörigheter och historik" },
      { value: "Era", label: "rutiner, inte en mall" },
    ],
    included: [
      "Kartläggning av rutiner",
      "Datamodell och behörigheter",
      "Första version i drift",
      "Import från Excel",
      "Utbildning av användare",
      "Vidareutveckling",
    ],
    faq: [
      { q: "Varför inte bara köpa en standardprodukt?", a: "Ibland är det rätt svar, och då säger vi det. Ett eget system lönar sig när det som skiljer er från andra är just det standardprodukten saknar." },
      { q: "Kan vi börja i liten skala?", a: "Ja, det är så vi föredrar att jobba. Den första versionen löser ett problem och är i drift inom några veckor." },
      { q: "Kan vi flytta över data från Excel?", a: "Ja. Vi importerar befintliga ark och rättar upp dubbletter och luckor som en del av arbetet." },
    ],
  },
];

export const softwareProcess = [
  { n: "01", title: "Brief", body: "Berätta kort om läget — vad som kostar tid idag." },
  { n: "02", title: "Kartläggning", body: "Vi går igenom flödet och föreslår den smalaste lösningen som löser det." },
  { n: "03", title: "Vi bygger", body: "Korta cykler, tidiga demos, inga överraskningar vid leverans." },
  { n: "04", title: "Drift", body: "Vi står kvar efter lansering — samma team, inte ett ärendenummer." },
];

export const softwareFaq = [
  { q: "Jobbar ni bara med byggföretag?", a: "Nej. Vi förstår byggbranschen inifrån, men bygger system för alla verksamheter där manuellt dubbelarbete kostar tid." },
  { q: "Hur ser en offert ut?", a: "Ett fast pris per etapp, med en tydlig beskrivning av vad som ingår. Ni betalar för en etapp i taget och kan stanna efter vilken som helst." },
  { q: "Vem äger det vi bygger?", a: "Ni. Koden, datan och kontona ligger hos er från dag ett." },
  { q: "Vad händer efter lansering?", a: "Vi erbjuder drift och vidareutveckling till en fast månadskostnad. Samma personer som byggde systemet svarar när ni hör av er." },
];

export const techStack = ["Next.js", "TypeScript", "Supabase", "PostgreSQL", "Vercel", "Resend"];

export const softwareCases = [
  {
    slug: "binaafy-sajten",
    image: "case-binaafy-sajten",
    title: "Binaafy.se — den här sajten",
    client: "Binaafy (intern)",
    tag: "Webb",
    summary:
      "Från en statisk enkelsidig sajt till en Next.js-applikation med två verksamheter, redigerbart innehåll och strukturerad data för sökmotorer.",
    situation:
      "Företaget hade en enkel enkelsidig sajt utan möjlighet att lägga till fler sidor, ingen strukturerad data för sökmotorer, och inget sätt för ägaren att uppdatera innehåll utan att koda.",
    insats:
      "Vi byggde om sajten i Next.js med en sida för bygg och en för mjukvara under samma varumärke, förberedde en Supabase-databas för innehåll, leads och bildhantering, och satte upp schema.org-data för varje tjänstesida så att sökmotorer förstår vad företaget faktiskt erbjuder.",
    resultat: [
      { label: "12", desc: "indexerbara tjänstesidor, upp från 0" },
      { label: "2", desc: "verksamheter på samma domän, tydligt åtskilda" },
      { label: "1", desc: "kodbas som ägaren kan bygga vidare på" },
    ],
    stack: ["Next.js", "Supabase", "Vercel"],
  },
];
