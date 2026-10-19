# Kundportalen version 3 — tidplan, dokumentation, kalkyl och faktura

Status: **plan, skriven 2026-10-19. Inget är byggt än.** Version 1 och 2 av
portalen beskrivs i `kundportal.md`. Det här dokumentet samlar ägarnas idéer
från oktober 2026 och gör dem till en byggordning.

## Princip för personalen

Det enda som ska göras varje dag är: ta foton, skriv en rad, tryck *Publicera*,
från mobilen. Fas, datum, förlopp, förseningar och slutrapporten ska räknas
fram ur den handlingen plus några siffror som anges en gång när projektet
startar. Inget ska kräva två verktyg eller en administrationsstund i veckan.

## Vad som finns i dag

| Idé | Läge |
|---|---|
| Kontaktformuläret mejlar | Byggt. `lib/lead-handler.ts` anropar `notify()` i `lib/mail.ts` som mejlar via Resend. Kräver bara `RESEND_API_KEY` och `MAIL_TO` i Vercel och ett test. Konfiguration, inte kod. |
| Kalkylen "ingen giltig offert" | `components/RotCalculator.tsx` har en text om skatten men ingen mening om att det inte är en offert. Liten textändring. |
| Tidplan | `project_phases` med manuellt skrivna start- och slutdatum och en *Klar*-bock. Förloppet räknas på bockade faser. Inga varaktigheter, mallar eller förseningar. |
| Foton | `project_updates` med text och foton, inte kopplade till fas eller dag. |
| Dokumentation | Inget utöver dagboken och fliken Dokument. |
| Kundtyper och moms | Offerten har *privat* och *företag*, ROT bara för privat på Bygg, växel inkl./exkl. moms. Ingen typ för byggföretag, ingen faktura alls. |

## 1. Tidplan 2.0

Grunden som dokumentationen hänger på, så den byggs först.

**Indata vid projektstart:** startdatum, en mall, och en varaktighet per fas i
arbetsdagar med halva dagar (0,5). Datumen räknas fram, de skrivs aldrig.

- Internt räknas allt i halvdagar, så två halvdagsfaser kan dela en dag.
  Helger och svenska röda dagar hoppas över (`lib/workdays.ts`, med en lista
  över röda dagar i kod). En växel per projekt tillåter lördagar.
- Kolumnerna `starts_on` och `ends_on` på faserna behålls men fylls i från
  beräkningen, så portalens sidor fungerar oförändrade. Nytt på fasen:
  `duration_days numeric(4,1)`. Nytt på projektet: `planned_ends_on` (det
  ursprungliga slutet) och `works_saturdays`.
- **Mallar:** en faslista med standardvaraktigheter per jobbtyp (Badrum, Kök,
  Tillbyggnad, Tak …). Inbyggda mallar ligger i kod som offertmallarna
  (`lib/quotes/templates.ts`), och ett projekts faser kan sparas som egen mall
  i en tabell `phase_templates`. Mallen väljs när projektet skapas från
  offerten.
- **Förskjutningar, två orsaker.** Slutdatumet kan bara flyttas av två saker:
  en försening eller en godkänd ÄTA. Båda sparas i tabellen
  **`timeline_shifts`**: projekt, sort (`delay` eller `change_order`), fas
  den hänger på, `change_order_id` (vid ÄTA), dagar (0,5-steg), orsak skriven
  för kunden, datum, skapad av. Det ursprungliga slutet behålls i
  `planned_ends_on`, så kunden alltid ser "Slut: 16 nov (ursprungligen
  12 nov)" med en rad per förskjutning: "+2 dagar, ÄTA 2 godkänd 21 okt",
  "+1 dag, kakelleverans försenad". Samma lista visas i rapporten.
- **Försening:** knappen *Försening* på en fas frågar efter dagar och orsak.
  Alla senare faser flyttas och det beräknade slutet flyttas. Admin ser
  "Nytt beräknat slut: 14 nov (var 12 nov)" och kan antingen godta det eller
  korta senare faser. En kryssruta mejlar kunden (`portalNoticeMail`, ny
  sort `delay`). Kundens Tidplan visar notisen på fasen.
