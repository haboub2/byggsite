/**
 * Binaafy annonser — ett system, alla format.
 *
 *   node build.js            skriver HTML för alla kampanjer × format till ../
 *   (rendera sedan med render.ps1 eller Chrome headless, se README.md)
 *
 * Layouten räknas i --u = 1 % av formatets bredd, så samma mall fungerar från
 * 1200×628 till A3. Bilder och mockups bor i .vis (container), texten i .panel.
 */
const fs = require("fs");
const path = require("path");
const QR = require("qrcode");

const OUT = path.join(__dirname, "..");
const IMG = path.join(__dirname, "bilder");
const mime = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const cache = {};
const img = (f) => (cache[f] ??= `data:${mime[path.extname(f)]};base64,${fs.readFileSync(path.join(IMG, f)).toString("base64")}`);

const PHONE = "079-304 97 37";

/* ---------- format ---------- */
const FORMATS = [
  { id: "flode-4x5", label: "Instagram/Facebook flöde 1080×1350", w: 1080, h: 1350, kind: "portrait", vis: 0.5, hl: 7.4, body: 2.85, pad: 6 },
  { id: "kvadrat-1x1", label: "Flöde + Google Display 1080×1080", w: 1080, h: 1080, kind: "portrait", vis: 0.5, hl: 7, body: 2.8, pad: 6, noBody: true },
  { id: "story-9x16", label: "Stories/Reels 1080×1920", w: 1080, h: 1920, kind: "story", vis: 0.47, hl: 9.4, body: 3.6, pad: 7.5 },
  { id: "liggande-1200x628", label: "Google Display / Facebook länk 1200×628", w: 1200, h: 628, kind: "landscape", hl: 4.5, body: 1.8, pad: 4.2 },
  { id: "affisch-a3", label: "Tryck A3", mm: [297, 420], kind: "portrait", vis: 0.52, hl: 7.6, body: 2.7, pad: 7, print: true },
];

