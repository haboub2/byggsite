# Kundportalen "Mitt projekt" — plan

Status: **version 2 byggd 2026-10-18.** Version 1 (2026-10-17) gav inloggning,
Översikt, Tidplan, Foton, Dokument och `/admin/projekt`. Version 2 lade till
fliken **Ändringar (ÄTA)** med Godkänn/Avböj, det orange märket på Översikt
och fliken, ÄTA-sektionen i `/admin/projekt/[id]` och mejlnotiserna (kund:
ny uppdatering, nytt dokument, ny ÄTA; admin: kunden svarade). **Tidplan 2.0
byggd 2026-10-19** (fas B i `kundportal-v3.md`, se avsnittet *Tidplan 2.0*
nedan): datum räknas fram ur startdatum och dagar per fas, förseningar och
ÄTA med tid flyttar slutdatumet med en orsak som kunden ser, och varje foto
hör till en fas och en dag. Kvar är punkt 4 under *Ordning*. Planen nedan är
uppdaterad för Vercel och för koden som finns i dag.

Var koden ligger: `supabase/migrations/0010_portal.sql`, `0012_timeline.sql`,
`lib/workdays.ts`, `lib/portal/*`,
`app/(portal)/mitt-projekt/*`, `app/admin/(dashboard)/projekt/*`,
`app/admin/portal-actions.ts`, `components/portal/*`, `components/admin/portal/*`,
`proxy.ts`. Migrationerna är omnumrerade: `0007` is_admin-fix, `0008` quotes,
`0009` cases, `0010` portal.

## Vad det är

En inloggad sida på **binaafy.se/mitt-projekt** där byggkunden följer sitt eget
projekt från accepterad offert till garanti. Byggd för mobilen först, eftersom
kunden oftast tittar i telefonen.

Den ersätter sms-trådar och "hur går det?"-samtal, och blir ett säljargument:
få byggfirmor i Göteborg har något liknande. För Software-sidan blir den ett
eget case: ett system i drift som kan säljas till andra byggföretag.

## Vad kunden ser

Fem flikar. På mobilen ligger de i en rad längst ner, som i en app. På datorn
ligger de i en meny till vänster.

| Flik | Innehåll |
|---|---|
| **Översikt** | Projektnamn och adress, vilken fas ni är i, ett förloppsfält, "Den här veckan", nästa steg och kontaktperson med knappar för att ringa eller sms:a. Ett orange märke visar om något väntar på kunden. |
| **Tidplan** | Faserna med datum, t.ex. Rivning, Tätskikt, Kakel, Slutbesiktning. Klara faser är bockade, den pågående markerad. Överst "Slut: 16 nov (ursprungligen 12 nov)" och en rad per förskjutning; en försening står på sin fas med orsaken ordagrant. En fas med foton fälls ut till sina dagar med miniatyrer och länkar till sin del av dokumentationen. |
| **Dokumentation** | *Dagbok*: korta uppdateringar med bilder och datum, nyaste överst. *Per fas*: samma innehåll ordnat fas → dag med sammanfattningar och bildtexter. Knappen *Ladda ner projektdokumentation (PDF)*, och efter låsningen *Ladda ner allt (zip)*. Se *Dokumentationen* nedan. |
| **Ändringar (ÄTA)** | Tilläggs- och ändringsarbeten med beskrivning, pris, hur ROT-avdraget påverkas och hur mycket längre projektet blir ("Förlänger projektet med ca 2 dagar"). Kunden trycker *Godkänn* eller *Avböj*; svaret sparas med namn och tidpunkt och blir ert skriftliga underlag. |
| **Dokument** | Offerten (PDF från offertverktyget), fakturor, ROT-underlag, våtrumsintyg, garantibevis, skötselråd, och den låsta projektdokumentationen. Samma PDF-knapp som under Dokumentation. |

Kunden ser bara sina egna projekt och kan inte ändra något utom att svara på ÄTA.

## Vad ni gör i /admin

Ny sida **/admin/projekt** (ny punkt i sidomenyn, `app/admin/(dashboard)/layout.tsx`):

1. Öppna en offert med status *Accepterad* och klicka **Skapa projekt**. Kund,
   adress, titel och belopp följer med från `quotes.data`.
