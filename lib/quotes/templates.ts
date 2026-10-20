import { emptyCustomer, emptyTerms, newItemId, type QuoteData, type QuoteDivision, type QuoteItem } from "./schema";
import type { QuoteSettings } from "../content/schema";
import { coverForGroup } from "./cover";

/**
 * Built-in quote templates, several per job: a sensible starting point with
 * example rows the admin edits or deletes. Prices are placeholders in the
 * same spirit as lib/pricing.ts (Bygg incl. VAT, Software excl. VAT).
 * Admins can also save any quote as their own template (quote_templates,
 * see lib/quotes/store.ts). To add a template, add an object to the list;
 * `group` decides under which job it is shown on the "Ny offert" page.
 */

export type BuiltInTemplate = {
  key: string;
  /** Job the template belongs to, e.g. "Badrum". Shown as a heading. */
  group: string;
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

type Kind = QuoteItem["kind"];
const row = (description: string, qty: number, unit: string, unitPrice: number, kind: Kind = "labor"): Omit<QuoteItem, "id"> => ({
  description,
  qty,
  unit,
  unitPrice,
  vatRate: 25,
  kind,
  section: "",
});
const mat = (description: string, qty: number, unit: string, unitPrice: number) => row(description, qty, unit, unitPrice, "material");
const other = (description: string, qty: number, unit: string, unitPrice: number) => row(description, qty, unit, unitPrice, "other");

/* ------------------------------------------------------------------ Bygg */

const bygg = (t: Omit<BuiltInTemplate, "division" | "pricesInclVat" | "rot"> & { rot?: boolean }): BuiltInTemplate => ({
  division: "bygg",
  pricesInclVat: true,
  rot: true,
  ...t,
});

const BADRUM_INTRO =
  "Tack för att vi fick komma på hembesök. Nedan följer vår offert på badrummet enligt det vi gick igenom. Arbetet utförs enligt Säker Vatten och Byggkeramikrådets branschregler, med dokumentation av tätskiktet.";
const DOLDA_FEL =
  "Eventuella dolda fel som upptäcks vid rivning (t.ex. fuktskador i bjälklag eller stammar) regleras separat efter att vi stämt av med er. Bygglov eller anmälan till bostadsrättsförening ingår inte.";

const byggTemplates: BuiltInTemplate[] = [
  bygg({ key: "tom", group: "Fritt", name: "Tom offert", description: "Börja från noll.", title: "", intro: "", items: [] }),

  // ---- Badrum
  bygg({
    key: "badrum-standard",
    group: "Badrum",
    name: "Helrenovering 5–8 m²",
    description: "Rivning, tätskikt, kakel, VVS och el. Arbete och material på egna rader.",
    title: "Renovering av badrum",
    intro: BADRUM_INTRO,
    items: [
      row("Rivning av befintligt badrum, bortforsling och deponi", 1, "kpl", 12_000),
      row("Tätskikt, golv och väggar, enligt BBV", 1, "kpl", 22_000),
      row("Plattsättning golv och väggar, inkl. fog och mjukfog", 1, "kpl", 38_000),
      row("VVS: nya ledningar, golvbrunn, dusch, WC och tvättställ", 1, "kpl", 24_000),
      row("El: golvvärme, spotlights, nytt uttag, jordfelsbrytare", 1, "kpl", 14_000),
      mat("Kakel och klinker enligt val", 1, "kpl", 18_000),
      mat("Sanitetsporslin, blandare och duschvägg", 1, "kpl", 24_000),
      mat("Övrigt material: tätskiktssystem, fix, fog, golvvärmematta", 1, "kpl", 16_000),
    ],
    terms: { start: "Preliminär start enligt överenskommelse. Byggtid cirka 3–5 veckor.", excluded: DOLDA_FEL },
  }),
  bygg({
    key: "badrum-stort",
    group: "Badrum",
    name: "Stort badrum 8–12 m²",
    description: "Som helrenovering, med badkar, dubbla tvättställ och tvättmaskinsplats.",
    title: "Renovering av badrum",
    intro: BADRUM_INTRO,
    items: [
      row("Rivning av befintligt badrum, bortforsling och deponi", 1, "kpl", 15_000),
      row("Tätskikt, golv och väggar, enligt BBV", 1, "kpl", 30_000),
      row("Plattsättning golv och väggar, inkl. fog och mjukfog", 1, "kpl", 55_000),
      row("VVS: nya ledningar, två golvbrunnar, badkar, dusch, WC, dubbla tvättställ", 1, "kpl", 36_000),
      row("El: golvvärme, belysning, uttag för tvättmaskin och torktumlare", 1, "kpl", 19_000),
      row("Snickeri: inbyggnad av badkar, nisch och kommod", 1, "kpl", 12_000),
      mat("Kakel och klinker enligt val", 1, "kpl", 30_000),
      mat("Badkar, sanitetsporslin, blandare och duschvägg", 1, "kpl", 42_000),
      mat("Övrigt material: tätskiktssystem, fix, fog, golvvärmematta", 1, "kpl", 22_000),
    ],
    terms: { start: "Preliminär start enligt överenskommelse. Byggtid cirka 5–7 veckor.", excluded: DOLDA_FEL },
  }),
  bygg({
    key: "badrum-ytskikt",
    group: "Badrum",
    name: "Ytskikt och porslin",
    description: "Nytt kakel, klinker och porslin på befintliga ledningar. Ingen flytt av VVS.",
    title: "Renovering av badrum – ytskikt",
    intro: BADRUM_INTRO,
    items: [
      row("Rivning av kakel, klinker och porslin, bortforsling", 1, "kpl", 9_000),
      row("Tätskikt, golv och väggar, enligt BBV", 1, "kpl", 20_000),
      row("Plattsättning golv och väggar, inkl. fog och mjukfog", 1, "kpl", 34_000),
      row("Återmontering av dusch, WC och tvättställ på befintliga anslutningar", 1, "kpl", 8_000),
      row("El: byte av golvvärmematta och belysning", 1, "kpl", 8_000),
      mat("Kakel och klinker enligt val", 1, "kpl", 16_000),
      mat("Porslin, blandare och duschvägg", 1, "kpl", 18_000),
      mat("Tätskiktssystem, fix, fog och golvvärmematta", 1, "kpl", 12_000),
    ],
    terms: { start: "Byggtid cirka 2–3 veckor.", excluded: DOLDA_FEL },
  }),
  bygg({
    key: "gasttoalett",
    group: "Badrum",
    name: "Gästtoalett / WC",
    description: "Litet utrymme utan dusch: tätskikt på golv, kakel, WC och tvättställ.",
    title: "Renovering av gästtoalett",
    intro: "Tack för förfrågan. Nedan följer vår offert på gästtoaletten enligt det vi gick igenom.",
    items: [
      row("Rivning, bortforsling och deponi", 1, "kpl", 5_000),
      row("Tätskikt golv och sockel", 1, "kpl", 7_000),
      row("Plattsättning golv och väggar", 1, "kpl", 14_000),
      row("VVS: WC, tvättställ och blandare", 1, "kpl", 7_000),
      row("El: belysning och uttag", 1, "kpl", 4_000),
      mat("Kakel, klinker, porslin och blandare enligt val", 1, "kpl", 16_000),
      mat("Tätskikt, fix och fog", 1, "kpl", 4_000),
    ],
    terms: { start: "Byggtid cirka 1–2 veckor." },
  }),

  // ---- Kök
  bygg({
    key: "kok-nytt",
    group: "Kök",
    name: "Nytt kök med ombyggnad",
    description: "Rivning, flytt av el och VVS, montering, bänkskivor, målning.",
    title: "Renovering av kök",
    intro: "Här är vår offert på köket enligt ritningen vi gick igenom tillsammans. Vi samordnar snickeri, el och VVS så att ni har en kontaktperson genom hela projektet.",
    items: [
      row("Rivning av befintligt kök och bortforsling", 1, "kpl", 8_000),
      row("Montering av köksstommar, luckor och lådor", 1, "kpl", 26_000),
      row("Montering av bänkskiva, diskho och stänkskydd", 1, "kpl", 9_000),
      row("El: nya uttag, belysning och anslutning av vitvaror", 1, "kpl", 12_000),
      row("VVS: flytt av vatten och avlopp, anslutning av diskmaskin", 1, "kpl", 9_000),
      row("Spackling och målning av väggar och tak", 1, "kpl", 7_000),
      mat("Kök enligt separat specifikation (stommar, luckor, bänkskiva)", 1, "kpl", 95_000),
    ],
    terms: { start: "Preliminär start enligt överenskommelse. Byggtid cirka 2–4 veckor efter att köket levererats." },
  }),
  bygg({
    key: "kok-byte",
    group: "Kök",
    name: "Byte av kök på samma plats",
    description: "Nytt kök där det gamla stod. Befintlig el och VVS behålls.",
    title: "Byte av kök",
    intro: "Tack för förfrågan. Nedan följer vår offert på byte av köket på befintlig plats.",
    items: [
      row("Rivning av befintligt kök och bortforsling", 1, "kpl", 7_000),
      row("Montering av köksstommar, luckor och lådor", 1, "kpl", 22_000),
      row("Montering av bänkskiva, diskho och stänkskydd", 1, "kpl", 8_000),
      row("Anslutning av vitvaror, diskmaskin och blandare", 1, "kpl", 5_000),
      row("Lagning och målning av väggar bakom köket", 1, "kpl", 4_000),
      mat("Kök enligt separat specifikation", 1, "kpl", 70_000),
    ],
    terms: { start: "Byggtid cirka 1–2 veckor efter leverans av köket." },
  }),
  bygg({
    key: "kok-luckor",
    group: "Kök",
    name: "Nya luckor och bänkskiva",
    description: "Stommarna behålls. Byte av luckor, lådfronter, handtag och bänkskiva.",
    title: "Nya luckor och bänkskiva",
    intro: "Tack för förfrågan. Nedan följer vår offert på nya luckor och ny bänkskiva, med befintliga stommar kvar.",
    items: [
      row("Demontering av luckor, lådfronter och bänkskiva", 1, "kpl", 3_000),
      row("Montering av nya luckor, lådfronter och handtag, justering", 1, "kpl", 9_000),
      row("Montering av bänkskiva, diskho och blandare", 1, "kpl", 6_000),
      mat("Luckor, lådfronter och handtag enligt val", 1, "kpl", 28_000),
      mat("Bänkskiva enligt val", 1, "kpl", 14_000),
    ],
    terms: { start: "Byggtid cirka 2–4 dagar." },
  }),

  // ---- Golv
  bygg({
    key: "golv-parkett",
    group: "Golv",
    name: "Parkett eller laminat",
    description: "Per kvadratmeter, inkl. avjämning, underlag och lister.",
    title: "Golvläggning",
    intro: "Tack för förfrågan. Nedan följer vår offert på nytt golv enligt uppmätning.",
    items: [
      row("Rivning av befintligt golv och bortforsling", 40, "m²", 120),
      row("Avjämning av undergolv", 40, "m²", 180),
      row("Läggning av golv inkl. underlag", 40, "m²", 350),
      row("Golvlister, kapning och montering", 36, "lpm", 90),
      mat("Golv, underlag och lister enligt val", 40, "m²", 450),
    ],
  }),
  bygg({
    key: "golv-klinker",
    group: "Golv",
    name: "Klinker med golvvärme",
    description: "Hall, kök eller groventré: avjämning, elektrisk golvvärme och klinker.",
    title: "Klinkergolv med golvvärme",
    intro: "Tack för förfrågan. Nedan följer vår offert på klinkergolv med golvvärme enligt uppmätning.",
    items: [
      row("Rivning av befintligt golv och bortforsling", 15, "m²", 150),
      row("Avjämning och primer", 15, "m²", 220),
      row("Elektrisk golvvärme inkl. termostat (behörig elektriker)", 15, "m²", 380),
      row("Plattsättning klinker, fog och sockel", 15, "m²", 650),
      mat("Klinker enligt val", 15, "m²", 400),
      mat("Golvvärmematta, termostat, avjämning, fix och fog", 15, "m²", 320),
    ],
  }),
  bygg({
    key: "golv-slipning",
    group: "Golv",
    name: "Slipning av trägolv",
    description: "Slipning, spackling och behandling av befintligt trägolv.",
    title: "Slipning och behandling av trägolv",
    intro: "Tack för förfrågan. Nedan följer vår offert på slipning och ny behandling av era trägolv.",
    items: [
      row("Slipning i tre steg, spackling av springor", 50, "m²", 220),
      row("Behandling: lack, olja eller hårdvaxolja, två lager", 50, "m²", 110),
      row("Demontering och återmontering av lister", 45, "lpm", 60),
      mat("Lack/olja och förbrukningsmaterial", 50, "m²", 60),
    ],
    terms: { start: "Golven kan beträdas försiktigt efter ett dygn och möbleras efter tre dygn." },
  }),

  // ---- Måleri
  bygg({
    key: "maleri-rum",
    group: "Måleri",
    name: "Invändig målning per rum",
    description: "Spackling, grundning och två strykningar av väggar och tak.",
    title: "Målning",
    intro: "Tack för förfrågan. Nedan följer vår offert på målningsarbetet enligt det vi gick igenom.",
    items: [
      row("Täckning, spackling och slipning", 3, "rum", 1_800),
      row("Grundning och två strykningar väggar och tak", 3, "rum", 3_400),
      mat("Färg, spackel och förbrukningsmaterial", 3, "rum", 900),
    ],
  }),
  bygg({
    key: "maleri-fasad",
    group: "Måleri",
    name: "Fasadmålning",
    description: "Tvätt, skrapning, grundning och två strykningar av träfasad.",
    title: "Målning av fasad",
    intro: "Tack för förfrågan. Nedan följer vår offert på fasadmålning enligt uppmätning. Vi använder ställning eller lift där det behövs för ett säkert arbete.",
    items: [
      row("Fasadtvätt och skrapning av lös färg", 180, "m²", 60),
      row("Grundning av bart trä och två strykningar", 180, "m²", 180),
      row("Målning av vindskivor, knutar och foder", 1, "kpl", 9_000),
      other("Ställning/lift, hyra och montering", 1, "kpl", 14_000),
      mat("Fasadfärg, grundolja och förbrukningsmaterial", 180, "m²", 55),
    ],
    terms: { start: "Utförs under torr väderlek, normalt maj–september. Byggtid cirka 2 veckor." },
  }),
  bygg({
    key: "maleri-tapet",
    group: "Måleri",
    name: "Tapetsering",
    description: "Nedtagning av gammal tapet, spackling och uppsättning av ny.",
    title: "Tapetsering",
    intro: "Tack för förfrågan. Nedan följer vår offert på tapetsering enligt det vi gick igenom.",
    items: [
      row("Nedtagning av befintlig tapet, spackling och slipning", 60, "m²", 90),
      row("Grundning och tapetsering", 60, "m²", 160),
      mat("Tapet enligt val (uppskattning) och lim", 60, "m²", 140),
    ],
  }),

  // ---- Tak
  bygg({
    key: "tak-pannor",
    group: "Tak",
    name: "Takomläggning med pannor",
    description: "Ny underlagsduk, läkt och betong- eller lertegelpannor.",
    title: "Omläggning av tak",
    intro: "Tack för att vi fick besiktiga taket. Nedan följer vår offert på omläggning enligt uppmätning.",
    items: [
      row("Rivning av befintliga pannor, läkt och duk, bortforsling", 150, "m²", 120),
      row("Ny underlagsduk, ströläkt och bärläkt", 150, "m²", 260),
      row("Läggning av takpannor inkl. nock och gavlar", 150, "m²", 280),
      row("Nya hängrännor och stuprör", 40, "lpm", 220),
      other("Ställning, hyra och montering", 1, "kpl", 22_000),
      mat("Takpannor, nockpannor och tillbehör", 150, "m²", 230),
      mat("Underlagsduk, läkt, plåt, spik och skruv", 150, "m²", 110),
      mat("Hängrännor, stuprör och fästen", 40, "lpm", 150),
    ],
    terms: {
      start: "Byggtid cirka 2–3 veckor beroende på väder.",
      excluded: "Byte av rötskadad råspont eller takstolar som upptäcks vid rivning regleras separat efter avstämning med er. Skorstensarbeten ingår inte.",
    },
  }),
  bygg({
    key: "tak-plat",
    group: "Tak",
    name: "Takomläggning med plåt",
    description: "Falsad eller profilerad plåt på ny underlagsduk.",
    title: "Omläggning av tak – plåt",
    intro: "Tack för att vi fick besiktiga taket. Nedan följer vår offert på nytt plåttak enligt uppmätning.",
    items: [
      row("Rivning av befintligt tak, bortforsling", 150, "m²", 120),
      row("Ny underlagsduk och läkt", 150, "m²", 220),
      row("Montering av plåttak inkl. nock, gavlar och genomföringar", 150, "m²", 420),
      row("Nya hängrännor och stuprör", 40, "lpm", 220),
      other("Ställning, hyra och montering", 1, "kpl", 22_000),
      mat("Takplåt, nock- och gavelbeslag, skruv", 150, "m²", 380),
      mat("Underlagsduk, läkt och tillbehör", 150, "m²", 90),
      mat("Hängrännor, stuprör och fästen", 40, "lpm", 150),
    ],
    terms: { start: "Byggtid cirka 2 veckor beroende på väder." },
  }),
  bygg({
    key: "tak-reparation",
    group: "Tak",
    name: "Takreparation och tätning",
    description: "Punktinsats: byte av pannor, tätning runt skorsten eller genomföring.",
    title: "Reparation av tak",
    intro: "Tack för att vi fick besiktiga taket. Nedan följer vår offert på reparationen.",
    items: [
      row("Byte av trasiga pannor och läkt, lokalt", 1, "kpl", 6_000),
      row("Ny tätning runt skorsten/genomföring med plåt", 1, "kpl", 7_000),
      row("Rensning av hängrännor och kontroll av stuprör", 1, "kpl", 1_500),
      other("Lift eller fallskydd", 1, "kpl", 3_500),
      mat("Pannor, plåt, tätmassa och läkt", 1, "kpl", 4_000),
    ],
    terms: { start: "Utförs inom två veckor, akuta läckage prioriteras." },
  }),

  // ---- Tillbyggnad
  bygg({
    key: "tillbyggnad-nyckel",
    group: "Tillbyggnad",
    name: "Tillbyggnad nyckelfärdig",
    description: "Grund, stomme, tak, fönster, el, VVS och invändiga ytskikt.",
    title: "Tillbyggnad",
    intro: "Tack för ett bra möte. Nedan följer vår offert på tillbyggnaden enligt skissen vi gick igenom. Vi tar fram bygglovshandlingar och bygger nyckelfärdigt med en kontaktperson genom hela projektet.",
    items: [
      row("Bygglovshandlingar, konstruktion och kontrollplan", 1, "kpl", 25_000),
      row("Mark och grund: schakt, dränering, platta", 25, "m²", 3_200),
      row("Stomme, yttertak, fasad och fönstermontering", 25, "m²", 5_800),
      row("El och VVS inkl. anslutning till befintligt hus", 1, "kpl", 48_000),
      row("Invändigt: isolering, gips, golv, målning och lister", 25, "m²", 3_400),
      row("Håltagning och anslutning mot befintlig byggnad", 1, "kpl", 22_000),
      mat("Material: grund, stomme, tak, fönster, dörrar, isolering", 25, "m²", 8_600),
      mat("Material invändigt: gips, golv, färg, lister, el- och VVS-material", 25, "m²", 2_400),
    ],
    terms: {
      payment: "Faktureras enligt betalplan: 10 % vid beställning, 30 % vid färdig grund, 30 % vid tätt hus, 20 % vid invändigt klart och 10 % efter godkänd slutbesiktning.",
      start: "Start när bygglovet vunnit laga kraft. Byggtid cirka 10–14 veckor.",
      excluded: "Bygglovsavgift till kommunen, nybyggnadskarta, utsättning, eventuell bergsprängning och kök/badrumsinredning ingår inte om inte annat anges ovan.",
    },
  }),
  bygg({
    key: "tillbyggnad-vind",
    group: "Tillbyggnad",
    name: "Inredning av vind",
    description: "Isolering, golv, väggar, takfönster, el och trappa.",
    title: "Inredning av vind",
    intro: "Tack för att vi fick titta på vinden. Nedan följer vår offert på att inreda den till boyta enligt det vi gick igenom.",
    items: [
      row("Bygglov/anmälan, konstruktionsberäkning och kontrollplan", 1, "kpl", 15_000),
      row("Förstärkning av bjälklag och nytt golv", 40, "m²", 1_600),
      row("Isolering, ångspärr och gips på snedtak och väggar", 40, "m²", 1_900),
      row("Montering av takfönster", 2, "st", 9_000),
      row("El: belysning, uttag och brandvarnare", 1, "kpl", 18_000),
      row("Montering av trappa och räcke", 1, "kpl", 14_000),
      row("Målning och lister", 40, "m²", 600),
      mat("Material: isolering, gips, golv, takfönster, trappa, el-material, färg", 1, "kpl", 120_000),
    ],
    terms: { start: "Byggtid cirka 6–8 veckor.", excluded: "Bygglovsavgift, eventuell ändring av ventilation och sotarbesiktning ingår inte." },
  }),
  bygg({
    key: "altan",
    group: "Tillbyggnad",
    name: "Altan eller trädäck",
    description: "Plintar, reglar, trall och räcke i tryckimpregnerat virke.",
    title: "Altan",
    intro: "Tack för förfrågan. Nedan följer vår offert på altanen enligt måtten vi gick igenom.",
    items: [
      row("Markarbete och plintar", 1, "kpl", 9_000),
      row("Bärlina, reglar och trall", 30, "m²", 950),
      row("Räcke och trappa", 14, "lpm", 1_100),
      mat("Virke, plintar, skruv och beslag", 30, "m²", 850),
      mat("Räckesmaterial och trappa", 14, "lpm", 700),
    ],
    terms: { start: "Byggtid cirka 1 vecka." },
  }),

  // ---- El & VVS
  bygg({
    key: "el-timpris",
    group: "El & VVS",
    name: "Elarbeten på timpris",
    description: "Behörig elektriker, uppskattat antal timmar och material enligt faktisk kostnad.",
    title: "Elarbeten",
    intro: "Tack för förfrågan. Nedan följer vår offert på elarbetet. Antalet timmar är en uppskattning; vi fakturerar faktisk tid efter avstämning med er.",
    items: [row("Elektriker, timpris", 16, "tim", 850), mat("Material enligt faktisk kostnad (uppskattning)", 1, "kpl", 6_000)],
    terms: { payment: "Faktureras efter utfört arbete." },
  }),
  bygg({
    key: "laddbox",
    group: "El & VVS",
    name: "Laddbox för elbil",
    description: "Installation av laddbox med ny gruppledning och jordfelsbrytare.",
    title: "Installation av laddbox",
    intro: "Tack för förfrågan. Nedan följer vår offert på installation av laddbox. Installationen utförs av behörig elektriker och dokumenteras för eventuellt bidrag.",
    items: [
      row("Installation: ny gruppledning, jordfelsbrytare typ B, montering och driftsättning", 1, "kpl", 7_500),
      mat("Laddbox 11 kW enligt val", 1, "st", 8_000),
      mat("Kabel, skydd och förbrukningsmaterial", 1, "kpl", 2_000),
    ],
    terms: { notes: "Om elcentralen behöver byggas om eller huvudsäkringen höjas offereras det separat." },
  }),
  bygg({
    key: "vvs-stam",
    group: "El & VVS",
    name: "Byte av vatten och avlopp",
    description: "Nya ledningar i kök eller badrum, inkl. återställning.",
    title: "Byte av vatten- och avloppsledningar",
    intro: "Tack för förfrågan. Nedan följer vår offert på byte av ledningar enligt det vi gick igenom. Arbetet utförs enligt Säker Vatten.",
    items: [
      row("Friläggning och demontering av befintliga ledningar", 1, "kpl", 8_000),
      row("Nya vatten- och avloppsledningar inkl. koppling", 1, "kpl", 18_000),
      row("Återställning: igensättning, spackling och målning", 1, "kpl", 7_000),
      mat("Rör, kopplingar, fördelare och tätningar", 1, "kpl", 9_000),
    ],
    terms: { excluded: "Om stammar i fastigheten visar sig behöva bytas stäms det av separat." },
  }),

  // ---- Totalrenovering
  bygg({
    key: "total-lagenhet",
    group: "Totalrenovering",
    name: "Lägenhet",
    description: "Kök, badrum, golv, målning och el i en lägenhet.",
    title: "Totalrenovering av lägenhet",
    intro: "Tack för ett bra möte. Nedan följer vår offert på totalrenoveringen enligt det vi gick igenom. Vi planerar arbetet i ordning så att ni får en tydlig tidplan och en kontaktperson.",
    items: [
      row("Rivning och bortforsling, hela lägenheten", 1, "kpl", 28_000),
      row("Badrum: tätskikt, plattsättning, VVS och el", 1, "kpl", 110_000),
      row("Kök: montering, el och VVS", 1, "kpl", 60_000),
      row("Golv: avjämning och läggning", 70, "m²", 550),
      row("Målning av väggar, tak, lister och dörrar", 70, "m²", 420),
      row("El: ny elcentral, uttag och belysning", 1, "kpl", 45_000),
      mat("Material badrum (kakel, porslin, tätskikt)", 1, "kpl", 60_000),
      mat("Kök enligt separat specifikation", 1, "kpl", 90_000),
      mat("Golv, färg, lister och el-material", 1, "kpl", 55_000),
    ],
    terms: {
      payment: "Faktureras enligt betalplan: 20 % vid start, därefter månadsvis efter utfört arbete, 10 % efter godkänd slutbesiktning.",
      start: "Byggtid cirka 8–12 veckor.",
      excluded: DOLDA_FEL,
    },
  }),
  bygg({
    key: "total-villa",
    group: "Totalrenovering",
    name: "Villa, etapp",
    description: "En etapp av en större villarenovering, med projektledning inräknad.",
    title: "Totalrenovering av villa – etapp 1",
    intro: "Tack för ett bra möte. Nedan följer vår offert på första etappen av renoveringen. Kommande etapper offereras separat när vi ser hur den första löper.",
    items: [
      row("Projektledning, tidplan och samordning av yrkesgrupper", 1, "kpl", 40_000),
      row("Rivning och bortforsling", 1, "kpl", 35_000),
      row("Stom- och planlösningsändringar inkl. bärande konstruktion", 1, "kpl", 85_000),
      row("El och VVS, ny dragning", 1, "kpl", 120_000),
      row("Invändiga ytskikt: gips, golv, målning, lister", 120, "m²", 1_400),
      mat("Material enligt specifikation", 1, "kpl", 260_000),
    ],
    terms: {
      payment: "Faktureras enligt betalplan: 15 % vid start, därefter månadsvis efter utfört arbete, 10 % efter godkänd slutbesiktning.",
      start: "Byggtid för etappen cirka 12–16 veckor.",
      excluded: "Bygglov, konstruktionsritningar av extern konstruktör samt kök och badrumsinredning ingår inte om inte annat anges ovan.",
    },
  }),

  // ---- Projektledning och löpande
  bygg({
    key: "projektledning",
    group: "Projektledning",
    name: "Projektledning fast pris",
    description: "Samordning av era egna hantverkare: tidplan, upphandling, uppföljning.",
    title: "Projektledning",
    intro: "Tack för förfrågan. Nedan följer vår offert på att projektleda er renovering: vi tar fram tidplanen, handlar upp och samordnar yrkesgrupperna och följer upp kvalitet och budget med er varje vecka.",
    rot: false,
    items: [
      row("Uppstart: genomgång, tidplan och upphandling", 1, "kpl", 18_000),
      row("Projektledning under byggtiden, inkl. veckoavstämning", 10, "vecka", 6_500),
      row("Slutbesiktning och överlämning", 1, "kpl", 6_000),
    ],
    terms: { notes: "Projektledning på egen hand ger inte ROT-avdrag. Ingår den i ett helhetsåtagande räknas den som arbete." },
  }),
  bygg({
    key: "lopande",
    group: "Projektledning",
    name: "Löpande räkning",
    description: "Timpris och uppskattat antal timmar. Material enligt faktisk kostnad.",
    title: "Arbete på löpande räkning",
    intro: "Nedan följer vår offert på arbete enligt löpande räkning. Antalet timmar är en uppskattning; vi stämmer av med er löpande och fakturerar faktisk tid.",
    items: [row("Snickare, timpris", 40, "tim", 650), mat("Material enligt faktisk kostnad (uppskattning)", 1, "kpl", 10_000)],
    terms: { payment: "Faktureras varje månad efter utförd tid." },
  }),
];

/* -------------------------------------------------------------- Software */

const sw = (t: Omit<BuiltInTemplate, "division" | "pricesInclVat" | "rot">): BuiltInTemplate => ({
  division: "01",
  pricesInclVat: false,
  rot: false,
  ...t,
});

const WEBB_EXCLUDED = "Domän, hosting hos tredje part, fotografering och skrivande av texter ingår inte om inte annat anges ovan.";

const softwareTemplates: BuiltInTemplate[] = [
  sw({ key: "tom-01", group: "Fritt", name: "Tom offert", description: "Börja från noll.", title: "", intro: "", items: [] }),

  // ---- Webb
  sw({
    key: "webb-foretag",
    group: "Webb",
    name: "Företagswebbplats",
    description: "Fast pris per etapp: workshop, design, utveckling, lansering.",
    title: "Ny webbplats",
    intro: "Tack för ett bra möte. Nedan följer vårt förslag på upplägg och pris för er nya webbplats. Vi arbetar i etapper med fast pris, så att ni alltid vet vad nästa steg kostar. Ni äger all kod och allt innehåll.",
    items: [
      row("Etapp 1: workshop, kravbild och sitemap", 1, "kpl", 12_000),
      row("Etapp 2: design i er grafiska profil, desktop och mobil", 1, "kpl", 28_000),
      row("Etapp 3: utveckling i Next.js, redigerbart innehåll, formulär", 1, "kpl", 55_000),
      row("Etapp 4: sökmotoroptimering, analys, lansering och utbildning", 1, "kpl", 9_000),
      other("Drift och support, per månad (tillval)", 12, "mån", 900),
    ],
    terms: {
      payment: "Varje etapp faktureras när den är godkänd av er.",
      start: "Start inom två veckor från beställning. Lansering cirka 6–8 veckor senare, beroende på när vi får innehåll och återkoppling.",
      excluded: WEBB_EXCLUDED,
    },
  }),
  sw({
    key: "webb-landning",
    group: "Webb",
    name: "Landningssida",
    description: "En sida med ett mål: kampanj, tjänst eller lead-formulär. Klar på en till två veckor.",
    title: "Landningssida",
    intro: "Tack för förfrågan. Nedan följer vårt förslag på en landningssida med ett tydligt mål, byggd för att ladda snabbt och mäta konverteringar.",
    items: [
      row("Struktur, text-stöd och design", 1, "kpl", 9_000),
      row("Utveckling, formulär och koppling till ert CRM eller e-post", 1, "kpl", 14_000),
      row("Analys, A/B-redo uppsättning och lansering", 1, "kpl", 4_000),
    ],
    terms: { payment: "50 % vid beställning, 50 % vid lansering.", start: "Klar inom 1–2 veckor från att vi fått innehåll.", excluded: WEBB_EXCLUDED },
  }),
  sw({
    key: "webb-ehandel",
    group: "Webb",
    name: "E-handel",
    description: "Butik med produkter, kassa, betalning och frakt, kopplad till ert affärssystem.",
    title: "E-handel",
    intro: "Tack för ett bra möte. Nedan följer vårt förslag på er e-handel. Vi bygger på en beprövad plattform och kopplar den till betalning, frakt och ert affärssystem.",
    items: [
      row("Workshop: sortiment, flöden och integrationer", 1, "kpl", 15_000),
      row("Design av butik, produktsidor och kassa", 1, "kpl", 32_000),
      row("Utveckling: produkter, kassa, betalning (Klarna/Stripe) och frakt", 1, "kpl", 85_000),
      row("Integration mot affärssystem (lager, ordrar, fakturor)", 1, "kpl", 30_000),
      row("Testning, migrering av produkter och lansering", 1, "kpl", 14_000),
      other("Drift, övervakning och support, per månad", 12, "mån", 1_900),
    ],
    terms: {
      payment: "30 % vid beställning, 40 % vid godkänd testbutik, 30 % vid lansering.",
      start: "Lansering cirka 10–14 veckor efter start.",
      excluded: "Plattformslicenser, betaltjänsternas avgifter, produktfoto och texter ingår inte.",
    },
  }),
  sw({
    key: "webb-omgorning",
    group: "Webb",
    name: "Omgörning av befintlig sajt",
    description: "Ny design och teknik, befintligt innehåll flyttas med. Sökmotorpositioner bevaras.",
    title: "Ny version av er webbplats",
    intro: "Tack för ett bra möte. Nedan följer vårt förslag på att göra om er befintliga webbplats: ny design, snabbare teknik och innehåll som ni själva kan redigera, med era nuvarande sökmotorpositioner bevarade.",
    items: [
      row("Genomgång av befintlig sajt, innehåll och sökmotortrafik", 1, "kpl", 8_000),
      row("Ny design, desktop och mobil", 1, "kpl", 24_000),
      row("Utveckling och flytt av innehåll, omdirigeringar", 1, "kpl", 42_000),
      row("Lansering, mätning och utbildning", 1, "kpl", 7_000),
      other("Drift och support, per månad (tillval)", 12, "mån", 900),
    ],
    terms: { payment: "Varje etapp faktureras när den är godkänd av er.", start: "Lansering cirka 5–7 veckor efter start.", excluded: WEBB_EXCLUDED },
  }),

  // ---- Portaler och system
  sw({
    key: "portal-kund",
    group: "Portaler och system",
    name: "Kundportal",
    description: "Inloggad portal där kunder ser sin egen data, ärenden och dokument.",
    title: "Kundportal",
    intro: "Här är vårt förslag på en kundportal enligt den brief ni skickade. Vi bygger en första version som går att använda på riktigt, och vidareutvecklar sedan i korta etapper tillsammans med er.",
    items: [
      row("Kravbild, flöden och datamodell", 1, "kpl", 18_000),
      row("Inloggning, roller och behörigheter", 1, "kpl", 22_000),
      row("Kärnfunktioner enligt brief (första version)", 1, "kpl", 95_000),
      row("Integration mot befintligt system (t.ex. Fortnox)", 1, "kpl", 24_000),
      row("Testning, driftsättning och utbildning", 1, "kpl", 14_000),
      other("Drift, övervakning och support, per månad", 12, "mån", 1_900),
    ],
    terms: { payment: "30 % vid beställning, 40 % vid godkänd testversion, 30 % vid driftsättning.", start: "Första version i drift cirka 8–12 veckor efter start." },
  }),
  sw({
    key: "portal-internt",
    group: "Portaler och system",
    name: "Internt verktyg",
    description: "Ersätter Excel-ark och manuella rutiner: ett system för er egen personal.",
    title: "Internt system",
    intro: "Tack för genomgången av hur ni arbetar i dag. Nedan följer vårt förslag på ett internt verktyg som ersätter de manuella stegen vi gick igenom, byggt i etapper så att ni kan börja använda det tidigt.",
    items: [
      row("Kartläggning av nuvarande arbetssätt och datamodell", 1, "kpl", 14_000),
      row("Inloggning, roller och grundstruktur", 1, "kpl", 16_000),
      row("Funktioner etapp 1 enligt kravlista", 1, "kpl", 65_000),
      row("Import av befintlig data från Excel/annat system", 1, "kpl", 9_000),
      row("Testning, driftsättning och utbildning", 1, "kpl", 10_000),
      other("Drift, övervakning och support, per månad", 12, "mån", 1_400),
    ],
    terms: { payment: "30 % vid beställning, 40 % vid godkänd testversion, 30 % vid driftsättning.", start: "Etapp 1 i drift cirka 6–10 veckor efter start." },
  }),
  sw({
    key: "portal-app",
    group: "Portaler och system",
    name: "Mobilapp (PWA)",
    description: "App för fältpersonal eller kunder som installeras från webben, fungerar offline.",
    title: "Mobilapp",
    intro: "Tack för ett bra möte. Nedan följer vårt förslag på en mobilapp byggd som progressiv webbapp: installeras direkt från webben utan appbutik, fungerar även utan täckning och delar data med era andra system.",
    items: [
      row("Flöden, skärmar och datamodell", 1, "kpl", 16_000),
      row("Design för mobil", 1, "kpl", 20_000),
      row("Utveckling: inloggning, kärnflöden, offline-stöd, foto och notiser", 1, "kpl", 90_000),
      row("Koppling till befintligt system", 1, "kpl", 20_000),
      row("Testning på enheter, driftsättning och utbildning", 1, "kpl", 12_000),
      other("Drift, övervakning och support, per månad", 12, "mån", 1_900),
    ],
    terms: { payment: "30 % vid beställning, 40 % vid godkänd testversion, 30 % vid driftsättning.", start: "Första version cirka 8–12 veckor efter start." },
  }),

  // ---- Automation
  sw({
    key: "automation-flode",
    group: "Automation",
    name: "Automation av arbetsflöde",
    description: "Ta bort manuella steg i ett flöde, med larm och loggning.",
    title: "Automation av arbetsflöde",
    intro: "Nedan följer vårt förslag på hur vi tar bort dubbelarbetet ni beskrev. Vi börjar med det flöde som kostar mest tid i dag och mäter effekten innan vi går vidare.",
    items: [
      row("Kartläggning av nuvarande flöde och datakällor", 1, "kpl", 9_000),
      row("Integration och automatisering av flödet", 1, "kpl", 32_000),
      row("Larm, loggning och felhantering", 1, "kpl", 8_000),
      other("Drift och övervakning, per månad", 12, "mån", 700),
    ],
    terms: { payment: "Faktureras vid driftsättning." },
  }),
  sw({
    key: "automation-integration",
    group: "Automation",
    name: "Integration mellan två system",
    description: "T.ex. CRM till bokföring: data flyttas automatiskt åt ett eller båda hållen.",
    title: "Integration",
    intro: "Tack för genomgången. Nedan följer vårt förslag på en integration som gör att informationen bara behöver matas in en gång.",
    items: [
      row("Kartläggning av fält, regler och felfall", 1, "kpl", 7_000),
      row("Utveckling av integrationen, båda riktningarna", 1, "kpl", 26_000),
      row("Testning mot verklig data och driftsättning", 1, "kpl", 6_000),
      other("Drift och övervakning, per månad", 12, "mån", 600),
    ],
    terms: { payment: "Faktureras vid driftsättning.", excluded: "Licenser och API-avgifter hos de system som kopplas ihop ingår inte." },
  }),
  sw({
    key: "automation-rapport",
    group: "Automation",
    name: "Rapportering och dashboard",
    description: "Nyckeltal från era system samlade på en sida, uppdaterade automatiskt.",
    title: "Rapportering och dashboard",
    intro: "Tack för genomgången av vilka siffror ni vill följa. Nedan följer vårt förslag på en dashboard som hämtar data automatiskt och ersätter de manuella sammanställningarna.",
    items: [
      row("Definition av nyckeltal och datakällor", 1, "kpl", 8_000),
      row("Datahämtning och modellering", 1, "kpl", 22_000),
      row("Dashboard med filter och veckorapport via e-post", 1, "kpl", 18_000),
      other("Drift och övervakning, per månad", 12, "mån", 700),
    ],
    terms: { payment: "50 % vid beställning, 50 % vid driftsättning." },
  }),

  // ---- Support och drift
  sw({
    key: "timbank",
    group: "Support och drift",
    name: "Timbank",
    description: "Förbetalda timmar för utveckling och support.",
    title: "Timbank för utveckling och support",
    intro: "Nedan följer vårt förslag på en timbank. Timmarna används till utveckling, ändringar och support, och ni får en sammanställning varje månad.",
    items: [row("Utveckling och support, timpris", 40, "tim", 950)],
    terms: { payment: "Faktureras i förskott. Timmarna gäller i 12 månader från fakturadatum." },
  }),
  sw({
    key: "driftavtal",
    group: "Support och drift",
    name: "Driftavtal per månad",
    description: "Drift, övervakning, säkerhetsuppdateringar och support med svarstid.",
    title: "Driftavtal",
    intro: "Nedan följer vårt förslag på ett driftavtal för er lösning: vi övervakar, uppdaterar och tar hand om fel innan ni märker dem, med en fast månadskostnad.",
    items: [
      other("Drift, övervakning och säkerhetsuppdateringar, per månad", 12, "mån", 1_900),
      other("Support med svarstid nästa arbetsdag, inkl. 2 timmar per månad", 12, "mån", 1_500),
      row("Ytterligare timmar utöver avtalet, timpris", 1, "tim", 950),
    ],
    terms: { payment: "Faktureras kvartalsvis i förskott.", start: "Avtalet löper 12 månader med tre månaders uppsägningstid." },
  }),
  sw({
    key: "forstudie",
    group: "Support och drift",
    name: "Förstudie / workshop",
    description: "Kartläggning och förslag med kostnadsbild innan ni bestämmer er.",
    title: "Förstudie",
    intro: "Tack för samtalet. Nedan följer vårt förslag på en förstudie: vi kartlägger hur ni arbetar i dag, tar fram ett lösningsförslag med kostnadsbild och ni avgör sedan om och hur ni vill gå vidare.",
    items: [
      row("Workshop med nyckelpersoner, halvdag", 1, "kpl", 9_000),
      row("Kartläggning, skisser och lösningsförslag", 1, "kpl", 14_000),
      row("Presentation med prioriterad plan och kostnadsbild", 1, "kpl", 4_000),
    ],
    terms: { payment: "Faktureras vid leverans av rapporten.", notes: "Går ni vidare med oss dras förstudiens kostnad av från första etappen." },
  }),
];

export const builtInTemplates: BuiltInTemplate[] = [...byggTemplates, ...softwareTemplates];

export function templatesFor(division: QuoteDivision): BuiltInTemplate[] {
  return builtInTemplates.filter((t) => t.division === division);
}

/** Templates for one side, grouped by job in the order they are listed. */
export function templateGroups(division: QuoteDivision): { group: string; templates: BuiltInTemplate[] }[] {
  const groups: { group: string; templates: BuiltInTemplate[] }[] = [];
  for (const t of templatesFor(division)) {
    const g = groups.find((x) => x.group === t.group);
    if (g) g.templates.push(t);
    else groups.push({ group: t.group, templates: [t] });
  }
  return groups;
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
    deductionType: "rot",
    show: { process: true, band: true },
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
    cover: coverForGroup(t.group),
  };
}