/* ---------- kampanjer ---------- */
const url = (p) => `https://binaafy.se${p}`;
const CAMPAIGNS = [
  // ===== Bygg — privatpersoner =====
  {
    id: "bygg-tak", side: "bygg", theme: "dark",
    eyebrow: "Binaafy Bygg · Tak och plåt",
    hl: "Ett tak ska hålla <em>i decennier.</em>",
    body: "Vi river ner till råsponten, byter det som är skadat och bygger upp taket lager för lager.",
    chip: "ROT-avdrag 30 % på arbetet",
    cta: "Begär offert", link: url("/bygg/offert"),
    vis: { photo: "tak-montor-nock.webp", pos: "50% 32%", cap: "Eget jobb · nock i falsad plåt" },
  },
  {
    id: "bygg-takbyte", side: "bygg", theme: "dark",
    eyebrow: "Binaafy Bygg · Takbyte",
    hl: "Från rötskadad läkt <em>till nytt tak.</em>",
    body: "Så ser ett takbyte ut hos oss, steg för steg. ROT-avdraget drar vi direkt på fakturan.",
    chip: "Bilder från ett och samma jobb",
    cta: "Begär offert", link: url("/bygg/offert"),
    vis: { steps: [["tak-fore-rotskadad.webp", "Före", "50% 50%"], ["tak-montor-nock.webp", "Under arbetet", "50% 32%"], ["tak-falsad-plat.webp", "Klart", "50% 40%"]] },
  },
  {
    id: "bygg-badrum", side: "bygg", theme: "dark",
    eyebrow: "Binaafy Bygg · Badrum",
    hl: "Dags för ett <em>nytt badrum?</em>",
    body: "Tätskikt, kakel, VVS och inredning. Ett team och en kontaktperson från rivning till sista fogen.",
    chip: "Exempel: 27 000 kr i ROT-avdrag",
    cta: "Begär offert", link: url("/bygg/offert"),
    vis: { photo: "stock-badrum.jpg", pos: "50% 58%" },
  },
  {
    id: "bygg-kok", side: "bygg", theme: "dark",
    eyebrow: "Binaafy Bygg · Kök",
    hl: "Ett kök byggt för <em>hur ni lever.</em>",
    body: "Vi ritar, river och bygger. Snickerier, el och VVS, med en kontaktperson hela vägen.",
    chip: "ROT-avdrag 30 % på arbetet",
    cta: "Begär offert", link: url("/bygg/offert"),
    vis: { photo: "stock-kok.jpg", pos: "50% 55%" },
  },
  {
    id: "bygg-uteplats", side: "bygg", theme: "dark", hook: "Före/efter på samma plats",
    eyebrow: "Binaafy Bygg · Uteplats",
    hl: "Från mossiga plattor <em>till skiffer och trädäck.</em>",
    body: "Gamla betongplattor ut, nytt underlag, skiffer i fritt mönster och ett nytt trädäck längs husväggen.",
    chip: "Eget jobb · samma gång före och efter",
    cta: "Begär offert", link: url("/bygg/projekt/uteplats-skiffer-och-tradack"),
    vis: { steps: [["ute-fore-gang.webp", "Före", "50% 60%"], ["ute-efter-gang.webp", "Efter", "50% 55%"]] },
  },
  {
    id: "bygg-maleri", side: "bygg", theme: "dark", hook: "Resultatet talar",
    eyebrow: "Binaafy Bygg · Måleri",
    hl: "Släta väggar. <em>Raka linjer.</em>",
    body: "Spackling, väggar, dörrar och snickerier. Vi lämnar lägenheten städad och klar att flytta in i.",
    chip: "ROT-avdrag 30 % på arbetet",
    cta: "Begär offert", link: url("/bygg/offert"),
    vis: { steps: [["maleri-hall.webp", "Hall", "50% 50%"], ["maleri-dorr.webp", "Snickerier", "50% 50%"], ["maleri-rum.webp", "Vardagsrum", "50% 50%"]] },
  },
  // ===== Software — byggföretag =====
  {
    id: "software-pappersarbete", side: "software", theme: "light",
    eyebrow: "Binaafy Fakturering · För byggföretag",
    hl: "Bygg. <em>Inte pappersarbete.</em>",
    body: "Offert, faktura, ÄTA och ROT i ett system, gjort för hur ett bygge faktureras.",
    chip: "Från 1 490 kr/mån exkl. moms",
    cta: "Boka demo", link: url("/fakturering#priser"),
    vis: { mock: "phone" },
  },
  {
    id: "software-faktura", side: "software", theme: "light",
    eyebrow: "Binaafy Fakturering",
    hl: "Från offert till <em>betald faktura.</em>",
    body: "Delfakturor, ÄTA och ROT-avdrag räknas ut åt dig. Skicka direkt från mobilen.",
    chip: "Gjort för hur ett bygge faktureras",
    cta: "Se hur det funkar", link: url("/fakturering"),
    vis: { mock: "phone" },
  },
  {
    id: "software-hemsida", side: "software", theme: "light",
    eyebrow: "Binaafy · Hemsida + fakturering",
    hl: "Hemsidan klar på tre veckor. <em>Sedan sköter vi den.</em>",
    body: "Hemsida, offertformulär och fakturering. Ett pris, ett ansvar, ett nummer att ringa.",
    chip: "Drift, säkerhet och support ingår",
    cta: "Se paketen", link: url("/fakturering#priser"),
    vis: { mock: "browser" },
  },
  {
    id: "software-grundare", side: "software", theme: "light",
    eyebrow: "Binaafy · Grundarerbjudande",
    hl: "De fem första företagen <em>startar utan avgift.</em>",
    body: "0 kr i uppstart och 1 290 kr/mån för hemsida och fakturering. I gengäld visar vi er som referens.",
    chip: "Priser exkl. moms",
    cta: "Säkra en plats", link: url("/fakturering#priser"),
    vis: { mock: "offer" },
  },
  // ===== Erbjudande — mjukvaran för alla företag. hook = vilken krok annonsen bygger på =====
  {
    id: "erbjudande-kvall", side: "erbjudande", theme: "dark", hook: "Fråga som träffar en smärta",
    eyebrow: "Binaafy Fakturering · För alla företag",
    hl: "Fakturerar du fortfarande <em>på kvällarna?</em>",
    body: "Offerten blir faktura med en knapp. OCR, Swish och påminnelser sköts av sig själva, så kvällen blir din igen.",
    chip: "490 kr/mån · ingen bindningstid",
    cta: "Kom igång", link: url("/registrera"),
    vis: { mock: "phone", inv: {
      k: "Faktura 2031 · Skickad 07:12", title: "Nordström AB", status: "Betald via Swish",
      rows: [["Konsulttimmar, 24 h", "18 000 kr"], ["Resor", "1 200 kr"], ["Moms 25 %", "4 800 kr"], ["OCR", "4471 2031 08"]],
      tot: "24 000 kr" } },
  },
  {
    id: "erbjudande-16kr", side: "erbjudande", theme: "light", hook: "Specifikt tal och prisankare",
    eyebrow: "Binaafy Fakturering",
    hl: "Mindre än en kaffe <em>om dagen.</em>",
    body: "Fakturor med OCR och Swish, påminnelser, kundportal och bokföring i bakgrunden. Ingen bindningstid.",
    chip: "490 kr/mån exkl. moms",
    cta: "Kom igång", link: url("/registrera"),
    vis: { mock: "offer", k: "Per dag", big: "16 kr", s: "allt i fakturering, exkl. moms" },
  },
  {
    id: "erbjudande-fore-efter", side: "erbjudande", theme: "dark", hook: "Före/efter-kontrast",
    eyebrow: "Binaafy Fakturering · Före och efter",
    hl: "Word, Excel, banken och mejlen. <em>Nu ett system.</em>",
    body: "Offert, faktura, inbetalningar, påminnelser och underlag till revisorn på samma ställe.",
    chip: "490 kr/mån · ingen bindningstid",
    cta: "Se hur det funkar", link: url("/fakturering"),
    vis: { mock: "compare",
      before: ["Fakturan skrivs i Word", "Banken kollas för hand", "Påminnelser mejlas själv", "Kvitton letas fram till revisorn"],
      after: ["Offerten blir faktura", "Betalningar prickas av", "Påminnelser går ut själva", "Klart för revisorn"] },
  },
  {
    id: "erbjudande-obetalt", side: "erbjudande", theme: "light", hook: "Nyfikenhet och förlustaversion",
    eyebrow: "Binaafy Fakturering",
    hl: "Vem har inte <em>betalat än?</em>",
    body: "Binaafy prickar av inbetalningarna från bankens fil och påminner de som är sena, med avgift och dröjsmålsränta.",
    chip: "Sluta jaga dina egna pengar",
    cta: "Se hur det funkar", link: url("/fakturering"),
    vis: { mock: "status", title: "Fakturor · oktober", rows: [
      ["2028", "Nordström AB", "24 000 kr", "Betald", "ok"],
      ["2029", "Café Linné", "3 450 kr", "Betald", "ok"],
      ["2030", "Studio Ek", "12 800 kr", "9 dagar sen", "late"],
      ["2031", "Hallberg Konsult", "6 900 kr", "Påminnelse skickad", "sent"]] },
  },
  {
    id: "erbjudande-alla", side: "erbjudande", theme: "dark", hook: "Callout: målgruppen ser sig själv",
    eyebrow: "Binaafy · Hemsida + fakturering",
    hl: "Frisör, konsult eller städfirma? <em>Det funkar för er.</em>",
    body: "Vi bygger hemsidan, sätter upp faktureringen och sköter allt efteråt. Ni har ett nummer att ringa.",
    chip: "Från 1 490 kr/mån exkl. moms",
    cta: "Se paketen", link: url("/fakturering#priser"),
    vis: { mock: "tags", on: ["Frisör", "Konsult", "Städfirma"],
      tags: ["Frisör", "Hantverkare", "Konsult", "Café", "Fotograf", "Städfirma", "Butik", "Bilverkstad", "Personlig tränare", "Byrå", "Redovisning", "Bygg"] },
  },
  {
    id: "erbjudande-fem", side: "erbjudande", theme: "light", hook: "Äkta knapphet",
    eyebrow: "Binaafy · Grundarerbjudande",
    hl: "Fem platser. <em>Noll kronor i uppstart.</em>",
    body: "De fem första företagen får hemsida och fakturering för 1 290 kr/mån utan uppstartsavgift. I gengäld visar vi er som referens.",
    chip: "Priser exkl. moms",
    cta: "Säkra en plats", link: url("/fakturering#priser"),
    vis: { mock: "slots", n: 5 },
  },
  // ===== Tjänster — programmering + färdiga system, för ägarledda tjänsteföretag (2–20 anst.) i Halland =====
  {
    id: "tjanster-meny", side: "tjanster", theme: "dark", hook: "Två vägar: färdigt eller skräddarsytt",
    eyebrow: "Binaafy Software · Halmstad",
    hl: "Färdigt system eller byggt för er? <em>Vi gör båda.</em>",
    body: "Fakturering som är redo i dag. Hemsidor, appar och interna verktyg byggda efter hur ni jobbar, med fast pris per etapp.",
    chip: "Kod ni äger · vi sköter driften",
    cta: "Berätta om ert behov", link: url("/mjukvara/brief"),
    vis: { mock: "menu",
      ready: [["Fakturering", "490 kr/mån"], ["Hemsida + fakturering", "1 490 kr/mån"]],
      custom: ["Hemsidor och kundportaler", "Appar för iPhone och Android", "Interna system: HR, schema, offert", "Integrationer mellan era system"] },
  },
  {
    id: "tjanster-allt", side: "tjanster", theme: "dark", hook: "Smärtan i många leverantörer → en",
    eyebrow: "Binaafy Software · Allt på ett ställe",
    hl: "Fem leverantörer, fem inloggningar? <em>Eller en: vi.</em>",
    body: "Hemsida, app, fakturering, HR och integrationer. Vi bygger det, kopplar ihop det och sköter det. Ni har ett nummer att ringa.",
    chip: "Fast pris per etapp · kod ni äger",
    cta: "Berätta om ert behov", link: url("/mjukvara/brief"),
    vis: { mock: "hub", tiles: [["Hemsida", "Syns på Google"], ["App", "iPhone och Android"], ["Fakturering", "OCR, Swish, påminnelser"], ["Kundportal", "Kunden ser allt"], ["HR och schema", "Vem jobbar var"], ["Integrationer", "Systemen pratar"], ["Offert", "Blir faktura direkt"], ["Drift och support", "Vi står kvar"]] },
  },
  {
    id: "tjanster-excel", side: "tjanster", theme: "light", hook: "Igenkänning med humor",
    eyebrow: "Binaafy Software · Interna system",
    hl: "Drivs ert företag <em>i ett Excelark?</em>",
    body: "Vi bygger systemet som ersätter det: kundregister, schema, personal eller offert. Format efter er verksamhet, inte tvärtom.",
    chip: "Fast pris per etapp",
    cta: "Boka ett samtal", link: url("/mjukvara/brief"),
    vis: { mock: "sheet", file: "kunder_FINAL_v7 (2).xlsx" },
  },
  {
    id: "tjanster-app", side: "tjanster", theme: "dark", hook: "Drömmen + igenkänning i vardagen",
    eyebrow: "Binaafy Software · Appar",
    hl: "Appen ni har pratat om? <em>Vi bygger den.</em>",
    body: "Dagens jobb, tidrapport och faktura i fickan. För iPhone och Android, byggd efter hur ni jobbar.",
    chip: "Fast pris per etapp · kod ni äger",
    cta: "Berätta om er idé", link: url("/mjukvara/brief"),
    vis: { mock: "app" },
  },
  {
    id: "tjanster-hemsida", side: "tjanster", theme: "light", hook: "Kundens beteende + egen sajt som bevis",
    eyebrow: "Binaafy Software · Hemsidor",
    hl: "Kunderna googlar er <em>innan de ringer.</em>",
    body: "Vi bygger hemsidor som laddar snabbt, syns på Google och som ni ändrar själva. Som binaafy.se, som vi byggt och sköter själva.",
    chip: "Hemsida + fakturering från 1 490 kr/mån",
    cta: "Se paketen", link: url("/fakturering#priser"),
    vis: { mock: "browser", shot: "case-binaafy-sajten.jpg", url: "binaafy.se/mjukvara" },
  },
  {
    id: "tjanster-tio-timmar", side: "tjanster", theme: "light", hook: "Chockerande siffra med källa",
    eyebrow: "Binaafy Software",
    hl: "Så mycket administration <em>gör en företagare i veckan.</em>",
    body: "Vi bygger verktygen som tar tillbaka tiden: fakturor, offerter, schema och kundregister på ett ställe.",
    chip: "Fakturering från 490 kr/mån exkl. moms",
    cta: "Boka ett samtal", link: url("/mjukvara/brief"),
    vis: { mock: "offer", k: "I snitt", big: "10 h", s: "Källa: Företagarna" },
  },
  {
    id: "tjanster-flode", side: "tjanster", theme: "dark", hook: "Omformulera problemet",
    eyebrow: "Binaafy Software · Automation",
    hl: "Kopierar någon data för hand <em>varje vecka?</em>",
    body: "Det är ett automationsproblem, inte en personalfråga. Vi kopplar ihop era system så att det sker av sig självt.",
    chip: "Fast pris per integration",
    cta: "Boka ett samtal", link: url("/mjukvara/brief"),
    vis: { mock: "flow", nodes: [["Webbformulär", "Ny förfrågan"], ["Kundregister", "Kund skapas"], ["Faktura", "Skickas med OCR"]] },
  },
  // ===== Paket — hemsida + verktyg på köpet. Villkor: ../paket/villkor.md =====
  {
    id: "paket-kvitto", side: "paket", theme: "light", hook: "Kvittot: värdet syns rad för rad",
    eyebrow: "Binaafy · Allt-i-ett-paketet",
    hl: "Hemsida för 1&nbsp;490 kr/mån. <em>Offert, faktura och HR på köpet.</em>",
    body: "Vi bygger och sköter hemsidan. Offertsystem, fakturering med OCR och Swish och HR ingår, så ni blir av med de fasta kostnaderna för separata program.",
    chip: "Exkl. moms · startavgift 4 900 kr · 12 mån",
    cta: "Se paketet", link: url("/fakturering#priser"),
    vis: { mock: "receipt", rows: [["Hemsida, byggd av oss", "1 490 kr"], ["Drift, säkerhet, backup", "0 kr"], ["Offertverktyg", "0 kr"], ["Fakturering, OCR och Swish", "0 kr"], ["HR: personal och schema", "0 kr"], ["Support, ett nummer", "0 kr"]], tot: "1 490 kr/mån" },
  },
  {
    id: "paket-en-faktura", side: "paket", theme: "dark", hook: "Fyra leverantörer → en faktura",
    eyebrow: "Binaafy · Allt-i-ett-paketet",
    hl: "Fyra fakturor i månaden? <em>Nu en.</em>",
    body: "Webbyrå, webbhotell, faktureringsprogram och HR-system var för sig. Eller allt hos oss för 1 490 kr/mån.",
    chip: "Exkl. moms · startavgift 4 900 kr · 12 mån",
    cta: "Se paketet", link: url("/fakturering#priser"),
    vis: { mock: "compare", before: ["Webbyrån", "Webbhotellet", "Faktureringsprogrammet", "HR-systemet"], after: ["Hemsida och drift", "Offert och fakturering", "HR och schema", "En faktura: 1 490 kr/mån"] },
  },
  {
    id: "paket-forsta-aret", side: "paket", theme: "light", hook: "Hela årskostnaden öppet",
    eyebrow: "Binaafy · Allt-i-ett-paketet",
    hl: "Hemsida och alla verktyg. <em>Ett pris för hela året.</em>",
    body: "Startavgift och tolv månader: hemsida, drift, offert, fakturering och HR. Inga tillägg, inga timmar som tickar.",
    chip: "De fem första: 0 kr i startavgift",
    cta: "Se paketet", link: url("/fakturering#priser"),
    vis: { mock: "offer", k: "Första året, allt ingår", big: "22 780 kr", s: "4 900 kr start + 12 × 1 490 kr, exkl. moms" },
  },
  // Fast pris per antal sidor (engångspris). Villkor: ../paket/villkor.md
  {
    id: "paket-fastpris", side: "paket", theme: "light", hook: "Frågan alla ställer – med svaret",
    eyebrow: "Binaafy Software · Hemsidor",
    hl: "Vad kostar en hemsida? <em>Här är svaret.</em>",
    body: "Fem sidor för 9 900 kr just nu. Plus offert- och faktureringssystemet gratis i ett år: skicka offerter och fakturera med OCR och Swish, utan fasta månadskostnader.",
    chip: "Erbjudande · exkl. moms · koden är er",
    cta: "Välj storlek", link: url("/mjukvara/brief"),
    vis: { mock: "tiers", tiers: [["Standard", "Upp till 5 sidor", "9 900 kr", true, ["Mobilanpassad", "Offertformulär", "Ni redigerar själva", "Fakturering + offert gratis i 1 år"]], ["Större", "Upp till 10 sidor", "34 900 kr", false, ["Allt i Standard", "En sida per tjänst", "Nyheter/blogg", "Fakturering + offert gratis i 1 år"]]], note: "Extra sida 2 500 kr" },
  },
  {
    id: "paket-gratis-ar", side: "paket", theme: "light", hook: "Gratis på köpet – med värdet utskrivet",
    eyebrow: "Binaafy · Erbjudande",
    hl: "Köp hemsidan. <em>Få&nbsp;faktureringen gratis i&nbsp;ett&nbsp;år.</em>",
    body: "Skapa snygga offerter som blir faktura med en knapp när kunden säger ja, med OCR, Swish och automatiska påminnelser. Bli av med den fasta månadskostnaden för fakturaprogram: 0 kr i tolv månader.",
    chip: "Hemsida från 9 900 kr exkl. moms",
    cta: "Säkra erbjudandet", link: url("/mjukvara/brief"),
    vis: { mock: "offer", k: "Fakturering + offert i 12 månader", big: "0 kr", s: "värde 5 880 kr (12 × 490 kr), exkl. moms" },
  },
  {
    id: "paket-fem-sidor", side: "paket", theme: "dark", hook: "Konkret erbjudande, inga reservationer",
    eyebrow: "Binaafy Software · Erbjudande",
    hl: "Fem sidor. 9&nbsp;900&nbsp;kr. <em>Fast pris.</em>",
    body: "Startsida, tjänster, om oss, referenser och kontakt. På köpet: offert- och faktureringssystem gratis i ett år, så ni slipper betala varje månad för fakturaprogram.",
    chip: "Erbjudande · exkl. moms · koden är er",
    cta: "Säkra priset", link: url("/mjukvara/brief"),
    vis: { mock: "pages", pages: ["Startsida", "Tjänster", "Om oss", "Referenser", "Kontakt"] },
  },
  // ===== Fördelar — varför Binaafy (bygg + software) =====
  {
    id: "fordelar-portal", side: "fordelar", theme: "dark", hook: "Unik fördel: se bygget i realtid",
    eyebrow: "Binaafy Bygg · Kundportal",
    hl: "Följ ditt bygge <em>i realtid.</em>",
    body: "Tidplan, foton från varje dag, ändringar att godkänna och fakturor, samlat i din egen kundportal. Logga in med en kod, inget lösenord.",
    chip: "Ingår i alla våra projekt",
    cta: "Begär offert", link: url("/bygg/offert"),
    vis: { mock: "portal" },
  },
  {
    id: "fordelar-bygg", side: "fordelar", theme: "dark", hook: "Lista med skäl",
    eyebrow: "Binaafy Bygg · Därför oss",
    hl: "Sex skäl att välja <em>Binaafy Bygg.</em>",
    body: "Tak, plåt, måleri och uteplats i Halland, med full koll för dig från offert till sista fakturan.",
    chip: "ROT-avdrag 30 % på arbetet",
    cta: "Begär offert", link: url("/bygg/offert"),
    vis: { mock: "benefits", items: [["Följ bygget i realtid", "Tidplan, foton och fakturor i din kundportal"], ["ROT direkt på fakturan", "Vi sköter ansökan hos Skatteverket"], ["En kontaktperson", "Från första besök till slutbesiktning"], ["Inga överraskningar", "Ändringar godkänner du i portalen först"], ["Dokumentation", "Foton från varje steg, som PDF när det är klart"], ["Eget team", "Inga okända underentreprenörer"]] },
  },
  {
    id: "fordelar-software", side: "fordelar", theme: "light", hook: "Lista med skäl",
    eyebrow: "Binaafy Software · Därför oss",
    hl: "Sex skäl att välja <em>Binaafy Software.</em>",
    body: "Hemsidor, appar och system till fast pris, plus offert- och faktureringssystem gratis i ett år när ni köper en hemsida.",
    chip: "Hemsida från 9 900 kr exkl. moms",
    cta: "Boka ett samtal", link: url("/mjukvara/brief"),
    vis: { mock: "benefits", items: [["Fast pris", "Inga timmar som tickar"], ["Koden är er", "Domän och data också, allt kan exporteras"], ["Gratis i ett år", "Offert- och faktureringssystem vid köp av hemsida"], ["Inga fasta programkostnader", "Bli av med fakturaprogrammet"], ["Kundportal", "Era kunder ser offerter och fakturor själva"], ["Lokalt i Halmstad", "Ett nummer att ringa, vi står kvar"]] },
  },
  {
    id: "fordelar-verktyg", side: "fordelar", theme: "dark", hook: "Förklara verktygen + fasta kostnader",
    eyebrow: "Binaafy · Offert och fakturering",
    hl: "Sluta betala varje månad <em>för fakturaprogrammet.</em>",
    body: "Offerten skapas på några minuter och blir faktura med en knapp när kunden säger ja. OCR, Swish och påminnelser sköts av sig själva. Gratis i ett år med er nya hemsida.",
    chip: "0 kr i 12 månader · värde 5 880 kr",
    cta: "Se hur det funkar", link: url("/fakturering"),
    vis: { mock: "compare", before: ["Fakturaprogram varje månad", "Offertmall i Word", "Påminnelser för hand", "Kolla banken själv"], after: ["Offert på några minuter", "Blir faktura med en knapp", "OCR, Swish, påminnelser", "0 kr i ett år"] },
  },
  // ===== Rabatt — egen sektion, inte på alla bilder. Villkor: ../rabatt/villkor.md =====
  {
    id: "rabatt-bygg", side: "rabatt", theme: "dark", hook: "Tidsbegränsad rabatt",
    eyebrow: "Binaafy Bygg · Erbjudande",
    hl: "10&nbsp;% rabatt <em>om du bestämmer dig före februari.</em>",
    body: "Signera din offert senast 31 januari 2027 så drar vi 10&nbsp;% på arbetet. Gäller tak, plåt, måleri och uteplats.",
    chip: "Gäller offerter signerade t.o.m. 31/1 2027",
    cta: "Begär offert", link: url("/bygg/offert"),
    vis: { mock: "offer", k: "Rabatt på arbetet", big: "10 %", s: "för offerter signerade senast 31 januari 2027" },
  },
  {
    id: "rabatt-software", side: "rabatt", theme: "light", hook: "Tidsbegränsad rabatt",
    eyebrow: "Binaafy Software · Erbjudande",
    hl: "Starta före februari. <em>Få 10&nbsp;% rabatt.</em>",
    body: "Hemsidor, appar och interna system: signera senast 31 januari 2027 så får ni 10&nbsp;% på projektpriset.",
    chip: "Kan inte kombineras med andra erbjudanden",
    cta: "Boka ett samtal", link: url("/mjukvara/brief"),
    vis: { mock: "offer", k: "Rabatt på projektpriset", big: "10 %", s: "för avtal signerade senast 31 januari 2027" },
  },
  // ===== Bygg — organiska inlägg för Instagram/Facebook (flöde + story). Captions: ../bygg-instagram/captions.md =====
  ...[
    { id: "ig-intro", hook: "Presentation", eyebrow: "Binaafy Bygg · Halland",
      hl: "Hej Halland. <em>Vi bygger tak som håller.</em>",
      body: "Takbyten, plåt och renoveringar. Ett team och en kontaktperson från första besöket till sista skruven.",
      chip: "Följ oss för fler jobb", vis: { photo: "tak-montor-nock.webp", pos: "50% 32%", cap: "Eget jobb" } },
    { id: "ig-takbyte", hook: "Före/under/efter", eyebrow: "Binaafy Bygg · Takbyte",
      hl: "Takbyte, <em>steg för steg.</em>",
      body: "Rötskadat ut, nytt underlag in, falsad plåt på. Bilder från ett av våra egna jobb.",
      chip: "ROT-avdrag 30 % på arbetet",
      vis: { steps: [["tak-fore-rotskadad.webp", "Före", "50% 50%"], ["tak-montor-nock.webp", "Under arbetet", "50% 32%"], ["tak-falsad-plat.webp", "Klart", "50% 40%"]] } },
    { id: "ig-tecken", hook: "Lista att spara", eyebrow: "Binaafy Bygg · Tips",
      hl: "Fem tecken på att taket <em>behöver ses över.</em>",
      body: "Känner du igen ett av dem? Vi kommer ut, tittar och ger ett kostnadsfritt förslag.",
      chip: "Spara inlägget",
      vis: { mock: "list", bg: "tak-rota-narbild.webp", items: ["Mossa och lav på pannorna", "Fuktfläckar på vinden", "Spruckna eller lösa pannor", "Rost på plåten", "Taket är 30–40 år eller äldre"] } },
    { id: "ig-rot", hook: "Räkneexempel", eyebrow: "Binaafy Bygg · ROT-avdrag",
      hl: "Så mycket drar <em>ROT-avdraget.</em>",
      body: "Avdraget görs direkt på fakturan. Du betalar resten, vi sköter ansökan hos Skatteverket.",
      chip: "Max 50 000 kr per person och år",
      vis: { mock: "rotcalc", title: "Exempel · takbyte", rows: [["Arbete", "120 000 kr"], ["Material", "80 000 kr"], ["ROT-avdrag 30 % på arbetet", "−36 000 kr", "rot"]], tot: ["Du betalar", "164 000 kr"], note: "Priser inkl. moms" } },
    { id: "ig-process", hook: "Trygghet: så går det till", eyebrow: "Binaafy Bygg",
      hl: "Så går ett jobb till <em>hos oss.</em>",
      body: "Inga överraskningar. Du vet vad som händer, när det händer och vad det kostar.",
      chip: "Kostnadsfritt besök",
      vis: { mock: "process", items: [["Du hör av dig", "Formulär, telefon eller DM"], ["Vi kommer ut", "Mäter, tittar, svarar på frågor"], ["Skriftlig offert", "Med ROT-avdraget uträknat"], ["Vi bygger", "En kontaktperson hela vägen"]] } },
    { id: "ig-falsad", hook: "Snyggt resultat", eyebrow: "Binaafy Bygg · Plåttak",
      hl: "Falsad plåt. <em>Raka linjer, tätt i decennier.</em>",
      body: "Ett plåttak från ett av våra jobb. Snyggt, tåligt och lätt att hålla efter.",
      chip: "Eget jobb", vis: { photo: "tak-falsad-plat.webp", pos: "50% 50%", cap: "Eget jobb · falsad plåt" } },
    { id: "ig-detalj", hook: "Hantverk i detalj", eyebrow: "Binaafy Bygg · Tegeltak",
      hl: "Det är detaljerna <em>som håller tätt.</em>",
      body: "Nock, vindskivor och genomföringar. Där de flesta läckor börjar, och där vi lägger mest tid.",
      chip: "Eget jobb", vis: { photo: "tak-tegel-detalj.webp", pos: "50% 50%", cap: "Eget jobb · tegeltak" } },
    { id: "ig-uteplats", hook: "Före/efter", eyebrow: "Binaafy Bygg · Uteplats",
      hl: "Samma gång. <em>Före och efter.</em>",
      body: "Mossiga betongplattor blev skiffer i fritt mönster. Nytt underlag, jämna fogar, nyspolat.",
      chip: "Eget jobb",
      vis: { steps: [["ute-fore-gang.webp", "Före", "50% 60%"], ["ute-efter-gang.webp", "Efter", "50% 55%"]] } },
    { id: "ig-tradack", hook: "Drömmen om sommaren", eyebrow: "Binaafy Bygg · Uteplats",
      hl: "Skiffer möter trä. <em>Klart till sommaren.</em>",
      body: "Ett nytt trädäck längs husväggen och skiffer runt planteringen. Planera nu, bygg innan säsongen.",
      chip: "Eget jobb", vis: { photo: "ute-dack-skiffer.webp", pos: "50% 60%", cap: "Eget jobb · trädäck och skiffer" } },
    { id: "ig-maleri", hook: "Inflyttningsklart", eyebrow: "Binaafy Bygg · Måleri",
      hl: "Klar att <em>flytta in i.</em>",
      body: "Väggar, dörrar och snickerier målade i hela lägenheten – och städat efteråt.",
      chip: "ROT-avdrag på arbetet",
      vis: { steps: [["maleri-hall.webp", "Hall", "50% 50%"], ["maleri-dorr.webp", "Snickerier", "50% 50%"], ["maleri-rum.webp", "Vardagsrum", "50% 50%"]] } },
    { id: "ig-fasad", hook: "Utomhusmåleri", eyebrow: "Binaafy Bygg · Fasad",
      hl: "Ljus fasad. <em>Ny takfot.</em>",
      body: "Fasaden gjordes om från ställning, med ny inklädnad av takfoten och ny plåt runt fönstren.",
      chip: "Eget jobb", vis: { photo: "fasad-ljus.webp", pos: "50% 40%", cap: "Eget jobb · fasad och takfot" } },
    // --- månad 2 ---
    { id: "ig-portal", hook: "Unik fördel", eyebrow: "Binaafy Bygg · Kundportal",
      hl: "Se ditt bygge <em>från jobbet.</em>",
      body: "Tidplan, dagens foton och ändringar att godkänna, i din egen kundportal. Du vet alltid var vi är.",
      chip: "Ingår i alla våra projekt", vis: { mock: "portal" } },
    { id: "ig-fordelar", hook: "Lista med skäl", eyebrow: "Binaafy Bygg · Därför oss",
      hl: "Sex skäl att välja <em>oss.</em>",
      body: "Från första besöket till sista fakturan, med full koll för dig hela vägen.",
      chip: "Spara inlägget", vis: { mock: "benefits", items: [["Följ bygget i realtid", "Tidplan, foton och fakturor i din kundportal"], ["ROT direkt på fakturan", "Vi sköter ansökan hos Skatteverket"], ["En kontaktperson", "Från första besök till slutbesiktning"], ["Inga överraskningar", "Ändringar godkänner du i portalen först"], ["Dokumentation", "Foton från varje steg, som PDF när det är klart"], ["Eget team", "Inga okända underentreprenörer"]] } },
    { id: "ig-rabatt", hook: "Tidsbegränsad rabatt", eyebrow: "Binaafy Bygg · Erbjudande",
      hl: "10&nbsp;% rabatt <em>till och med januari.</em>",
      body: "Signera din offert senast 31 januari 2027 så drar vi 10&nbsp;% på arbetet.",
      chip: "Tak, plåt, måleri, uteplats",
      vis: { mock: "offer", k: "Rabatt på arbetet", big: "10 %", s: "offerter signerade t.o.m. 31 januari 2027" } },
    { id: "ig-solceller", hook: "Nyfikenhet", eyebrow: "Binaafy Bygg · Solceller",
      hl: "Solceller på taket? <em>Börja med taket.</em>",
      body: "Paneler ska sitta i 25 år. Vi kollar att taket under håller lika länge och fäster panelerna tätt.",
      chip: "Eget jobb", vis: { photo: "tak-solceller.webp", pos: "50% 50%", cap: "Eget jobb · solceller på pannat tak" } },
    { id: "ig-nock", hook: "Hantverk", eyebrow: "Binaafy Bygg · Tegeltak",
      hl: "Raka rader. <em>Hela vägen upp.</em>",
      body: "Nya pannor och nockpannor som följer läkten exakt. Så ser ett tak ut när det är gjort ordentligt.",
      chip: "Eget jobb", vis: { photo: "tak-nock.webp", pos: "50% 50%", cap: "Eget jobb · nya nockpannor" } },
    { id: "ig-takfall", hook: "Säsong", eyebrow: "Binaafy Bygg · Inför vintern",
      hl: "Klarar taket <em>vinterns stormar?</em>",
      body: "Lösa pannor och slitna anslutningar syns först när det läcker. Vi tittar på ditt tak, kostnadsfritt.",
      chip: "Kostnadsfritt besök", vis: { photo: "tak-takfall.webp", pos: "50% 50%", cap: "Eget jobb · nytt tegeltak" } },
  ].map((p) => ({ ...p, side: "bygg-instagram", theme: "dark", cta: "Offert: binaafy.se", link: url("/bygg/offert"), formats: ["flode-4x5", "story-9x16"] })),
];

