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
  /** Long-form copy, rendered like the Bygg service pages. */
  sections: { heading: string; body: string }[];
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
    ],
    included: [
      "Workshop och kravbild",
      "Design i er grafiska profil",
      "Utveckling och testning",
      "Redigerbart innehåll",
      "Analys och sökmotoroptimering",
      "Drift och support",
    ],
    sections: [
      {
        heading: "Vad ni får",
        body: "En webbplats eller kundportal som laddar snabbt på mobilen, syns i sökmotorer och som ni själva kan uppdatera. Vi bygger i Next.js och TypeScript, samma teknik som stora e-handlare och mediehus använder, och publicerar på en global server så att sidorna öppnas på bråkdelen av en sekund. Texter, bilder, priser och nyheter ändrar ni i en enkel admin, utan att behöva kunna kod eller vänta på oss.",
      },
      {
        heading: "Så går ett projekt till",
        body: "Vi börjar med en workshop där vi går igenom era kunder, vad de ska kunna göra på sajten och vad som ska mätas. Därefter tar vi fram struktur och design i er grafiska profil, och ni godkänner innan vi bygger. Utvecklingen sker i korta etapper med en förhandsvisning efter varje steg, så att ni ser sajten växa fram och kan styra tidigt. Lanseringen gör vi tillsammans, med omdirigeringar från gamla adresser så att ni inte tappar besökare från Google.",
      },
      {
        heading: "Sökmotoroptimering från start",
        body: "Snabbhet, tydliga rubriker, beskrivande sidtitlar och strukturerad data är inget vi lägger till i efterhand — det ingår i hur vi bygger. Varje sida får en egen adress, en egen beskrivning och en delningsbild för sociala medier. Vi sätter även upp sitemap, analys och sökmotorernas verktyg, så att ni ser vilka sidor som ger besök och förfrågningar.",
      },
      {
        heading: "Kundportaler och inloggning",
        body: "När kunder ska logga in och se sin egen information — ordrar, dokument, bokningar eller fakturor — bygger vi en portal med säker inloggning och behörigheter. Varje användare ser bara sin egen data, och ni styr vem som har tillgång till vad. Portalen kan kopplas till ert affärssystem så att informationen alltid är aktuell, utan att någon behöver föra över den för hand.",
      },
      {
        heading: "Efter lansering",
        body: "Vi försvinner inte när sajten är live. För en fast månadsavgift tar vi hand om drift, säkerhetsuppdateringar, säkerhetskopior och mindre ändringar, och vi följer upp hur sajten presterar. Ni äger koden och allt innehåll, och kan när som helst ta det vidare till någon annan.",
      },
    ],
    faq: [
      { q: "Äger vi koden?", a: "Ja, helt. Koden ligger i ert konto och ni kan ta den till vem ni vill. Ingen inlåsning." },
      { q: "Kan vi uppdatera texter och bilder själva?", a: "Ja. Allt innehåll som ändras ofta går att redigera utan att ringa oss." },
      { q: "Vad kostar drift efter lansering?", a: "En fast månadsavgift som täcker hosting, uppdateringar och mindre ändringar. Den står i offerten, så ni vet innan ni bestämmer er." },
      { q: "Kan ni ta över en befintlig sajt?", a: "Ofta ja. Vi går igenom den nuvarande lösningen först och säger rakt ut om det är billigare att bygga vidare eller börja om." },
      { q: "Hur lång tid tar det att bygga en webbplats?", a: "En företagssajt tar oftast 2–4 veckor från första möte till lansering, en kundportal med inloggning 4–8 veckor. Tidplanen står i offerten." },
      { q: "Behåller vi vår placering i Google om vi byter sajt?", a: "Ja, om bytet görs rätt. Vi lägger upp omdirigeringar från alla gamla adresser och behåller det innehåll som ger besök, så att ni inte tappar trafik vid lanseringen." },
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
    sections: [
      {
        heading: "Vad automation kan lösa",
        body: "I de flesta företag finns uppgifter som någon gör varje vecka för att två system inte pratar med varandra: ordrar som skrivs in igen i bokföringen, kunduppgifter som kopieras från ett formulär till CRM:et, rapporter som klistras ihop från flera Excel-ark. Varje sådan uppgift tar tid och ger risk för fel. En integration flyttar informationen automatiskt, i rätt format och i rätt ögonblick.",
      },
      {
        heading: "Så går ett projekt till",
        body: "Vi börjar med att kartlägga flödet tillsammans med den som gör jobbet idag: var informationen kommer ifrån, vart den ska och vad som kan gå fel på vägen. Därefter bekräftar vi att systemen har de gränssnitt som krävs, innan ni betalar för själva bygget. Integrationen byggs och testas mot verklig data i en testmiljö, och sätts i drift först när ni har sett att resultatet stämmer.",
      },
      {
        heading: "Tekniken bakom",
        body: "Beroende på systemen kopplar vi ihop dem via API, webhooks som reagerar direkt när något händer, eller schemalagda körningar som synkar vid fasta tider. Vi bygger integrationen som en egen, liten tjänst som ni äger, i stället för att låsa er till ett abonnemang på en integrationsplattform. Varje steg loggas, så att det går att se exakt vad som har flyttats och när.",
      },
      {
        heading: "När något går fel",
        body: "Ett system kan vara nere, en leverantör kan ändra sitt gränssnitt eller en post kan sakna en uppgift. Integrationen är byggd för att hantera det: den försöker igen, lägger felaktiga poster åt sidan i stället för att stoppa allt, och skickar ett larm till oss och till en utsedd person hos er. Ett fel upptäcks samma dag, inte vid månadsbokslutet.",
      },
      {
        heading: "Efter lansering",
        body: "Vi dokumenterar hur integrationen fungerar och hur den byggs om om ett av systemen byts ut. Med ett supportavtal övervakar vi den löpande, uppdaterar den när leverantörerna ändrar sina gränssnitt och bygger ut den när nya flöden behövs.",
      },
    ],
    faq: [
      { q: "Vilka system kan ni koppla ihop?", a: "De flesta system som har ett API eller kan exportera data. Vi bekräftar vad som går redan i kartläggningen, innan ni betalar för något." },
      { q: "Vad händer om ett av systemen byts ut?", a: "Integrationen byggs så att den delen kan bytas utan att allt annat påverkas. Det står i dokumentationen hur." },
      { q: "Vem märker om en synk slutar fungera?", a: "Vi sätter upp larm som går till oss och till en utsedd person hos er, så att ett fel upptäcks samma dag." },
      { q: "Vad kostar en integration?", a: "Det beror på hur många system och flöden som ingår. Efter kartläggningen får ni ett fast pris per integration, och en fast månadsavgift om ni vill att vi övervakar och underhåller den." },
      { q: "Måste vi byta system för att automatisera?", a: "Nej. Poängen är oftast att behålla de system ni redan använder och låta dem utbyta information automatiskt." },
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
    ],
    included: [
      "Kartläggning av rutiner",
      "Datamodell och behörigheter",
      "Första version i drift",
      "Import från Excel",
      "Utbildning av användare",
      "Vidareutveckling",
    ],
    sections: [
      {
        heading: "Vad ett internt system ersätter",
        body: "Många verksamheter körs på en blandning av Excel-ark, mejltrådar och ett standardverktyg som nästan räcker. Det fungerar tills fler personer ska arbeta i samma underlag, någon skriver över en annans ändringar eller ingen vet vilken version som gäller. Ett internt system samlar informationen på ett ställe, med rätt behörigheter, historik över vem som ändrat vad och flöden som följer hur ni faktiskt arbetar.",
      },
      {
        heading: "Så går ett projekt till",
        body: "Vi börjar med att följa en vanlig arbetsdag: hur en offert tas fram, hur jobb planeras och hur uppföljningen görs. Utifrån det bygger vi den smalaste versionen som löser det mest akuta problemet och sätter den i drift inom några veckor. Sedan bygger vi vidare i korta etapper, utifrån hur systemet faktiskt används, i stället för att försöka förutse allt i en lång kravspecifikation.",
      },
      {
        heading: "Exempel på vad vi bygger",
        body: "Offertverktyg som räknar fram pris och material och skickar en snygg offert till kunden. Planeringstavlor där alla ser vem som är var och vilka jobb som väntar. Uppföljning av tid, material och lönsamhet per projekt. Kundregister med historik över varje kontakt. Gemensamt för alla är att de är formade efter er verksamhet, inte tvärtom.",
      },
      {
        heading: "Säkerhet och behörigheter",
        body: "Varje användare loggar in personligt och ser bara det hen behöver. Behörigheter styrs per roll — till exempel säljare, projektledare och ekonomi — och varje ändring sparas med tid och namn. Data lagras i en databas inom EU med dagliga säkerhetskopior, och ni kan när som helst exportera allt.",
      },
      {
        heading: "Efter lansering",
        body: "Vi utbildar användarna, finns med de första veckorna när rutinerna sätter sig och tar hand om drift och uppdateringar för en fast månadsavgift. När verksamheten förändras bygger vi vidare på systemet, så att det växer med er i stället för att bli nästa sak ni växer ur.",
      },
    ],
    faq: [
      { q: "Varför inte bara köpa en standardprodukt?", a: "Ibland är det rätt svar, och då säger vi det. Ett eget system lönar sig när det som skiljer er från andra är just det standardprodukten saknar." },
      { q: "Kan vi börja i liten skala?", a: "Ja, det är så vi föredrar att jobba. Den första versionen löser ett problem och är i drift inom några veckor." },
      { q: "Kan vi flytta över data från Excel?", a: "Ja. Vi importerar befintliga ark och rättar upp dubbletter och luckor som en del av arbetet." },
      { q: "Vem äger systemet och vår data?", a: "Ni. Koden och databasen ligger i era konton, och ni kan exportera all data när som helst. Ingen inlåsning." },
      { q: "Fungerar systemet i mobilen?", a: "Ja. Vi bygger för att det ska gå att använda på telefon och surfplatta ute hos kund eller på plats, inte bara vid skrivbordet." },
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