2. **Bjud in kund** — fyll i e-postadress. Två ägare som delar ROT kan bjudas in
   båda. Inbjudan skapar kontot i Supabase Auth och mejlar en inloggningslänk.
3. Under bygget:
   - posta *Dagens uppdatering* med foton från mobilen (samma komprimering som
     `components/admin/ImageUpload.tsx`, längsta sida 2 400 px); fas och dag
     är ifyllda,
   - bocka av faser, eller lägga in en försening,
   - lägga till ÄTA och, när kunden godkänt, lägga in dem i tidplanen,
   - ladda upp dokument (PDF),
   - i efterhand, om det behövs: flytta foton, skriva bildtexter och sammanfattningar under *Dokumentation*.
4. Kunden får mejl när något nytt kommer. Ni får mejl när kunden svarar på en ÄTA.
5. När jobbet är klart: status *Klart*, skriv slutdokumentationen och tryck **Lås dokumentationen**.

## Tidplan 2.0

Byggd 2026-10-19 enligt avsnitt 1 i `kundportal-v3.md`, med de två besluten
tagna som rekommenderat: bara beräknade fasdatum (ingen manuell ändring per
fas), och kunden ser orsaken till en försening ordagrant.

**Kalendern** (`lib/workdays.ts`, testad i `lib/workdays.test.ts`): ren
TypeScript som körs både i webbläsaren och på servern. Varaktigheter är
arbetsdagar i halvdagar (0,5); internt räknas halvdagar, så två
halvdagsfaser delar en dag och 1,5 + 1 slutar mitt på dag två och fortsätter
samma eftermiddag. Helger och röda dagar hoppas över: nyårsdagen,
trettondedagen, långfredagen, påskafton, annandag påsk, första maj, Kristi
himmelsfärd, nationaldagen, midsommarafton, midsommardagen, alla helgons
dag, julafton, juldagen, annandag jul och nyårsafton (aftnarna räknas som
lediga i branschen). Påsken räknas fram med Meeus algoritm (gregoriansk). Växeln
*Vi jobbar lördagar* per projekt gör lördagar till arbetsdagar, utom en röd
lördag. Ett startdatum på en helg börjar nästa arbetsdag.

**Beräkningen** (`lib/portal/timeline.ts`, testad i `timeline.test.ts`):
`computeTimeline` lägger faserna i ordning från startdatum. En försening
lägger sina dagar på fasen den rapporterades på, så alla senare faser och
slutet flyttas. En ÄTA:s tid ligger i ÄTA:ns egen fas. Resultatet skrivs till
`project_phases.starts_on/ends_on` och `portal_projects.ends_on` av
`recomputeTimeline` i `lib/portal/store.ts` efter varje ändring, så sidor som
läser datumen fungerar som förut. Det ursprungliga slutet
(`planned_ends_on`) följer planen tills den första förskjutningen finns, och
står sedan still. Flyttas startdatumet flyttas det ursprungliga slutet lika
många arbetsdagar, eftersom det är en ny plan och inte en försening.

**I admin, `/admin/projekt/[id]`:**

- *Dagens uppdatering* ligger högst upp: foton, en rad, *Publicera*. Fasen
  är förvald som den som pågår i dag enligt kalendern, eller den första
  obockade om ni ligger efter; ett tryck på ett chip byter fas. Dagen är i
  dag och kan ändras om man postar i efterhand.
- *Tidplan*: startdatum, lördagsväxeln och en rad per fas med namn, dagar och
  de framräknade datumen, som uppdateras medan man skriver. Flytta upp/ner,
  ta bort och *Lägg till fas* görs lokalt och sparas med *Spara tidplan*.
  Bocken *Klar* och *Försening* sparas direkt och väntar därför tills
  tidplanen inte har osparade ändringar.
- *Försening…* på en fas: dagar och en orsak skriven för kunden, med
  förhandsvisning "Nytt beräknat slut: 14 nov (var 12 nov)" innan man sparar,
  och en kryssruta *Mejla kunden* (`portalNoticeMail`, sort `delay`, länk till
  Tidplan). Efteråt visar sidan det nya slutet och man kan godta det eller
  korta senare faser. *Ångra* tar bort en försening som lades in av misstag.