/* ---------- visuals ---------- */
function visual(c, f) {
  const v = c.vis;
  const corners = `<i class="cm cm-tl"></i><i class="cm cm-br"></i>`;
  const cap = v.cap ? `<span class="cap">${v.cap}</span>` : "";
  if (v.photo) return `<div class="vis"><div class="ph" style="background-image:url(${img(v.photo)});background-position:${v.pos}"></div>${corners}${cap}</div>`;
  if (v.steps) {
    const cols = v.steps.map(([f2, label, pos], i) => `<figure><div class="ph" style="background-image:url(${img(f2)});background-position:${pos}"></div><figcaption><b>0${i + 1}</b>${label}</figcaption></figure>`).join("");
    return `<div class="vis vis--steps"><div class="steps" style="grid-template-columns:repeat(${v.steps.length},1fr)">${cols}</div></div>`;
  }
  if (v.mock === "phone" && v.inv) {
    const iv = v.inv;
    return `<div class="vis vis--grid${c.theme === "dark" ? " vis--dark" : ""}">${corners}
    <div class="phone"><div class="scr">
      <div class="notch"></div>
      <div class="ph-h"><span class="k">${iv.k}</span><b>${iv.title}</b><span class="paid">${iv.status}</span></div>
      <div class="rows">${iv.rows.map(([a, b]) => `<p><span>${a}</span><span>${b}</span></p>`).join("")}</div>
      <div class="tot"><span>Summa</span><b>${iv.tot}</b></div>
    </div></div></div>`;
  }
  if (v.mock === "phone") return `<div class="vis vis--grid">${corners}
    <div class="phone"><div class="scr">
      <div class="notch"></div>
      <div class="ph-h"><span class="k">Faktura 1042 · Slutfaktura</span><b>Badrum, Andersson</b><span class="paid">Betald</span></div>
      <div class="rows">
        <p><span>Arbete</span><span>48 000 kr</span></p>
        <p><span>Material</span><span>22 000 kr</span></p>
        <p><span>ÄTA · extra golvbrunn</span><span>4 500 kr</span></p>
        <p><span>Avgår delfaktura 1</span><span>−30 000 kr</span></p>
        <p class="rot"><span>ROT-avdrag 30 %</span><span>−14 400 kr</span></p>
      </div>
      <div class="tot"><span>Att betala</span><b>30 100 kr</b></div>
    </div></div></div>`;
  if (v.mock === "compare") return `<div class="vis vis--dark vis--grid">${corners}
    <div class="cmp">
      <div class="cmp-c cmp-b"><span class="k">Före</span>${v.before.map((t) => `<p>${t}</p>`).join("")}</div>
      <div class="cmp-c cmp-a"><span class="k">Med Binaafy</span>${v.after.map((t) => `<p>${t}</p>`).join("")}</div>
    </div></div>`;
  if (v.mock === "status") return `<div class="vis vis--grid">${corners}
    <div class="st"><div class="st-h"><b>${v.title}</b><span>4 fakturor</span></div>
      ${v.rows.map(([n, who, amt, s, cls]) => `<div class="st-r"><span class="n">${n}</span><span class="who">${who}</span><span class="amt">${amt}</span><span class="pill pill--${cls}">${s}</span></div>`).join("")}
    </div></div>`;
  if (v.mock === "tags") return `<div class="vis vis--dark vis--grid">${corners}
    <div class="tags">${v.tags.map((t) => `<span${v.on.includes(t) ? ' class="on"' : ""}>${t}</span>`).join("")}</div></div>`;
  if (v.mock === "slots") return `<div class="vis vis--offer">${corners}
    <div class="slots"><span class="k">Grundarplatser</span><div class="sl">${Array.from({ length: v.n }, (_, i) => `<div><b>0${i + 1}</b><span>Ledig</span></div>`).join("")}</div></div></div>`;
  if (v.mock === "portal") return `<div class="vis vis--dark vis--grid">${corners}
    <div class="phone"><div class="scr pt">
      <div class="notch"></div>
      <div class="pt-h"><span class="k">Mitt projekt</span><b>Takbyte, Storgatan 12</b>
        <div class="pt-bar"><i style="width:55%"></i></div><span class="pt-d">Dag 6 av 11 · enligt tidplan</span></div>
      <div class="pt-tabs"><span class="on">Översikt</span><span>Tidplan</span><span>Foton</span><span>Fakturor</span></div>
      <div class="pt-ph"><span class="k">Nya foton i dag</span><div>${["tak-fore-rotskadad.webp", "tak-under-laktning.webp", "tak-montor-nock.webp"].map((p) => `<i style="background-image:url(${img(p)})"></i>`).join("")}</div></div>
      <div class="pt-ata"><b>Ändring väntar på ditt svar</b><span>Byte av två rötskadade bräder · 1&nbsp;800&nbsp;kr</span><em>Godkänn</em></div>
      <ul class="pt-ph2"><li class="ok">Rivning</li><li class="ok">Nytt underlag</li><li class="now">Läkt och pannor</li><li>Slutbesiktning</li></ul>
    </div></div><span class="cap cap--r">Exempel</span></div>`;
  if (v.mock === "benefits") return `<div class="vis ${c.theme === "dark" ? "vis--dark " : ""}vis--grid">${corners}
    <div class="bn">${v.items.map(([a, b], i) => `<div class="bn-i${i === 0 ? " bn-i--hot" : ""}"><span class="n">0${i + 1}</span><b>${a}</b><span>${b}</span></div>`).join("")}</div></div>`;
  if (v.mock === "tiers") return `<div class="vis vis--grid">${corners}
    <div class="tiers">${v.tiers.map(([n, p, pr, hot, it]) => `<div class="tr${hot ? " tr--hot" : ""}">${hot ? '<span class="tr-tag">Erbjudande</span>' : ""}<span class="k">${n}</span><span class="p">${p}</span><ul>${it.map((x) => `<li>${x}</li>`).join("")}</ul><b>${pr}</b></div>`).join("")}</div>
    <span class="tr-note">${v.note}</span></div>`;
  if (v.mock === "pages") return `<div class="vis vis--dark vis--grid">${corners}
    <div class="pgs">${v.pages.map((p, i) => `<div class="pg" style="--i:${i}"><div class="pg-bar"><i></i><i></i><i></i></div><div class="pg-hero"></div><i class="ln"></i><i class="ln s"></i><b>${p}</b></div>`).join("")}</div></div>`;
  if (v.mock === "receipt") return `<div class="vis vis--grid">${corners}
    <div class="rc"><div class="rc-h"><b>Binaafy</b><span>Allt-i-ett · per månad</span></div>
      ${v.rows.map(([a, b]) => `<p><span>${a}</span><b${b === "0 kr" ? ' class="free"' : ""}>${b}</b></p>`).join("")}
      <div class="rc-t"><span>Totalt</span><b>${v.tot}</b></div><small>exkl. moms</small></div></div>`;
  if (v.mock === "list") return `<div class="vis"><div class="ph" style="background-image:url(${img(v.bg)});background-position:50% 50%"></div><div class="dim"></div>${corners}
    <ol class="lst">${v.items.map((t, i) => `<li><b>0${i + 1}</b>${t}</li>`).join("")}</ol></div>`;
  if (v.mock === "rotcalc") return `<div class="vis vis--dark vis--grid">${corners}
    <div class="st rcalc"><div class="st-h"><b>${v.title}</b><span>${v.note}</span></div>
      ${v.rows.map(([a, b, cls]) => `<div class="rr${cls ? " rr--" + cls : ""}"><span>${a}</span><b>${b}</b></div>`).join("")}
      <div class="rr rr--tot"><span>${v.tot[0]}</span><b>${v.tot[1]}</b></div></div></div>`;
  if (v.mock === "process") return `<div class="vis vis--dark vis--grid">${corners}
    <ol class="proc">${v.items.map(([a, b], i) => `<li><b>0${i + 1}</b><div><strong>${a}</strong><span>${b}</span></div></li>`).join("")}</ol></div>`;
  if (v.mock === "app") return `<div class="vis vis--dark vis--grid">${corners}
    <div class="phone"><div class="scr app">
      <div class="notch"></div>
      <div class="ap-h"><span class="k">Tisdag 14 oktober</span><b>Dagens jobb</b></div>
      <div class="ap-j done"><span class="t">07:30</span><div><b>Byte av blandare</b><span>Lyckans väg 4</span></div><em>Klart · faktura skickad</em></div>
      <div class="ap-j now"><span class="t">10:00</span><div><b>Badrumsrenovering</b><span>Storgatan 12 · dag 3 av 12</span></div><em>Pågår</em></div>
      <div class="ap-j"><span class="t">15:30</span><div><b>Besiktning</b><span>Tallvägen 8</span></div><em>Nästa</em></div>
      <div class="ap-b">Rapportera tid</div>
    </div></div><span class="cap cap--r">Exempel</span></div>`;
  if (v.mock === "hub") return `<div class="vis vis--dark vis--grid">${corners}
    <div class="hub">${v.tiles.slice(0, 4).map(([a, b]) => `<div class="hb"><b>${a}</b><span>${b}</span></div>`).join("")}<div class="hb hb-c"><b>Binaafy</b><span>Ett nummer att ringa</span></div>${v.tiles.slice(4).map(([a, b]) => `<div class="hb"><b>${a}</b><span>${b}</span></div>`).join("")}</div></div>`;
  if (v.mock === "menu") return `<div class="vis vis--dark vis--grid">${corners}
    <div class="menu">
      <div class="mn mn-r"><span class="k">Färdigt att använda</span>${v.ready.map(([a, b]) => `<p><span>${a}</span><b>${b}</b></p>`).join("")}<small>exkl. moms</small></div>
      <div class="mn mn-c"><span class="k">Byggt för er</span>${v.custom.map((t) => `<p>${t}</p>`).join("")}<small>Fast pris per etapp</small></div>
    </div></div>`;
  if (v.mock === "sheet") {
    const rows = [["Kund", "Tel", "Status", "Faktura?"], ["Nordström AB", "070-…", "klar??", "JA"], ["Café Linné", "", "ring igen", "nej"], ["Studio Ek", "073-…", "", "?? kolla"], ["Hallberg", "070-…", "VÄNTAR", ""], ["", "", "", ""]];
    return `<div class="vis vis--grid">${corners}
    <div class="sheet"><div class="sh-t">${v.file}</div><div class="sh-g">${rows.map((r, i) => `<span class="rn">${i + 1}</span>${r.map((c2) => `<span${i === 0 ? ' class="hd"' : ""}>${c2}</span>`).join("")}`).join("")}</div></div>
    <div class="sticky">Vem uppdaterade den här?</div></div>`;
  }
  if (v.mock === "flow") return `<div class="vis vis--dark vis--grid">${corners}
    <div class="flow">${v.nodes.map(([a, b], i) => `${i ? '<i class="fl-a"></i>' : ""}<div class="fl-n"><b>${a}</b><span>${b}</span></div>`).join("")}</div>
    <span class="fl-tag">Sker av sig självt</span></div>`;
  if (v.mock === "offer" && v.big) return `<div class="vis vis--offer">${corners}
    <div class="offer"><span class="k">${v.k}</span><b style="font-size:min(42cqmin,${(140 / v.big.length).toFixed(1)}cqw)">${v.big}</b><span class="s">${v.s}</span></div></div>`;
  if (v.mock === "browser") return `<div class="vis vis--grid vis--dark">${corners}
    <div class="browser"><div class="bar"><i></i><i></i><i></i><span>${v.url || "dinbyggfirma.se"}</span></div><div class="shot" style="background-image:url(${img(v.shot || "sajt-bygg.png")})"></div></div></div>`;
  if (v.mock === "offer") return `<div class="vis vis--offer">${corners}
    <div class="offer"><span class="k">Uppstart</span><b>0 kr</b><span class="s">för de fem första företagen</span></div></div>`;
}