- **ÄTA som tar tid:** när ni skriver en ÄTA anger ni, utöver pris, hur många
  dagar den tar (`change_orders.duration_days`, 0,5-steg, 0 om den inte
  påverkar tiden). Kunden ser det på ÄTA-kortet innan hen svarar:
  "Förlänger projektet med ca 2 dagar". När kunden godkänner ändras inget
  automatiskt. Ni får mejlet som i dag, öppnar projektet och ser rutan
  "ÄTA 2 är godkänd (2 dagar). Lägg in i tidplanen efter: [fas]" med den
  pågående fasen förvald och en knapp *Lägg in*. Då skapas en ny fas i
  tidplanen märkt ÄTA (`project_phases.change_order_id`), alla senare faser
  flyttas, slutdatumet flyttas och en rad läggs i `timeline_shifts` med
  orsaken "ÄTA 2: Extra eluttag, godkänd av kunden 21 okt". Fasen kan sedan
  flyttas upp eller ner som vilken fas som helst, och får foton och dagar i
  dokumentationen som ett eget kapitel. Avböjd ÄTA eller 0 dagar: inget
  händer med tidplanen.
- **Påminnelse för personalen:** listan `/admin/projekt` flaggar faser som
  borde ha varit klara, med två knappar: *Klar* eller *Försening*. Det
  ersätter att komma ihåg att uppdatera.
- **Foton per fas och dag:** varje foto hör till exakt en fas och en dag, se
  avsnitt 2. Kundens Tidplan fäller ut en fas till dess dagar med miniatyrer.
  Ingen gräns per dag. Gränsen på 20 foton per inlägg behålls för att
  uppladdningen ska vara pålitlig; det går bra att posta två gånger.

## 2. Dokumentationssystemet

Varje projekt får en egen dokumentation som byggs upp medan jobbet pågår,
lämnas till kunden när det är klart och sparas i arkivet. Den ersätter
dagboken som idé: dagboken blir bara det sätt som dokumentationen fylls på.

### Struktur

```
Projekt (försättsblad: kund, adress, offert, start, slut)
├── Fas 1  Rivning            ← kapitel, ett per fas i tidplanen
│   ├── Sammanfattning          (skrivs av er, valfri)
│   ├── Dag 2026-10-20          ← avsnitt, en per arbetsdag med innehåll
│   │   ├── Foto, foto, foto    (obegränsat, med valfri bildtext)
│   │   └── Dagens anteckning   (valfri)
│   └── Dag 2026-10-21 …
├── Fas 2  Tätskikt …
├── Slutdokumentation           (er text om det färdiga resultatet)
└── Bilagor
    ├── Godkända ÄTA (pris, tid, vem som godkände och när)
    ├── Intyg, garantibevis, skötselråd (fliken Dokument)
    └── Förskjutningar av slutdatumet med orsak (förseningar och ÄTA)
```

Fas och dag är inte fria rubriker utan kommer från tidplanen. Därför måste
avsnitt 1 byggas först.

### Datamodell

- Ny tabell **`project_photos`**: `project_id`, `phase_id`, `day` (datum),
  `path` i bucketen, `caption` (valfri), `taken_at`, `sort`, `in_report`
  (på som standard), `created_by`. Ett foto, en rad, en fas, en dag.
- **`project_updates`** får `phase_id` och `day` och blir dagens anteckning.
  Kolumnen `photos text[]` fylls över till `project_photos` (fas tom, dag
  från `created_at`) och tas bort när portalen läser den nya tabellen.
- **`project_phases`** får `summary` (kapitlets inledning) och
  `photo_required` (se *Kvalitet* nedan).
- **`portal_projects`** får `final_summary` och `archived_at`.
- Dokument får en ny sort `report` för den låsta rapporten.

### Så fylls den, personalen

Samma knapp som i dag, *Ny uppdatering* från mobilen, men:

1. Fas och dag är förifyllda: dagens datum, och den fas som kalendern säger
   pågår i dag (eller den första obockade om ni ligger efter). Ett chip-val
   byter fas med ett tryck. Inget annat att fylla i.
2. Foton laddas upp som i dag och blir rader i `project_photos` med inläggets
   fas och dag. Texten blir dagens anteckning.
3. Allt annat är valfritt och görs i efterhand i admin under en ny flik
   **Dokumentation** på projektet: trädet fas → dag → foton. Där kan ni flytta
   ett foto till rätt fas eller dag om det hamnade fel, skriva bildtext,
   bocka ur *ta med i rapporten*, skriva fasens sammanfattning och
   slutdokumentationen. Ett foto med bildtext blir en figur i rapporten; utan
   bildtext hamnar det i dagens bildrutnät.

### Så ser kunden den