- ÄTA får fältet *Tid (arbetsdagar)*, 0 om tiden inte påverkas. När kunden
  godkänt en ÄTA med tid visas rutan "ÄTA 2 är godkänd (2 dagar). Lägg in i
  tidplanen efter: [fas]" med dagens fas förvald. *Lägg in* skapar en fas
  märkt med ÄTA:n (`project_phases.change_order_id`), flyttar resten och
  loggar en rad i `timeline_shifts` med orsaken "ÄTA 2: Extra eluttag,
  godkänd av kunden 21 okt". Fasen kan sedan flyttas som vilken fas som
  helst. Tas fasen bort försvinner raden och rutan kommer tillbaka.
- *Spara tidplanen som mall* sparar faserna (inte ÄTA-faserna) med sina dagar
  i `phase_templates`.

**Nytt projekt, `/admin/projekt/ny`:** varje accepterad offert har en
mallväljare, förvald efter offertens rubrik ("Badrumsrenovering" → Badrum),
och ett startdatum. De inbyggda mallarna ligger i
`lib/portal/phase-templates.ts` (Badrum, Kök, Tillbyggnad, Tak, Golv, Måleri,
El och VVS, Totalrenovering, Tom tidplan); egna mallar listas under och kan
tas bort.

**Påminnelsen, `/admin/projekt`:** rutan *Borde vara klart* listar faser i
pågående projekt som enligt kalendern skulle vara klara före i dag men inte
är bockade, med *Klar* (bockar direkt) och *Försening* (öppnar
förseningsrutan på projektet).

**Foton:** varje foto är en rad i `project_photos` med inläggets fas och dag
(`update_id` knyter det till inlägget). `project_updates` har fått `phase_id`
och `day`. Migrationen flyttar befintliga foton dit (fas tom, dag från
inlägget i svensk tid). Kolumnen `project_updates.photos` läses och skrivs
inte längre och togs bort i `0013` (fas C, se *Dokumentationen*).

**Migration `0012_timeline.sql`:** `portal_projects.planned_ends_on`,
`works_saturdays`; `project_phases.duration_days numeric(4,1)` (befintliga
faser får sina vardagar mellan start och slut) och `change_order_id` (unik,
så samma ÄTA inte kan läggas in två gånger); `change_orders.duration_days`;
tabellerna `phase_templates`, `timeline_shifts` och `project_photos`; check
på halvdagar; RLS som i `0010`: `is_admin()` för allt, medlemmar `select`
via `is_member()` (mallarna bara admin). Provkörd 2026-10-19 med alla
migrationer i ordning mot en tom Postgres med exempeldata från version 2.
**Inte körd mot produktion.**

## Dokumentationen

Byggd 2026-10-19 enligt avsnitt 2 i `kundportal-v3.md` (fas C). Varje projekt
får en dokumentation som byggs upp medan jobbet pågår, lämnas till kunden som
PDF när det är klart och sparas i arkivet. Personalens dagliga handling är
densamma: ta foton, skriv en rad, tryck *Publicera*. Allt annat är valfritt.

**Strukturen** (`lib/portal/documentation.ts`, ren och testad i
`documentation.test.ts`): `documentationTree` gör fas → dag → anteckningar och
foton av fotona i `project_photos` och inläggen i `project_updates`. Kapitlen
följer tidplanen; anteckningar utan fas (gamla inlägg, eller fasen togs bort)
hamnar sist som *Övrigt från bygget*. Ett inlägg utan text räknas inte som
anteckning. Samma träd används av admin, kundens *Per fas*, rapporten och zip-filen.

**I admin:**

- `/admin/projekt/[id]` har en ruta *Dokumentation* under dagens uppdatering:
  "Foton 6 av 8 dagar hittills", varningen "Tätskikt saknar foton", *Öppna
  dokumentationen* och *Visa PDF*.
- `/admin/projekt/[id]/dokumentation` är trädet. Varje fält sparar sig självt
  (bildtext och texter när man lämnar fältet, resten direkt) och skriver
  *Sparat*: bildtext, *Med i rapporten*, *Flytta* (fas och dag), *Ta bort*,
  dagens anteckning (text, fas, dag), fasens *Sammanfattning* och
  *Slutdokumentation*. Ett foto med bildtext blir en stor bild i rapporten,
  utan bildtext hamnar det i dagens rutnät med tre i bredd.