/* ---------- css ---------- */
function css(f) {
  const u = f.print ? `${f.mm[0] / 100}mm` : `${f.w / 100}px`;
  const W = f.print ? `${f.mm[0]}mm` : `${f.w}px`;
  const H = f.print ? `${f.mm[1]}mm` : `${f.h}px`;
  const hU = f.print ? (f.mm[1] / f.mm[0]) * 100 : (f.h / f.w) * 100; // height in u
  return `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
${f.print ? `@page { size: ${W} ${H}; margin: 0; }` : ""}
*{box-sizing:border-box;margin:0;padding:0}
:root{--u:${u};--dark:#18232c;--dark2:#1e2c37;--dark3:#26343f;--cream:#f5f2ed;--cream2:#ebe6de;--paper:#fbfaf7;--ink:#1e2c37;--ink2:#4b5763;--ink3:#5e6a76;--on2:#a9b3bd;--orange:#f7802e;--orange-t:#b8560f}
html,body{width:${W};height:${H};overflow:hidden}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;-webkit-font-smoothing:antialiased}
.ad{position:relative;width:${W};height:${H};display:grid;overflow:hidden}
.t-dark{background:var(--dark);color:var(--cream)}
.t-light{background:var(--cream);color:var(--ink)}
.k-portrait,.k-story{grid-template-rows:calc(${hU}*var(--u)*${f.vis ?? 0.5}) 1fr}
.k-landscape{grid-template-columns:1fr 1fr}
.k-landscape .vis{order:2}

/* visual */
.vis{position:relative;overflow:hidden;container-type:size}
.ph{position:absolute;inset:0;background-size:cover}
.cm{position:absolute;width:5cqmin;height:5cqmin;border:0 solid var(--orange);z-index:2}
.cm-tl{top:4cqmin;left:4cqmin;border-top-width:max(2px,.45cqmin);border-left-width:max(2px,.45cqmin)}
.cm-br{bottom:4cqmin;right:4cqmin;border-bottom-width:max(2px,.45cqmin);border-right-width:max(2px,.45cqmin)}
.cap{position:absolute;z-index:2;left:4cqmin;bottom:4cqmin;font-size:max(11px,2.6cqmin);font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#fff;background:rgba(24,35,44,.78);padding:1.2cqmin 2.4cqmin}
.vis--grid{background-color:var(--cream2);background-image:linear-gradient(rgba(30,44,55,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(30,44,55,.07) 1px,transparent 1px);background-size:6cqmin 6cqmin}
.vis--dark{background-color:var(--dark2);background-image:linear-gradient(rgba(245,242,237,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(245,242,237,.06) 1px,transparent 1px)}
.t-light .vis--grid .cm, .t-light .vis--offer .cm{border-color:var(--dark)}
.t-light .vis--dark .cm{border-color:var(--orange)}

/* steps */
.vis--steps{background:var(--dark)}
.steps{position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,1fr);gap:max(3px,.8cqmin)}
.steps figure{position:relative;overflow:hidden}
.steps figcaption{position:absolute;left:0;right:0;bottom:0;padding:9cqmin 3cqmin 3cqmin;background:linear-gradient(transparent,rgba(24,35,44,.92));color:#fff;font-size:max(11px,3.2cqmin);font-weight:600;letter-spacing:.04em}
.steps figcaption b{display:block;color:var(--orange);font-size:max(10px,2.4cqmin);letter-spacing:.2em;margin-bottom:.6cqmin}

/* phone */
.phone{position:absolute;left:50%;top:9cqh;transform:translateX(-50%);height:120cqh;aspect-ratio:9/18.5;background:#11181f;border-radius:7cqh;padding:1.6cqh;box-shadow:0 4cqh 10cqh rgba(24,35,44,.28)}
.scr{width:100%;height:100%;background:#fff;border-radius:5.6cqh;overflow:hidden;font-size:2.7cqh;color:var(--ink)}
.notch{width:32%;height:3cqh;background:#11181f;border-radius:0 0 2cqh 2cqh;margin:0 auto}
.ph-h{padding:3.6cqh 4.2cqh 2.6cqh;border-bottom:1px solid #ece7df;display:flex;flex-direction:column;gap:.8cqh}
.ph-h .k{font-size:1.9cqh;letter-spacing:.16em;text-transform:uppercase;color:var(--ink3);font-weight:600}
.ph-h b{font-size:3.8cqh;letter-spacing:-.02em}
.paid{align-self:flex-start;background:#d7eadf;color:#155a37;font-weight:700;font-size:2cqh;padding:.5cqh 1.8cqh;border-radius:9cqh}
.rows{padding:1cqh 4.2cqh}
.rows p{display:flex;justify-content:space-between;padding:1.7cqh 0;border-bottom:1px solid #f0ebe3}
.rows .rot{color:#155a37;font-weight:600}
.tot{margin:1.4cqh 4.2cqh 0;padding-top:2cqh;border-top:2px solid var(--ink);display:flex;justify-content:space-between;align-items:baseline}
.tot span{color:var(--ink3)} .tot b{font-size:5cqh;letter-spacing:-.03em}

/* browser */
.browser{position:absolute;left:8cqw;right:-6cqw;top:14cqh;bottom:-4cqh;background:#fff;border-radius:1.6cqmin;overflow:hidden;box-shadow:0 3cqh 9cqh rgba(0,0,0,.4)}
.bar{height:5.5cqmin;background:#e9e5df;display:flex;align-items:center;gap:1cqmin;padding:0 2.2cqmin}
.bar i{width:1.4cqmin;height:1.4cqmin;border-radius:50%;background:#c8c1b6}
.bar span{margin-left:2cqmin;flex:0 1 46%;background:#fff;border-radius:1cqmin;height:3.2cqmin;line-height:3.2cqmin;font-size:max(9px,1.8cqmin);color:var(--ink3);padding:0 2cqmin}
.browser{background:#1b2530}.shot{position:absolute;top:5.5cqmin;left:0;right:0;aspect-ratio:1600/860;background-size:100% auto;background-repeat:no-repeat;background-position:left top}

/* offer */
.vis--offer{background:var(--orange);color:var(--dark);display:grid;place-items:center}
.offer{text-align:center;display:flex;flex-direction:column;align-items:center}
.offer .k{font-size:4cqmin;font-weight:600;letter-spacing:.3em;text-transform:uppercase}
.offer b{font-size:42cqmin;font-weight:700;letter-spacing:-.06em;line-height:.9;margin:1cqmin 0 2cqmin}
.offer .s{font-size:4.2cqmin;font-weight:600}

/* före/efter */
.cmp{position:absolute;inset:10cqmin 7cqmin;display:grid;grid-template-columns:1fr 1fr;gap:3cqmin}
.cmp-c{padding:1.2em;display:flex;flex-direction:column;justify-content:center;gap:1em;font-size:min(5cqh,3.3cqw);font-weight:500;line-height:1.22}
.cmp-c .k{font-size:.7em;font-weight:700;letter-spacing:.2em;text-transform:uppercase;margin-bottom:.8cqmin}
.cmp-b{border:max(1px,.25cqmin) dashed rgba(245,242,237,.3);color:#8d98a3}
.cmp-b p{text-decoration:line-through;text-decoration-color:rgba(247,128,46,.8);text-decoration-thickness:max(1.5px,.3cqmin)}
.cmp-a{background:var(--cream);color:var(--ink);box-shadow:0 2cqmin 6cqmin rgba(0,0,0,.35)}
.cmp-a .k{color:var(--orange-t)}
.cmp-a p{padding-left:4.4cqmin;position:relative}
.cmp-a p::before{content:"";position:absolute;left:0;top:.5cqmin;width:1.6cqmin;height:2.8cqmin;border:solid var(--orange);border-width:0 .55cqmin .55cqmin 0;transform:rotate(45deg) translate(-.4cqmin,-.6cqmin)}

/* fakturastatus */
.st{position:absolute;left:7cqmin;right:7cqmin;top:50%;transform:translateY(-50%);background:#fff;box-shadow:0 2cqmin 7cqmin rgba(24,35,44,.18);font-size:min(4.4cqh,3cqw);color:var(--ink)}
.st-h{display:flex;justify-content:space-between;align-items:baseline;padding:.9em 1.1em;border-bottom:1px solid #ece7df}
.st-h b{font-size:1.2em;letter-spacing:-.02em} .st-h span{color:var(--ink3);font-size:.8em}
.st-r{display:grid;grid-template-columns:auto 1fr auto auto;gap:.8em;align-items:center;padding:.72em 1.1em;border-bottom:1px solid #f0ebe3}
.st-r .n{color:var(--ink3);font-variant-numeric:tabular-nums} .st-r .who{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} .st-r .amt{font-variant-numeric:tabular-nums}
.pill{font-size:.72em;font-weight:700;padding:.3em .8em;border-radius:9cqmin;white-space:nowrap;justify-self:end}
.pill--ok{background:#d7eadf;color:#155a37} .pill--late{background:#fde3d2;color:#a3420a} .pill--sent{background:#e7ebef;color:#33424f}

/* branscher */
.tags{position:absolute;inset:10cqmin 8cqmin;display:flex;flex-wrap:wrap;align-content:center;justify-content:center;gap:2.4cqmin 2cqmin}
.tags span{font-size:min(5.6cqmin,4.2cqw);font-weight:600;padding:1.6cqmin 3.4cqmin;border:max(1px,.25cqmin) solid rgba(245,242,237,.25);color:#a9b3bd;letter-spacing:-.01em}
.tags .on{background:var(--orange);border-color:var(--orange);color:var(--dark)}

/* kundportal */
.pt{display:flex;flex-direction:column;font-size:2.4cqh;gap:1.4cqh}
.pt-h{padding:2.6cqh 3.6cqh 0;display:flex;flex-direction:column;gap:.6cqh}
.pt-h .k,.pt-ph .k{font-size:1.8cqh;letter-spacing:.14em;text-transform:uppercase;color:var(--ink3);font-weight:600}
.pt-h b{font-size:3.4cqh;letter-spacing:-.03em}
.pt-bar{height:1.2cqh;background:#ece7df;border-radius:9cqh;overflow:hidden;margin-top:.8cqh} .pt-bar i{display:block;height:100%;background:var(--orange)}
.pt-d{font-size:1.9cqh;color:#155a37;font-weight:600}
.pt-tabs{display:flex;gap:1.4cqh;padding:0 3.6cqh;font-size:1.9cqh;color:var(--ink3);font-weight:600;border-bottom:1px solid #ece7df}
.pt-tabs span{padding-bottom:1cqh} .pt-tabs .on{color:var(--ink);border-bottom:2px solid var(--orange)}
.pt-ph{padding:0 3.6cqh;display:flex;flex-direction:column;gap:.8cqh}
.pt-ph div{display:grid;grid-template-columns:repeat(3,1fr);gap:.8cqh} .pt-ph i{aspect-ratio:1;background-size:cover;background-position:center;border-radius:1cqh}
.pt-ata{margin:0 3cqh;padding:1.6cqh 2cqh;background:#fff8f2;border:2px solid var(--orange);border-radius:1.6cqh;display:grid;grid-template-columns:1fr auto;gap:.3cqh 1.4cqh;align-items:center}
.pt-ata b{font-size:2.2cqh} .pt-ata span{grid-column:1;font-size:1.8cqh;color:var(--ink3)} .pt-ata em{grid-row:1/3;grid-column:2;font-style:normal;background:var(--orange);color:var(--dark);font-weight:700;font-size:1.9cqh;padding:1cqh 1.8cqh;border-radius:1cqh}
.pt-ph2{list-style:none;padding:0 3.6cqh;display:flex;flex-direction:column;gap:.9cqh;font-size:2.1cqh}
.pt-ph2 li{display:flex;align-items:center;gap:1.2cqh;color:var(--ink3)} .pt-ph2 li::before{content:"";width:1.8cqh;height:1.8cqh;border-radius:50%;border:2px solid #cfc8bd;flex:none}
.pt-ph2 .ok{color:var(--ink)} .pt-ph2 .ok::before{background:#155a37;border-color:#155a37}
.pt-ph2 .now{color:var(--ink);font-weight:700} .pt-ph2 .now::before{border-color:var(--orange);background:radial-gradient(var(--orange) 45%,transparent 50%)}

/* fördelar */
.bn{position:absolute;inset:8cqmin 6cqmin;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);gap:2cqmin;font-size:min(4.1cqh,2.5cqw)}
.bn-i{padding:.9em 1em;display:flex;flex-direction:column;gap:.35em;justify-content:flex-end;line-height:1.2}
.t-dark .bn-i{background:rgba(24,35,44,.6);border:max(1px,.25cqmin) solid rgba(245,242,237,.2);color:var(--cream)}
.t-light .bn-i{background:#fff;box-shadow:0 1cqmin 4cqmin rgba(24,35,44,.1);color:var(--ink)}
.bn-i .n{font-size:.7em;font-weight:700;letter-spacing:.14em;color:var(--orange);margin-bottom:auto}
.t-light .bn-i .n{color:var(--orange-t)}
.bn-i b{font-size:1.08em;letter-spacing:-.02em}
.bn-i span:last-child{font-size:.74em} .t-dark .bn-i span:last-child{color:var(--on2)} .t-light .bn-i span:last-child{color:var(--ink3)}
.bn-i--hot{background:var(--orange)!important;border-color:var(--orange)!important;color:var(--dark)!important}
.bn-i--hot .n,.bn-i--hot span:last-child{color:var(--dark)!important}

/* prisnivåer */
.tiers{position:absolute;inset:12cqmin 10cqmin 15cqmin;display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:2.4cqmin;align-items:stretch;font-size:min(4.2cqh,2.7cqw)}
.tr{position:relative;background:#fff;box-shadow:0 1.5cqmin 5cqmin rgba(24,35,44,.12);padding:1em .9em;display:flex;flex-direction:column;gap:.35em;color:var(--ink)}
.tr .k{font-size:.66em;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--ink3)}
.tr .p{font-weight:600;line-height:1.2}
.tr ul{list-style:none;margin-top:.6em;display:flex;flex-direction:column;gap:.45em;font-size:.78em;color:var(--ink2)}
.tr li{padding-left:1em;position:relative} .tr li::before{content:"";position:absolute;left:0;top:.5em;width:.4em;height:.4em;background:var(--orange)}
.tr--hot ul{color:var(--on2)}
.tr b{margin-top:auto;font-size:1.55em;letter-spacing:-.04em;white-space:nowrap}
.tr--hot{background:var(--dark);color:var(--cream);transform:translateY(-4%);box-shadow:0 2cqmin 6cqmin rgba(24,35,44,.3)}
.tr--hot .k{color:var(--orange)} .tr--hot b{color:var(--orange)}
.tr-tag{position:absolute;top:0;right:0;transform:translateY(-50%);margin-right:.8em;background:var(--orange);color:var(--dark);font-size:.62em;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:.3em .7em}
.tr-note{position:absolute;left:10cqmin;bottom:5.5cqmin;font-size:min(3.2cqh,2.2cqw);font-weight:600;color:var(--ink2)}

/* fem sidor */
.pgs{position:absolute;inset:10cqmin 6cqmin;display:grid;grid-template-columns:repeat(5,1fr);gap:2cqmin;align-items:center}
.pg{background:var(--cream);aspect-ratio:3/4.2;display:flex;flex-direction:column;gap:5%;padding:6%;box-shadow:0 2cqmin 5cqmin rgba(0,0,0,.35);transform:translateY(calc((var(--i) - 2) * (var(--i) - 2) * 1.6cqmin));font-size:min(3.4cqh,1.9cqw);color:var(--ink)}
.pg-bar{display:flex;gap:6%;height:5%} .pg-bar i{flex:1;background:#d9d3c9}
.pg-hero{height:32%;background:linear-gradient(135deg,#26343f,#3a4b58)}
.pg .ln{height:4%;background:#e3ddd3} .pg .ln.s{width:60%}
.pg b{margin-top:auto;font-weight:700;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pg:nth-child(1) .pg-hero{background:var(--orange)}

/* kvitto */
.rc{position:absolute;left:50%;top:7cqh;bottom:0;width:min(78cqw,80cqh);transform:translateX(-50%);background:#fff;box-shadow:0 2cqmin 7cqmin rgba(24,35,44,.18);padding:1.1em 1.4em;font-size:min(4cqh,2.8cqw);color:var(--ink);display:flex;flex-direction:column;gap:.15em}
.rc-h{display:flex;justify-content:space-between;align-items:baseline;padding-bottom:.6em;margin-bottom:.3em;border-bottom:2px solid var(--ink)}
.rc-h b{font-size:1.35em;letter-spacing:-.04em} .rc-h span{font-size:.72em;color:var(--ink3);letter-spacing:.12em;text-transform:uppercase;font-weight:600}
.rc p{display:flex;justify-content:space-between;gap:1em;padding:.42em 0;border-bottom:1px dashed #d9d3c9}
.rc p b{font-variant-numeric:tabular-nums;white-space:nowrap} .rc p b.free{color:#155a37}
.rc-t{display:flex;justify-content:space-between;align-items:baseline;margin-top:.5em}
.rc-t span{font-weight:600} .rc-t b{font-size:1.6em;letter-spacing:-.04em;color:var(--orange-t)}
.rc small{color:var(--ink3);font-size:.7em;align-self:flex-end}

/* lista över foto */
.dim{position:absolute;inset:0;background:linear-gradient(90deg,rgba(24,35,44,.92) 0%,rgba(24,35,44,.75) 60%,rgba(24,35,44,.35) 100%)}
.lst{position:absolute;inset:9cqmin 8cqmin;list-style:none;display:flex;flex-direction:column;justify-content:center;gap:.7em;font-size:min(5.2cqh,3.6cqw);color:#fff;font-weight:600;z-index:1}
.lst li{display:flex;align-items:baseline;gap:.8em;padding-bottom:.55em;border-bottom:1px solid rgba(245,242,237,.18)}
.lst b{color:var(--orange);font-size:.75em;letter-spacing:.1em}

/* ROT-kalkyl */
.rcalc{font-size:min(4.6cqh,3.1cqw)}
.rr{display:flex;justify-content:space-between;gap:1em;padding:.75em 1.1em;border-bottom:1px solid #f0ebe3}
.rr b{font-variant-numeric:tabular-nums;white-space:nowrap}
.rr--rot{color:#155a37;font-weight:600}
.rr--tot{border-bottom:0;border-top:2px solid var(--ink);align-items:baseline} .rr--tot span{font-weight:600} .rr--tot b{font-size:1.5em;letter-spacing:-.04em;color:var(--orange-t)}

/* process */
.proc{position:absolute;inset:9cqmin 9cqmin;list-style:none;display:flex;flex-direction:column;justify-content:center;gap:1em;font-size:min(6.2cqh,4.4cqw);color:var(--cream)}
.proc li{display:flex;align-items:center;gap:1em;position:relative}
.proc li>b{flex:none;width:2.4em;height:2.4em;display:grid;place-items:center;background:var(--orange);color:var(--dark);font-size:.9em}
.proc li div{display:flex;flex-direction:column;gap:.15em} .proc strong{font-size:1.1em;letter-spacing:-.01em} .proc span{color:var(--on2);font-size:.78em}

/* app: dagens jobb */
.app{display:flex;flex-direction:column;font-size:2.5cqh}
.ap-h{padding:3cqh 4.2cqh 2cqh;display:flex;flex-direction:column;gap:.6cqh}
.ap-h .k{font-size:1.9cqh;letter-spacing:.14em;text-transform:uppercase;color:var(--ink3);font-weight:600}
.ap-h b{font-size:4.2cqh;letter-spacing:-.03em}
.ap-j{margin:0 3cqh 1.6cqh;padding:2cqh 2.4cqh;border:1px solid #ece7df;border-radius:2cqh;display:grid;grid-template-columns:auto 1fr;gap:.4cqh 2cqh;align-items:start}
.ap-j .t{font-weight:700;font-variant-numeric:tabular-nums;color:var(--ink3)}
.ap-j div{display:flex;flex-direction:column;gap:.3cqh;min-width:0} .ap-j b{font-size:2.7cqh;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} .ap-j div span{color:var(--ink3);font-size:2.1cqh;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ap-j em{grid-column:2;justify-self:start;font-style:normal;font-weight:700;font-size:1.9cqh;padding:.4cqh 1.4cqh;border-radius:9cqh;background:#e7ebef;color:#33424f}
.ap-j.done{opacity:.75} .ap-j.done em{background:#d7eadf;color:#155a37}
.ap-j.now{border:2px solid var(--orange);background:#fff8f2} .ap-j.now em{background:var(--orange);color:var(--dark)}
.ap-b{margin:1cqh 3cqh 0;background:var(--dark);color:#fff;font-weight:700;text-align:center;padding:2.2cqh;border-radius:2cqh;font-size:2.6cqh}
.cap--r{left:auto;right:4cqmin}

/* hub: alla tjänster */
.hub{position:absolute;inset:9cqmin 7cqmin;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:2cqmin;font-size:min(4.2cqh,2.5cqw)}
.hb{border:max(1px,.25cqmin) solid rgba(245,242,237,.22);padding:.8em .9em;display:flex;flex-direction:column;justify-content:flex-end;gap:.25em;color:var(--cream);background:rgba(24,35,44,.55)}
.hb b{font-size:1em;letter-spacing:-.01em;line-height:1.15} .hb span{font-size:.7em;color:var(--on2);line-height:1.25}
.hb-c{background:var(--orange);border-color:var(--orange);color:var(--dark);justify-content:center;align-items:center;text-align:center}
.hb-c b{font-size:1.45em;letter-spacing:-.04em} .hb-c span{color:var(--dark);font-weight:600}

/* meny: färdigt / byggt */
.menu{position:absolute;inset:10cqmin 7cqmin;display:grid;grid-template-columns:1fr 1fr;gap:3cqmin;font-size:min(4.4cqh,2.9cqw)}
.mn{padding:1.1em;display:flex;flex-direction:column;gap:.75em;line-height:1.2}
.mn .k{font-size:.66em;font-weight:700;letter-spacing:.2em;text-transform:uppercase}
.mn small{margin-top:auto;font-size:.7em;font-weight:600}
.mn-r{background:var(--cream);color:var(--ink)} .mn-r .k{color:var(--orange-t)}
.mn-r p{display:flex;flex-direction:column;gap:.15em;padding-bottom:.6em;border-bottom:1px solid #e3ddd3;font-weight:600}
.mn-r p b{font-size:1.5em;letter-spacing:-.03em;color:var(--ink)} .mn-r small{color:var(--ink3)}
.mn-c{border:max(1.5px,.3cqmin) solid var(--orange);color:var(--cream)} .mn-c .k{color:var(--orange)}
.mn-c p{font-weight:500;padding-left:1em;position:relative} .mn-c p::before{content:"";position:absolute;left:0;top:.45em;width:.42em;height:.42em;background:var(--orange)}
.mn-c small{color:var(--orange)}

/* excelark */
.sheet{position:absolute;left:8cqmin;right:8cqmin;top:9cqmin;bottom:9cqmin;background:#fff;box-shadow:0 2cqmin 7cqmin rgba(24,35,44,.2);font-size:min(3.8cqh,2.6cqw);display:flex;flex-direction:column;transform:rotate(-1.5deg)}
.sh-t{background:#1f7244;color:#fff;font-weight:600;padding:.55em .9em;font-size:.85em}
.sh-g{flex:1;display:grid;grid-template-columns:2.2em 1.6fr 1fr 1fr 1fr;grid-auto-rows:1fr;font-family:Arial,sans-serif}
.sh-g span{border-right:1px solid #dcdcdc;border-bottom:1px solid #dcdcdc;padding:0 .5em;display:flex;align-items:center;white-space:nowrap;overflow:hidden;color:#333}
.sh-g .rn{background:#f1f1f1;color:#777;justify-content:center;font-size:.8em}
.sh-g .hd{background:#f6f6f6;font-weight:700}
.sticky{position:absolute;right:6cqmin;bottom:6cqmin;width:min(30cqh,22cqw);aspect-ratio:1;background:#ffd85c;color:#3a2f00;font-family:'Comic Sans MS','Segoe Print',cursive;font-size:min(4.2cqh,3cqw);line-height:1.2;padding:1em .8em;transform:rotate(4deg);box-shadow:0 1.5cqmin 4cqmin rgba(0,0,0,.2);display:flex;align-items:center}

/* flöde */
.flow{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:0;padding:0 7cqmin;font-size:min(4.4cqh,2.6cqw)}
.fl-n{background:var(--cream);color:var(--ink);padding:1em 1.1em;display:flex;flex-direction:column;gap:.3em;flex:1;box-shadow:0 2cqmin 6cqmin rgba(0,0,0,.35)}
.fl-n b{font-size:1.05em;letter-spacing:-.02em;white-space:nowrap} .fl-n span{color:var(--ink3);font-size:.8em}
.fl-a{flex:0 0 7%;height:max(2px,.6cqmin);background:var(--orange);position:relative}
.fl-a::after{content:"";position:absolute;right:-.1em;top:50%;width:.6em;height:.6em;border:solid var(--orange);border-width:max(2px,.6cqmin) max(2px,.6cqmin) 0 0;transform:translateY(-50%) rotate(45deg)}
.fl-tag{position:absolute;left:50%;bottom:14cqh;transform:translateX(-50%);font-size:min(3cqh,2cqw);font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--orange)}

/* grundarplatser */
.slots{display:flex;flex-direction:column;align-items:center;gap:5cqmin;width:84cqw}
.slots .k{font-size:4cqmin;font-weight:600;letter-spacing:.3em;text-transform:uppercase}
.sl{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:2.4cqmin;width:100%}
.sl div{aspect-ratio:3/4;max-height:44cqh;border:max(2px,.5cqmin) solid var(--dark);display:flex;flex-direction:column;justify-content:space-between;padding:min(2.4cqmin,1.6cqw);background:rgba(255,255,255,.18)}
.sl b{font-size:min(9cqmin,6cqw);font-weight:700;letter-spacing:-.05em;line-height:1}
.sl span{font-size:min(2.8cqmin,1.8cqw);font-weight:700;letter-spacing:.1em;text-transform:uppercase}

/* panel */
.panel{position:relative;min-height:0;overflow:hidden;display:flex;flex-direction:column;padding:calc(var(--u)*${f.pad}) calc(var(--u)*${f.pad}) calc(var(--u)*${f.kind === "story" ? (hU * 0.19).toFixed(1) : f.pad * 0.85})}
.k-landscape .panel{justify-content:space-between}
.eyebrow{display:flex;align-items:center;gap:calc(var(--u)*1.6);font-size:calc(var(--u)*${f.kind === "landscape" ? 1.15 : f.print ? 1.65 : 2});font-weight:600;letter-spacing:.22em;text-transform:uppercase}
.eyebrow::before{content:"";width:calc(var(--u)*${f.kind === "landscape" ? 3 : 5});height:max(2px,calc(var(--u)*.3));background:var(--orange)}
.t-dark .eyebrow{color:var(--on2)} .t-light .eyebrow{color:var(--ink3)}
h1{margin-top:calc(var(--u)*${f.kind === "landscape" ? 1.6 : 3});font-size:calc(var(--u)*${f.hl}*var(--fit,1));line-height:1.03;font-weight:600;letter-spacing:-.035em;text-wrap:balance}
h1 em{font-style:normal}
.t-dark h1 em{color:var(--orange)} .t-light h1 em{color:var(--orange-t)}
.body{margin-top:calc(var(--u)*${f.kind === "landscape" ? 1.4 : 2.6});font-size:calc(var(--u)*${f.body}*var(--fitb,1));line-height:1.45;max-width:46ch;text-wrap:pretty}
.t-dark .body{color:#c3cbd3} .t-light .body{color:var(--ink2)}
.chip{align-self:flex-start;margin-top:calc(var(--u)*${f.kind === "landscape" ? 1.6 : 3});font-size:calc(var(--u)*${f.kind === "landscape" ? 1.35 : f.body * 0.82});font-weight:600;padding:calc(var(--u)*${f.kind === "landscape" ? .6 : 1}) calc(var(--u)*${f.kind === "landscape" ? 1.2 : 2});border:max(1.5px,calc(var(--u)*.18)) solid}
.t-dark .chip{border-color:rgba(245,242,237,.3);color:var(--cream)} .t-light .chip{border-color:rgba(30,44,55,.3);color:var(--ink)}
.foot{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:calc(var(--u)*3);padding-top:calc(var(--u)*${f.kind === "landscape" ? 2 : 3})}
.logo{height:calc(var(--u)*${f.kind === "landscape" ? 3 : f.print ? 4 : 4.6});width:auto}
.cta{display:inline-flex;align-items:center;gap:calc(var(--u)*1.2);background:var(--orange);color:var(--dark);font-weight:600;font-size:calc(var(--u)*${f.kind === "landscape" ? 1.6 : 2.7});padding:calc(var(--u)*${f.kind === "landscape" ? 1 : 1.6}) calc(var(--u)*${f.kind === "landscape" ? 2 : 3.2})}
.cta svg{width:1em;height:1em}
.print-foot{display:flex;align-items:center;gap:calc(var(--u)*3)}
.qr{width:calc(var(--u)*13);height:calc(var(--u)*13);background:#fff;padding:calc(var(--u)*.9);flex:none}
.qr svg{display:block;width:100%;height:100%}
.pf-t{font-size:calc(var(--u)*2.4);font-weight:600;line-height:1.3}
.pf-t small{display:block;font-size:calc(var(--u)*1.5);font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--orange-t);margin-bottom:calc(var(--u)*.8)}
.t-dark .pf-t small{color:var(--orange)}
.pf-t span{display:block;font-weight:500;font-size:calc(var(--u)*2);margin-top:calc(var(--u)*.6)}
.t-dark .pf-t span{color:var(--on2)} .t-light .pf-t span{color:var(--ink3)}
`;
}

