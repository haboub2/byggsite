/** Skriver ../annonstexter.md och kontrollerar Googles teckengränser
 *  (rubrik ≤ 30, beskrivning ≤ 90, sökväg ≤ 15). node copy.js */
const fs = require("fs");
const path = require("path");

const utm = (link, source, medium, campaign) => {
  const u = new URL(link);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", medium);
  u.searchParams.set("utm_campaign", campaign);
  return u.toString();
};

const GOOGLE = [
  {
    name: "Bygg · Sök", campaign: "bygg-sok", link: "https://binaafy.se/bygg/offert",
    groups: [
      {
        name: "Takbyte", paths: ["tak", "offert"],
        keywords: ['"byta tak"', '"takbyte"', '"lägga om tak"', '"takläggare"', '"nytt tak pris"', '"plåttak"', '"takrenovering"', "[takbyte halmstad]", "[takläggare halmstad]"],
        headlines: ["Takbyte med ROT-avdrag", "Kostnadsfri offert på tak", "Plåt eller tegel", "Vi river ner till råsponten", "Ett tak som håller", "ROT dras direkt på fakturan", "Göteborg till Malmö", "Binaafy Bygg", "Se bilder från våra tak", "En kontaktperson hela vägen"],
        descriptions: ["Vi byter skadad läkt och råspont och bygger upp taket lager för lager. Begär offert.", "ROT-avdrag 30 % på arbetet, avdraget direkt på fakturan. Vi sköter ansökan.", "Ett team och en kontaktperson från rivning till sista nockpannan.", "Se hur våra takbyten går till, steg för steg, och begär en kostnadsfri offert."],
      },
      {
        name: "Badrum", paths: ["badrum", "offert"],
        keywords: ['"badrumsrenovering"', '"renovera badrum"', '"nytt badrum"', '"badrumsrenovering pris"', '"badrum rot avdrag"', "[badrumsrenovering halmstad]"],
        headlines: ["Badrumsrenovering", "Kostnadsfri offert på badrum", "Tätskikt, kakel och VVS", "ROT-avdrag på arbetet", "Ett team gör allt", "Binaafy Bygg", "Göteborg till Malmö", "En kontaktperson hela vägen"],
        descriptions: ["Tätskikt, kakel, VVS och inredning. Ett team och en kontaktperson hela vägen.", "Exempel: 27 000 kr i ROT-avdrag på ett badrum för 150 000 kr. Begär offert.", "Du ser hela priset i offerten innan vi börjar. ROT dras direkt på fakturan."],
      },
      {
        name: "Kök", paths: ["kok", "offert"],
        keywords: ['"köksrenovering"', '"renovera kök"', '"nytt kök montering"', '"köksrenovering pris"', "[köksrenovering halmstad]"],
        headlines: ["Köksrenovering", "Kostnadsfri offert på kök", "Ritning, rivning, montering", "ROT-avdrag på arbetet", "Snickerier, el och VVS", "Binaafy Bygg", "Göteborg till Malmö"],
        descriptions: ["Vi ritar, river och bygger. Snickerier, el och VVS med en kontaktperson.", "ROT-avdrag 30 % på arbetet, dras direkt på fakturan. Begär en kostnadsfri offert."],
      },
      {
        name: "Måleri", paths: ["maleri", "offert"],
        keywords: ['"målare"', '"måla lägenhet"', '"målning lägenhet pris"', '"fasadmålning"', '"måla om hus"', '"målerifirma"', "[målare halmstad]", "[målerifirma halmstad]"],
        headlines: ["Målare med ROT-avdrag", "Kostnadsfri offert på måleri", "Väggar, snickerier, fasad", "Släta väggar, raka linjer", "Klart att flytta in i", "Vi städar efter oss", "Binaafy Bygg", "En kontaktperson hela vägen"],
        descriptions: ["Spackling, väggar, dörrar och snickerier. Vi lämnar det städat och klart.", "Fasad och takfot från ställning. ROT-avdrag 30 % på arbetet, direkt på fakturan.", "Se bilder från våra måleriuppdrag och begär en kostnadsfri offert."],
      },
      {
        name: "Uteplats", paths: ["uteplats", "offert"],
        keywords: ['"anlägga uteplats"', '"bygga trädäck"', '"lägga skiffer"', '"skifferplattor uteplats"', '"altan bygga pris"', '"lägga plattor trädgård"', "[trädäck halmstad]"],
        headlines: ["Uteplats i skiffer", "Trädäck byggt av oss", "Kostnadsfri offert", "Från mossiga plattor", "Skiffer i fritt mönster", "Klart till sommaren", "ROT-avdrag på arbetet", "Binaafy Bygg"],
        descriptions: ["Gamla plattor ut, nytt underlag, skiffer i fritt mönster och nytt trädäck.", "Se före och efter från ett av våra jobb. ROT-avdrag 30 % på arbetet.", "Planera nu och bygg innan säsongen. Begär en kostnadsfri offert."],
      },
    ],
    negatives: ["jobb", "lediga jobb", "lön", "utbildning", "själv", "diy", "bauhaus", "byggmax", "begagnad", "gratis"],
  },
  {
    name: "Software · Sök", campaign: "software-sok", link: "https://binaafy.se/fakturering",
    groups: [
      {
        name: "Fakturering bygg", paths: ["fakturering", "bygg"],
        keywords: ['"faktureringsprogram bygg"', '"fakturera rot avdrag"', '"ata fakturering"', '"äta fakturering"', '"offertprogram hantverkare"', '"faktureringsprogram hantverkare"', '"rot avdrag fil skatteverket"', '"delfakturering bygg"'],
        headlines: ["Fakturering för byggföretag", "Offert, faktura, ÄTA och ROT", "ROT-avdraget räknas åt dig", "Delfakturor med ett klick", "ROT-filen till Skatteverket", "Byggt av ett byggföretag", "Boka en gratis demo", "Binaafy Fakturering", "Kundportal för era kunder", "Från 490 kr/mån exkl. moms", "Exportera all data när ni vill"],
        descriptions: ["Offerten blir faktura med en knapp. Kund, rader och ROT följer med. Boka demo.", "Delfakturor enligt betalplan, ÄTA och ROT-filen till Skatteverket. Gjort för bygg.", "Inbetalningar prickas av från bankens fil. Påminnelser går ut automatiskt.", "Vi använder det själva på Binaafy. Boka en gratis demo på 20 minuter."],
      },
      {
        name: "Hemsida bygg", paths: ["hemsida", "bygg"],
        keywords: ['"hemsida byggföretag"', '"hemsida hantverkare"', '"webbsida byggfirma"', '"hemsida för byggfirma"'],
        headlines: ["Hemsida för byggföretag", "Hemsida + fakturering i ett", "Live på tre veckor", "Ett pris. Vi har ansvaret.", "Från 1 490 kr/mån exkl. moms", "0 kr uppstart, 5 platser", "Byggt av ett byggföretag", "Boka en gratis demo"],
        descriptions: ["Hemsida, offertformulär och fakturering. Vi bygger, driftar och sköter allt efteråt.", "De fem första företagen betalar 0 kr i uppstart. Från 1 490 kr/mån exkl. moms.", "Domänen är er och all data kan exporteras. Drift, säkerhet och support ingår."],
      },
    ],
    negatives: ["gratis mall", "word mall", "excel", "jobb", "utbildning", "wordpress tema", "wix"],
  },
  {
    // Lokal sökning: visa bara i Halland + 50 km. Folk som söker "i Halmstad" vill träffa någon.
    name: "Tjänster · Sök Halland", campaign: "tjanster-sok", link: "https://binaafy.se/mjukvara/brief",
    groups: [
      {
        name: "Hemsida lokalt", paths: ["hemsida", "halmstad"],
        keywords: ['"webbyrå halmstad"', '"hemsida halmstad"', '"webbutveckling halmstad"', '"skapa hemsida företag"', '"webbyrå halland"', '"hemsida småföretag"'],
        headlines: ["Webbyrå i Halmstad", "Hemsida för ert företag", "Snabb, syns på Google", "Ni ändrar texterna själva", "Fast pris per etapp", "Kod och domän är era", "Vi sköter driften efteråt", "Hemsida + fakturering", "Från 1 490 kr/mån exkl. moms", "Boka ett samtal"],
        descriptions: ["Hemsidor som laddar snabbt, syns på Google och som ni uppdaterar själva. Fast pris.", "Vi bygger, driftar och sköter hemsidan efteråt. Ett nummer att ringa när något behövs.", "Vill ni hellre ha månadspris? Hemsida + fakturering från 1 490 kr/mån exkl. moms."],
      },
      {
        name: "App och system", paths: ["app", "system"],
        keywords: ['"apputveckling"', '"utveckla app företag"', '"systemutveckling halmstad"', '"skräddarsytt affärssystem"', '"bokningssystem företag"', '"integrera system"', '"ersätta excel system"'],
        headlines: ["Appar för iPhone och Android", "Interna system efter er", "Ersätt Excelarket", "Koppla ihop era system", "Fast pris per etapp", "Kod ni äger", "Utvecklare i Halmstad", "Vi står kvar efter lansering", "Berätta om er idé"],
        descriptions: ["Appar, kundportaler och interna system formade efter hur ni jobbar. Fast pris per etapp.", "Kopierar någon data för hand varje vecka? Vi kopplar ihop systemen så det sker själv.", "Ni betalar en etapp i taget och kan stanna efter vilken som helst. Koden är er."],
      },
    ],
    negatives: ["jobb", "lön", "utbildning", "kurs", "gratis", "praktik", "lediga tjänster"],
  },
];

