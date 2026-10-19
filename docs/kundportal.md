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
| **Tidplan** | Faserna med datum, t.ex. Rivning, Tätskikt, Kakel, Slutbesiktning. Klara faser är bockade, den pågående markerad. Överst "Slut: 16 nov (ursprungligen 12 nov)" och en rad per förskjutning; en försening står på sin fas med orsaken ordagrant. En fas med foton fälls ut till sina dagar med miniatyrer. |
| **Foton** | En dagbok: korta uppdateringar från er med bilder och datum, nyaste överst. |
| **Ändringar (ÄTA)** | Tilläggs- och ändringsarbeten med beskrivning, pris, hur ROT-avdraget påverkas och hur mycket längre projektet blir ("Förlänger projektet med ca 2 dagar"). Kunden trycker *Godkänn* eller *Avböj*; svaret sparas med namn och tidpunkt och blir ert skriftliga underlag. |
| **Dokument** | Offerten (PDF från offertverktyget), fakturor, ROT-underlag, våtrumsintyg, garantibevis, skötselråd. |

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
   - ladda upp dokument (PDF).
4. Kunden får mejl när något nytt kommer. Ni får mejl när kunden svarar på en ÄTA.

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
inte längre och tas bort i `0013`.

**Migration `0012_timeline.sql`:** `portal_projects.planned_ends_on`,
`works_saturdays`; `project_phases.duration_days numeric(4,1)` (befintliga
faser får sina vardagar mellan start och slut) och `change_order_id` (unik,
så samma ÄTA inte kan läggas in två gånger); `change_orders.duration_days`;
tabellerna `phase_templates`, `timeline_shifts` och `project_photos`; check
på halvdagar; RLS som i `0010`: `is_admin()` för allt, medlemmar `select`
via `is_member()` (mallarna bara admin). Provkörd 2026-10-19 med alla
migrationer i ordning mot en tom Postgres med exempeldata från version 2.
**Inte körd mot produktion.**

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
| `portal_projects` | `quote_id → quotes`, titel, adress, kund-namn, aktuell fas, start, slut, kontaktperson (namn, telefon), "den här veckan"-text, status (`active`/`done`/`warranty`) |
| `project_members` | `project_id`, `user_id → auth.users`, e-post, namn, inbjuden när |
| `project_phases` | `project_id`, namn, sort, start/slut (räknas fram), `duration_days`, `change_order_id`, `done_at` |
| `project_updates` | `project_id`, text, `phase_id`, `day`, skapad av, skapad när (fotona i `project_photos` sedan `0012`) |
| `change_orders` | `project_id`, löpnummer, titel, beskrivning, belopp, arbetskostnad (för ROT), `duration_days`, status (`pending`/`approved`/`declined`), svarat av (`user_id`, namn), svarat när |
| `timeline_shifts` (`0012`) | `project_id`, sort (`delay`/`change_order`), fas, `change_order_id`, dagar, orsak för kunden, skapad när och av |
| `project_photos` (`0012`) | `project_id`, `phase_id`, `update_id`, dag, sökväg, bildtext, `in_report`, sort, skapad av |
| `phase_templates` (`0012`) | namn, jobbtyp, faser med dagar (`jsonb`) |
| `project_documents` | `project_id`, typ (`quote`/`invoice`/`rot`/`certificate`/`warranty`/`care`/`other`), titel, sökväg i bucket, uppladdad när |

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
  `tidplan/`, `foton/`, `andringar/`, `dokument/`.
- Admin: `app/admin/(dashboard)/projekt/` — `page.tsx` (lista),
  `ny/page.tsx` (från offert), `[id]/page.tsx` (redigera, uppdateringar, ÄTA,
  dokument, medlemmar).
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
4. **Senare:** felanmälan under garantitiden (med foto), betalplan och
   fakturastatus, BankID-signering, Software-variant (etapper och leveranser
   i stället för byggfaser).

## Innan bygget kan gå live

- Supabase-projektet måste finnas i produktion med migrationer körda (kolla
  i Vercel → Environment Variables att `NEXT_PUBLIC_SUPABASE_URL` är satt).
- `MAIL_FROM` måste vara en verifierad avsändare i Resend, annars går inga
  inbjudningar ut (se `setup-forms.md`).
- Supabase e-postmallen för *Magic Link* ändras så att både `{{ .Token }}`
  (koden) och `{{ .ConfirmationURL }}` (länken) finns med, på svenska.