function withUtm(link, source, medium, campaign) {
  const u = new URL(link);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", medium);
  u.searchParams.set("utm_campaign", campaign);
  return u.toString();
}

const ARROW =`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8h10M9 4l4 4-4 4"/></svg>`;

async function page(c, f) {
  const logo = img(c.theme === "dark" ? "binaafy-light.svg" : "binaafy.svg");
  let foot;
  if (f.print) {
    const qr = await QR.toString(withUtm(c.link, "affisch", "print", c.id), { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#18232c", light: "#ffffff" } });
    foot = `<div class="foot"><div class="print-foot"><div class="qr">${qr}</div><div class="pf-t"><small>${c.cta} · scanna</small>${PHONE}<span>binaafy.se</span></div></div><img class="logo" src="${logo}"></div>`;
  } else {
    foot = `<div class="foot"><img class="logo" src="${logo}"><span class="cta">${c.cta} ${ARROW}</span></div>`;
  }
  const body = f.noBody ? "" : `<p class="body">${c.body}</p>`;
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>${c.id} ${f.id}</title><style>${css(f)}</style></head><body>
<div class="ad t-${c.theme} k-${f.kind}">
  ${visual(c, f)}
  <div class="panel">
    <div class="eyebrow">${c.eyebrow}</div>
    <h1>${c.hl}</h1>
    ${body}
    <span class="chip">${c.chip}</span>
    ${foot}
  </div>
</div><script>document.fonts.ready.then(function(){var p=document.querySelector(".panel"),r=document.documentElement.style,f=1,b=1;function over(){return p.scrollHeight>p.clientHeight+1}for(var i=0;i<40&&over();i++){if(f>0.72){f-=0.03;r.setProperty("--fit",f)}else if(b>0.8){b-=0.03;r.setProperty("--fitb",b)}else break}if(over())document.title="OVERFLOW "+document.title});</script></body></html>`;
}

(async () => {
  const only = process.argv[2];
  const jobs = [];
  for (const c of CAMPAIGNS) {
    if (only && !c.id.includes(only)) continue;
    const dir = path.join(OUT, c.side, c.id);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of FORMATS) {
      if (c.formats && !c.formats.includes(f.id)) continue;
      const file = path.join(dir, `${c.id}_${f.id}.html`);
      fs.writeFileSync(file, await page(c, f));
      jobs.push({ file, w: f.w, h: f.h, print: !!f.print });
    }
  }
  fs.writeFileSync(path.join(__dirname, "jobs.json"), JSON.stringify(jobs, null, 1));
  fs.writeFileSync(path.join(__dirname, "campaigns.json"), JSON.stringify({ CAMPAIGNS: CAMPAIGNS.map(({ vis, ...c }) => c), FORMATS }, null, 1));
  console.log(`${jobs.length} filer`);
})();