const META = [
  ["bygg-tak", "Ett tak ska hålla i decennier. Vi river ner till råsponten, byter det som är skadat och bygger upp taket lager för lager. ROT-avdraget drar vi direkt på fakturan.", "Kostnadsfri offert på takbyte", "ROT-avdrag 30 % på arbetet", "Begär offert"],
  ["bygg-takbyte", "Så ser ett takbyte ut hos oss: från rötskadad läkt till nytt tak. Bilderna är från våra egna jobb. Ett team och en kontaktperson hela vägen.", "Från rötskadad läkt till nytt tak", "Bilder från våra egna takjobb", "Begär offert"],
  ["bygg-badrum", "Dags för ett nytt badrum? Tätskikt, kakel, VVS och inredning – vi gör allt, så du slipper samordna hantverkare.", "Kostnadsfri offert på badrum", "Exempel: 27 000 kr i ROT", "Begär offert"],
  ["bygg-kok", "Ett kök byggt för hur ni lever. Vi ritar, river och bygger – snickerier, el och VVS – och du har en kontaktperson hela vägen.", "Kostnadsfri offert på kök", "ROT-avdrag 30 % på arbetet", "Begär offert"],
  ["bygg-uteplats", "Från mossiga betongplattor till skiffer och trädäck. Samma gång, före och efter – ett av våra egna jobb. Nytt underlag, skiffer i fritt mönster och ett nytt trädäck längs husväggen.", "Uteplats i skiffer och trädäck", "ROT-avdrag på arbetet", "Begär offert"],
  ["bygg-maleri", "Släta väggar. Raka linjer. Vi spacklar och målar väggar, dörrar och snickerier – och lämnar lägenheten städad och klar att flytta in i.", "Kostnadsfri offert på måleri", "ROT-avdrag 30 % på arbetet", "Begär offert"],
  ["software-pappersarbete", "Ni bygger. Vi tar pappersarbetet. Offert, faktura, ÄTA och ROT i ett system – byggt av ett byggföretag, för byggföretag.", "Bygg. Inte pappersarbete.", "Från 1 490 kr/mån exkl. moms", "Boka demo"],
  ["software-faktura", "Från offert till betald faktura, direkt i mobilen. Delfakturor, ÄTA och ROT-avdrag räknas ut åt dig, och ROT-filen till Skatteverket skapas automatiskt.", "Fakturering för byggföretag", "Boka en gratis demo på 20 min", "Läs mer"],
  ["software-hemsida", "Hemsidan klar på tre veckor. Sedan sköter vi den. Hemsida, offertformulär och fakturering – ett pris, ett ansvar, ett nummer att ringa.", "Hemsida + fakturering i ett", "Drift och support ingår", "Läs mer"],
  ["software-grundare", "De fem första byggföretagen startar utan avgift: 0 kr i uppstart och 1 290 kr/mån för hemsida och fakturering (exkl. moms). I gengäld visar vi er som referens.", "0 kr i uppstart – 5 platser", "Grundarerbjudande", "Registrera dig"],
  // Tjänster: programmering + färdiga system, ägarledda tjänsteföretag i Halland.
  ["tjanster-meny", "Färdigt system eller byggt för er? Vi gör båda. Fakturering som är redo i dag från 490 kr/mån, eller hemsidor, appar och interna verktyg byggda efter hur ni jobbar, med fast pris per etapp. Kod ni äger, och vi sköter driften.", "Färdigt eller skräddarsytt – vi gör båda", "Fast pris per etapp", "Läs mer"],
  ["tjanster-allt", "Fem leverantörer, fem inloggningar och fem fakturor varje månad? Eller en: vi. Hemsida, app, fakturering, HR och integrationer – vi bygger det, kopplar ihop det och sköter det. Ni har ett nummer att ringa.", "Allt digitalt. En leverantör.", "Fast pris per etapp", "Läs mer"],
  ["tjanster-excel", "Drivs ert företag i ett Excelark som bara en person förstår? Vi bygger systemet som ersätter det: kundregister, schema, personal eller offert, format efter er verksamhet.", "Byt Excelarket mot ett riktigt system", "Fast pris per etapp", "Boka nu"],
  ["tjanster-app", "Appen ni har pratat om? Vi bygger den. Dagens jobb, tidrapport och faktura i fickan, för iPhone och Android och byggd efter hur ni jobbar.", "Er app, byggd av oss", "Kod ni äger", "Läs mer"],
  ["tjanster-hemsida", "Kunderna googlar er innan de ringer. Vi bygger hemsidor som laddar snabbt, syns på Google och som ni ändrar själva – som binaafy.se, som vi byggt och sköter själva.", "Hemsida som ger samtal", "Från 1 490 kr/mån exkl. moms", "Läs mer"],
  ["tjanster-tio-timmar", "En småföretagare lägger i snitt runt tio timmar i veckan på administration (Företagarna). Vi bygger verktygen som tar tillbaka tiden: fakturor, offerter, schema och kundregister på ett ställe.", "Ta tillbaka tio timmar i veckan", "Fakturering från 490 kr/mån", "Boka nu"],
  ["tjanster-flode", "Kopierar någon data för hand varje vecka? Det är ett automationsproblem, inte en personalfråga. Vi kopplar ihop era system så att det sker av sig självt.", "Låt systemen prata med varandra", "Fast pris per integration", "Boka nu"],
  // Paket: hemsida + verktyg på köpet. Villkor: paket/villkor.md
  ["paket-kvitto", "Hemsida för 1 490 kr/mån – med offertsystem, fakturering (OCR, Swish, påminnelser) och HR på köpet. Bli av med de fasta kostnaderna för separata program. Startavgift 4 900 kr, 12 månader. Priser exkl. moms.", "Hemsida + offert, faktura och HR", "1 490 kr/mån exkl. moms", "Läs mer"],
  ["paket-en-faktura", "Fyra fakturor i månaden – webbyrån, webbhotellet, faktureringsprogrammet och HR-systemet? Eller en: allt hos oss för 1 490 kr/mån (exkl. moms, startavgift 4 900 kr, 12 månader).", "Fyra leverantörer blev en", "1 490 kr/mån exkl. moms", "Läs mer"],
  ["paket-forsta-aret", "Hela första året: 22 780 kr exkl. moms. Hemsida, drift, offert, fakturering och HR – startavgift och tolv månader, inga tillägg. De fem första företagen slipper startavgiften.", "Ett pris för hela året", "De fem första: 0 kr i start", "Läs mer"],
  ["paket-fastpris", "Vad kostar en hemsida? Just nu: 9 900 kr för upp till fem sidor (34 900 kr för upp till tio). Fast pris, inga timmar som tickar. Plus offert- och faktureringssystemet gratis i ett år, så ni blir av med fasta kostnader för fakturaprogram. Priser exkl. moms.", "Hemsida till fast pris", "5 sidor: 9 900 kr exkl. moms", "Läs mer"],
  ["paket-gratis-ar", "Köp hemsidan – få offert- och faktureringssystemet gratis i ett år. Skapa snygga offerter som blir faktura med en knapp när kunden säger ja, med OCR, Swish och automatiska påminnelser. Bli av med den fasta månadskostnaden för fakturaprogram: 0 kr i tolv månader (värde 5 880 kr). Hemsida från 9 900 kr exkl. moms.", "Fakturering gratis i ett år", "Hemsida från 9 900 kr", "Läs mer"],
  ["paket-fem-sidor", "Fem sidor. 9 900 kr. Fast pris – erbjudande just nu. Startsida, tjänster, om oss, referenser och kontakt. På köpet: offert- och faktureringssystem gratis i ett år – skicka offerter och fakturor med OCR och Swish och slipp betala varje månad för fakturaprogram. Exkl. moms.", "5 sidor för 9 900 kr", "Fast pris, koden är er", "Läs mer"],
  // Fördelar
  ["fordelar-portal", "Följ ditt bygge i realtid. I din egen kundportal ser du tidplanen, foton från varje dag, ändringar att godkänna och fakturorna. Logga in med en kod – inget lösenord. Ingår i alla våra projekt.", "Följ ditt bygge i realtid", "Kundportal ingår", "Begär offert"],
  ["fordelar-bygg", "Sex skäl att välja Binaafy Bygg: följ bygget i realtid i kundportalen, ROT direkt på fakturan, en kontaktperson, inga överraskningar (ändringar godkänner du först), dokumentation från varje steg och ett eget team.", "Därför väljer man Binaafy Bygg", "ROT-avdrag 30 % på arbetet", "Begär offert"],
  ["fordelar-software", "Sex skäl att välja Binaafy Software: fast pris, koden är er, offert- och faktureringssystem gratis i ett år, inga fasta programkostnader, kundportal för era kunder och ett lokalt team i Halmstad.", "Därför väljer man Binaafy Software", "Hemsida från 9 900 kr", "Läs mer"],
  ["fordelar-verktyg", "Sluta betala varje månad för fakturaprogrammet. Med Binaafy skapar du offerten på några minuter, och när kunden säger ja blir den faktura med en knapp – med OCR, Swish och påminnelser som sköts av sig själva. Gratis i ett år när du köper en hemsida av oss.", "Offert + fakturering: 0 kr i ett år", "Värde 5 880 kr", "Läs mer"],
  // Rabatt – egen sektion
  ["rabatt-bygg", "10 % rabatt på arbetet om du bestämmer dig före februari. Signera din offert senast 31 januari 2027 – gäller tak, plåt, måleri och uteplats. Begär en kostnadsfri offert i dag.", "10 % rabatt t.o.m. 31 januari", "Gäller signerade offerter", "Begär offert"],
  ["rabatt-software", "Starta före februari och få 10 % rabatt. Hemsidor, appar och interna system: signera senast 31 januari 2027 så får ni 10 % på projektpriset. Kan inte kombineras med andra erbjudanden.", "10 % rabatt t.o.m. 31 januari", "Hemsidor, appar, system", "Läs mer"],
  // Erbjudande, alla företag. Första meningen är kroken: den syns innan "Visa mer".
  ["erbjudande-kvall", "Fakturerar du fortfarande på kvällarna? Med Binaafy blir offerten en faktura med en knapp. OCR, Swish och påminnelser sköts av sig själva, så kvällen blir din igen. 490 kr/mån exkl. moms, ingen bindningstid.", "Fakturera på dagtid igen", "490 kr/mån · ingen bindning", "Registrera dig"],
  ["erbjudande-16kr", "Mindre än en kaffe om dagen. 490 kr/mån (exkl. moms) för fakturor med OCR och Swish, automatiska påminnelser, kundportal och bokföring i bakgrunden. Ingen uppstartsavgift, ingen bindningstid.", "Hela faktureringen för 16 kr/dag", "Ingen bindningstid", "Registrera dig"],
  ["erbjudande-fore-efter", "Word för fakturan, Excel för koll, banken för betalningarna och mejlen för påminnelserna. Eller ett system som gör allt. Offert, faktura, inbetalningar, påminnelser och underlag till revisorn på samma ställe.", "Fyra verktyg blev ett", "490 kr/mån exkl. moms", "Läs mer"],
  ["erbjudande-obetalt", "Vem har inte betalat än? Om du måste leta i banken för att svara, gör Binaafy det åt dig: inbetalningar prickas av och de som är sena får en påminnelse med avgift och dröjsmålsränta.", "Sluta jaga dina egna pengar", "Påminnelser går ut själva", "Läs mer"],
  ["erbjudande-alla", "Frisör, konsult, städfirma eller hantverkare? Vi bygger er hemsida, sätter upp faktureringen och sköter allt efteråt: drift, säkerhet, ändringar och support. Ni har ett nummer att ringa.", "Hemsida + fakturering för ert företag", "Från 1 490 kr/mån exkl. moms", "Läs mer"],
  ["erbjudande-fem", "Fem platser. Noll kronor i uppstart. De fem första företagen får hemsida och fakturering för 1 290 kr/mån (exkl. moms) utan uppstartsavgift. I gengäld visar vi er som referens.", "0 kr i uppstart – 5 platser", "Grundarerbjudande", "Läs mer"],
];
const LINK = { bygg: "https://binaafy.se/bygg/offert", "bygg-uteplats": "https://binaafy.se/bygg/projekt/uteplats-skiffer-och-tradack", "software-faktura": "https://binaafy.se/fakturering",
  "erbjudande-kvall": "https://binaafy.se/registrera", "tjanster-hemsida": "https://binaafy.se/fakturering#priser",
  "tjanster-meny": "https://binaafy.se/mjukvara/brief", "tjanster-allt": "https://binaafy.se/mjukvara/brief", "paket-fastpris": "https://binaafy.se/mjukvara/brief", "paket-gratis-ar": "https://binaafy.se/mjukvara/brief", "fordelar-software": "https://binaafy.se/mjukvara/brief", "fordelar-verktyg": "https://binaafy.se/fakturering", "rabatt-software": "https://binaafy.se/mjukvara/brief", "fordelar-portal": "https://binaafy.se/bygg/offert", "fordelar-bygg": "https://binaafy.se/bygg/offert", "rabatt-bygg": "https://binaafy.se/bygg/offert", "paket-fem-sidor": "https://binaafy.se/mjukvara/brief", "tjanster-excel": "https://binaafy.se/mjukvara/brief", "tjanster-app": "https://binaafy.se/mjukvara/brief",
  "tjanster-tio-timmar": "https://binaafy.se/mjukvara/brief", "tjanster-flode": "https://binaafy.se/mjukvara/brief", "erbjudande-16kr": "https://binaafy.se/registrera",
  "erbjudande-fore-efter": "https://binaafy.se/fakturering", "erbjudande-obetalt": "https://binaafy.se/fakturering" };
