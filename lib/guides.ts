/**
 * Guides: evergreen answers to questions customers search for. Written to be
 * quotable by search and AI answer engines: a direct answer first, then
 * detail, facts with their source, and a dated "last updated".
 * ROT figures are for 2026 and were checked against Skatteverket.
 */

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
      { label: "Badrumsrenovering i Halmstad", href: "/bygg/tjanster/badrumsrenovering" },
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
      { label: "Badrumsrenovering i Halmstad", href: "/bygg/tjanster/badrumsrenovering" },
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
];

export const guideBySlug = (slug: string) => guides.find((g) => g.slug === slug);

/** Guides worth linking from a service page. */
export const guidesFor: Record<string, string[]> = {
  badrumsrenovering: ["badrumsrenovering-steg-for-steg", "rot-avdrag-2026"],
  totalrenovering: ["checklista-infor-renovering", "rot-avdrag-2026"],
  koksrenovering: ["rot-avdrag-2026", "checklista-infor-renovering"],
  tillbyggnad: ["checklista-infor-renovering", "rot-avdrag-2026"],
  tak: ["rot-avdrag-2026"],
  golv: ["rot-avdrag-2026"],
  maleri: ["rot-avdrag-2026"],
  "el-vvs": ["rot-avdrag-2026"],
  projektledning: ["checklista-infor-renovering"],
  "interna-system": ["standardsystem-eller-eget-system"],
  automation: ["standardsystem-eller-eget-system"],
};