- **Lås dokumentationen** visas när projektet har status *Klart* (eller
  *Garantitid*): rapporten renderas en sista gång, sparas som dokument av typen
  *Projektdokumentation* (`report`) och `archived_at` sätts. Sedan är faser,
  dagar, foton och texter skrivskyddade (inga fält, ingen *Publicera*, tidplanen
  grå); dokument kan fortfarande läggas till, t.ex. en garantiåtgärd. Zip-filen
  byggs direkt efter svaret. *Lås upp* finns under en utfällbar rad om något
  blev fel; den låsta rapporten och zip-filen tas då bort och en ny görs vid
  nästa låsning. Ett låst projekt kan inte tas bort förrän det låsts upp.
- `/admin/projekt` visar per pågående projekt "Foton 6 av 8 dagar" (dagar
  hittills = arbetsdagar från start till i dag, plus dagar med foton utanför
  arbetstid) och "Tätskikt saknar foton". Fliken **Arkiv** listar låsta
  projekt med sök på kund, adress och projekt och ett års-filter; raden öppnar
  rapporten direkt.

**Kvalitet:** en fas kan kräva foto (`project_phases.photo_required`). De
inbyggda mallarna sätter det på *Tätskikt* och *El och VVS*, och en fas med
de namnen som läggs till för hand får det också (`photoRequiredByDefault`).
Kameraknappen på fasraden i tidplanen slår av och på. En sådan fas kan inte
bockas *Klar* utan minst ett foto: varken på projektet eller från *Borde vara
klart*-rutan, som då visar "Tätskikt saknar foton. Ladda upp minst ett foto
innan fasen bockas av …".

**Hos kunden:** fliken *Foton* heter **Dokumentation** och har två vyer:
*Dagbok* (som förut, nyast överst, nu med fasens namn) och *Per fas* (bara
faser och dagar med innehåll, fasens sammanfattning, bildtexter, och
slutdokumentationen sist). `/foton` skickar vidare dit, och mejlet om en ny
uppdatering länkar dit. Tidplanen har "Se fasens dokumentation →" på varje
fas med innehåll. Knappen **Ladda ner projektdokumentation (PDF)** finns i
Dokumentation och i Dokument: under bygget ger den "hittills", efter låsningen
den låsta filen. Efter låsningen finns också **Ladda ner allt (zip)**.

**Rapporten** (`lib/pdf/ReportPdf.tsx`, `lib/portal/report.tsx`): A4 i samma
utseende som offerten (Plus Jakarta Sans inbäddad, ligaturer av, sidhuvudet i
flödet). Försättsblad med det senaste fotot, innehållsförteckning med
klickbara kapitel och sidnummer, ett kapitel per fas (planerat och utfört
eller beräknat datum, längd, förseningar med orsak, ÄTA-ursprung,
sammanfattning, sedan dagarna med anteckningar, figurer och rutnät),
slutdokumentationen och bilagorna A (godkända ÄTA med pris, tid, vem och
när), B (dokumentlistan) och C (förskjutningar av slutdatumet). Ingen
marknadsföring. Foton skalas ner med sharp (figur längsta sida 1 200 px,
rutnät 800 × 600, kvalitet 62); originalen ligger kvar.

- Sidbrytningar: react-pdf klämmer ihop ett odelbart block som inte får plats
  i stället för att flytta det, och `render`-callbacks i flödande text förstör
  layouten. Därför renderas rapporten tills layouten står still (oftast två
  gånger): varje varv läser var allt hamnade (layouten från `Document`
  `onRender`), skriver sidnumren i innehållet och börjar ett kapitel eller en
  bilaga på ny sida om rubriken annars blev ensam längst ner.
- **Cachen:** filen sparas i bucketen som
  `projects/{id}/rapport-{fingeravtryck}.pdf`, där fingeravtrycket är en
  sha256 av allt rapporten skriver ut (`reportFingerprintSource`, plus
  `REPORT_VERSION`), och `portal_projects.report_hash` pekar ut den aktuella.
  Varje åtgärd som ändrar innehållet (inlägg, foto, text, tidplan, försening,
  ÄTA-svar, dokument) renderar om den efter svaret med Next `after()`, så den
  är klar när någon laddar ner. Saknas den eller är inaktuell renderas den en
  gång i nedladdningen och sparas. Fingeravtrycket i filnamnet gör att två
  renderingar samtidigt aldrig kan lämna en gammal PDF under ett nytt namn
  (planen sa `rapport.pdf`; det här är skälet till avvikelsen). Kundens
  nedladdning skriver cachen med service role, eftersom medlemmar bara får läsa.
  Höj `REPORT_VERSION` när layouten ändras.