const linkFor = (id) => LINK[id] || (id.startsWith("bygg") ? LINK.bygg : "https://binaafy.se/fakturering#priser");

/* ---- kontroll ---- */
const errors = [];
const check = (t, max, where) => { if ([...t].length > max) errors.push(`${where}: "${t}" (${[...t].length}/${max})`); };
for (const c of GOOGLE) for (const g of c.groups) {
  g.headlines.forEach((h) => check(h, 30, `${c.name}/${g.name} rubrik`));
  g.descriptions.forEach((d) => check(d, 90, `${c.name}/${g.name} beskrivning`));
  g.paths.forEach((p) => check(p, 15, `${c.name}/${g.name} sökväg`));
  if (g.headlines.length < 3 || g.descriptions.length < 2) errors.push(`${g.name}: för få rubriker/beskrivningar`);
}
for (const [id, , h, d] of META) { check(h, 40, `Meta ${id} rubrik`); check(d, 30, `Meta ${id} beskrivning`); }
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }

/* ---- markdown ---- */
let md = `# Binaafy annonstexter

Genererad av \`_kalla/copy.js\`. Alla rubriker och beskrivningar är kontrollerade mot Googles gränser
(rubrik ≤ 30 tecken, beskrivning ≤ 90, sökväg ≤ 15) och Metas rekommendationer (rubrik ≤ 40).
Bilderna ligger i \`bygg/\`, \`software/\`, \`erbjudande/\` och \`tjanster/\`, en mapp per kampanj.

## Google Ads – sökannonser (responsiva)

Lägg in alla rubriker och beskrivningar i varje annonsgrupp; Google testar kombinationerna själv.
Sökorden står med matchningstyp: \`"fras"\` och \`[exakt]\`.
`;
for (const c of GOOGLE) {
  md += `\n### ${c.name}\n\nSlutlig webbadress: \`${utm(c.link, "google", "cpc", c.campaign)}\`  \nNegativa sökord (hela kampanjen): ${c.negatives.map((n) => `\`${n}\``).join(", ")}\n`;
  for (const g of c.groups) {
    md += `\n#### ${g.name}\n\nVisningssökväg: binaafy.se/${g.paths.join("/")}\n\n**Sökord:** ${g.keywords.join(", ")}\n\n| Rubrik (≤ 30) | Tecken |\n|---|---|\n${g.headlines.map((h) => `| ${h} | ${[...h].length} |`).join("\n")}\n\n| Beskrivning (≤ 90) | Tecken |\n|---|---|\n${g.descriptions.map((d) => `| ${d} | ${[...d].length} |`).join("\n")}\n`;
  }
}
md += `
## Google Ads – Display och Performance Max

Ladda upp från varje kampanjmapp:

| Googles fält | Fil |
|---|---|
| Liggande bild 1,91:1 | \`*_liggande-1200x628.png\` |
| Kvadratisk bild 1:1 | \`*_kvadrat-1x1.png\` |
| Stående bild 4:5 | \`*_flode-4x5.png\` |
| Logotyp | \`_kalla/bilder/binaafy.svg\` (exportera som 1200×1200 PNG) |

Korta rubriker och beskrivningar tar du från sökannonserna ovan.

## Meta – Facebook och Instagram

| Placering | Fil |
|---|---|
| Flöde (Facebook, Instagram) | \`*_flode-4x5.png\` (eller \`*_kvadrat-1x1.png\`) |
| Stories och Reels | \`*_story-9x16.png\` – nedersta 20 % är tom med flit, där ligger Instagrams knappar |
| Länkannons / Audience Network | \`*_liggande-1200x628.png\` |
`;
for (const [id, primary, h, d, cta] of META) {
  md += `\n### ${id}\n\n- **Primär text:** ${primary}\n- **Rubrik:** ${h}\n- **Beskrivning:** ${d}\n- **Knapp:** ${cta}\n- **Webbadress:** \`${utm(linkFor(id), "meta", "paid_social", id)}\`\n`;
}
md += `
## Upplägg att börja med

| | Bygg (privatpersoner) | Software (byggföretag) |
|---|---|---|
| Kanal 1 | Meta: Tak + Takbyte, sedan Badrum/Kök | Google Sök: Fakturering bygg + Hemsida bygg |
| Kanal 2 | Google Sök: Takbyte, Badrum | Meta: Grundare + Pappersarbete, riktat till ägare/VD i bygg |
| Område | 50–80 km runt Halmstad, sedan Göteborg–Malmö | Hela Sverige |
| Startbudget | 100–150 kr/dag per kanal | 100 kr/dag per kanal |
| Mål | Förfrågan via /bygg/offert | Intresseanmälan/registrering via /fakturering |
| Utvärdera | Efter 2 veckor: kostnad per förfrågan | Efter 2–3 veckor: kostnad per demo |

Kör 2–3 annonser per kampanj samtidigt och stäng av den som har sämst kostnad per förfrågan efter en vecka.

## Innan ni startar

1. **Mätning.** Lägg in Meta-pixeln och Google-taggen på sajten och mät *skickat formulär* som konvertering.
   Sajten har redan en cookieruta; taggarna ska bara laddas när besökaren godkänt analys/marknadsföring.
2. **Priserna** (490 / 1 490 / 2 290 kr/mån och grundarerbjudandet) är förslag – bekräfta dem innan Software-annonserna går ut.
3. **Badrum- och köksbilderna** är licensierade Unsplash-bilder, inte era jobb. Annonserna påstår inget annat,
   men byt till egna bilder så fort ni har dem – det ger fler förfrågningar.
4. **Konsumentpriser** ska anges inklusive moms. ROT-exemplet (150 000 kr → 123 000 kr) är inklusive moms.
`;
fs.writeFileSync(path.join(__dirname, "..", "annonstexter.md"), md);
console.log("annonstexter.md OK");