- Fliken **Foton** byter namn till **Dokumentation** och får två vyer:
  *Dagbok* (som i dag, nyast överst) och *Per fas* (trädet ovan, bara faser
  och dagar som har innehåll). Tidplanen länkar från varje fas till dess del
  av dokumentationen.
- Knappen **Ladda ner projektdokumentation (PDF)** finns i Dokumentation och
  i Dokument. Under bygget ger den "hittills"; efter låsning ger den den
  låsta filen.

### Rapporten (PDF)

- Byggs med `@react-pdf/renderer` som offerten: `lib/pdf/ReportPdf.tsx`.
  Försättsblad, innehållsförteckning med ett kapitel per fas, kapitlets
  datum (planerat och faktiskt, förseningar), sammanfattning, sedan dagarna
  i ordning med anteckning, foton och bildtexter. Sist slutdokumentationen
  och bilagorna.
- Fotona skalas ner till rapportstorlek (längsta sida ca 1 200 px) och
  filen cachas i bucketen under `projects/{id}/rapport.pdf` och genereras om
  när något ändrats. Den byggs därför aldrig inne i en enda långsam request
  på Vercel. Originalen på 2 400 px ligger kvar i bucketen.
- Nedladdning via en route som kontrollerar medlemskap, som
  `/mitt-projekt/fil`.

### Arkivet

- När projektet sätts till *Klart* trycker admin **Lås dokumentationen**:
  rapporten genereras en sista gång, sparas som dokument av sorten `report`,
  och `archived_at` sätts. Efter det är fas, dag, foton och texter
  skrivskyddade i admin; bilagor kan fortfarande läggas till (till exempel
  en garantiåtgärd under garantitiden).
- **Överlämning till kund:** PDF:en i portalen, och en knapp *Ladda ner allt
  (zip)* med PDF:en plus originalfotona i mappar per fas och dag, för kunder
  som vill ha det på egen disk. Kunden behåller portalinloggningen under
  garantitiden (status `warranty`).
- **Arkiv i admin:** `/admin/projekt` får filtret *Arkiv* med sök på kund,
  adress och år, och varje rad öppnar rapporten direkt. Gallring: spara minst
  tio år, eftersom konsumenttjänstlagen ger kunden tio år att reklamera
  arbete på fast egendom. Supabase lagring räcker länge; en zip-export per
  projekt gör det enkelt att flytta till annan lagring senare.

### Kvalitet

- En fas i en mall kan märkas `photo_required`, till exempel *Tätskikt* och
  *El och VVS* där foton före inklädnad är ert bevis vid garantiärenden.
  Fasen kan då inte bockas *Klar* utan minst ett foto, och projektlistan
  visar "Tätskikt saknar foton".
- Översikten i admin visar per projekt hur många dagar som har foton av
  dagarna hittills, så att en tunn dokumentation syns i tid och inte vid
  slutbesiktningen.

## 3. Kalkylen

Lägg till "Räkneexempel, inte en offert" under resultatet i kalkylen och
intill från-priserna i `components/Pricing.tsx`. Snabb vinst.

## 4. Kontaktformuläret

Sätt nycklarna, verifiera domänen, skicka ett test (se `setup-forms.md`).
Ingen kod om inte mejlet ska gå någon annanstans än `MAIL_TO`.

## 5. Kundtyper, moms och faktura

Tre typer på offert och faktura: **privat**, **företag**, **byggföretag**.

| Typ | ROT | Visning |
|---|---|---|
| Privat | Ja, 30 % av arbetet | Priser inkl. moms, ROT-rad, *Att betala*, liten rad "varav moms". |
| Företag | Nej | Priser exkl. moms, summor exkl., momsrad, liten rad "inkl. moms". |
| Byggföretag | Nej | Omvänd betalningsskyldighet, se nedan. |