- Nedladdning: `/mitt-projekt/[id]/dokumentation/pdf` och `/zip` för
  inloggade medlemmar (RLS avgör, som `/mitt-projekt/fil`), och
  `/admin/projekt/[id]/rapport` och `/rapport/zip` för admin. Med Supabase blir
  svaret en omdirigering till en signerad länk med filnamnet
  `Projektdokumentation-Badrumsrenovering.pdf`.
- **Zip-filen** (`lib/zip.ts`, testad): PDF:en plus originalfotona i mappar
  per fas och dag, t.ex. `02 Tätskikt/2026-10-20/01 Duschhörnan.jpg`, med
  UTF-8-namn så å, ä och ö överlever i Windows, macOS och Linux. Lagrad, inte
  komprimerad: JPEG och PDF blir inte mindre. Sparas som
  `projects/{id}/dokumentation.zip`.

**Migration `0013_documentation.sql`:** `project_phases.summary` och
`photo_required` (sätts på ej klara faser som heter Tätskikt eller El och
VVS), `portal_projects.final_summary`, `archived_at` (med index) och
`report_hash`; dokumenttypen `report` (kolumnen är fri text, kommentar
uppdaterad); `project_updates.photos` tas bort (läses och skrivs inte sedan
`0012`, som flyttade fotona). **Låset i databasen:** triggers på
`project_phases`, `project_updates` och `project_photos` vägrar insert,
update och delete när projektet har `archived_at`, och en trigger på
`portal_projects` vägrar ändrad `final_summary`; appen kontrollerar samma
sak först (`assertOpen` i `store.ts`). Att ta bort hela projektet kaskaderar
fortfarande. Inga nya tabeller, så RLS från `0010` gäller. Provkörd
2026-10-19 i PGlite med 0001–0013 i ordning, stubbad auth/storage och
exempeldata från fas B: kolumnerna, att `photos` försvinner, flaggan på
Tätskikt (inte på en redan klar El och VVS), att låset vägrar tio sorters
ändringar men släpper igenom dokument, status och `report_hash`, att ett
låst projekt kan tas bort och att upplåsning gör allt redigerbart igen.
**Inte körd mot produktion.**

**Demoläge:** exempelprojektet har anteckningar och nio foton i Uppstart,
Rivning och El och VVS (ritade med sharp första gången de visas,
`lib/portal/demo-photos.ts`), en sammanfattning på El och VVS, ett foto
utanför rapporten, och Tätskikt utan foto så att varningen syns. Rapporten,
låsningen och zip-filen fungerar mot `uploads/portal/` på disk.

## Utseende

Samma uttryck som sajten: antracit, orange och cream, Plus Jakarta Sans och
ritningsdetaljerna (`lib/tokens.css`). Mörkt sidhuvud med projektnamn, adress
och förloppsfält. Det som väntar på kunden markeras orange; allt annat är lugnt
och grått.

## Inloggning

Inget lösenord. Kunden fyller i e-post och får ett mejl med en **6-siffrig
engångskod och en länk** (Supabase Auth OTP, `signInWithOtp`).

- Koden finns med eftersom vissa mejlprogram öppnar länkar automatiskt för att
  kontrollera dem, och länken då är förbrukad innan kunden klickat.
- Kunden förblir inloggad i telefonen i ungefär en månad (Supabase refresh
  token; sätt sessionslängden i Supabase-dashboarden).
- **Bara inbjudna adresser kan logga in:** `shouldCreateUser: false` i
  `signInWithOtp`, och *Allow new users to sign up* avstängt i Supabase →
  Authentication. En okänd adress får ingen kod. Konton skapas enbart av
  *Bjud in kund* via service role (`lib/supabase/admin.ts`).
- Admin-inloggningen (`/admin/login`, lösenord) ändras inte.
- BankID kan läggas till senare via Criipto eller Signicat. Det kostar per
  inloggning och är mest värt det för att signera ÄTA och avtal.

