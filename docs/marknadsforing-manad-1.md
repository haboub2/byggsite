# Marketing kit, month one: binaafy.se (2026-11-03)

What an SEO and marketing agency would hand over for the first month: a paid search setup that can
go live the same day, a review routine, 30 verified listing and link targets, a three-month content
calendar and a one-hour weekly routine for Ibrahim.

It builds on `docs/seo-granskning-2026-11-01.md` and does not repeat it. The technical fixes, the
owner to-dos (section 4: Vercel env, Search Console, Business Profile setup, register claims,
social profiles, Bing Webmaster Tools, company name in /admin, byggly.se) and the month-by-month
agency plan (section 5) are assumed to be in progress. Where this kit touches the same item, it
adds the exact text or steps, not the reason.

**Rules this kit follows.** Narrative in English, every text a customer sees in Swedish, du-form.
Only facts the site already states are used in ads and messages: fast pris, ROT-avdrag på fakturan,
kostnadsfritt hembesök, 5 års garanti på hantverket, svar inom 24 timmar, merparten av arbetet med
egen personal, en kontaktperson. No CPCs, conversion rates or review counts are presented as facts;
the budgets below are labelled estimates. Every external URL in section 3 was fetched on
2026-11-03 with `curl -sS -o /dev/null -L -w "%{http_code}" -A "Mozilla/5.0" <url>`.

**Before anything goes live, confirm two things in the code:**

- `lib/pricing.ts` says its prices are "EXAMPLE FIGURES, placeholders until the owners supply real
  prices". The ads below do not use prices except a few optional headlines marked †. Use those only
  after Ibrahim has confirmed the prices on the service pages are real. The Software prices
  (9 900 kr and 17 900 kr exkl. moms, `lib/website-packages.ts`) are real package prices and are used.
- `lib/placeholder.ts` shows "6+ års erfarenhet" and "100+ genomförda projekt" on the site. The
  company was founded in 2026, so neither figure is used anywhere in this kit. If they describe the
  team's experience before Binaafy, the site should say so; otherwise they should come off the site.

---

## 1. Google Ads: brand and service campaigns

### 1.1 Account structure

| Campaign | Ad groups | Location | Suggested daily budget (estimate) |
|---|---|---|---|
| Bygg – Varumärke | Varumärke | Göteborg + 40 km, Halland, Skåne | 30–50 kr |
| Bygg – Tjänster Göteborg | Badrumsrenovering, Takbyte, Byggfirma, Köksrenovering, Totalrenovering, Tillbyggnad | Göteborg + 40 km | 150–250 kr |
| Software – Webbyrå Göteborg | Webbyrå Göteborg | Göteborg + 40 km | 30–60 kr |
| Software – Köp hemsida Sverige | Köp hemsida | Sverige | 40–80 kr |

The budgets are rough starting estimates (in total roughly 7 500–13 500 kr a month) chosen so each
campaign gets enough clicks in week one to see real search terms. They are not based on measured
CPCs. Replace them after the first full week with figures from the account: Keyword Planner's
"Bud för toppen av sidan" for each keyword, and the cost per `generate_lead` once there are leads.

Why four campaigns: location, budget and negatives are set per campaign. Brand clicks are cheap and
must never run out of budget, so the brand gets its own. Software is a different buyer (a company)
with a different geography (all of Sweden for "köp hemsida"), so it is kept away from the building
budget.

**Settings for all four campaigns**

- Campaign type: Sök. Networks: untick "Sökpartners" and "Displaynätverket" for the first month.
- Location option: "Närvaro: Personer som befinner sig i eller regelbundet befinner sig på
  platserna du har valt" (not "intresse"), so a search from abroad does not spend the budget.