**Byggföretag, kontrollerat mot Skatteverket 2026-10-19.** Omvänd
betalningsskyldighet gäller när ni säljer byggtjänster i Sverige till en
köpare som mer än tillfälligt själv säljer byggtjänster, eller till en
mellanhand som säljer vidare till ett sådant företag. Innehåller byggtjänsten
material räknas hela leveransen som byggtjänst, så **ingen moms debiteras
alls, inte heller på materialet.** Bara ren varuförsäljning, eller vara med
obetydlig montering som en spis eller ett kylskåp, får vanlig moms. Fakturan
ska vara utan moms, ange köparens momsregistreringsnummer och texten
"Omvänd betalningsskyldighet". Ni drar fortfarande av ingående moms på
materialet ni köpt. Privatpersoner och företag utanför byggsektorn får
alltid moms, oavsett var arbetet utförs. Källa:
[Skatteverket, omvänd betalningsskyldighet inom byggsektorn](https://www.skatteverket.se/foretag/moms/sarskildamomsregler/byggverksamhet/omvandbetalningsskyldighetinombyggsektorn).

**Vad en fullständig faktura måste innehålla enligt momslagen** (källa:
[Skatteverket, momslagens regler om fakturering](https://www.skatteverket.se/foretag/moms/saljavarorochtjanster/momslagensregleromfakturering)):

1. Datum för utfärdandet.
2. Ett unikt löpnummer ur en eller flera serier (egen serie, skild från
   offertnumren).
3. Säljarens momsregistreringsnummer.
4. Köparens momsregistreringsnummer vid omvänd betalningsskyldighet.
5. Säljarens och köparens namn och adress.
6. Tjänsternas omfattning och art, varornas mängd och art.
7. Datum då tjänsten utförts eller slutförts, eller datum för a conto, om det
   skiljer sig från fakturadatumet.
8. Beskattningsunderlag per momssats, enhetspris exkl. moms, rabatter.
9. Tillämpad momssats.
10. Momsbelopp att betala. Vid omvänd betalningsskyldighet i stället texten
    "Omvänd betalningsskyldighet" och inget momsbelopp.

**Utöver lagkraven, för att se professionell ut och få betalt i tid:**
förfallodatum, org.nr, uppgift om godkänd F-skatt, bankgiro och OCR eller
fakturanummer som referens, er och kundens referens, betalningsvillkor och
dröjsmålsränta, hänvisning till offertnummer och godkända ÄTA. Förenklad
faktura är tillåten bara under 4 000 kr inkl. moms, så alla era fakturor är
fullständiga.

**För ROT (privatpersoner):** arbetet särredovisat från material, avdraget
visat som en rad, kundens personnummer och fastighetsbeteckning eller
bostadsrättsförenings org.nr och lägenhetsnummer, vilket Skatteverket kräver
för er begäran om utbetalning. Dessa uppgifter står på fakturan, aldrig i
portalen. Delfakturor mot en betalplan och en slutfaktura som tar med
godkända ÄTA.

**Det stora beslutet först:** fakturera från det här systemet, eller från
Fortnox eller Bokio? Många små firmor fakturerar från bokföringsprogrammet
eftersom det också skickar ROT-begäran till Skatteverket. Med Fortnox bygger
vi bara en export, och portalen visar status. Här blir det planens största
del.

## Ordning

| Fas | Innehåll | Ungefärlig tid |
|---|---|---|
| A, snabba vinster | Kalkyltexten, mejlkonfiguration och test, privat kontra företag på offert-PDF:en. **Kod klar 2026-10-19**; mejlnycklarna i Vercel och ett skarpt test återstår. | 1 dag |
| B, Tidplan 2.0 | Arbetsdagskalender, varaktigheter, mallar, förseningar, ÄTA med tid som läggs in i tidplanen, påminnelser, kundens tidplan, och `project_photos` med fas och dag på varje foto. Migration `0012`. | 1,5 vecka |
| C, Dokumentation | Fliken Dokumentation i admin och portal, bildtexter, sammanfattningar, rapport-PDF, låsning, zip-överlämning, arkivfilter. Migration `0013`. | 1,5 vecka |
| D, Faktura | Egen fakturering som produktkärna, se `fakturering.md` (version 2) | se den planen |

## Beslut som väntar

Rekommendationen står först.

1. Faktura här eller via Fortnox/Bokio? Rekommendation: bestäm efter samtal
   med redovisningskonsulten; bygg A till C under tiden. Momsreglerna ovan
   gäller oavsett var fakturan skrivs.
2. Bara beräknade fasdatum, eller behålla manuell ändring per fas?
   Rekommendation: bara beräknade, lägg till *lås startdatum* för leveranser
   senare.
3. Ser kunden orsaken till en försening ordagrant? Rekommendation: ja,
   personalen skriver orsaken för kunden.
4. Ska rapporten ta med ÄTA? Rekommendation: ja, som bilaga.
5. Får kunden ladda ner originalfotona (zip), eller bara PDF:en?
   Rekommendation: båda; fotona är kundens bevis lika mycket som ert.
