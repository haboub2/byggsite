# Kundportalen "Mitt projekt" — plan

Status: **version 2 byggd 2026-10-18.** Version 1 (2026-10-17) gav inloggning,
Översikt, Tidplan, Foton, Dokument och `/admin/projekt`. Version 2 lade till
fliken **Ändringar (ÄTA)** med Godkänn/Avböj, det orange märket på Översikt
och fliken, ÄTA-sektionen i `/admin/projekt/[id]` och mejlnotiserna (kund:
ny uppdatering, nytt dokument, ny ÄTA; admin: kunden svarade). Kvar är punkt 3
under *Ordning*. Planen nedan är uppdaterad för Vercel och för koden som finns
i dag.

Var koden ligger: `supabase/migrations/0010_portal.sql`, `lib/portal/*`,
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
| **Tidplan** | Faserna med datum, t.ex. Rivning, Tätskikt, Kakel, Slutbesiktning. Klara faser är bockade, den pågående markerad. |
| **Foton** | En dagbok: korta uppdateringar från er med bilder och datum, nyaste överst. |
| **Ändringar (ÄTA)** | Tilläggs- och ändringsarbeten med beskrivning, pris och hur ROT-avdraget påverkas. Kunden trycker *Godkänn* eller *Avböj*; svaret sparas med namn och tidpunkt och blir ert skriftliga underlag. |
| **Dokument** | Offerten (PDF från offertverktyget), fakturor, ROT-underlag, våtrumsintyg, garantibevis, skötselråd. |

Kunden ser bara sina egna projekt och kan inte ändra något utom att svara på ÄTA.

## Vad ni gör i /admin

Ny sida **/admin/projekt** (ny punkt i sidomenyn, `app/admin/(dashboard)/layout.tsx`):

1. Öppna en offert med status *Accepterad* och klicka **Skapa projekt**. Kund,
   adress, titel och belopp följer med från `quotes.data`.
2. **Bjud in kund** — fyll i e-postadress. Två ägare som delar ROT kan bjudas in
   båda. Inbjudan skapar kontot i Supabase Auth och mejlar en inloggningslänk.
3. Under bygget:
   - posta uppdateringar med foton från mobilen (samma komprimering som
     `components/admin/ImageUpload.tsx`, längsta sida 2 400 px),
   - flytta faser och sätta datum,
   - lägga till ÄTA,
   - ladda upp dokument (PDF).
4. Kunden får mejl när något nytt kommer. Ni får mejl när kunden svarar på en ÄTA.

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
| `project_phases` | `project_id`, namn, sort, planerat start/slut, `done_at` |
| `project_updates` | `project_id`, text, bildsökvägar (`text[]`), skapad av, skapad när |
| `change_orders` | `project_id`, löpnummer, titel, beskrivning, belopp, arbetskostnad (för ROT), status (`pending`/`approved`/`declined`), svarat av (`user_id`, namn), svarat när |
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
3. **Senare:** felanmälan under garantitiden (med foto), betalplan och
   fakturastatus, BankID-signering, Software-variant (etapper och leveranser
   i stället för byggfaser).

## Innan bygget kan gå live

- Supabase-projektet måste finnas i produktion med migrationer körda (kolla
  i Vercel → Environment Variables att `NEXT_PUBLIC_SUPABASE_URL` är satt).
- `MAIL_FROM` måste vara en verifierad avsändare i Resend, annars går inga
  inbjudningar ut (se `setup-forms.md`).
- Supabase e-postmallen för *Magic Link* ändras så att både `{{ .Token }}`
  (koden) och `{{ .ConfirmationURL }}` (länken) finns med, på svenska.