## Säkerhet

- **RLS:** kunden läser bara rader där hen finns i `project_members`. Admins
  ser allt via `is_admin()`, som i dag.
- **Kunder kommer aldrig in i /admin.** I dag släpper `proxy.ts` in alla
  inloggade på `/admin/*` och bara `checkAdmin()` i layouten stoppar dem. När
  kunder får konton måste proxyn också slå upp `admins`-tabellen och skicka
  icke-admins till `/mitt-projekt`. Omvänt kräver `/mitt-projekt/*` bara en
  session.
- **Foton och dokument i en privat bucket** (`portal`, `public = false`).
  Visas via signerade länkar som går ut efter kort tid (t.ex. 1 timme), till
  skillnad från den publika `gallery`-bucketen.
- Inga personnummer i portalen. ROT-uppgifterna stannar i offert och faktura.

## Kod och databas

### Migrationer

**`supabase/migrations/0010_portal.sql`** (de två som hette `0007_*` är
omnumrerade till `0007` och `0008`, cases till `0009`):

| Tabell | Innehåll |
|---|---|
| `portal_projects` | `quote_id → quotes`, titel, adress, kund-namn, aktuell fas, start, slut, kontaktperson (namn, telefon), "den här veckan"-text, status (`active`/`done`/`warranty`); `final_summary`, `archived_at`, `report_hash` (`0013`) |
| `project_members` | `project_id`, `user_id → auth.users`, e-post, namn, inbjuden när |
| `project_phases` | `project_id`, namn, sort, start/slut (räknas fram), `duration_days`, `change_order_id`, `done_at`, `summary` och `photo_required` (`0013`) |
| `project_updates` | `project_id`, text, `phase_id`, `day`, skapad av, skapad när (fotona i `project_photos` sedan `0012`) |
| `change_orders` | `project_id`, löpnummer, titel, beskrivning, belopp, arbetskostnad (för ROT), `duration_days`, status (`pending`/`approved`/`declined`), svarat av (`user_id`, namn), svarat när |
| `timeline_shifts` (`0012`) | `project_id`, sort (`delay`/`change_order`), fas, `change_order_id`, dagar, orsak för kunden, skapad när och av |
| `project_photos` (`0012`) | `project_id`, `phase_id`, `update_id`, dag, sökväg, bildtext, `in_report`, sort, skapad av |
| `phase_templates` (`0012`) | namn, jobbtyp, faser med dagar (`jsonb`) |
| `project_documents` | `project_id`, typ (`quote`/`invoice`/`rot`/`certificate`/`warranty`/`care`/`report`/`other`), titel, sökväg i bucket, uppladdad när |

RLS: `is_admin()` för allt, plus `select` för medlemmar via
`exists(select 1 from project_members m where m.project_id = X.project_id and m.user_id = auth.uid())`.
Medlemmar får `update` på `change_orders` begränsat till status/svar-kolumnerna
(hanteras enklast i en server action med service role, med kontroll av medlemskap).

Bucket `portal` med policies: admin läser/skriver allt; medlem läser objekt
under `projects/{project_id}/` om hen är medlem.

### Sidor

- Kund: `app/(portal)/mitt-projekt/` — `page.tsx` (lista om flera projekt,
  annars redirect till det enda), `login/page.tsx`, `[id]/` med `layout.tsx`
  (sidhuvud + flikar) och en route per flik: `page.tsx` (Översikt),
  `tidplan/`, `dokumentation/` (med `pdf/` och `zip/`; `foton/` skickar vidare), `andringar/`, `dokument/`.
- Admin: `app/admin/(dashboard)/projekt/` — `page.tsx` (lista),
  `ny/page.tsx` (från offert), `[id]/page.tsx` (redigera, uppdateringar, ÄTA,
  dokument, medlemmar), `[id]/dokumentation/page.tsx` och `[id]/rapport/`
  (PDF och zip). Dokumentationens åtgärder i `app/admin/documentation-actions.ts`.
