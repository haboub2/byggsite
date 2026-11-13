/**
 * Guides: evergreen answers to questions customers search for. Written to be
 * quotable by search and AI answer engines: a direct answer first, then
 * detail, facts with their source, and a dated "last updated".
 * ROT figures are for 2026 and were checked against Skatteverket.
 */

import { team } from "./placeholder";

export type GuideSection = { heading: string; paragraphs: string[]; list?: string[] };

export type Guide = {
  slug: string;
  side: "bygg" | "mjukvara";
  title: string;
  description: string;
  /** One or two sentences that answer the question outright. */
  answer: string;
  published: string;
  updated: string;
  /** Name of the team member who wrote it (lib/placeholder.ts team). */
  author?: string;
  image: string;
  readingMinutes: number;
  sections: GuideSection[];
  faq: { q: string; a: string }[];
  related: { label: string; href: string }[];
  sources?: { label: string; href: string }[];
  /** Show the ROT calculator after this section index. */
  calculatorAfter?: number;
};

export const guides: Guide[] = [
  {
    slug: "rot-avdrag-2026",
    side: "bygg",
    title: "ROT-avdrag 2026: så mycket får du och så fungerar det",
    description:
      "ROT-avdraget 2026 är 30 % av arbetskostnaden, högst 50 000 kr per person och år. Så räknar du, vad som ingår och vad som gäller med två ägare.",
    answer:
      "År 2026 är ROT-avdraget 30 procent av arbetskostnaden inklusive moms, högst 50 000 kronor per person och år. ROT och RUT får tillsammans vara högst 75 000 kronor per person och år. Material och resor ger inget avdrag.",
    published: "2026-09-26",
    updated: "2026-09-26",
    image: "golv-hero",
    readingMinutes: 5,
    calculatorAfter: 1,
    sections: [
      {
        heading: "Vad är ROT-avdrag?",
        paragraphs: [
          "ROT står för reparation, ombyggnad och tillbyggnad. Avdraget är en skattereduktion: du betalar mindre skatt med samma belopp som avdraget. När du anlitar ett företag med F-skatt drar företaget av beloppet direkt på fakturan och ansöker sedan om pengarna hos Skatteverket. Du betalar alltså bara din del från början.",
          "Avdraget gäller arbete i din bostad eller ditt fritidshus, till exempel renovering av badrum eller kök, byte av tak, golvläggning, målning och el- och VVS-arbeten.",
        ],
      },
      {
        heading: "Hur mycket är ROT-avdraget 2026?",
        paragraphs: [
          "Från 1 januari 2026 är avdraget åter 30 procent av arbetskostnaden. Under 2025 var det tillfälligt höjt till 50 procent. Tre gränser styr hur mycket du kan få:",
        ],
        list: [
          "30 procent av arbetskostnaden inklusive moms.",
          "Högst 50 000 kronor i ROT-avdrag per person och år.",
          "ROT och RUT tillsammans högst 75 000 kronor per person och år. Har du redan fått mycket RUT under året kan det minska utrymmet för ROT.",
        ],
      },
      {
        heading: "Vad ger inte avdrag?",
        paragraphs: [
          "Bara arbetet räknas. Material, resekostnader, maskinhyra och avgifter, till exempel för container och tippning, ger inget avdrag. Därför ska fakturan specificera arbetskostnaden för sig — det är den som avdraget räknas på.",
          "Avdraget kan heller aldrig bli större än den skatt du betalar under året. Har du låg inkomst eller många andra skattereduktioner kan utrymmet bli mindre än 50 000 kronor. Skatteverkets tjänst Räkna ut din skatt visar hur mycket du har.",
        ],
      },
      {
        heading: "Två ägare kan få dubbelt",
        paragraphs: [
          "Äger ni bostaden tillsammans kan var och en få upp till 50 000 kronor, totalt 100 000 kronor. Det kräver att båda äger bostaden, att båda betalar sin del av fakturan och att arbetskostnaden räcker: för att nå 50 000 kronor per person behövs cirka 166 700 kronor i arbetskostnad per person.",
        ],
      },
      {
        heading: "Exempel: badrum och totalrenovering",
        paragraphs: [
          "Ett badrum med 90 000 kronor i arbete och 60 000 kronor i material ger 27 000 kronor i ROT-avdrag. Du betalar 123 000 kronor i stället för 150 000.",
          "En totalrenovering med 320 000 kronor i arbete skulle ge 96 000 kronor med 30 procent, men en ensam ägare får högst 50 000. Är ni två ägare räcker taket och ni får hela 96 000 kronor, 48 000 var.",
        ],
      },
      {
        heading: "Vilket år hamnar avdraget på?",
        paragraphs: [
          "Det är dagen du betalar fakturan som avgör vilket år avdraget räknas till, inte när arbetet utfördes.",
        ],
      },
    ],
    faq: [
      {
        q: "Hur mycket är ROT-avdraget 2026?",
        a: "30 procent av arbetskostnaden inklusive moms, högst 50 000 kronor per person och år. ROT och RUT tillsammans får vara högst 75 000 kronor per person och år.",
      },
      {
        q: "Gäller ROT-avdrag i bostadsrätt?",
        a: "Ja. Som bostadsrättsinnehavare får du ROT-avdrag för arbete i din egen lägenhet, till exempel badrum, kök och golv. Arbete som föreningen ansvarar för, som stambyte eller fasad, ger inget avdrag för dig.",
      },
      {
        q: "Gäller ROT-avdraget på material?",
        a: "Nej. Bara arbetskostnaden ger avdrag. Material, resor och maskiner betalar du fullt ut.",
      },
      {
        q: "Kan två personer få ROT för samma renovering?",
        a: "Ja, om båda äger bostaden. Var och en kan få upp till 50 000 kronor per år, så länge arbetskostnaden räcker och båda har betalat tillräckligt med skatt.",
      },
      {
        q: "Påverkar RUT hur mycket ROT jag kan få?",
        a: "Ja. ROT och RUT delar på ett tak om 75 000 kronor per person och år. Har du fått mer än 25 000 kronor i RUT under året blir utrymmet för ROT mindre än 50 000 kronor.",
      },
      {
        q: "Vem ansöker om ROT-avdraget?",
        a: "Företaget. De drar av avdraget direkt på fakturan och ansöker om utbetalning hos Skatteverket efter att du har betalat.",
      },
    ],
    related: [
      { label: "Räkna på ditt projekt", href: "/#priser" },
      { label: "Badrumsrenovering", href: "/bygg/tjanster/badrumsrenovering" },
      { label: "Checklista inför renovering", href: "/guider/checklista-infor-renovering" },
    ],
    sources: [
      {
        label: "Skatteverket — Rot och rut",
        href: "https://www.skatteverket.se/privat/fastigheterochbostad/rotochrutarbete.4.2e56d4ba1202f95012080002966.html",
      },
    ],
  },
  {
    slug: "badrumsrenovering-steg-for-steg",
    side: "bygg",
    title: "Badrumsrenovering steg för steg: tid, ordning och vad du ska kräva",
    description:
      "Så går en badrumsrenovering till, från rivning till slutkontroll. Hur lång tid det tar, varför tätskiktet är viktigast och vilken dokumentation du ska få.",
    answer:
      "En badrumsrenovering på 5–8 kvadratmeter tar oftast 3–5 veckor. Ordningen är rivning, el och VVS, underarbete och tätskikt, kakel och klinker, inredning och till sist slutkontroll med dokumentation. Tätskiktet är det viktigaste steget.",
    published: "2026-09-26",
    updated: "2026-09-26",
    image: "badrum-hero",
    readingMinutes: 6,
    sections: [
      {
        heading: "1. Planering och offert",
        paragraphs: [
          "Allt börjar med ett besök där badrummet mäts och du berättar vad du vill ha: dusch eller badkar, golvvärme, var toalett och handfat ska sitta. Flyttas golvbrunnen eller avloppet blir jobbet större, så det är bra att bestämma tidigt.",
          "Be om en offert med fast pris där arbetskostnad och material står var för sig. Det behövs för ROT-avdraget och gör det lätt att jämföra.",
        ],
      },
      {
        heading: "2. Rivning",
        paragraphs: [
          "Gammalt kakel, klinker, inredning och ofta även gammalt tätskikt rivs ut. Här upptäcks ibland fuktskador eller en sprucken golvbrunn. Ett seriöst företag stannar då och ger dig ett skriftligt besked med pris innan något görs utanför offerten.",
        ],
      },
      {
        heading: "3. El och VVS",
        paragraphs: [
          "Rör för vatten och avlopp dras om, och el för belysning, golvvärme och uttag installeras. VVS-arbetet i våtrum bör följa branschreglerna Säker Vatten och el ska utföras av behörig elektriker.",
        ],
      },
      {
        heading: "4. Underarbete och tätskikt",
        paragraphs: [
          "Golvet får rätt fall mot golvbrunnen och väggarna förbereds. Sedan läggs tätskiktet, det lager som hindrar vatten från att nå konstruktionen bakom kaklet. Det måste torka enligt tillverkarens anvisning innan kakelsättningen börjar, och det är en stor del av varför ett badrum tar veckor.",
          "Fel i tätskiktet syns inte förrän det läcker, ofta flera år senare. Därför ska arbetet följa branschregler för våtrum och dokumenteras, bland annat med foton innan det täcks.",
        ],
      },
      {
        heading: "5. Kakel och klinker",
        paragraphs: [
          "Kakel sätts på väggar och klinker på golv, med fogning och silikon i hörn och anslutningar. Stora plattor och avancerade mönster tar längre tid.",
        ],
      },
      {
        heading: "6. Inredning och montage",
        paragraphs: [
          "Toalett, handfat, kommod, blandare, duschvägg, speglar och belysning monteras och ansluts.",
        ],
      },
      {
        heading: "7. Slutkontroll och dokumentation",
        paragraphs: ["Innan överlämning går ni igenom badrummet tillsammans. Kräv att få:"],
        list: [
          "Dokumentation över tätskiktet med foton och vilka produkter som använts.",
          "Intyg om att VVS-arbetet följer branschreglerna.",
          "Faktura med arbetskostnaden specificerad för ROT-avdraget.",
          "Skötselråd och information om garanti.",
        ],
      },
    ],
    faq: [
      {
        q: "Hur lång tid tar en badrumsrenovering?",
        a: "Ett badrum på 5–8 kvadratmeter tar vanligtvis 3–5 veckor från rivning till klart, inklusive torktider för tätskiktet.",
      },
      {
        q: "Kan jag bo hemma medan badrummet renoveras?",
        a: "Oftast ja, om det finns en annan toalett eller om ni kan lösa dusch på annat håll i några veckor. Planera det innan start.",
      },
      {
        q: "Varför är tätskiktet så viktigt?",
        a: "Det är tätskiktet som hindrar vatten från att nå trä och isolering bakom kaklet. Ett fel syns inte förrän det läcker och är då dyrt att åtgärda. Hemförsäkringen kan dessutom kräva att arbetet följt branschreglerna.",
      },
      {
        q: "Får jag ROT-avdrag på badrumsrenovering?",
        a: "Ja, på arbetskostnaden. 2026 är avdraget 30 procent, högst 50 000 kronor per person och år.",
      },
    ],
    related: [
      { label: "Badrumsrenovering", href: "/bygg/tjanster/badrumsrenovering" },
      { label: "ROT-avdrag 2026", href: "/guider/rot-avdrag-2026" },
      { label: "Begär offert", href: "/bygg/offert?tjanst=Badrum" },
    ],
  },
  {
    slug: "checklista-infor-renovering",
    side: "bygg",
    title: "Checklista inför renovering: 10 saker att reda ut innan du begär offert",
    description:
      "Tio saker att bestämma innan du renoverar: mål, budget med marginal, bygglov, ROT, tidplan, boende under bygget och hur du kontrollerar hantverkaren.",
    answer:
      "Innan du begär offert: bestäm vad du vill uppnå, sätt en budget med 10–15 procent marginal, ta reda på om det krävs bygglov, kontrollera ditt ROT-utrymme och välj ett företag med F-skatt, försäkring och skriftligt avtal.",
    published: "2026-09-26",
    updated: "2026-09-26",
    image: "projektledning-hero",
    readingMinutes: 4,
    sections: [
      {
        heading: "Checklistan",
        paragraphs: ["Ju mer av det här som är klart innan offerten, desto mer exakt blir priset — och desto färre överraskningar under bygget."],
        list: [
          "Vad vill du uppnå? Mer yta, nytt uttryck, något som är trasigt eller ett högre värde vid försäljning. Målet styr vad som är värt pengarna.",
          "Budget med marginal. Lägg 10–15 procent åt oväntade saker, som fukt bakom kaklet eller gammal el som måste bytas.",
          "Mått och underlag. Enkla mått, foton och gärna en skiss gör offerten mer exakt.",
          "Krävs bygglov eller anmälan? Tillbyggnader, ändrad bärande konstruktion och fasadändringar kan kräva det. Kolla med kommunen eller låt företaget bedöma vid besöket.",
          "ROT-utrymme. Hur mycket ROT har du och eventuell medägare kvar i år? Har du använt RUT kan utrymmet vara mindre.",
          "Tidplan. När vill du vara klar, och finns det datum som inte går att flytta?",
          "Boende under bygget. Kan ni bo kvar, och hur löser ni kök, toalett och dusch?",
          "Materialval. Bestäm tidigt vad som är viktigt och var du kan tänka dig standardval — det påverkar både pris och leveranstid.",
          "Kontrollera företaget. F-skatt, ansvarsförsäkring och referenser från liknande jobb.",
          "Skriftligt avtal. Fast pris eller löpande räkning, tidplan, betalningsplan och hur ändringar hanteras. Standardavtal som Hantverkarformuläret 17 eller ABS 18 är en bra grund.",
        ],
      },
    ],
    faq: [
      {
        q: "Hur mycket marginal ska jag ha i budgeten?",
        a: "En vanlig tumregel är 10–15 procent utöver offerten, särskilt i äldre hus där det kan dölja sig fukt eller gamla installationer bakom ytskikten.",
      },
      {
        q: "Hur kontrollerar jag att ett byggföretag är seriöst?",
        a: "Kontrollera att företaget har F-skatt hos Skatteverket, fråga efter ansvarsförsäkring, be om referenser från liknande jobb och kräv ett skriftligt avtal.",
      },
      {
        q: "Behöver jag bygglov för att renovera?",
        a: "Vanlig invändig renovering kräver sällan bygglov. Tillbyggnad, ändring av bärande konstruktion eller fasad kan kräva bygglov eller anmälan. Kommunen ger besked.",
      },
    ],
    related: [
      { label: "ROT-avdrag 2026", href: "/guider/rot-avdrag-2026" },
      { label: "Alla bygg- och renoveringstjänster", href: "/bygg/tjanster" },
      { label: "Begär offert", href: "/bygg/offert" },
    ],
  },
  {
    slug: "standardsystem-eller-eget-system",
    side: "mjukvara",
    title: "Standardsystem eller eget system? Så väljer ni rätt",
    description:
      "När räcker ett standardsystem och när lönar sig ett eget? Fem frågor som avgör, vad ett eget system kostar över tid och hur ni börjar utan stor risk.",
    answer:
      "Välj standardsystem när det täcker det som gör er unika och ni kan anpassa rutinerna efter det. Ett eget system lönar sig när det som skiljer er från konkurrenterna är just det standardsystemet saknar, eller när ni lägger timmar varje vecka på att flytta data mellan system.",
    published: "2026-09-26",
    updated: "2026-09-26",
    image: "interna-system-hero",
    readingMinutes: 4,
    sections: [
      {
        heading: "Fem frågor som avgör",
        paragraphs: ["Svara ärligt på de här innan ni bestämmer er:"],
        list: [
          "Täcker standardsystemet det som gör er unika, eller bara allt runt omkring?",
          "Hur många timmar i veckan går till att kopiera data mellan system, Excel och mejl?",
          "Behöver kunder eller partner logga in och se sin egen information?",
          "Vad kostar licenserna per användare om fem år, när ni är fler?",
          "Kan ni ta med er er data om ni vill byta leverantör?",
        ],
      },
      {
        heading: "När standardsystem är rätt",
        paragraphs: [
          "Bokföring, lön och mejl är lösta problem. Där finns det sällan skäl att bygga eget. Detsamma gäller när ni är få, rutinerna är standard och verktyget redan täcker 90 procent av behovet.",
        ],
      },
      {
        heading: "När ett eget system lönar sig",
        paragraphs: [
          "Ett eget system lönar sig när det bär det som gör er bättre än konkurrenterna: ett offertflöde anpassat efter era jobb, en kundportal, eller uppföljning som standardverktygen inte klarar. Ofta är det bästa en kombination: standardsystem för det vanliga, och ett smalt eget system som kopplar ihop dem.",
        ],
      },
      {
        heading: "Börja smalt",
        paragraphs: [
          "Den största risken med eget system är att bygga för mycket på en gång. Börja med det ena flöde som kostar mest tid, sätt det i drift på några veckor och bygg vidare utifrån hur det faktiskt används. Se till att koden och datan ägs av er från dag ett.",
        ],
      },
    ],
    faq: [
      {
        q: "Vad kostar ett eget system?",
        a: "Det beror på omfattningen. Ett smalt första system kan vara i drift på några veckor. Jämför kostnaden med timmarna ni lägger på manuellt arbete och licenskostnaden för alternativen över några år.",
      },
      {
        q: "Äger vi koden om vi låter bygga ett system?",
        a: "Det ska stå i avtalet. Hos oss äger kunden koden, datan och kontona från start, så att ni kan byta leverantör när ni vill.",
      },
    ],
    related: [
      { label: "Interna system", href: "/mjukvara/tjanster/interna-system" },
      { label: "Automation och integrationer", href: "/mjukvara/tjanster/automation" },
      { label: "Skicka en brief", href: "/mjukvara/brief" },
    ],
  },
  {
    slug: "vad-kostar-en-hemsida-for-foretag",
    side: "mjukvara",
    title: "Vad kostar en hemsida för företag 2026? Priser, löpande kostnader och fällor",
    description:
      "En hemsida för företag kostar allt från några hundralappar i månaden till över 100 000 kr. Så skiljer sig alternativen, vad som driver priset och vad du betalar efter lansering.",
    answer:
      "En företagshemsida byggd av en byrå kostar oftast mellan 10 000 och 40 000 kronor exklusive moms för fem till femton sidor. Ett eget verktyg som Wix kostar några hundra kronor i månaden men kräver din egen tid. Räkna även med domän, drift och ändringar efter lansering.",
    published: "2026-11-03",
    updated: "2026-11-03",
    author: "Ibrahim Al Haboub",
    image: "webb-hero",
    readingMinutes: 5,
    sections: [
      {
        heading: "Tre sätt att skaffa en hemsida",
        paragraphs: [
          "Priset beror först och främst på vem som gör jobbet. Det finns i grunden tre vägar, och de passar olika företag.",
        ],
        list: [
          "Bygga själv i ett verktyg som Wix, Squarespace eller WordPress.com. Kostnaden är en månadsavgift på några hundra kronor, men du står för design, texter och sökmotoroptimering själv. Räkna med flera arbetsdagar för en enkel sida.",
          "Låta en byrå bygga ett färdigt paket. Vanligt pris är 10 000–40 000 kronor beroende på antal sidor och hur mycket som ingår. Du får en färdig sida på några veckor och slipper lära dig verktyget.",
          "Låta bygga en skräddarsydd lösning med inloggning, bokning eller kopplingar till andra system. Då hamnar priset ofta över 60 000 kronor, och det lönar sig bara när hemsidan ska göra mer än att presentera företaget.",
        ],
      },
      {
        heading: "Det här driver priset",
        paragraphs: [
          "Två hemsidor som ser lika ut kan skilja flera tiotusentals kronor. Skillnaden ligger nästan alltid i fem saker:",
        ],
        list: [
          "Antal sidor. Varje tjänst bör ha en egen sida om du vill synas på Google när folk söker på just den tjänsten, och varje sida tar tid att skriva och bygga.",
          "Design. En anpassad mall är billigare än en helt unik design som tas fram från grunden.",
          "Texter. Skriver du själv sparar du pengar. Ska byrån skriva, med sökord och struktur för Google, kostar det mer men ger oftast bättre resultat.",
          "Funktioner. Offertformulär, bokning, nyhetsflöde eller koppling till ett CRM lägger till tid.",
          "Sökmotoroptimering. Grunderna bör alltid ingå, men en sökordsanalys och lokala sidor för varje ort du jobbar i är extra arbete.",
        ],
      },
      {
        heading: "Löpande kostnader efter lansering",
        paragraphs: [
          "Engångspriset är bara en del av kostnaden. Fråga alltid vad som tillkommer varje månad och varje år, så att du kan jämföra offerterna på riktigt.",
          "Domänen kostar normalt ett par hundra kronor om året och ska registreras i företagets namn, inte byråns. Drift och säkerhetsuppdateringar kostar från några hundra kronor i månaden hos de flesta byråer. Mejl på egen domän betalas oftast per användare och månad. Mindre ändringar efter lansering ingår ibland i ett supportavtal och debiteras annars per timme.",
          "Var försiktig med avtal där hemsidan hyrs ut med lång bindningstid. Det kan se billigt ut per månad, men efter tre år har du ofta betalat mer än för en köpt sida, och du äger ingenting när avtalet tar slut.",
        ],
      },
      {
        heading: "Fem frågor att ställa innan du köper",
        paragraphs: ["Med de här svaren kan du jämföra två offerter på samma villkor:"],
        list: [
          "Vem äger koden, designen och domänen när sidan är klar?",
          "Vad kostar det per månad och per år efter lansering, och finns det bindningstid?",
          "Kan jag ändra texter och bilder själv, eller måste jag beställa varje ändring?",
          "Vilken sökmotoroptimering ingår, och hur ser jag om sidan ger förfrågningar?",
          "Hur lång tid tar det, och vad behöver ni från mig för att hålla tidplanen?",
        ],
      },
      {
        heading: "Våra priser",
        paragraphs: [
          "Hos oss kostar en hemsida på upp till fem sidor 9 900 kronor, och en sida med en egen undersida per tjänst 17 900 kronor, båda exklusive moms. Större sidor med lokala sidor per ort och koppling till andra system börjar på 29 900 kronor. Du äger koden och domänen, och det finns ingen bindningstid på drift.",
        ],
      },
    ],
    faq: [
      {
        q: "Är det billigare att bygga hemsidan själv?",
        a: "I pengar ja, men inte alltid i tid. En enkel sida i ett eget verktyg kostar några hundra kronor i månaden, men tar flera arbetsdagar att få bra, och sökmotoroptimeringen får du sköta själv.",
      },
      {
        q: "Vad kostar en hemsida per månad?",
        a: "Domän, drift och mejl kostar tillsammans oftast från några hundra kronor i månaden. Hyr du hela hemsidan av en byrå blir månadskostnaden högre, men då äger du sällan sidan.",
      },
      {
        q: "Hur lång tid tar det att få en ny hemsida?",
        a: "En färdig paketsida tar ofta två till fyra veckor. Det som oftast försenar är texter och bilder, så ta fram dem tidigt.",
      },
      {
        q: "Är priserna inklusive moms?",
        a: "Byråer anger oftast priser till företag exklusive moms. Ett momsregistrerat företag drar av momsen, så priset exklusive moms är den verkliga kostnaden.",
      },
    ],
    related: [
      { label: "Köp hemsida — paket och priser", href: "/mjukvara/kop-hemsida" },
      { label: "Hemsida för hantverkare: 7 saker som ger fler förfrågningar", href: "/guider/hemsida-for-hantverkare" },
      { label: "Webb och kundportaler", href: "/mjukvara/tjanster/webb" },
    ],
  },
  {
    slug: "vad-kostar-badrumsrenovering-goteborg",
    side: "bygg",
    title: "Vad kostar en badrumsrenovering i Göteborg 2026?",
    description:
      "Ett helkaklat badrum på 5–8 m² kostar oftast från 150 000 kr före ROT. Så fördelas kostnaden, vad som gör det dyrare och vad du betalar efter ROT-avdraget.",
    answer:
      "En komplett badrumsrenovering på 5–8 kvadratmeter i Göteborg kostar oftast från 150 000 kronor inklusive moms, före ROT-avdrag. Med ROT-avdraget på 30 procent av arbetskostnaden betalar du för ett normalt badrum på sex kvadratmeter ungefär 123 000 kronor.",
    published: "2026-11-03",
    updated: "2026-11-03",
    author: "Mohamed Al Haboub",
    image: "badrum-hero",
    readingMinutes: 5,
    sections: [
      {
        heading: "Ett räkneexempel: badrum på 6 kvadratmeter",
        paragraphs: [
          "Ett vanligt badrum i en villa eller lägenhet är fem till åtta kvadratmeter. För ett helkaklat badrum på sex kvadratmeter med dusch, toalett, kommod och golvvärme ser en normal kalkyl ut ungefär så här, inklusive moms:",
        ],
        list: [
          "Arbete: cirka 90 000 kronor för rivning, VVS, el, underarbete, tätskikt, kakel och montage.",
          "Material: cirka 60 000 kronor för tätskikt, kakel och klinker, porslin, blandare, duschvägg och golvvärme.",
          "Summa före ROT: cirka 150 000 kronor.",
          "ROT-avdrag: 30 procent av arbetet, alltså 27 000 kronor.",
          "Du betalar: cirka 123 000 kronor.",
        ],
      },
      {
        heading: "Så fördelas kostnaden",
        paragraphs: [
          "Ungefär 60 procent av priset är arbete och 40 procent material. Arbetet är svårt att pressa utan att tumma på kvaliteten, eftersom de moment som tar tid är de som skyddar huset: fall mot golvbrunnen, tätskiktet och dess torktider.",
          "Materialet är där du själv styr mest. Standardkakel i normalt format kan kosta en bråkdel av stora plattor i natursten, och en enkel blandare kostar en tiondel av en designserie. Bestäm tidigt var du vill lägga pengarna, så kan offerten bli exakt från början.",
        ],
      },
      {
        heading: "Det här gör badrummet dyrare",
        paragraphs: ["Priset stiger ofta av samma skäl. Ju fler av dem du vet om innan offerten, desto färre överraskningar:"],
        list: [
          "Flytt av golvbrunn, toalett eller dusch. Nya avloppsdragningar i bjälklaget är tidskrävande.",
          "Fuktskador bakom gammalt kakel. De syns först vid rivningen och måste åtgärdas innan det nya byggs.",
          "Stora plattor, mönster eller natursten. De tar längre tid att sätta och kräver ett jämnare underlag.",
          "Badkar, inbyggd cistern eller nischer i väggen.",
          "Gamla rör och gammal el. I äldre hus i Göteborg är det vanligt att avlopp och el behöver bytas när badrummet ändå öppnas.",
        ],
      },
      {
        heading: "Det här ska stå i offerten",
        paragraphs: [
          "Två offerter på samma badrum går bara att jämföra om de innehåller samma sak. Be om ett skriftligt fast pris där det framgår:",
        ],
        list: [
          "Arbetskostnad och material var för sig, så att du ser vad ROT-avdraget blir.",
          "Vilket tätskiktssystem som används och att arbetet följer branschreglerna för våtrum.",
          "Vem som gör el och VVS, och att de är behöriga.",
          "Vad som händer om rivningen visar fuktskador, och vad det i så fall kostar.",
          "Tidplan, betalningsplan och vilken garanti du får.",
        ],
      },
      {
        heading: "Bor du i bostadsrätt?",
        paragraphs: [
          "I en bostadsrätt behöver du styrelsens tillstånd innan du ändrar i badrummet, eftersom det berör vatten och avlopp. Kontrollera också om föreningen planerar stambyte. I många äldre flerbostadshus i Göteborg görs badrummen om i samband med stambytet, och då kan det löna sig att vänta eller samordna.",
        ],
      },
      {
        heading: "Spara rätt, inte på fel ställen",
        paragraphs: [
          "Det billigaste anbudet är sällan det billigaste badrummet. Ett tätskikt som inte följer branschreglerna kan ge en vattenskada som kostar mer än hela renoveringen, och försäkringsbolaget kan kräva att arbetet är gjort av behörig personal och dokumenterat. Spara hellre på kakel och inredning än på underarbetet. Be om ett fast pris där arbete och material står var för sig, så ser du var pengarna går och vad ROT-avdraget blir.",
        ],
      },
    ],
    calculatorAfter: 0,
    faq: [
      {
        q: "Vad kostar ett litet badrum på 3–4 kvadratmeter?",
        a: "Ett litet badrum är billigare i material men inte i samma takt i arbete, eftersom rivning, VVS och tätskikt tar nästan lika lång tid. Räkna med att priset per kvadratmeter blir högre än för ett större badrum.",
      },
      {
        q: "Hur mycket ROT-avdrag får jag på badrummet?",
        a: "År 2026 är ROT-avdraget 30 procent av arbetskostnaden, högst 50 000 kronor per person och år. Äger ni bostaden två kan ni dela avdraget.",
      },
      {
        q: "Hur lång tid tar en badrumsrenovering?",
        a: "Ett badrum på 5–8 kvadratmeter tar oftast 3–5 veckor från rivning till klart, inklusive torktider för tätskiktet.",
      },
      {
        q: "Varför skiljer sig offerterna så mycket?",
        a: "Ofta för att de inte innehåller samma sak. Jämför vad som ingår i arbetet, vilket material som räknats med, om tätskiktet görs enligt branschregler och om priset är fast eller löpande.",
      },
    ],
    related: [
      { label: "Badrumsrenovering i Göteborg", href: "/bygg/tjanster/badrumsrenovering" },
      { label: "Badrumsrenovering steg för steg", href: "/guider/badrumsrenovering-steg-for-steg" },
      { label: "ROT-avdrag 2026", href: "/guider/rot-avdrag-2026" },
      { label: "Begär offert", href: "/bygg/offert?tjanst=Badrum" },
    ],
    sources: [
      {
        label: "Skatteverket — Rot och rut",
        href: "https://www.skatteverket.se/privat/fastigheterochbostad/rotochrutarbete.4.2e56d4ba1202f95012080002966.html",
      },
      { label: "Säker Vatten — branschregler för VVS", href: "https://www.sakervatten.se/" },
      { label: "Byggkeramikrådet — branschregler för våtrum", href: "https://www.bkr.se/" },
    ],
  },
  {
    slug: "hemsida-for-hantverkare",
    side: "mjukvara",
    title: "Hemsida för hantverkare: 7 saker som ger fler förfrågningar",
    description:
      "De flesta hantverkarsajter ser bra ut men ger få förfrågningar. Sju konkreta saker som gör att fler kunder hittar dig på Google, litar på dig och faktiskt hör av sig.",
    answer:
      "En hemsida för hantverkare ger fler förfrågningar när telefonnumret syns på varje sida, varje tjänst och ort har en egen sida, egna projektbilder visar vad du gör, och kunden direkt ser F-skatt, försäkring, garanti och ROT. Koppla den till din Google Företagsprofil och håll offertformuläret kort.",
    published: "2026-11-03",
    updated: "2026-11-03",
    author: "Ibrahim Al Haboub",
    image: "hero-software",
    readingMinutes: 5,
    sections: [
      {
        heading: "Varför många hantverkarsajter inte ger jobb",
        paragraphs: [
          "Den som söker hantverkare har oftast bråttom och jämför tre eller fyra företag på mobilen. De letar efter svar på tre frågor: gör ni det jag behöver, finns ni där jag bor, och går det att lita på er. Hittar de inte svaren på några sekunder går de vidare. Vi driver själva en byggfirma, och det här är det vi har sett fungera.",
        ],
      },
      {
        heading: "1. Telefonnumret ska synas överallt",
        paragraphs: [
          "Många kunder vill ringa, inte fylla i formulär. Ha numret klickbart högst upp på varje sida, och gärna en knapp som följer med när man scrollar på mobilen. Svarar du inte direkt, ring tillbaka samma dag. Det är ofta den som svarar först som får jobbet.",
        ],
      },
      {
        heading: "2. En sida per tjänst och ort",
        paragraphs: [
          "Google visar sidor, inte företag. Har du bara en sida som räknar upp allt du gör, konkurrerar den dåligt mot företag som har en egen sida för badrumsrenovering, en för kök och en för tak. Samma sak gäller orter: jobbar du i Göteborg, Mölndal och Kungsbacka, nämn dem tydligt och skriv något konkret om jobb du gjort där.",
        ],
      },
      {
        heading: "3. Egna bilder slår bildbank",
        paragraphs: [
          "Före och efter-bilder från dina egna jobb är det starkaste bevis du har. Fota med mobilen i dagsljus, från samma vinkel före och efter, och skriv en mening om vad som gjordes. Kunder känner igen bildbanksbilder direkt, och då tappar resten av sidan i trovärdighet.",
        ],
      },
      {
        heading: "4. Google Företagsprofil och omdömen",
        paragraphs: [
          "När någon söker på en tjänst och en ort visar Google ofta en karta med lokala företag överst, före vanliga sökresultat. Dit kommer du med en verifierad Google Företagsprofil med samma namn, adress och telefonnummer som på hemsidan. Be varje nöjd kund om ett omdöme, gärna med en direktlänk i ett sms när jobbet är klart.",
        ],
      },
      {
        heading: "5. Visa det som skapar trygghet",
        paragraphs: [
          "Renovering är ett stort köp och kunden är rädd att välja fel. Visa tydligt att du har F-skatt och ansvarsförsäkring, vilken garanti du lämnar, och att ROT-avdraget dras direkt på fakturan. Har du behörigheter för våtrum, el eller VVS, skriv ut dem. Det är ofta det som avgör mellan dig och nästa företag.",
        ],
      },
      {
        heading: "6. Ett kort offertformulär",
        paragraphs: [
          "Fråga bara efter det du behöver för att höra av dig: namn, telefon, ort, vilken tjänst och en kort beskrivning. Låt kunden bifoga bilder om de vill. Varje extra obligatoriskt fält gör att fler ger upp halvvägs.",
        ],
      },
      {
        heading: "7. Snabb på mobilen",
        paragraphs: [
          "De flesta besökare kommer från telefonen, ofta ute på mobilnät. En sida som tar flera sekunder att ladda tappar besökare innan de sett något, och Google rankar långsamma sidor lägre. Komprimera bilderna, undvik tunga tillägg och testa sidan på din egen telefon.",
        ],
      },
      {
        heading: "Mät det som spelar roll",
        paragraphs: [
          "Antal besökare säger lite. Följ hur många som ringer, skickar formuläret eller klickar på vägbeskrivningen, och vilka sidor de kom från. Då ser du vilka tjänster och orter som ger jobb och var det är värt att lägga mer tid.",
        ],
      },
    ],
    faq: [
      {
        q: "Behöver en hantverkare verkligen en hemsida?",
        a: "Ja, om du vill ha jobb från folk som inte redan känner dig. Kunder kollar nästan alltid upp ett företag innan de ringer, och utan hemsida är det svårt att synas i Googles lokala resultat.",
      },
      {
        q: "Räcker det med en Facebooksida?",
        a: "Den är bra som komplement, men du styr inte över den och den syns sällan när folk söker på en tjänst och en ort. En egen hemsida och en Google Företagsprofil når fler.",
      },
      {
        q: "Vad kostar en hemsida för en hantverkare?",
        a: "En paketsida från en byrå kostar ofta 10 000–20 000 kronor exklusive moms. Hos oss kostar en sida med en egen undersida per tjänst 17 900 kronor.",
      },
    ],
    related: [
      { label: "Köp hemsida — paket och priser", href: "/mjukvara/kop-hemsida" },
      { label: "Vad kostar en hemsida för företag?", href: "/guider/vad-kostar-en-hemsida-for-foretag" },
      { label: "Fakturering för byggföretag", href: "/fakturering" },
    ],
  },
  {
    slug: "skapa-hemsida-for-foretag",
    side: "mjukvara",
    title: "Skapa hemsida för företag: själv, med AI eller med webbyrå?",
    description:
      "Tre sätt att skapa en hemsida till företaget — hemsidebyggare, AI-verktyg eller webbyrå. Vad varje väg kostar, hur lång tid den tar och vilken som ger kunder från Google.",
    answer:
      "Ett företag kan skapa en hemsida på tre sätt: själv i en hemsidebyggare som Wix eller Squarespace, med ett AI-verktyg som tar fram ett första utkast, eller genom att låta en webbyrå bygga den. Själv eller med AI är billigast och går snabbast att komma igång med. En webbyrå lönar sig när hemsidan ska ge förfrågningar från Google.",
    published: "2026-11-13",
    updated: "2026-11-13",
    author: "Ibrahim Al Haboub",
    image: "hero-software",
    readingMinutes: 6,
    sections: [
      {
        heading: "Steg för steg: så skapar du en hemsida för företaget",
        paragraphs: [
          "Oavsett vilket verktyg du väljer är stegen desamma. Det är ordningen som avgör om sidan blir klar och om den ger något.",
        ],
        list: [
          "Bestäm vad sidan ska åstadkomma: samtal, offertförfrågningar, bokningar eller försäljning.",
          "Registrera en domän i företagets namn, till exempel dittforetag.se. Den kostar normalt ett par hundra kronor om året.",
          "Välj hur sidan ska byggas: själv, med AI eller av en webbyrå. Se jämförelsen nedan.",
          "Skriv en sida per tjänst, med de ord dina kunder söker på och orterna du jobbar i.",
          "Gör det lätt att höra av sig: klickbart telefonnummer, ett kort formulär och tydliga knappar på varje sida.",
          "Anmäl sidan till Google Search Console och koppla den till en Google Företagsprofil.",
          "Mät samtal och förfrågningar, inte bara besökare, och förbättra de sidor som ger mest.",
        ],
      },
      {
        heading: "Skapa hemsida själv i en hemsidebyggare",
        paragraphs: [
          "Wix, Squarespace och WordPress.com låter dig dra och släppa fram en sida utan att kunna kod. Du betalar en månadsavgift, och det går att ha något uppe på en eftermiddag. Gratisplanerna visar verktygets namn i adressen och reklam på sidan, så för ett företag behövs en betald plan med egen domän.",
          "Nackdelen är tiden. Design, texter, bilder och sökmotoroptimering gör du själv, och det är där de flesta egenbyggda sidor fastnar. Sidan blir ofta långsam på mobilen, och du äger den inte: slutar du betala försvinner den.",
        ],
      },
      {
        heading: "Skapa hemsida med AI",
        paragraphs: [
          "AI-verktyg kan på några minuter bygga en sida som ser färdig ut utifrån en kort beskrivning. Det är ett snabbt sätt att se hur sidan skulle kunna se ut och att testa en idé.",
          "Men en sida som ser färdig ut är inte samma sak som en sida som ger kunder. Texterna blir ofta allmänna och liknar konkurrenternas, verktyget vet inte vad just dina kunder söker på, och teknisk sökmotoroptimering, drift, säkerhet och domän får du fortfarande lösa själv. Använd gärna AI för ett första utkast, men räkna med arbete innan det är en riktig företagssida.",
        ],
      },
      {
        heading: "Låta en webbyrå bygga hemsidan",
        paragraphs: [
          "En webbyrå tar fram struktur, design, texter och teknik, publicerar sidan och anmäler den till Google. Du lägger några timmar på ett startmöte och på att godkänna, i stället för flera arbetsdagar. Ett färdigt paket kostar ofta 10 000–40 000 kronor exklusive moms beroende på antal sidor.",
          "Fråga alltid vem som äger koden och domänen, vad som kostar per månad efter lansering och om det finns bindningstid. En sida du hyr kan bli dyrare än en du köper redan efter några år.",
        ],
      },
      {
        heading: "Vilket ska du välja?",
        paragraphs: ["En enkel tumregel utifrån vad hemsidan ska göra:"],
        list: [
          "Du vill bara finnas på nätet med kontaktuppgifter: bygg själv i en hemsidebyggare.",
          "Du vill testa en idé eller se ett förslag snabbt: ta fram ett utkast med AI.",
          "Hemsidan ska ge nya kunder från Google: låt en webbyrå bygga den, med en sida per tjänst och ort.",
        ],
      },
      {
        heading: "Så gör vi",
        paragraphs: [
          "Vi bygger hemsidor till företag med fast pris: 9 900 kronor för upp till fem sidor och 17 900 kronor för en sida med en egen undersida per tjänst, båda exklusive moms. Sidan är klar på två till tre veckor, sökmotoroptimering ingår och ni äger koden, domänen och innehållet.",
        ],
      },
    ],
    faq: [
      {
        q: "Kan man skapa en hemsida gratis?",
        a: "Ja, de flesta hemsidebyggare har en gratisplan, men då visas verktygets namn i adressen och reklam på sidan. För ett företag behövs en egen domän, och då kostar det från ett par hundra kronor i månaden.",
      },
      {
        q: "Är det bra att bygga hemsida med AI?",
        a: "Som utkast, ja. För en företagssida som ska synas på Google behöver texterna, strukturen och tekniken oftast arbetas om, och någon behöver ansvara för drift och säkerhet.",
      },
      {
        q: "Hur lång tid tar det att skapa en hemsida?",
        a: "En enkel sida i en hemsidebyggare kan vara uppe på en dag, men en bra företagssida tar oftast flera arbetsdagar att göra själv. En webbyrå levererar ett färdigt paket på två till fyra veckor.",
      },
      {
        q: "Vad behöver jag för att skapa en hemsida till företaget?",
        a: "En domän, logga, några egna bilder och en kort beskrivning av varje tjänst. Bygger en webbyrå sidan räcker det oftast, eftersom byrån kan skriva texterna utifrån ett startmöte.",
      },
    ],
    related: [
      { label: "Köp hemsida — paket och priser", href: "/mjukvara/kop-hemsida" },
      { label: "Vad kostar en hemsida för företag?", href: "/guider/vad-kostar-en-hemsida-for-foretag" },
      { label: "Hemsida för hantverkare: 7 saker som ger fler förfrågningar", href: "/guider/hemsida-for-hantverkare" },
    ],
    sources: [
      { label: "Google Search Central — startguide för sökmotoroptimering", href: "https://developers.google.com/search/docs/fundamentals/seo-starter-guide?hl=sv" },
    ],
  },
];

export const guideBySlug = (slug: string) => guides.find((g) => g.slug === slug);

/** The guide's writer as name and role, if it has one on the team. */
export function guideAuthor(g: Guide) {
  const m = team.find((t) => t.name === g.author);
  return m ? { name: m.name, jobTitle: m.role } : undefined;
}

/** Guides worth linking from a service page. */
export const guidesFor: Record<string, string[]> = {
  badrumsrenovering: ["vad-kostar-badrumsrenovering-goteborg", "badrumsrenovering-steg-for-steg"],
  totalrenovering: ["checklista-infor-renovering", "rot-avdrag-2026"],
  koksrenovering: ["rot-avdrag-2026", "checklista-infor-renovering"],
  tillbyggnad: ["checklista-infor-renovering", "rot-avdrag-2026"],
  tak: ["rot-avdrag-2026"],
  golv: ["rot-avdrag-2026"],
  maleri: ["rot-avdrag-2026"],
  projektledning: ["checklista-infor-renovering"],
  webb: ["vad-kostar-en-hemsida-for-foretag", "skapa-hemsida-for-foretag"],
  "interna-system": ["standardsystem-eller-eget-system"],
  automation: ["standardsystem-eller-eget-system"],
};
