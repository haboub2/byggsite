/**
 * Sökord per sida: vad folk faktiskt skriver i Google när de letar efter det
 * sidan erbjuder. Listan är kartan för titlar, beskrivningar, rubriker och
 * brödtext — orden ska stå naturligt i texten, det är där de räknas.
 * pageMetadata() lägger dessutom ut dem som <meta name="keywords">, som Bing
 * och vissa AI-sökmotorer läser (Google ignorerar taggen).
 *
 * Bygg och mjukvara hålls helt åtskilda: inga byggord på mjukvarusidor och
 * tvärtom. Startsidan "/" är byggsidan.
 *
 * Listorna är sorterade efter sökvolym (se siffrorna nedan); resten är varianter,
 * synonymer och frågor som ska täckas av samma sida. Ett sökord hör hemma på
 * en sida, inte flera, så att sidorna inte konkurrerar med varandra.
 */

/** Orter vi tar byggjobb i, inom länen i site.areasServed. Visas på
 *  tjänstesidorna och märks upp som City i JSON-LD. */
export const byggCities = [
  "Göteborg",
  "Mölndal",
  "Partille",
  "Kungälv",
  "Lerum",
  "Härryda",
  "Alingsås",
  "Kungsbacka",
  "Borås",
  "Trollhättan",
  "Uddevalla",
  "Varberg",
  "Falkenberg",
  "Halmstad",
  "Helsingborg",
  "Malmö",
];

/*
 * Sökvolym, Google Trends Sverige, nov 2025–nov 2026 (relativt index; bara
 * jämförbart inom samma grupp). Ordningen i listorna nedan följer siffrorna.
 * Autocomplete (Google, sv-SE) visar att "pris"/"kostnad" är det vanligaste
 * tillägget för varje byggtjänst, och "företag"/"pris" för hemsida.
 *
 *   Bygg (badrumsrenovering = 100):
 *     snickare ~500*, målare ~450*, hantverkare ~200*, renovera badrum 130,
 *     byggföretag ~140*, tillbyggnad 106, badrumsrenovering 100, byggfirma 94,
 *     byta tak 84, takbyte 50, golvläggare 48, plattsättare 47, renovera kök 39,
 *     köksrenovering 20, målerifirma 4, totalrenovering 2, lägga om tak 2
 *     (* inkluderar jobb-, lön- och korsordssökningar, så verklig köpavsikt är lägre)
 *
 *   Mjukvara (webbyrå = 100):
 *     webbyrå 100, skapa hemsida 52, köpa hemsida 31, hemsida företag 19,
 *     bygga hemsida 8, systemutveckling 6, webbutveckling 6, hemsida pris 4,
 *     köp hemsida 2, vad kostar en hemsida 2, integration fortnox 2
 *     ("systemutveckling" och "webbutveckling" är mest utbildningssökningar;
 *      "skräddarsydd" och "kundportal" ger kläder respektive inloggningssidor.)
 */

const BYGG_SERVICES: Record<string, string[]> = {
  totalrenovering: [
    "renovera hus",
    "renovera lägenhet",
    "totalrenovering Göteborg",
    "renovera lägenhet kostnad",
    "renovera hus kostnad",
    "totalrenovering hus",
    "totalrenovering lägenhet",
    "renoveringsfirma Göteborg",
  ],
  badrumsrenovering: [
    "renovera badrum",
    "badrumsrenovering Göteborg",
    "badrumsrenovering",
    "renovera badrum pris",
    "badrumsrenovering kostnad",
    "hur mycket kostar det att renovera ett badrum",
    "plattsättare Göteborg",
    "våtrumsrenovering",
    "tätskikt badrum",
  ],
  koksrenovering: [
    "renovera kök",
    "köksrenovering Göteborg",
    "köksrenovering",
    "renovera kök kostnad",
    "köksrenovering pris",
    "köksrenovering IKEA",
    "montera kök",
    "offert köksrenovering",
  ],
  tillbyggnad: [
    "tillbyggnad",
    "tillbyggnad hus",
    "tillbyggnad Göteborg",
    "bygga ut huset",
    "tillbyggnad bygglov",
    "tillbyggnad utan bygglov",
    "vindsinredning",
    "vindsinredning Göteborg",
  ],
  tak: [
    "byta tak",
    "byta tak kostnad",
    "takbyte",
    "takbyte kostnad",
    "takbyte Göteborg",
    "lägga om tak kostnad",
    "takläggare Göteborg",
    "takbesiktning",
  ],
  golv: [
    "golvläggare",
    "golvläggare Göteborg",
    "golvläggning",
    "golvläggning pris",
    "golvläggning pris per m2",
    "lägga parkett",
    "lägga klinker",
    "golvvärme",
  ],
  maleri: [
    "målare",
    "målare Göteborg",
    "målerifirma Göteborg",
    "målare pris",
    "fasadmålning",
    "målning inomhus",
    "putsa fasad",
  ],
  projektledning: [
    "byggprojektledning Göteborg",
    "byggprojektledning",
    "byggledare",
    "projektledning renovering",
  ],
};