- Server actions: `app/admin/portal-actions.ts` (admin) och
  `app/(portal)/portal-actions.ts` (inloggning och kundens ÄTA-svar). Svaret
  skrivs med service role i `answerChangeOrder` (`lib/portal/store.ts`) efter
  kontroll av medlemskap; bara en `pending` ÄTA kan besvaras, och bara en gång.
  ROT-effekten räknas i `changeOrderRot` (30 % av arbetsdelen, `lib/rot.ts`).
- Datalager: `lib/portal/schema.ts` (zod), `lib/portal/store.ts` med demoläge
  som `lib/quotes/store.ts`.
- Mejl i `lib/mail.ts`: `portalAddedMail` (befintligt konto lades till),
  `portalNoticeMail` (kund: ny uppdatering, nytt dokument, ny ÄTA — ett mejl
  per medlem med länk till rätt flik; kräver `MAIL_FROM`) och
  `changeOrderAnsweredMail` (till `MAIL_TO`, annars företagets adress, när
  kunden svarat). Inget mejlfel får fälla själva åtgärden: funktionerna loggar
  och går vidare.
- Uppladdning: `app/admin/upload/route.ts` utökas med bucket `portal` och
  mappen `projects/{id}`; dokument-PDF:er samma väg.

### Vercel

- Inget i planen är knutet till Netlify. Allt är Next.js + Supabase + Resend.
- Vercel begränsar en request till ca 4,5 MB. Foton komprimeras redan i
  webbläsaren innan de skickas, så det räcker. Dokument-PDF:er bör hållas under
  samma gräns, annars laddas de upp direkt till Supabase Storage från klienten
  med en signerad upload-URL.
- Miljövariabler som redan finns räcker (`NEXT_PUBLIC_SUPABASE_*`,
  `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `MAIL_FROM`). Nytt:
  `NEXT_PUBLIC_SITE_URL` måste vara satt till `https://binaafy.se` för att
  inloggningslänkarna i mejlen ska peka rätt (Supabase → Authentication → URL
  configuration: lägg till `https://binaafy.se/mitt-projekt/**` som redirect).
- **Vercels gratisplan (Hobby) tillåter bara icke-kommersiellt bruk.** Sajten
  är kommersiell, så Pro (ca 20 USD/mån) behövs oavsett portalen.

### Gratisplaner som räcker

- Supabase: 50 000 aktiva inloggade användare/mån, 1 GB lagring (≈ 3 000
  komprimerade foton), 500 MB databas.
- Resend: 100 mejl/dag, 3 000/mån.

### Demoläge

Som resten av admin: utan `NEXT_PUBLIC_SUPABASE_URL` körs allt mot exempeldata
i minnet (`lib/portal/store.ts`), så portalen kan byggas och visas lokalt.
Kundinloggningen i demoläge: vilken e-post som helst släpps in till ett
exempelprojekt.

## Ordning

1. **Version 1:** migration + bucket, proxy-ändringen, inloggning med kod,
   Översikt, Tidplan, Foton, Dokument, och `/admin/projekt` med skapa från
   offert, bjud in, uppdateringar, faser, dokument.
2. **Version 2 (klar 2026-10-18):** ÄTA med godkännande, mejlnotiser till
   kund och admin.
3. **Tidplan 2.0 (klar 2026-10-19, fas B i `kundportal-v3.md`):**
   arbetsdagskalender, varaktigheter, mallar, förseningar, ÄTA med tid,
   påminnelser, kundens tidplan och foton per fas och dag. Migration `0012`.
4. **Dokumentationen (klar 2026-10-19, fas C):** trädet fas → dag → foton i
   admin, kundens Dokumentation-flik, rapport-PDF med cache, låsning, zip,
   arkiv och fotokrav. Migration `0013`.
5. **Senare:** felanmälan under garantitiden (med foto), betalplan och
   fakturastatus, BankID-signering, Software-variant (etapper och leveranser
   i stället för byggfaser).

## Innan bygget kan gå live

- Supabase-projektet måste finnas i produktion med migrationer körda (kolla
  i Vercel → Environment Variables att `NEXT_PUBLIC_SUPABASE_URL` är satt).
- `MAIL_FROM` måste vara en verifierad avsändare i Resend, annars går inga
  inbjudningar ut (se `setup-forms.md`).
- Supabase e-postmallen för *Magic Link* ändras så att både `{{ .Token }}`
  (koden) och `{{ .ConfirmationURL }}` (länken) finns med, på svenska.