- Language: Svenska.
- Bidding, weeks 1–2: "Maximera klick" with a max CPC limit. Set the limit from Keyword Planner
  (the high end of "Bud för toppen av sidan" for the ad group's main keyword), not from a guess.
  Brand: "Visningsandel som mål", absolute top of page, 90 %, with a max CPC limit.
- Bidding, from week 3 or later: switch the Tjänster campaign to "Maximera konverteringar" once it
  has a steady flow of `generate_lead` conversions (a common rule of thumb is 15–30 in 30 days).
  Until then, smart bidding has too little to learn from.
- Match types: exact `[ ]` and phrase `" "` only in month one. No broad match until the
  search-term report shows what people actually type.
- Ad schedule: Mon–Sun 06:00–23:00 for text ads. The call asset is scheduled separately to the
  hours someone answers 079-304 97 37 (the site says Mån–Fre 07:00–16:00).
- Brand terms as negatives in every non-brand campaign: add `binaafy` (phrase) to Tjänster and
  both Software campaigns, so brand searches are always served by the brand campaign.

### 1.2 Negative keywords

Create three shared negative keyword lists (Verktyg → Delat bibliotek → Listor med uteslutande
sökord) and attach them as shown. All are phrase match unless marked exact.

| List | Attach to | Keywords |
|---|---|---|
| Neg – Alla | all four campaigns | `"benify"`, `"benify lön"`, `"jobb"`, `"lediga jobb"`, `"jobba"`, `"lön"`, `"löner"`, `"anställning"`, `"praktik"`, `"lärling"`, `"utbildning"`, `"kurs"`, `"gratis"`, `"diy"`, `"själv"`, `"gör det själv"`, `"youtube"`, `"video"`, `"pdf"`, `"mall"`, `"wikipedia"`, `"flashback"` |
| Neg – Bygg | Varumärke, Tjänster | `"begagnad"`, `"blocket"`, `"hyra"`, `"byggmax"`, `"bauhaus"`, `"hornbach"`, `"biltema"`, `"jula"`, `"k-rauta"`, `"ritning gratis"`, `"bilder"`, `"inspiration"` |
| Neg – Software | both Software campaigns | `"wix"`, `"squarespace"`, `"wordpress tema"`, `"one.com"`, `"hemsida gratis"`, `"gratis hemsida"`, `"tema"`, `"själv"`, `"bygga hemsida själv"`, `"hostning"`, `"domän"` |

Why `benify` matters here: Google treats close spellings as the same word, and it currently
autocorrects "binaafy" to "Benify". Without the negative, the brand campaign can pay for people
looking for Benify's payroll portal.

Watch list (do not add yet, decide from the search-term report): `ikea` (can be a real
köksmontering lead), `pris` and `kostnad` (usually good leads, keep), `bilder` and `inspiration`
(already negative; remove if they convert).

### 1.3 Responsive search ads

Each ad group has three RSAs. Each RSA has 15 headlines (≤ 30 characters) and 4 descriptions
(≤ 90 characters), built from two parts so the ads stay consistent and the angle is what is tested:

- **8 ad-group headlines (G1–G8) and 2 ad-group descriptions (GD1–GD2)** carry the keyword and are
  in all three RSAs of that ad group.
- **One angle block (A, B or C)** adds 7 headlines and 2 descriptions. RSA A tests price and ROT,
  RSA B trust, RSA C speed and the free home visit.

All character counts below were checked by script. No phone numbers in ad text (Google rejects
them; the number goes in the call asset). No competitor names. Pin only in the brand campaign: pin
G1 "Binaafy Bygg i Göteborg" to headline position 1 in all three brand RSAs. Leave the rest unpinned.

† Optional price headline: add only after the prices in `lib/pricing.ts` are confirmed as real. It
then replaces the weakest headline in RSA A of that ad group (see "Tillgångsrapport" after week 2).

#### Bygg angle blocks (Varumärke and all Tjänster ad groups)


**Angle A (pris och ROT)**

| # | Headline | Chars |
|---|---|---|
| A1 | Fast pris innan vi börjar | 25 |
| A2 | ROT-avdrag direkt på fakturan | 29 |
| A3 | Specificerad offert | 19 |
| A4 | Kostnadsfri offert | 18 |
| A5 | Pris, tidplan och material | 26 |
| A6 | ROT: 30 % av arbetskostnaden | 28 |
| A7 | Offert utan förpliktelser | 25 |

| # | Description | Chars |
|---|---|---|
| AD1 | Fast pris i offerten och ROT-avdraget dras direkt på fakturan. Du betalar bara din del. | 87 |
| AD2 | Specificerad offert med pris, tidplan och materialval efter ett kostnadsfritt hembesök. | 87 |


**Angle B (trygghet)**

| # | Headline | Chars |
|---|---|---|
| B1 | 5 års garanti på hantverket | 27 |
| B2 | Egen personal på plats | 22 |
| B3 | En kontaktperson hela vägen | 27 |
| B4 | Vi tar ansvar för helheten | 26 |
| B5 | Se våra genomförda projekt | 26 |
| B6 | Läs våra omdömen | 16 |
| B7 | Hantverk med garanti | 20 |

| # | Description | Chars |
|---|---|---|
| BD1 | 5 års garanti på hantverket. Merparten av arbetet gör vi med egen personal. | 75 |
| BD2 | En kontaktperson från offert till slutbesiktning. Vi tar ansvar för helheten. | 77 |


**Angle C (snabbt svar och hembesök)**

| # | Headline | Chars |
|---|---|---|
| C1 | Kostnadsfritt hembesök | 22 |
| C2 | Svar inom 24 timmar | 19 |
| C3 | Begär offert på 2 minuter | 25 |
| C4 | Ring eller skriv till oss | 25 |
| C5 | Boka ett hembesök | 17 |
| C6 | Göteborg, Halland och Skåne | 27 |
| C7 | Utan förpliktelser | 18 |

| # | Description | Chars |
|---|---|---|
| CD1 | Fyll i formuläret på två minuter så återkommer vi inom 24 timmar och bokar hembesök. | 84 |
| CD2 | Kostnadsfritt hembesök och offert utan förpliktelser. Vi svarar inom 24 timmar. | 79 |


#### Software angle blocks (both Software ad groups)


**Angle A (pris)**

| # | Headline | Chars |
|---|---|---|
| A1 | Fast pris från 9 900 kr | 23 |
| A2 | Tre paket med fast pris | 23 |
| A3 | Inga licensavgifter | 19 |
| A4 | Du äger hela hemsidan | 21 |
| A5 | Företag-paket 17 900 kr | 23 |
| A6 | Pris klart innan vi börjar | 26 |
| A7 | Beställ direkt på sajten | 24 |

| # | Description | Chars |
|---|---|---|
| AD1 | Tre paket med fast pris från 9 900 kr exkl. moms. Du får priset innan vi börjar. | 80 |
| AD2 | Inga licensavgifter och du äger hela hemsidan. Beställ ditt paket på två minuter. | 81 |


**Angle B (kvalitet och SEO)**

| # | Headline | Chars |
|---|---|---|
| B1 | SEO från start | 14 |
| B2 | Mobilanpassad hemsida | 21 |
| B3 | Snabb hemsida i Next.js | 23 |
| B4 | Design i din profil | 19 |
| B5 | Du äger koden | 13 |
| B6 | En sida per tjänst | 18 |
| B7 | Byggd för att synas i sök | 25 |

| # | Description | Chars |
|---|---|---|
| BD1 | Snabb och mobilanpassad hemsida med SEO från start, byggd i Next.js. Du äger koden. | 83 |
| BD2 | Design i din profil och en egen sida per tjänst, så att du syns för rätt sökningar. | 83 |


**Angle C (snabbhet)**

| # | Headline | Chars |
|---|---|---|
| C1 | Klar på två till tre veckor | 27 |
| C2 | Beställ på två minuter | 22 |
| C3 | Snabb start, fast pris | 22 |
| C4 | Publicering ingår | 17 |
| C5 | Kom igång i dag | 15 |
| C6 | Hemsida klar på några veckor | 28 |
| C7 | Enkel beställning online | 24 |

| # | Description | Chars |
|---|---|---|
| CD1 | Välj paket, beställ på två minuter och ha din nya hemsida live inom två till tre veckor. | 88 |
| CD2 | Design, mobilanpassning, SEO och publicering ingår. Fast pris och inga överraskningar. | 86 |


#### Campaign: Bygg – Varumärke


##### Ad group: Varumärke

- **Landing page (final URL):** https://www.binaafy.se/
- **Keywords:** `[binaafy]`, `[binaafy bygg]`, `[binaafy ab]`, `[binaafy göteborg]`, `[binafy]`, `[binaafi]`, `[binaffy]`, `[binaify]`, `[binafi]`, `"binaafy"`

Ad-group headlines (used in all three RSAs):

| # | Headline | Chars |
|---|---|---|
| G1 | Binaafy Bygg i Göteborg | 23 |
| G2 | Binaafy AB | 10 |
| G3 | Binaafy, byggfirma Göteborg | 27 |
| G4 | Binaafy Bygg och Software | 25 |
| G5 | Officiell sida för Binaafy | 26 |
| G6 | Begär offert hos Binaafy | 24 |
| G7 | Binaafy: renovering och bygg | 28 |
| G8 | Söker du Binaafy Bygg? | 22 |

Ad-group descriptions (used in all three RSAs):

| # | Description | Chars |
|---|---|---|
| GD1 | Binaafy AB är byggfirman i Göteborg för renovering, badrum, kök, tak och tillbyggnad. | 85 |
| GD2 | Officiell sida för Binaafy AB med offert, projekt, omdömen och kontaktuppgifter. | 80 |

- **RSA A:** G1–G8 + angle block A (pris och ROT) headlines + GD1, GD2 + angle A descriptions = 15 headlines, 4 descriptions.
- **RSA B:** G1–G8 + angle block B (trygghet) headlines + GD1, GD2 + angle B descriptions = 15 headlines, 4 descriptions.
- **RSA C:** G1–G8 + angle block C (snabbt svar och hembesök) headlines + GD1, GD2 + angle C descriptions = 15 headlines, 4 descriptions.

#### Campaign: Bygg – Tjänster Göteborg


##### Ad group: Badrumsrenovering

- **Landing page (final URL):** https://www.binaafy.se/bygg/tjanster/badrumsrenovering
- **Keywords:** `[badrumsrenovering göteborg]`, `"badrumsrenovering göteborg"`, `[renovera badrum göteborg]`, `"renovera badrum göteborg"`, `[badrumsrenovering mölndal]`, `[badrumsrenovering kungsbacka]`

Ad-group headlines (used in all three RSAs):

| # | Headline | Chars |
|---|---|---|
| G1 | Badrumsrenovering Göteborg | 26 |
| G2 | Renovera badrum i Göteborg | 26 |
| G3 | Badrumsrenovering, fast pris | 28 |
| G4 | Nytt badrum med ROT-avdrag | 26 |
| G5 | Badrum från rivning till klart | 30 |
| G6 | Helkaklat badrum | 16 |
| G7 | Badrumsrenovering med garanti | 29 |
| G8 | Badrum: offert efter besök | 26 |
| G† | Badrum från 150 000 kr | 22 |

Ad-group descriptions (used in all three RSAs):

| # | Description | Chars |
|---|---|---|
| GD1 | Badrumsrenovering i Göteborg med fast pris, ROT på fakturan och 5 års garanti. | 78 |
| GD2 | Vi river, bygger och kaklar ditt badrum. Begär en kostnadsfri offert i dag. | 75 |

- **RSA A:** G1–G8 + angle block A (pris och ROT) headlines + GD1, GD2 + angle A descriptions = 15 headlines, 4 descriptions.
- **RSA B:** G1–G8 + angle block B (trygghet) headlines + GD1, GD2 + angle B descriptions = 15 headlines, 4 descriptions.
- **RSA C:** G1–G8 + angle block C (snabbt svar och hembesök) headlines + GD1, GD2 + angle C descriptions = 15 headlines, 4 descriptions.

##### Ad group: Takbyte

- **Landing page (final URL):** https://www.binaafy.se/bygg/tjanster/tak
- **Keywords:** `[takbyte göteborg]`, `"takbyte göteborg"`, `[byta tak göteborg]`, `[takläggare göteborg]`, `"takläggare göteborg"`, `[takrenovering göteborg]`, `[plåttak göteborg]`

Ad-group headlines (used in all three RSAs):

| # | Headline | Chars |
|---|---|---|
| G1 | Takbyte i Göteborg | 18 |
| G2 | Byta tak? Fast pris | 19 |
| G3 | Takläggare i Göteborg | 21 |
| G4 | Takbyte med ROT-avdrag | 22 |
| G5 | Omläggning av tak | 17 |
| G6 | Kostnadsfri takbesiktning | 25 |
| G7 | Takbyte med 5 års garanti | 25 |
| G8 | Vad kostar ett takbyte? | 23 |
| G† | Takbyte från 1 400 kr/m² | 24 |

Ad-group descriptions (used in all three RSAs):

| # | Description | Chars |
|---|---|---|
| GD1 | Takbyte i Göteborg med fast pris efter kostnadsfri takbesiktning och ROT på fakturan. | 85 |
| GD2 | Vi lägger om taket och ser över läkt, underlagstak och takfot. 5 års garanti. | 77 |

- **RSA A:** G1–G8 + angle block A (pris och ROT) headlines + GD1, GD2 + angle A descriptions = 15 headlines, 4 descriptions.
- **RSA B:** G1–G8 + angle block B (trygghet) headlines + GD1, GD2 + angle B descriptions = 15 headlines, 4 descriptions.
- **RSA C:** G1–G8 + angle block C (snabbt svar och hembesök) headlines + GD1, GD2 + angle C descriptions = 15 headlines, 4 descriptions.

##### Ad group: Byggfirma

- **Landing page (final URL):** https://www.binaafy.se/bygg/tjanster
- **Keywords:** `[byggfirma göteborg]`, `"byggfirma göteborg"`, `[byggföretag göteborg]`, `"byggföretag göteborg"`, `[hantverkare göteborg]`, `[renovering göteborg]`

Ad-group headlines (used in all three RSAs):

| # | Headline | Chars |
|---|---|---|
| G1 | Byggfirma i Göteborg | 20 |
| G2 | Byggföretag i Göteborg | 22 |
| G3 | Renovering i Göteborg | 21 |
| G4 | Byggfirma med fast pris | 23 |
| G5 | Bygg och renovering | 19 |
| G6 | Badrum, kök, tak och mer | 24 |
| G7 | Byggfirma med ROT på fakturan | 29 |
| G8 | Byggfirma i Västsverige | 23 |

Ad-group descriptions (used in all three RSAs):

| # | Description | Chars |
|---|---|---|
| GD1 | Byggfirma i Göteborg för renovering, badrum, kök, tak och tillbyggnad. Fast pris. | 81 |
| GD2 | Vi bygger i Göteborg, Halland och Skåne. Se våra projekt och begär en offert. | 77 |

- **RSA A:** G1–G8 + angle block A (pris och ROT) headlines + GD1, GD2 + angle A descriptions = 15 headlines, 4 descriptions.
- **RSA B:** G1–G8 + angle block B (trygghet) headlines + GD1, GD2 + angle B descriptions = 15 headlines, 4 descriptions.
- **RSA C:** G1–G8 + angle block C (snabbt svar och hembesök) headlines + GD1, GD2 + angle C descriptions = 15 headlines, 4 descriptions.

##### Ad group: Köksrenovering

- **Landing page (final URL):** https://www.binaafy.se/bygg/tjanster/koksrenovering
- **Keywords:** `[köksrenovering göteborg]`, `"köksrenovering göteborg"`, `[renovera kök göteborg]`, `"renovera kök göteborg"`, `[köksmontering göteborg]`

Ad-group headlines (used in all three RSAs):

| # | Headline | Chars |
|---|---|---|
| G1 | Köksrenovering i Göteborg | 25 |
| G2 | Renovera kök i Göteborg | 23 |
| G3 | Köksrenovering, fast pris | 25 |
| G4 | Nytt kök med ROT-avdrag | 23 |
| G5 | Montage, el och VVS | 19 |
| G6 | Köksrenovering med garanti | 26 |
| G7 | Kök från rivning till klart | 27 |
| G8 | Kök: offert efter hembesök | 26 |
| G† | Kök från 180 000 kr | 19 |

Ad-group descriptions (used in all three RSAs):

| # | Description | Chars |
|---|---|---|
| GD1 | Köksrenovering i Göteborg med fast pris, ROT på fakturan och 5 års garanti. | 75 |
| GD2 | Rivning, montage, el och VVS samordnat av oss. En kontaktperson hela vägen. | 75 |

- **RSA A:** G1–G8 + angle block A (pris och ROT) headlines + GD1, GD2 + angle A descriptions = 15 headlines, 4 descriptions.
- **RSA B:** G1–G8 + angle block B (trygghet) headlines + GD1, GD2 + angle B descriptions = 15 headlines, 4 descriptions.
- **RSA C:** G1–G8 + angle block C (snabbt svar och hembesök) headlines + GD1, GD2 + angle C descriptions = 15 headlines, 4 descriptions.

##### Ad group: Totalrenovering

- **Landing page (final URL):** https://www.binaafy.se/bygg/tjanster/totalrenovering
- **Keywords:** `[totalrenovering göteborg]`, `"totalrenovering göteborg"`, `[renovera lägenhet göteborg]`, `[renovera hus göteborg]`, `"totalrenovering villa"`

Ad-group headlines (used in all three RSAs):

| # | Headline | Chars |
|---|---|---|
| G1 | Totalrenovering i Göteborg | 26 |
| G2 | Renovera lägenhet eller hus | 27 |
| G3 | Totalrenovering, fast pris | 26 |
| G4 | Totalrenovering med ROT | 23 |
| G5 | Allt från rivning till klart | 28 |
| G6 | En firma för hela projektet | 27 |
| G7 | Totalrenovering med garanti | 27 |
| G8 | Offert efter hembesök | 21 |

Ad-group descriptions (used in all three RSAs):

| # | Description | Chars |
|---|---|---|
| GD1 | Totalrenovering av hus och lägenhet i Göteborg. Fast pris och ROT på fakturan. | 78 |
| GD2 | Vi samordnar alla moment och hantverkare. En kontaktperson och 5 års garanti. | 77 |

- **RSA A:** G1–G8 + angle block A (pris och ROT) headlines + GD1, GD2 + angle A descriptions = 15 headlines, 4 descriptions.
- **RSA B:** G1–G8 + angle block B (trygghet) headlines + GD1, GD2 + angle B descriptions = 15 headlines, 4 descriptions.
- **RSA C:** G1–G8 + angle block C (snabbt svar och hembesök) headlines + GD1, GD2 + angle C descriptions = 15 headlines, 4 descriptions.

##### Ad group: Tillbyggnad

- **Landing page (final URL):** https://www.binaafy.se/bygg/tjanster/tillbyggnad
- **Keywords:** `[tillbyggnad göteborg]`, `"tillbyggnad göteborg"`, `[bygga ut huset göteborg]`, `[tillbyggnad villa göteborg]`, `"inreda vind göteborg"`

Ad-group headlines (used in all three RSAs):

| # | Headline | Chars |
|---|---|---|
| G1 | Tillbyggnad i Göteborg | 22 |
| G2 | Bygga ut huset i Göteborg | 25 |
| G3 | Tillbyggnad, nyckelfärdigt | 26 |
| G4 | Vi tar fram bygglovsunderlag | 28 |
| G5 | Inredd vind och tillbyggnad | 27 |
| G6 | Tillbyggnad med ROT-avdrag | 26 |
| G7 | Tillbyggnad med garanti | 23 |
| G8 | Mer yta utan att flytta | 23 |
| G† | Tillbyggnad från 25 000 kr/m² | 29 |

Ad-group descriptions (used in all three RSAs):

| # | Description | Chars |
|---|---|---|
| GD1 | Tillbyggnad eller inredd vind i Göteborg. Vi tar fram bygglovsunderlaget och bygger. | 84 |
| GD2 | Nyckelfärdig tillbyggnad från grund till tak med fast pris och 5 års garanti. | 77 |

- **RSA A:** G1–G8 + angle block A (pris och ROT) headlines + GD1, GD2 + angle A descriptions = 15 headlines, 4 descriptions.
- **RSA B:** G1–G8 + angle block B (trygghet) headlines + GD1, GD2 + angle B descriptions = 15 headlines, 4 descriptions.
- **RSA C:** G1–G8 + angle block C (snabbt svar och hembesök) headlines + GD1, GD2 + angle C descriptions = 15 headlines, 4 descriptions.

#### Campaign: Software – Webbyrå Göteborg


##### Ad group: Webbyrå Göteborg

- **Landing page (final URL):** https://www.binaafy.se/mjukvara/kop-hemsida
- **Keywords:** `[webbyrå göteborg]`, `"webbyrå göteborg"`, `[webbyrå i göteborg]`, `[webbdesign göteborg]`, `[hemsida göteborg]`

Ad-group headlines (used in all three RSAs):

| # | Headline | Chars |
|---|---|---|
| G1 | Webbyrå i Göteborg | 18 |
| G2 | Webbyrå med fast pris | 21 |
| G3 | Ny hemsida i Göteborg | 21 |
| G4 | Webbdesign i Göteborg | 21 |
| G5 | Binaafy Software, Göteborg | 26 |
| G6 | Webbyrå för småföretag | 22 |
| G7 | Hemsida till ditt företag | 25 |
| G8 | Webbyrå som bygger i Next.js | 28 |

Ad-group descriptions (used in all three RSAs):

| # | Description | Chars |
|---|---|---|
| GD1 | Binaafy Software i Göteborg bygger snabba hemsidor med SEO från start. Fast pris. | 81 |
| GD2 | Tre paket från 9 900 kr exkl. moms. Du äger koden och slipper licensavgifter. | 77 |

- **RSA A:** G1–G8 + angle block A (pris) headlines + GD1, GD2 + angle A descriptions = 15 headlines, 4 descriptions.
- **RSA B:** G1–G8 + angle block B (kvalitet och SEO) headlines + GD1, GD2 + angle B descriptions = 15 headlines, 4 descriptions.
- **RSA C:** G1–G8 + angle block C (snabbhet) headlines + GD1, GD2 + angle C descriptions = 15 headlines, 4 descriptions.

#### Campaign: Software – Köp hemsida Sverige


##### Ad group: Köp hemsida

- **Landing page (final URL):** https://www.binaafy.se/mjukvara/kop-hemsida
- **Keywords:** `[köp hemsida företag]`, `"köp hemsida företag"`, `[köpa hemsida]`, `[hemsida till företag]`, `"hemsida till företag"`, `[företagshemsida pris]`, `"vad kostar en hemsida"`

Ad-group headlines (used in all three RSAs):

| # | Headline | Chars |
|---|---|---|
| G1 | Köp hemsida till företag | 24 |
| G2 | Köp hemsida, fast pris | 22 |
| G3 | Företagshemsida, fast pris | 26 |
| G4 | Hemsida från 9 900 kr | 21 |
| G5 | Beställ hemsida online | 22 |
| G6 | Ny hemsida till företaget | 25 |
| G7 | Vad kostar en hemsida? | 22 |
| G8 | Hemsida med SEO och mobil | 25 |

Ad-group descriptions (used in all three RSAs):

| # | Description | Chars |
|---|---|---|
| GD1 | Köp en snabb, mobilanpassad hemsida till ditt företag. Tre paket med fast pris. | 79 |
| GD2 | Från 9 900 kr exkl. moms för upp till fem sidor. Beställ på två minuter. | 72 |

- **RSA A:** G1–G8 + angle block A (pris) headlines + GD1, GD2 + angle A descriptions = 15 headlines, 4 descriptions.
- **RSA B:** G1–G8 + angle block B (kvalitet och SEO) headlines + GD1, GD2 + angle B descriptions = 15 headlines, 4 descriptions.
- **RSA C:** G1–G8 + angle block C (snabbhet) headlines + GD1, GD2 + angle C descriptions = 15 headlines, 4 descriptions.

### 1.4 Assets (sitelinks, callouts, snippets, call, location)

Sitelinks (text ≤ 25, each description line ≤ 35 characters). Add at campaign level.

**Bygg – Varumärke and Bygg – Tjänster Göteborg**

| Sitelink text | Line 1 | Line 2 | Final URL |
|---|---|---|---|
| Begär offert | Svar inom 24 timmar | Kostnadsfritt hembesök | https://www.binaafy.se/bygg/offert |
| Våra projekt | Bilder från färdiga jobb | Göteborg, Halland och Skåne | https://www.binaafy.se/bygg/projekt |
| ROT-avdrag 2026 | 30 % av arbetskostnaden | Dras direkt på fakturan | https://www.binaafy.se/guider/rot-avdrag-2026 |
| Omdömen | Vad våra kunder säger | Läs innan du bestämmer dig | https://www.binaafy.se/omdomen |
| Alla tjänster | Badrum, kök, tak och golv | Fast pris i varje offert | https://www.binaafy.se/bygg/tjanster |
| Välj rätt byggfirma | Nio kontroller före avtal | Checklista att skriva ut | https://www.binaafy.se/guider/valja-byggfirma-checklista |

Ad-group level, Takbyte only (overrides the campaign set):

| Sitelink text | Line 1 | Line 2 | Final URL |
|---|---|---|---|
| Vad kostar ett takbyte? | Pris per kvadratmeter | Räkneexempel med ROT | https://www.binaafy.se/guider/takbyte-kostnad-2026 |

**Software – Webbyrå Göteborg and Software – Köp hemsida Sverige**

| Sitelink text | Line 1 | Line 2 | Final URL |
|---|---|---|---|
| Se paketen | Tre paket med fast pris | Från 9 900 kr exkl. moms | https://www.binaafy.se/mjukvara/kop-hemsida |
| Kundcase | Hemsidor och system i drift | Se vad vi har byggt | https://www.binaafy.se/mjukvara/case |
| Beskriv ditt projekt | Skicka en kort brief | Vi återkommer med upplägg | https://www.binaafy.se/mjukvara/brief |
| System och integration | Portaler, automation, system | Fast pris per etapp | https://www.binaafy.se/mjukvara/tjanster |

Callouts (≤ 25 characters):

- Bygg: `Fast pris` · `ROT-avdrag på fakturan` · `Kostnadsfritt hembesök` · `5 års garanti` ·
  `Svar inom 24 timmar` · `Egen personal` · `En kontaktperson` · `Göteborg, Halland, Skåne`
- Software: `Fast pris` · `Du äger koden` · `SEO från start` · `Inga licensavgifter` ·
  `Mobilanpassad` · `Klar på 2 till 3 veckor`

Structured snippet, Bygg (header "Tjänster"): Badrumsrenovering, Köksrenovering, Totalrenovering,
Tillbyggnad, Takbyte, Golvläggning, Målning, Projektledning.
Structured snippet, Software (header "Tjänster"): Hemsidor, Kundportaler, Integrationer, Interna system.

Call asset: 079-304 97 37, schedule Mon–Fri 07:00–16:00 (or whatever hours the phone is really
answered). Turn on call reporting if the account offers it for Sweden.

Location asset: link the Business Profile "Binaafy AB" (Verktyg → Länkade konton → Google Business
Profile). This shows the address and the star rating under the ad when Google chooses to.

### 1.5 Landing pages

| Ad group | Final URL |
|---|---|
| Varumärke | https://www.binaafy.se/ |
| Badrumsrenovering | https://www.binaafy.se/bygg/tjanster/badrumsrenovering |
| Takbyte | https://www.binaafy.se/bygg/tjanster/tak |
| Byggfirma | https://www.binaafy.se/bygg/tjanster |
| Köksrenovering | https://www.binaafy.se/bygg/tjanster/koksrenovering |
| Totalrenovering | https://www.binaafy.se/bygg/tjanster/totalrenovering |
| Tillbyggnad | https://www.binaafy.se/bygg/tjanster/tillbyggnad |
| Webbyrå Göteborg | https://www.binaafy.se/mjukvara/kop-hemsida |
| Köp hemsida | https://www.binaafy.se/mjukvara/kop-hemsida |

All nine returned 200 on 2026-11-03. Each service page has the offer form and the mobile call bar,
so `generate_lead` and `contact_call` fire on the page the ad lands on.

### 1.6 Tracking template and UTMs

- Turn on auto-tagging (Administratör → Kontoinställningar → Automatisk taggning). With GA4 linked,
  this is what attributes leads to keywords. UTMs are a backup and make the traffic readable in
  other tools.
- Account-level "Suffix för slutlig webbadress":

  ```
  utm_source=google&utm_medium=cpc&utm_campaign={_kampanj}&utm_term={keyword}&utm_content={creative}
  ```

- Custom parameter `kampanj` per campaign (Kampanj → Inställningar → Fler inställningar →
  Alternativ för kampanjens webbadress): `bygg-varumarke`, `bygg-tjanster-gbg`, `sw-webbyra-gbg`,
  `sw-kop-hemsida`.
- Test: "Testa" in the URL options must show the landing page with the parameters, and the page
  must load with status 200.

### 1.7 Conversion setup

The site already sends `generate_lead` (all lead forms), `contact_call` (taps on the phone number in
the mobile call bar) and `contact_whatsapp` to GA4 via `lib/track.ts`.

1. GA4 → Administratör → Händelser: mark `generate_lead`, `contact_call` and `contact_whatsapp` as
   key events (nyckelhändelser).
2. GA4 → Administratör → Produktlänkar → Google Ads-länkar → link the Ads account. Tick
   "Aktivera personlig annonsering" only if the cookie banner covers ads consent.
3. Google Ads → Mål → Konverteringar → Ny konverteringsåtgärd → Importera → Google Analytics 4 →
   Webb → pick the three events.
4. Set `generate_lead` as **primary** (it is what bidding optimizes for). Set `contact_call` and
   `contact_whatsapp` as **secondary** in month one: a tap on the number is not a call that
   happened, and a primary goal that counts taps would teach bidding to buy taps. Promote
   `contact_call` to primary later if the taps turn out to be real calls (compare with the phone log).
5. Count: "En" (one per click) for all three. Value: leave empty until there is a real average
   order value and close rate to base it on.
6. Know the limit: GA4 on binaafy.se loads only after cookie consent. Visitors who decline are not
   counted, so Ads will show fewer conversions than real leads. Once a week, compare Ads
   conversions with the number of leads in /admin. If the gap is large, a later dev task is Google
   Consent Mode v2 (not part of this kit).

### 1.8 Weekly review checklist (15 minutes, same day each week)

1. **Search terms** (Insikter och rapporter → Söktermer), last 7 days: add every irrelevant term
   as a negative (to the right shared list), and add good converting terms as exact keywords.
2. **Benify check:** any search term containing "benify" or "lön" means a negative is missing.
3. **Budget:** "Begränsad av budget" on the brand campaign means raise it at once; on Tjänster it is
   a choice.
4. **Conversions:** `generate_lead` per campaign this week vs. leads in /admin. Note both numbers.
5. **Ad strength and asset report:** after two weeks, replace headlines rated "Låg" with a new
   headline from the same angle (facts only).
6. **Disapprovals:** Annonser → filter "Avvisad"/"Begränsad". Fix the same day.
7. **Landing pages:** open each final URL once on a phone. Form works, call bar shows.
8. **Quality score columns** (add Kvalitetsresultat to the keyword view): note keywords below 5 and
   whether the landing page or the ad text is "Under genomsnittet".
9. After week one: replace the estimated budgets and the max CPC limits with figures from the
   account itself.

---

## 2. Review engine

Google reviews feed the map pack for "byggfirma göteborg" and the stars next to the Business
Profile and (via the location asset) the ads. The profile has 6 reviews today. The goal is a steady
flow from every finished job, not a burst.

### 2.1 The short link

`https://www.binaafy.se/recension` (new in this change, `app/recension/route.ts`) redirects with a
302 to Google's "skriv en recension" form when `NEXT_PUBLIC_REVIEW_URL` is set, and to `/omdomen`
until then. One link for every SMS, e-mail, card and QR code, and it never has to change if the
target does.

To switch it on: Business Profile → "Be om recensioner" (Ask for reviews) → copy the link (it looks
like `https://g.page/r/…/review`) → Vercel → Settings → Environment Variables →
`NEXT_PUBLIC_REVIEW_URL` = that link, Production → redeploy (`NEXT_PUBLIC_` values are read at
build time). Check: `curl -sI https://www.binaafy.se/recension` shows `location:` with the g.page link.

Print a QR code to `https://www.binaafy.se/recension` on the back of a business card and at the
bottom of the slutbesiktning protocol.

### 2.2 When to ask

1. **At slutbesiktning, in person**, after the customer has signed off and is pleased with the
   result. That is when satisfaction is highest and the work is in front of them.
2. **The same evening**, the SMS (or WhatsApp if that is how you have been talking) with the link.
3. **One reminder after 5 days** by e-mail if no review has appeared. Never more than one reminder.

Ask every finished customer, not only the ones you expect to be happy. Google's policy forbids
selectively asking for positive reviews ("review gating") and offering anything in return for a
review (discount, gift, lottery). Fake or bought reviews are also illegal marketing under Swedish
law. Never write reviews for the company yourself or have friends do it.

**What to say at slutbesiktning (Ibrahim):**

> Tack för att vi fick göra det här jobbet. Vi är ett ungt företag och de flesta nya kunder hittar
> oss genom vad andra skriver på Google. Om du är nöjd skulle det betyda mycket om du skrev några
> rader där. Jag skickar länken till dig i kväll, det tar en minut.

### 2.3 SMS (same evening, ≤ 160 characters)

> Hej Anna! Tack för att vi fick bygga åt dig. Har du en minut? En recension på Google betyder mycket för oss: binaafy.se/recension /Ibrahim, Binaafy

147 characters with a four-letter first name; all characters are in the standard SMS set (å, ä, ö
included), so it is sent as one SMS. With a long name, drop ", Binaafy".

### 2.4 WhatsApp variant (same evening, send with 2–3 photos of the finished work)

> Hej Anna! Här är några bilder från ditt färdiga badrum. Tack igen för förtroendet, det har varit roligt att jobba hos dig.
>
> Om du vill hjälpa oss lite: en kort recension på Google gör stor skillnad för ett ungt företag som vårt. Det tar en minut:
> https://www.binaafy.se/recension
>
> Tack! /Ibrahim

### 2.5 E-mail (reminder after 5 days, or instead of SMS when you only have an e-mail address)

**Ämne:** Tack för förtroendet, Anna

> Hej Anna,
>
> Tack för att du valde Binaafy till ditt badrum. Det har varit roligt att bygga åt dig.
>
> En sista sak: vi är ett ungt företag och nya kunder hittar oss mest genom vad andra säger om oss.
> Om du har två minuter blir vi väldigt glada om du berättar på Google hur du upplevde jobbet:
>
> https://www.binaafy.se/recension
>
> Skriv gärna med egna ord vad vi gjorde och hur det gick. Det hjälper andra som funderar på
> samma sak.
>
> Om något inte blev som du tänkt dig vill jag att du hör av dig direkt, så tar vi hand om det.
> Garantin på hantverket gäller i fem år.
>
> Vänliga hälsningar
> Ibrahim
> Binaafy AB
> 079-304 97 37 · info@binaafy.se · www.binaafy.se

### 2.6 Replying to reviews

Reply to every review within 48 hours, from the Business Profile. Mention the service in your own
words (it helps the profile rank for that service), never the customer's address, price, or
anything else they did not write themselves.

**Positive (5 or 4 stars), vary between these:**

> Tack Anna för fina ord! Det var roligt att få renovera badrummet åt dig. Hör av dig om du behöver något mer, garantin gäller i fem år. /Ibrahim, Binaafy

> Stort tack för ditt omdöme! Vi är glada att takbytet blev som du ville och att allt höll tidplanen. Lycka till med huset! /Ibrahim, Binaafy

> Tack för förtroendet och för att du tog dig tid att skriva. Det betyder mycket för oss som ungt företag. Välkommen tillbaka när det är dags för nästa projekt! /Ibrahim, Binaafy

**Mixed (3 stars):**

> Tack för att du skriver och för att du är ärlig. Vi är glada att resultatet blev bra, och vi tar till oss det du skriver om [kommunikationen/tidplanen]. Jag ringer dig gärna för att höra mer, eller nå mig på 079-304 97 37. /Ibrahim, Binaafy

**Negative (1–2 stars):**

> Hej Anna. Tack för att du tog dig tid att skriva, och jag beklagar att du inte är nöjd. Det vill jag reda ut med dig. Ring mig gärna direkt på 079-304 97 37 eller mejla info@binaafy.se, så går vi igenom det tillsammans. /Ibrahim, Binaafy AB

Rules for negative reviews: answer calmly and once; no arguing about details in public; no
compensation offered in the reply; call the customer first if you can. If the problem is fixed,
you can ask (once, without pressure) whether they want to update the review.

**Review from someone who was never a customer:**

> Hej. Vi hittar ingen kund eller något uppdrag som stämmer med det du beskriver. Om du har haft kontakt med oss, hör gärna av dig på info@binaafy.se så tittar vi på det. /Binaafy AB

Then report it in the Business Profile ("Rapportera recension") as not based on a real experience.

### 2.7 Monthly target

- 100 % of finished jobs asked within 24 hours of slutbesiktning.
- Target for months 1–3: at least 2 new Google reviews a month. Adjust to the number of jobs
  actually finished; the share of asked customers who write a review is what to watch.
- 100 % of reviews answered within 48 hours.
- Keep a simple list (in /admin notes or a sheet): customer, date of slutbesiktning, asked in
  person, SMS sent, reminder sent, review posted.

### 2.8 Why Google first, then Reco, then Trustpilot

- **Google** is where the decision is made for local services: the map pack, the Business Profile
  and the stars in ads all use Google reviews. Asking for one platform at a time also gets more
  reviews than offering a menu of three.
- **Reco.se** is the Swedish review site for hantverkare, and the SEO review found that competitors
  for *badrumsrenovering göteborg* have many Reco reviews. Reco offers new companies a free 60-day
  trial (stated on reco.se/foretag), after that it is a subscription. Start it in month 2 or 3,
  when the Google routine runs by itself, and then ask every second customer for Reco instead.
- **Trustpilot** has a free business account, but for a local byggfirma it is mainly a
  consumer-goods and e-commerce platform. Claim the name so nobody else does, do not actively
  collect reviews there yet.

---

## 3. 30 link and listing targets (verified 2026-11-03)

Each URL was checked with `curl -sS -o /dev/null -L -w "%{http_code}" -A "Mozilla/5.0" <url>`.
200 = page exists and loaded. 403 = page exists but blocks scripted requests (bot protection); it
opens normally in a browser. Costs are what the site states, or "check on the site" where it could
not be read; do not buy any paid upgrade in month one.

**NAP, identical everywhere (copy exactly):**

```
Binaafy AB
Uppstigen 130
412 80 Göteborg
079-304 97 37
info@binaafy.se
https://www.binaafy.se
Org.nr 559603-3471
```

Short description for every directory (Swedish, ~300 characters):

> Binaafy AB är en byggfirma i Göteborg för totalrenovering, badrum, kök, tillbyggnad, tak, golv och
> måleri i Västra Götaland, Halland och Skåne. Fast pris i offerten, ROT-avdrag direkt på fakturan,
> kostnadsfritt hembesök och 5 års garanti på hantverket.

Category everywhere: Byggfirma / Byggföretag (secondary where offered: Takläggare, Badrumsrenovering,
Målare, Snickare). Logo: `public/brand/` (square version). Use the same three project photos on
every profile that accepts images.

### 3.1 Summary

| # | Target | URL | HTTP | Cost | Type |
|---|---|---|---|---|---|
| 1 | Google Business Profile | https://www.google.com/business/ | 200 | Free | Maps / search |
| 2 | Bing Places | https://www.bingplaces.com/ | 200 | Free | Maps / search |
| 3 | Apple Business Connect | https://business.apple.com/ | 200 | Free | Maps (iPhone) |
| 4 | hitta.se (existing listing) | https://www.hitta.se/binaafy+ab/g%C3%B6teborg/krudjppv | 200 | Free basic; paid upgrades offered | Directory |
| 5 | Eniro | https://www.eniro.se/ | 403 | Check on the site | Directory |
| 6 | Allabolag (proff.se now redirects here) | https://www.allabolag.se/5596033471 | 403 | Check on the site | Register |
| 7 | Bolagsfakta | https://www.bolagsfakta.se/5596033471-Binaafy_AB | 403 | Check on the site | Register |
| 8 | Ratsit | https://www.ratsit.se/5596033471-Binaafy_AB | 403 | Check on the site | Register |
| 9 | Merinfo | https://www.merinfo.se/ | 403 | Check on the site | Register |
| 10 | Upplysning.se | https://www.upplysning.se/ | 403 | Check on the site | Register |
| 11 | Cylex | https://www.cylex.se/ | 403 | Check on the site | Directory |
| 12 | Företagsfakta | https://www.foretagsfakta.se/ | 200 | Check on the site | Register |
| 13 | Lokaldelen | https://www.lokaldelen.se/ | 200 | Check on the site | Directory |
| 14 | Brownbook | https://www.brownbook.net/add-business | 200 | Free | Directory |
| 15 | Offerta | https://www.offerta.se/anslut-ditt-foretag | 200 | Paid (price by region, trade, volume) | Lead marketplace |
| 16 | Servicefinder | https://www.servicefinder.se/for-foretag | 200 | Free to register; subscription to answer jobs | Lead marketplace |
| 17 | Dorunner | https://www.dorunner.se/info/bli-medlem | 200 | Paid (subscription with coupons) | Lead marketplace |
| 18 | Hemfixarna | https://hemfixarna.se/anslut-som-entreprenor/ | 200 | Free to join (stated on the page) | Job marketplace |
| 19 | Reco | https://www.reco.se/foretag | 200 | 60-day free trial, then subscription | Reviews |
| 20 | Trustpilot | https://business.trustpilot.com/ | 200 | Free account; paid plans | Reviews |
| 21 | Byggahus.se forum | https://www.byggahus.se/forum/ | 403 | Free | Community |
| 22 | LinkedIn company page | https://www.linkedin.com/company/setup/new/ | 403 | Free | Social |
| 23 | Instagram | https://www.instagram.com/accounts/emailsignup/ | 200 | Free | Social |
| 24 | Facebook page | https://www.facebook.com/pages/create | 200 | Free | Social |
| 25 | YouTube channel | https://www.youtube.com/ | 200 | Free | Social / video |
| 26 | Företagarna Västra Götaland | https://www.foretagarna.se/regioner/vastra-gotaland/ | 200 | Membership fee | Local network |
| 27 | HSB Göteborg | https://www.hsb.se/goteborg/ | 200 | Free (outreach) | Local / BRF |
| 28 | Optimera Proffsklubben | https://www.optimera.se/kund-hos-oss/proffsklubben | 200 | Trade account; check terms | Supplier |
| 29 | Bauhaus företagskund | https://www.bauhaus.se/bli-foretagskund | 200 | Trade account; check terms | Supplier |
| 30 | Göteborgs-Posten (news tip) | https://www.gp.se/ | 200 | Free | Local press |

Verified but not for now (keep for later):

| Target | URL | HTTP | Why later |
|---|---|---|---|
| Byggstart | https://www.byggstart.se/foretag | 200 | Requirements on the page: active more than three years, at least 5 MSEK turnover last financial year, certifications such as BKR, GVK, Trygg Plåt. Binaafy does not qualify yet. |
| Säker Vatten (authorised companies) | https://sakervatten.se/auktorisation/ | 200 | Listing only after authorisation for wet rooms. Worth it for badrum once someone on the team has the certificate. |
| GVK (find a company) | https://www.gvk.se/hitta-foretag/ | 200 | Same, for wet-room authorisation. Byggstart also asks for it. |
| K-Bygg proffs | https://www.k-bygg.se/proffs/ | 200 | Trade account only (k-rauta.se/proffs redirects here). Open it if you buy there. |
| Bizzdo | https://www.bizzdo.se/ | 200 | Register data aggregator; check later that the data is right. |
| Bing Webmaster Tools | https://www.bing.com/webmasters/ | 200 | Already in the SEO review, section 4, item 7. |

Dropped because they did not return 200 or 403, or were not what they claim:

- hittaforetag.se: 200, but the domain is parked at Loopia (no directory).
- 118100.se: 429 (rate limited) on three attempts; not verified.
- mittanbud.se: connection timed out.
- businessregion.se (Business Region Göteborg): TLS error from this machine; not verified.
- hotfrog.se: domain does not resolve.
- gulasidorna.se: redirect loop (more than 50 redirects).
- proff.se: redirects to allabolag.se (covered by #6).
- beijerbygg.se/proffs and /bli-kund: 404. byggmax.se/proffs: 404 (byggmax.se/foretagslosningar
  redirects to a quote form, no partner page). bauhaus.se/proffs: 404 (use #29 instead).
- offerta.se/foretag, servicefinder.se/foretag, hitta.se/foretag: 404 (the correct pages are in the table).
- Göteborgs Stad: no company register page found (goteborg.se/…/foretagande and …/naringsliv: 404).
- nyforetagarcentrum.se/goteborg: 404. bostadsratterna.se/leverantorer: 404.
- yelp.se: redirects to a Copenhagen page; not useful in Sweden.
- renoveringsguiden.se: redirects to 198.se (403), unclear what it is.

### 3.2 What to do, per target

**1. Google Business Profile.** Already exists. Beyond section 4 of the SEO review: add the
services with descriptions from the service pages, add "Kostnadsfritt hembesök" and "ROT-avdrag på
fakturan" in the description, set opening hours Mån–Fre 07:00–16:00, add the Q&A pairs below as
your own questions and answers, post twice a month (section 4). Free.

Q&A to add (ask from a personal account, answer as the business):
- *Gör ni hembesök?* Ja, hembesöket är kostnadsfritt. Du får sedan en specificerad offert med fast pris.
- *Drar ni ROT-avdraget?* Ja, ROT-avdraget dras direkt på fakturan, så du betalar bara din del.
- *Vilka områden jobbar ni i?* Göteborg med omnejd, Halland och Skåne.

**2. Bing Places.** Sign in with a Microsoft account, "Import from Google Business Profile" (one
click), check NAP. Free. Bing's data also feeds Copilot answers.

**3. Apple Business Connect.** Claim the place on Apple Maps (iPhone users searching in Maps). Add
NAP, category, hours, logo, photos. Verification by phone or document. Free.

**4. hitta.se.** A listing already exists (verified): name, org.nr and Uppstigen 130 are correct,
but **no website and no phone number** are listed, and the category reads "Puts-, fasad- och
stuckatörsarbeten". Click "Verifiera ditt företag" / "Ändra uppgifter" on the listing, add phone,
e-mail, website, hours, the short description, and change the category to Byggfirma. The free
change is enough; skip the paid "Skapa en webbsida" offer.

**5. Eniro.** Search for Binaafy AB. If it exists, use "Är detta ditt företag?" and add phone,
website, description. If not, register the company through their business page. Check the price
before accepting anything beyond a basic entry.

**6–10. Allabolag, Bolagsfakta, Ratsit, Merinfo, Upplysning.se.** These copy data from
Bolagsverket and Skatteverket. Open each profile in a browser, check that address and SNI code
match, and add phone and website where the site allows the company to do it (Allabolag: "Är detta
ditt företag?"). Do not pay for "företagsprofil" upgrades in month one. The three already-verified
profile URLs (6–8) are in `site.profiles`; add Merinfo once you have the profile URL.

**11. Cylex.** Search; claim or add the company. NAP + description + category.

**12. Företagsfakta.** The site currently says "Arbete pågår" (new platform). Check that Binaafy's
data is right; nothing to add yet.

**13. Lokaldelen.** Local directory. Search for Binaafy; add or correct the listing with NAP and the
description.

**14. Brownbook.** "Add a business": NAP, category Building contractor, website, description in
Swedish. Free.

**15. Offerta.** Lead marketplace (customers post jobs, companies buy access). Fill in the
interest form on the page. A sales rep calls back. Test only after the Google Ads data from month
one shows what a lead costs there, so the two can be compared. Message for the form:

> Hej! Vi är Binaafy AB, en byggfirma i Göteborg (org.nr 559603-3471) som gör totalrenovering,
> badrum, kök, tillbyggnad, tak, golv och måleri i Västra Götaland, Halland och Skåne. Vi jobbar
> med fast pris och ROT-avdrag direkt på fakturan. Vi vill veta vad det kostar att ta emot
> förfrågningar inom badrum, kök och tak i Göteborgsområdet, och om det går att börja med en
> kortare testperiod. Nå mig på 079-304 97 37 eller info@binaafy.se. Vänliga hälsningar, Ibrahim

**16. Servicefinder.** Register the company for free (gives a public company profile page with
reviews and a link). Answering jobs needs a subscription; decide after month one, like Offerta.
Message if a rep calls or you contact them:

> Hej! Binaafy AB är en byggfirma i Göteborg inom renovering, badrum, kök, tak och tillbyggnad. Vi
> har registrerat vår profil och vill gärna veta vilka abonnemang som finns för Göteborgsområdet
> och de tjänsterna, och ungefär hur många jobb per månad det brukar handla om. Ring gärna på
> 079-304 97 37 eller mejla info@binaafy.se. Tack! Ibrahim

**17. Dorunner.** Same model (coupons to answer jobs). Lower priority than Offerta and
Servicefinder; register only if the first two show that marketplace leads work for you.

**18. Hemfixarna.** Connects contractors to fixed-price jobs; joining is free according to the
page, and they also take larger building jobs. Good for filling gaps in the calendar. Apply through
the form. Message:

> Hej! Vi är Binaafy AB, en byggfirma i Göteborg med egen personal inom renovering, badrum, kök,
> golv, måleri och tak. Vi har kapacitet för fler uppdrag i Göteborgsområdet och vill gärna ansluta
> som entreprenör. Org.nr 559603-3471, F-skatt. Nå mig på 079-304 97 37 eller info@binaafy.se.
> Vänliga hälsningar, Ibrahim

(Only write "F-skatt" if the company holds F-skatt; check on Skatteverket first.)

**19. Reco.** Create the company profile and start the free trial in month 2 or 3 (see 2.8). Add
NAP, description, categories, logo, photos.

**20. Trustpilot.** Create the free business account to claim the name binaafy.se. Fill in the
profile; no active review collection yet (see 2.8).

**21. Byggahus.se forum.** Create a personal account (Ibrahim, "byggingenjör/byggfirma i
Göteborg" in the profile and signature if the forum rules allow a link). Answer 2–3 questions a
week in the renovation and roof sections with real, specific help. Never post ads; read the forum
rules first. This builds the name and, over time, a few strong links.

**22. LinkedIn.** Company page "Binaafy AB" (one page for both divisions, or a showcase page for
Binaafy Software). Website, industry Construction, size 2–10, Göteborg, logo, the short
description. Ask the team to list Binaafy AB as employer. Add the page URL to `site.profiles`.

**23. Instagram** and **24. Facebook.** Handle `@binaafy` (free as of the SEO review). Business
account, category Byggfirma / General Contractor, NAP, website `https://www.binaafy.se`, link in
bio to `/bygg/offert`. Connect both in Meta Business Suite so one post goes to both. Add both URLs
to `site.profiles`.

**25. YouTube.** Create the channel "Binaafy" from the same Google account as the Business
Profile. Upload short before/after clips of the projects (vertical, 20–40 seconds, as Shorts too).
Channel description = the short description + website. Add the URL to `site.profiles`.

**26. Företagarna Västra Götaland.** Membership gives a local business network, events in
Göteborg (several in November 2026 are listed on the page) and the "Årets företagare" award.
Membership costs money; worth it only if Ibrahim will actually go to the events. Message to the
regional office:

> Hej! Jag heter Ibrahim och driver Binaafy AB, en byggfirma i Göteborg som startade 2026. Vi gör
> renovering, badrum, kök, tak och tillbyggnad, och har också en mjukvarudel som bygger hemsidor
> och system åt småföretag. Jag funderar på medlemskap och vill gärna veta vad det kostar och vilka
> nätverksträffar ni har i Göteborg den närmaste tiden. Vänliga hälsningar, Ibrahim Al Haboub,
> 079-304 97 37

**27. HSB Göteborg (and BRF boards).** Bostadsrättsföreningar buy
badrum, fasad, tak and painting work, both for the förening and for members. HSB Göteborg runs property management for föreningar. Send the message to their contact
address, and the same text to BRF boards you know in the area (via the board's e-mail or the
notice board, never by scraping personal addresses):

> Hej! Vi är Binaafy AB, en byggfirma i Göteborg som gör badrumsrenoveringar, tak- och
> fasadarbeten, målning och golv. Vi tar gärna uppdrag åt bostadsrättsföreningar, både
> föreningens egna projekt och medlemmarnas renoveringar, med fast pris, ROT-avdrag på fakturan
> för medlemmarna och 5 års garanti på hantverket. Vi kommer gärna på ett kostnadsfritt
> platsbesök. Får vi skicka en presentation, eller vem ska vi prata med? Vänliga hälsningar,
> Ibrahim, Binaafy AB, 079-304 97 37, info@binaafy.se, www.binaafy.se

**28. Optimera Proffsklubben** and **29. Bauhaus företagskund.** These are trade accounts, not
link pages: neither page offers a "find a contractor" listing. Open an account where you already
buy material (better prices, invoicing). When the account is open, ask your contact whether they
have a local contractor list or customer reference page:

> Hej! Vi är kund hos er som Binaafy AB, byggfirma i Göteborg. Har ni någon lista eller sida där
> ni tipsar privatkunder om lokala hantverkare, eller referensprojekt där ert material används?
> Vi har färdiga projekt med bilder som vi gärna delar. Vänliga hälsningar, Ibrahim, 079-304 97 37

**30. Göteborgs-Posten (news tip).** Only when there is a real story: an unusual project, a
local angle (for example a roof with solar panels on an older house, or a BRF project), or an
event. Send to the news desk's tip address listed on gp.se. Message template:

> Hej! Jag heter Ibrahim och driver Binaafy AB, en ny byggfirma i Göteborg. Vi har just avslutat
> [kort beskrivning, t.ex. ett takbyte med solceller på en villa från 1960-talet i Göteborg], och
> [vad som är intressant för läsarna, t.ex. vad det kostade efter ROT och vad ägarna lärde sig].
> Ägarna är villiga att berätta. Jag skickar gärna bilder före och efter. Nå mig på 079-304 97 37.
> Vänliga hälsningar, Ibrahim Al Haboub, Binaafy AB

The same template works for Hallandsposten (hn.se, 200) for the Hyltebruk roof and for
Helsingborgs Dagblad (hd.se, 200) for the Helsingborg job.

---

## 4. Content calendar, three months

Month 1 = November 2026, month 2 = December 2026, month 3 = January 2027.

### 4.1 One guide a month

Same format as the existing guides in `lib/guides.ts` (900+ words, dated, FAQ schema, sources,
links to the service page and `/bygg/offert`). Existing slugs not to repeat: `rot-avdrag-2026`,
`badrumsrenovering-steg-for-steg`, `checklista-infor-renovering`, `takbyte-kostnad-2026`,
`valja-byggfirma-checklista`, `standardsystem-eller-eget-system`.

| Month | Slug (suggested) | Title (Swedish) | Main queries |
|---|---|---|---|
| 1 | `koksrenovering-pris` | Vad kostar en köksrenovering? Pris, tidplan och ROT | köksrenovering pris, renovera kök kostnad, köksrenovering göteborg |
| 2 | `bygglov-tillbyggnad-goteborg` | Bygglov för tillbyggnad i Göteborg: steg, tid och kostnad | bygglov tillbyggnad göteborg, bygglov tillbyggnad, attefall tillbyggnad |
| 3 | `solceller-pa-tak` | Solceller på taket: byt taket först, avdrag och vad det kostar | solceller tak, solceller rot, byta tak innan solceller |

**Month 1, köksrenovering pris.** H2s: Vad påverkar priset (yta, stomme, el och VVS, skåp och
vitvaror); Exempel med ROT (use only confirmed figures from `lib/pricing.ts`, show the ROT
calculation: 30 % of the labour, max 50 000 kr per person and year); Tidplan vecka för vecka;
Vad ingår hos oss och vad köper du själv; Så får du en offert som går att jämföra. FAQ: Får jag
ROT på köksskåp? (no, only labour); Hur länge står köket oanvändbart?; Behöver jag bygglov? Sources:
Skatteverket (ROT), Elsäkerhetsverket (behörighet for el). Links: `/bygg/tjanster/koksrenovering`,
`/guider/rot-avdrag-2026`, `/guider/checklista-infor-renovering`.

**Month 2, bygglov tillbyggnad Göteborg.** H2s: Bygglov, anmälan eller attefall; Så söker du hos
Göteborgs Stad (e-tjänst, handlingar: situationsplan, ritningar, fasader, konstruktion);
Handläggningstid; Kostnad (the municipality's fee is separate from our quote, as the service page
says; link to Göteborgs Stad's fee page rather than quoting a figure); Kontrollansvarig and
tekniskt samråd; What changed in PBL on 2025-12-01 (the takbyte guide already flags this; check
Boverket for what applies to additions). FAQ: Hur stor tillbyggnad får jag göra utan bygglov?;
Vem ritar?; Kan ni söka åt mig? Sources: Boverket, Göteborgs Stad, the PBL text. Links:
`/bygg/tjanster/tillbyggnad`, `/guider/valja-byggfirma-checklista`.

**Month 3, solceller på tak.** Use the real Göteborg project (`/bygg/projekt/solceller-pa-tak`,
"Totalt takbyte med solceller"). Important for accuracy: solar panels are normally covered by
Skatteverket's **skattereduktion för grön teknik**, not by ROT. ROT applies to the roof work
itself. Check the current grön-teknik rates and rules on Skatteverket before writing, and only say
Binaafy installs the panels if it does (otherwise: we replace the roof and coordinate with the
solar installer). H2s: Varför byta taket innan solceller; Vilka tak passar; Grön teknik och ROT,
vad gäller för vad; Bygglov för solceller (Boverket); Vårt projekt i Göteborg. Links:
`/bygg/tjanster/tak`, `/guider/takbyte-kostnad-2026`.

January also: update `rot-avdrag-2026` for 2027 once Skatteverket has published the 2027 rules
(SEO review section 5 says refresh each January).

### 4.2 Business Profile posts (2 a month)

Post type "Uppdatering" with one photo and a button. Keep under ~300 characters so the whole text
shows.

| When | Text (Swedish) | Button → URL |
|---|---|---|
| Month 1, week 1 | Totalt takbyte med solceller i Göteborg. Nytt tak först, sedan panelerna, så att taket håller lika länge som anläggningen. Se bilderna från jobbet. | Läs mer → /bygg/projekt/solceller-pa-tak |
| Month 1, week 3 | Planerar du att renovera badrummet i vår? Boka ett kostnadsfritt hembesök nu, så har du en offert med fast pris och tidplan i god tid. ROT-avdraget drar vi direkt på fakturan. | Boka → /bygg/offert |
| Month 2, week 1 | Ny guide: vad kostar en köksrenovering? Vi går igenom vad som styr priset, hur lång tid det tar och hur ROT-avdraget räknas. | Läs mer → /guider/koksrenovering-pris |
| Month 2, week 3 | Inför vintern: kolla taket. Mossa, lösa pannor och rost runt skorsten är tecken på att det är dags att se över det. Vi gör en kostnadsfri takbesiktning i Göteborg med omnejd. | Läs mer → /guider/takbyte-kostnad-2026 |
| Month 3, week 1 | Ny guide: bygglov för tillbyggnad i Göteborg. Steg för steg, från attefall till bygglov, och vad du behöver skicka in. | Läs mer → /guider/bygglov-tillbyggnad-goteborg |
| Month 3, week 3 | ROT-avdraget 2027: så fungerar det och så mycket kan du få tillbaka. Hos oss dras det direkt på fakturan. (Publish only after checking the 2027 rules.) | Läs mer → /guider/rot-avdrag-2026 |

### 4.3 Instagram and Facebook: 4 before/after posts a month

Before posting a customer's home: written OK from the customer (a line in the SMS thread is
enough), no house numbers, number plates, faces or street signs in the photos.

Caption templates (fill the brackets):

**Före/efter (carousel, photo 1 = före, photo 2 = efter):**
> Före och efter: [tjänst] i [ort]. [En mening om vad som var fel, t.ex. Under de gamla pannorna fanns rötskadat virke.] [En mening om vad vi gjorde.] Fast pris, ROT-avdrag direkt på fakturan och 5 års garanti på hantverket. Kostnadsfritt hembesök: länk i bion.

**Det vi hittade (photo or short video from the demolition):**
> Det här ser man inte från marken. [Vad ni hittade, t.ex. fukt i råsponten runt skorstenen.] Därför börjar vi alltid med en besiktning innan vi lämnar pris. Funderar du på [tjänst]? Länk i bion.

**Process (Reel, 15–30 seconds, 3–5 clips):**
> Från [start] till [klart] på [antal] dagar. [Tjänst] i [ort], av vårt eget team. Vill du veta vad ditt projekt kostar? Länk i bion.

**Fråga och svar (text image or talking to camera):**
> "[Vanlig kundfråga, t.ex. Får man ROT-avdrag på material?]" Kort svar: [svar]. Hela genomgången finns i vår guide, länk i bion.

Hashtags (pick 6–10 per post; tag the town of the job):
`#byggfirma #byggfirmagöteborg #göteborg #renovering #renoveringgöteborg #föreochefter #takbyte
#plåttak #badrumsrenovering #köksrenovering #tillbyggnad #rotavdrag #hantverk #villarenovering
#halland #skåne #hyltebruk #helsingborg #binaafy`

Plan (uses the seven published projects; replace with new jobs as they finish):

| Month | Post 1 | Post 2 | Post 3 | Post 4 |
|---|---|---|---|---|
| 1 | Före/efter: takbyte med nytt underlagstak, Hyltebruk (`/bygg/projekt/takbyte-villa`) | Det vi hittade: rötskadat virke under pannorna (same project) | Före/efter: falsat plåttak i svart (`plattak-falsat`) | Fråga och svar: Får man ROT på material? |
| 2 | Före/efter: takbyte runt takfönster och skorsten | Process: fasad och ny takfot (`fasad-och-takfot`) | Före/efter: målning av lägenhet, Helsingborg | Fråga och svar: Vad kostar ett kök? (links the new guide) |
| 3 | Före/efter: uteplats i skiffer och nytt trädäck | Process: takbyte med solceller, Göteborg | Det vi hittade: rost runt skorstenen | Fråga och svar: Behöver jag bygglov för tillbyggnad? |

### 4.4 Numbers to check on the 1st of each month

Write them in one table (month in columns) so the trend is visible. Compare with last month, not
with other companies.

| Source | Where | Number |
|---|---|---|
| GA4 | Rapporter → Engagemang → Händelser | `generate_lead`, `contact_call`, `contact_whatsapp`: count last month |
| GA4 | Rapporter → Förvärv → Trafikförvärv | Sessions and key events per channel: Organic Search, Paid Search, Direct, Referral, Organic Social |
| GA4 | Rapporter → Engagemang → Landningssida | Top 10 landing pages by key events |
| /admin | Leads | Number of leads (the real number; GA4 misses visitors who declined cookies) |
| Search Console | Resultat → Sökresultat, last 28 days vs previous | Total clicks, impressions, average CTR, average position |
| Search Console | Same, filter Fråga innehåller "binaafy" | Brand clicks and impressions (shows whether the Benify autocorrect is easing) |
| Search Console | Same, filter Fråga innehåller "göteborg" | Clicks and position for the service + Göteborg queries |
| Search Console | Sidor tab, sort by impressions | Pages with many impressions but low CTR: rewrite their title and description |
| Search Console | Indexering → Sidor | Indexed vs not indexed; any new error type |
| Business Profile | Prestanda | Calls, website clicks, direction requests, searches that showed the profile |
| Business Profile | Recensioner | New reviews this month, average rating, all answered? |
| Google Ads | Kampanjer, last month | Cost, clicks, conversions (`generate_lead`) and cost per conversion per campaign |

---

## 5. The weekly 60 minutes (for Ibrahim)

Same slot every week, for example **Friday 15:00–16:00**, phone off, laptop open. If a step is
done early, move on; if the hour is over, stop.

| Minutes | What | Done when |
|---|---|---|
| 0–10 | **Reviews.** Check this week's finished jobs: everyone asked in person, SMS sent, 5-day reminder sent where due. Answer every new review (templates in 2.6). | Every finished customer asked, every review answered. |
| 10–25 | **Google Ads.** Search-term report: add negatives, add good terms as exact keywords. Check budgets, disapprovals, conversions vs. /admin leads (checklist 1.8, items 1–6). | No irrelevant terms left from this week. |
| 25–35 | **Business Profile.** Upload 2–3 new photos from this week's jobs. Answer new questions. Publish the planned post if it is due (4.2). | Photos up, nothing unanswered. |
| 35–45 | **Instagram and Facebook.** Publish or schedule this week's before/after post (4.3) in Meta Business Suite. | One post scheduled. |
| 45–55 | **One authority task** from section 3, in order: claim or correct one listing, or answer two questions on the Byggahus forum, or send one outreach message. | One target ticked off in the list. |
| 55–60 | **Write down the numbers:** leads this week (/admin), Ads conversions and cost, new reviews. | One line added to the tracking sheet. |

On the first Friday of the month, add 30 minutes for the monthly numbers (4.4) and the next guide's
outline (4.1).