const SOFTWARE_AREAS: Record<string, string[]> = {
  webb: [
    "webbutveckling",
    "webbutveckling Göteborg",
    "webbdesign",
    "webbutvecklare",
    "webbapplikation",
    "utveckla webbplats",
    "kundportal företag",
  ],
  automation: [
    "integration Fortnox",
    "systemintegration",
    "automatisering företag",
    "API-integration",
    "koppla ihop system",
    "automatisera arbetsflöden",
  ],
  "interna-system": [
    "systemutveckling",
    "systemutveckling Göteborg",
    "verksamhetssystem",
    "affärssystem",
    "ersätta Excel",
    "skräddarsytt system",
    "offertsystem",
  ],
};

export const pageKeywords: Record<string, string[]> = {
  // ── Bygg ──
  "/": [
    "byggfirma Göteborg",
    "snickare Göteborg",
    "hantverkare Göteborg",
    "byggföretag Göteborg",
    "byggfirma",
    "snickare",
    "hantverkare",
    "renovering Göteborg",
    "ROT-avdrag",
  ],
  "/bygg/tjanster": [
    "bygg och renovering Göteborg",
    "byggtjänster",
    "renovering",
    "renoveringsfirma",
  ],
  "/bygg/offert": [
    "offert renovering",
    "offert byggfirma",
    "kostnadsfri offert",
    "offert hantverkare",
    "fast pris renovering",
  ],
  "/bygg/projekt": [
    "renoveringsprojekt Göteborg",
    "före och efter renovering",
    "referensprojekt byggfirma",
  ],
  ...Object.fromEntries(Object.entries(BYGG_SERVICES).map(([slug, k]) => [`/bygg/tjanster/${slug}`, k])),

  // ── Mjukvara ──
  "/mjukvara": [
    "webbyrå",
    "webbyrå Göteborg",
    "webbyråer",
    "IT-konsult företag",
    "digital byrå",
  ],
  "/mjukvara/kop-hemsida": [
    "skapa hemsida",
    "köpa hemsida",
    "hemsida företag",
    "skapa hemsida företag",
    "hemsida företag pris",
    "köpa hemsida pris",
    "hemsida till företag",
    "bygga hemsida",
    "göra hemsida",
    "hemsida pris",
    "köp hemsida",
    "vad kostar en hemsida",
    "billig hemsida företag",
    "hjälp med hemsida",
    "beställa hemsida",
    "ny hemsida företag",
    "hemsida småföretag",
  ],
  "/mjukvara/tjanster": [
    "mjukvaruutveckling",
    "IT-tjänster företag",
    "utvecklingsbyrå",
    "webb och system",
  ],
  "/mjukvara/brief": ["offert systemutveckling", "offert webbutveckling", "projektförfrågan"],
  "/mjukvara/case": ["webbprojekt", "kundcase systemutveckling", "referenser webbyrå"],
  ...Object.fromEntries(Object.entries(SOFTWARE_AREAS).map(([slug, k]) => [`/mjukvara/tjanster/${slug}`, k])),

  "/fakturering": [
    "faktureringsprogram byggföretag",
    "faktureringsprogram hantverkare",
    "fakturera ROT-avdrag",
    "ROT-fil Skatteverket",
    "faktureringssystem",
    "e-faktura Peppol",
  ],
};

/** Sökorden för en sida, eller inga. */
export const keywordsFor = (path: string): string[] | undefined => pageKeywords[path];
