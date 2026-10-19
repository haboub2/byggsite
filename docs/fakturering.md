# Fakturering — en produktkärna, med Binaafy som första kund

Status: **version 2, skriven 2026-10-19. Fas 0–3 är kodade samma dag,
se *Läge* nedan.** Version 1 samma dag beskrev en fakturamodul för Binaafy. Den här versionen beskriver en
**kärna som andra företag ska kunna använda i stället för Fortnox**, där
Binaafy är första kunden och det som byggs för Binaafy (offert → betalplan →
delfakturor → ÄTA → slutfaktura → ROT) är produktens första säljargument.
Prototypen av gränssnittet finns som design-canvas (sju skärmar: fakturalista,
faktura, projektekonomi, kundportal i mobil, PDF, ROT-begäran, dashboard).

## Läge 2026-10-19: fas 0–3 kodade, migrationerna provkörda lokalt

Byggt, med 64 tester som är gröna (`npm test`, 121 totalt), lint och
typkontroll rena:

| Grundkrav | Fil | Vad |
|---|---|---|
| 1 Flera företag | `supabase/migrations/0014_core.sql` | `organizations`, `memberships`, `invitations`; `is_org_member`, `has_org_role`, `can_write_org`, `can_admin_org`; `is_admin()` omdefinierad till owner/admin i någon organisation; `org_id` på `quotes`, `quote_templates`, `leads`, `portal_projects` med Binaafy ifyllt och nya policies på offerter och projekt |
| 2 Huvudbok | `lib/core/ledger/posting.ts`, migrationen | Kontering per händelse (faktura, omvänd, ROT, betalning, ROT-utbetalning, påminnelse, kreditfaktura, vändning), alltid balanserad; tabellerna `accounts`, `journal_entries`, `journal_lines`, `period_locks` med triggers: oföränderliga, låst period, balans vid commit |
| 3 EN 16931 | `lib/core/documents/invoice.ts`, `lib/core/invoices/totals.ts` | Dokumentet med BT-termer och `se`-tillägg (ROT, omvänd), tre kundtyper, `validateForIssue` med momslagens krav, summor i öre med momsunderlag per sats, ROT per köpare, öresavrundning som egen rad, kreditfaktura som spegel |
| 4 Regelverk | `lib/core/rules/index.ts` | Regelset per datum (2025: ROT 50 %, 2026: 30 %), referensränta per halvår, dröjsmålsränta, påminnelseavgift, arkivering, ROT-deadline |
| 5 API | `lib/api/*`, `app/api/v1/health`, `app/api/v1/openapi.json`, migrationen | API-nycklar (hashade, prefix, scopes), bearer-autentisering mot `api_keys`, idempotensnycklar, felformat, OpenAPI-kontrakt; tabellerna `api_keys`, `idempotency_keys`, `webhook_endpoints`, `webhook_deliveries` |
| 6 Öre och serier | `lib/core/money.ts`, `lib/core/numbering.ts`, `lib/core/ocr.ts`, `lib/core/events.ts`, `lib/render/sie/sie4.ts`, migrationen | Öre som heltal med en avrundningsplats, obrutna serier via `next_document_number` (radlås), OCR med längd- och kontrollsiffra (TS och SQL), loggboken `events` som bara växer, SIE4 med golden-file-test och PC8-kodning |
| Utfärdande | migrationen, `issue_invoice()` | En transaktion: nummer, fryst dokument, hash, OCR, verifikation i serien V, händelse. Trigger `invoices_freeze` gör utfärdade fakturor oföränderliga |

**Fas 1 kodad samma dag** och körd i demo-läget i webbläsaren (kund → utkast
→ utfärdad 10001 med OCR → PDF → betalning → kreditfaktura 10002 → originalet
krediterat):

| Del | Fil |
|---|---|
| Kundregister | `lib/core/customers/schema.ts`, `store.ts`; `app/admin/(dashboard)/kunder/*`; `components/admin/customers/CustomerForm.tsx`; `app/admin/customer-actions.ts` |
| Fakturastore med demo-läge | `lib/core/invoices/store.ts` (utkast, utfärda via `issue_invoice`, skicka, betalning via `register_payment`, kreditfaktura, händelser, demo-huvudbok) |
| Offert → faktura | `lib/core/invoices/from-quote.ts` (testad), knappen på offertsidan, kund matchas eller skapas |
| Säljaruppgifter | `lib/core/invoices/seller.ts`: från Företaget och Offertuppgifter, uppdateras vid utfärdandet |
| PDF och utskick | `lib/pdf/InvoicePdf.tsx`, `lib/pdf/render-invoice.tsx`, `app/admin/(dashboard)/fakturor/[id]/pdf/route.ts`, `lib/core/invoices/send.ts` |
| Admin | `app/admin/(dashboard)/fakturor/*` (lista med nyckeltal, ny, redigerare, låst vy), `components/admin/invoices/*`, `app/admin/invoice-actions.ts`, menyn |
| Migration 0015 | `register_payment`, `mark_invoice_sent`, `mark_invoice_credited` som transaktioner |

**Fas 2 kodad samma dag** och körd i demo-läget (offert 1004 → projekt →
betalplan 30/40/30 → delfaktura 10003 från steg 1 → betald → ROT-begäran som
XML → utbetalning bokförd → kundens flik Fakturor med PDF):

| Del | Fil |
|---|---|
| Betalplan | `lib/core/plans/schema.ts` (steg, regler, mallar 30/40/30, 50/50, allt vid klart), `billing.ts` (fakturerbart, stegets rader per kostnadsslag så ROT håller, slutfaktura med rest plus godkända ÄTA som egna rader, projektets ekonomi; testad), `store.ts` |
| Delfaktura från steg | `lib/core/invoices/from-plan.ts`, `app/admin/plan-actions.ts`: kund matchas i registret, utkastet öppnas i redigeraren, steget och ÄTA:n kopplas till fakturan |
| Rutan Ekonomi | `components/admin/projects/ProjectEconomy.tsx` på projektsidan: offert, godkända ÄTA, fakturerat, betalt, kvar; betalplanen med *Skapa faktura* på det steg som kan faktureras |
| ROT-begäran | `lib/core/rot/claim-xml.ts` (Skatteverkets schema v6, kontrollerat mot `Begaran.xsd` och `BegaranCOMPONENT.xsd`; golden-file-test), `lib/core/rot/store.ts`, `app/admin/(dashboard)/rot/*`, `app/admin/rot-actions.ts`, migration `0016_rot_payout.sql` (`register_rot_payout`, `reject_rot_claim`) |
| Portalen | `app/(portal)/mitt-projekt/[id]/fakturor/page.tsx`, fliken Fakturor med märke för obetalda, fakturans PDF via `/mitt-projekt/fil?p=invoice:<id>` |

**Fas 3 kodad samma dag** och körd i demo-läget (faktura 10004 daterad
2026-08-01 → förfallen → *Påminn* bokför 164 kr dröjsmålsränta, ingen avgift
till privatperson, händelsen i tidslinjen → camt.054-fil inläst, OCR-förslag
registrerat på 10005 → publik sida och PDF med Swish-QR → cron listar 10006
som förfallen):

| Del | Fil |
|---|---|
| Databasklient per anropare | `lib/core/db.ts`: `getDb()` ger sessionens klient så att RLS avgör; `asSystem()` ger service role för kod som autentiserat sig själv (cron). Alla stores går via `getDb()` |
| Påminnelser | `lib/core/reminders/reminders.ts` (när nästa påminnelse är due, avgift bara till företag om inte villkoren säger annat, ränta från förfallodagen eller förra påminnelsen, delbetalningar; testad), `store.ts` (lista, mejla via Resend, registrera), `app/admin/reminder-actions.ts`, panelen *Påminnelse* på fakturasidan (`SendReminderForm` i `components/admin/invoices/InvoiceTools.tsx`) |
| Daglig körning | `app/api/cron/invoices/route.ts`, `vercel.json` (06:00 UTC): `Authorization: Bearer $CRON_SECRET`, listar förfallna och skickar själv bara med `REMINDERS_AUTO=1`; svaret är JSON med `due`, `sent`, `failed` |
| Bankfil och matchning | `lib/core/payments/camt054.ts` (ISO 20022 camt.054, poster och transaktionsdetaljer, bara kredit), `matching.ts` (OCR, fakturanummer i meddelandet, belopp och namn, unikt belopp; konfidensen visas), `store.ts`, `app/admin/bank-actions.ts`, `app/admin/(dashboard)/fakturor/bank/page.tsx`. Inget bokförs förrän en person klickar *Registrera* |
| Swish-QR | `lib/core/payments/swish.ts` hämtar bilden från Swishs publika QR-tjänst (`mpc.getswish.net/qrg-swish/api/v1/prefilled`, minst 300 px) med nummer, belopp och OCR låsta; på PDF:en (`lib/pdf/InvoicePdf.tsx`, `render-invoice.tsx`), i portalen och på den publika sidan. Numret kommer från `SWISH_NUMBER` (`lib/core/invoices/seller.ts`) eller fältet på fakturan |
| Publik fakturasida | `lib/core/invoices/public.ts`, `app/faktura/[token]/page.tsx`, `pdf/route.ts`, `swish.png/route.ts`: slumpad token (`invoices.public_token`), bara utfärdade fakturor, `noindex`, läses med service role |
| Dashboarden Ekonomi | `lib/core/dashboard.ts` (nyckeltal, kassaprognos 8 veckor, ålder, månader, moms, största kunder, att göra; testad), `app/admin/(dashboard)/ekonomi/page.tsx` (planerade steg räknas med `stepGross` som i rutan Ekonomi), `lib/core/events-store.ts`, menyn |
| Migration 0017 | `invoices.public_token`; `register_reminder` (rad, räknare, verifikation för avgift och ränta, händelse i en transaktion); `mark_bank_transaction`; `can_write_org_or_system` så att cron med service role får registrera; `org_id default default_org()` på kärntabellerna som stores skriver direkt (saknades i 0014, så en insert i t.ex. `customers` hade fallit på not null) |

Två beslut i fas 3:

- **Swish-QR hämtas från Swishs publika QR-tjänst**, inte genereras själva.
  Den kräver inget avtal eller certifikat för bilden, och formatet följer
  Swishs egen specifikation. Lyckade bilder cachas i processen; ett fel
  ger fakturan utan QR i stället för att stoppa PDF:en.
- **Påminnelsekedjan styrs av miljövariabler tills `org_settings` har ett
  gränssnitt:** `REMINDERS_AUTO=1` (cron skickar själv, annars bara knappen),
  `REMINDERS_GRACE_DAYS`, `REMINDERS_DAYS_BETWEEN` och
  `REMINDERS_FEE_TO_CONSUMERS=1` (avgift till privatpersoner, bara om
  villkoren säger det). Standardvärdena står i `lib/core/reminders/reminders.ts`.

Kontroll: 146 tester gröna (`npm test`), lint och typkontroll rena.
Migrationerna 0001–0017 är körda i PGlite (Postgres 17 i WebAssembly) med
Supabase-liknande roller och `auth`-funktioner, följt av 17 RLS- och
funktionskontroller: medlem utan roll och anon ser inga fakturor,
påminnelser, verifikationer eller banktransaktioner; anon kan inte köra
`register_reminder`; personal och service role kan; negativa belopp och
okänd status avvisas; `org_id` fylls i av default. Skriptet ligger utanför
repot tills PGlite läggs till som utvecklingsberoende.

Inte gjort i fas 0–3, och varför:

- **Migrationerna mot Supabase.** Inget av de Supabase-projekt som nås
  härifrån har tabellerna från 0014–0016, och `.env.local` saknas, så appen
  kör i demo-läget. 0017 ska köras efter 0016 i det projekt där 0014–0016
  kördes, och `get_advisors` (security) köras efteråt.
- **Mejlutskick** är inte testat skarpt (kräver `RESEND_API_KEY` och
  `MAIL_FROM`); knappen *Markera skickad* och *Registrera bara* på
  påminnelsen täcker tills dess.
- **Bankfilen läses in för hand.** Automatisk hämtning från bankens
  filtjänst eller öppen bankdata kommer i fas 5. Betalningen och
  markeringen av transaktionen är två anrop, inte en transaktion;
  `payments.bank_transaction_id` sätts inte än.
- **Swish Handel** (callback som kvitterar betalningen direkt) i fas 5.
- **Inkasso** som export till inkassobolag är inte byggt.
- **ROT-XML:en** är skriven mot schemat men inte provad i Skatteverkets
  e-tjänst; första riktiga filen laddas upp och kontrolleras där. Timmar
  tas från arbetsrader i enheten *tim*, materialkostnad från materialrader;
  kategorin (Bygg, El, VVS …) väljs per begäran.
- **Projektets kostnadssida** (leverantörsfakturor, timmar, marginal) och
  "upparbetat men ej fakturerat" ligger i fas 4.
- **Peppol-renderaren** (`lib/render/ubl`) väntar till fas 5; dokumentet är
  redan format efter standarden.
- **Kryptering av personnummer** i `rot_buyers`: tabellen har strikt RLS
  (bara owner/admin), kryptering med nyckel i Supabase Vault läggs till när
  en andra organisation finns.
- `lib/rot.ts` (kalkylatorn på sajten och offerten) läser fortfarande sina
  egna konstanter; den byter till `rulesAt()` när offertkoden inte ändras av
  någon annan.

## Vad vi bygger, och vad vi inte bygger först

**Produkten:** fakturering och projektekonomi för hantverks- och byggföretag,
med en kundportal, ROT inbyggt och export till vilket bokföringsprogram som
helst. Software-sidan (01) använder samma kärna för timmar och avtal.

**Inte först**, även om Fortnox-kunder väntar sig det: bokförings-UI, löner,
leverantörsfakturor, fakturaköp. Kärnan byggs så att bokföring kan läggas till
utan att något skrivs om (grundkrav 2), men vi vinner kunder på byggflödet
först och lägger till bokföring när kärnan sitter.

**Varför det slår Fortnox hos en byggfirma:** fakturan är härledd ur
projektet, inte skriven om. Fortnox är ett bokföringsprogram med fakturering
ovanpå; det här är fakturering byggd på projektet, med en huvudbok under.

| Vad | Fortnox | Här |
|---|---|---|
| Offert → faktura | Kopiera rader för hand | En knapp; kund, rader, ROT och villkor följer med |
| Delfakturor | Skriv varje faktura | Betalplan på projektet; steget blir fakturerbart när fasen bockas |
| ÄTA | Kom ihåg dem | Godkända ÄTA läggs på slutfakturan med vem som godkände och när |
| ROT | Per faktura, fil separat | Personer och fastighet från offerten; Skatteverkets XML med ett klick; status till utbetalning |
| Byggföretag | Inställning per kund och artikel | Kundtypen styr: ingen moms, rätt text, köparens VAT-nr |
| E-faktura (Peppol) | Tredjepart (Qvalia) | Inbyggt: fakturamodellen är standarden (grundkrav 3) |
| Kunden | PDF i mejl | Portal med status, Swish-QR, kvitto, bredvid projektets dokumentation |
| Full koll | Rapporter | Dashboard: att få in, förfallet, kassaprognos, ålder, att göra |
| Inlåsning | Export begränsad | Full export: SIE, CSV, Peppol-XML, PDF-arkiv, JSON |

## De sex grundkraven

Det här är det som inte går att lägga till i efterhand. Allt sex finns i den
första migrationen och i den första versionen av kodstrukturen, även om bara
Binaafy använder systemet det första halvåret.

### 1. Flera företag från dag ett

- Tabellen **`organizations`** är roten. Varje tabell i kärnan har `org_id`
  och radsäkerhet (RLS) på den. Ingen tabell utan.
- **`memberships`** (`org_id`, `user_id`, `role`) ersätter dagens
  `admins`-tabell. Roller: `owner`, `admin`, `staff`, `accountant`
  (läser allt, exporterar, bokför inget), `readonly`. En revisor är en
  `accountant` i kundens organisation.
- Hjälpfunktionerna `is_member(org)` och `has_role(org, role)` (security
  definer, som dagens `is_admin()` och portalens `is_member(project)`).
- **Befintliga tabeller** (`quotes`, `quote_templates`, `leads`,
  `portal_projects`, `cases`, innehållet …) får `org_id` i samma migration,
  fylls med Binaafys organisation och får sina policies omskrivna från
  `is_admin()` till `has_role(org_id, 'admin')`. Portalens kunder är som i
  dag vanliga användare utan medlemskap; `portal_projects.org_id` avgör vems
  kund de är.
- URL:erna behåller `/admin` tills vidare; organisationen tas ur sessionen
  (en användare, en organisation). Växling mellan organisationer och
  `/app/[org]/…` kommer i fas 5 när det finns en andra kund.
- **Inställningar per organisation** (`org_settings`): företagsuppgifter,
  logotyp, kontoplan, nummerserier, standardvillkor per kundtyp, bankgiro,
  Swish, påminnelseregler, e-postavsändare. Dagens "Företaget" och
  "Offertuppgifter" i `lib/content/schema.ts` flyttar hit.

### 2. Huvudbok under fakturan

Varje faktura, betalning, kreditering och ROT-utbetalning skapar en låst
**verifikation** med debet och kredit på konton, automatiskt, i samma
transaktion som händelsen. Vi visar ingen bokföring i början, men den finns,
så att SIE-exporten är en serialisering av något som redan är rätt, och så
att bokföring kan bli en modul senare utan omskrivning.

- **`accounts`**: kontoplan per organisation, BAS som standard, redigerbar.
- **`journal_entries`**: `org_id`, serie (`V`), obrutet nummer, datum,
  `source_type`/`source_id` (fakturan, betalningen …), `reversed_by`.
- **`journal_lines`**: konto, debet, kredit (öre), dimensioner
  `project_id`, `customer_id`, `cost_center`.
- Konteringar som standard (ändras i inställningarna):

| Händelse | Debet | Kredit |
|---|---|---|
| Faktura utfärdad, 25 % | 1510 Kundfordringar | 3001 Försäljning 25 %, 2611 Utgående moms 25 % |
| Faktura till byggföretag, omvänd | 1510 | 3231 Försäljning byggtjänster omvänd (ingen moms) |
| Faktura med ROT | 1510 (kundens del), 1513 ROT-fordran Skatteverket (avdraget) | 3001, 2611 |
| Betalning från kund | 1930 Bank | 1510 |
| ROT utbetalt från Skatteverket | 1930 | 1513 |
| Kreditfaktura | Spegelvänd verifikation med hänvisning | |
| Påminnelseavgift, ränta | 1510 | 3591 Påminnelseavgifter, 8313 Ränteintäkter kundfordringar |

- Verifikationer ändras aldrig; fel rättas med en vändande verifikation
  (`reversed_by`). Perioder kan **låsas** (`period_locks`), vilket SIE-exporten
  gör automatiskt för den månad som exporterats.
- Konteringen beräknas av en ren funktion i `lib/core/ledger/posting.ts` med
  tester per händelse och kundtyp. Fel kontering är en bugg i en funktion,
  inte i tusen fakturor.

### 3. Fakturamodellen följer EN 16931

Fakturan lagras som ett dokument med den europeiska e-fakturastandardens
fält (EN 16931, det som Peppol BIS Billing 3 bygger på): säljare, köpare,
period, betalningsmedel, rader med artikel, antal, enhet, pris, moms-kategori
per rad (`S` 25/12/6 %, `AE` omvänd betalningsskyldighet, `E` undantagen),
dokumentnivåns rabatter och avgifter, summor. PDF:en, Peppol-XML:en,
portalen och SIE-filen renderas alla ur **samma dokument**. Då kan e-faktura
aldrig säga något annat än PDF:en.

- `lib/core/documents/invoice.ts`: zod-schemat för dokumentet, med fältnamn
  efter standardens begrepp (`BT-`-nummer i kommentarerna så att det går att
  slå upp).
- Svenska tillägg i ett eget objekt `se`: ROT (köpare, personnummer,
  fastighet, arbetsandel, avdrag), omvänd betalningsskyldighet-texten,
  F-skatt, OCR. Hur ROT uttrycks i Peppol-XML:en följer SFTI:s rekommendation
  och verifieras mot den när fas 5 börjar; i dokumentet är det ett eget fält
  från dag ett.
- Renderare: `lib/render/pdf` (`@react-pdf/renderer`, som offerten),
  `lib/render/ubl` (Peppol BIS Billing 3 XML), `lib/render/sie` (SIE4),
  `lib/render/csv`. Varje renderare har **golden-file-tester**: ett dokument
  in, en känd fil ut.
- Dokumentet fryses vid utfärdandet och får en `sha256`-hash som lagras på
  raden och skrivs i PDF:ens metadata, så att en fil senare kan bevisas vara
  den utfärdade.

### 4. Regelverk med giltighetsdatum

Allt som är lag eller myndighetsbeslut ligger i `lib/core/rules/` som
versionerade regler med `validFrom`/`validTo`, och anropas med fakturadatumet:
`rules.at('2026-10-10').rot.rate`. Inga konstanter i affärslogiken.

| Regel | 2026 | Källa, kontrollerad 2026-10-19 |
|---|---|---|
| Momssatser | 25, 12, 6, 0 | Skatteverket |
| ROT | 30 % av arbete inkl. moms, 50 000 kr/person/år, ROT+RUT 75 000 | Skatteverket, rot och rut. 2025 var satsen 50 %. |
| RUT | 50 %, 75 000 kr/person/år | Skatteverket |
| Omvänd betalningsskyldighet | Byggtjänster till köpare som mer än tillfälligt säljer byggtjänster: ingen moms, köparens VAT-nr, texten "Omvänd betalningsskyldighet" | Skatteverket, byggsektorn |
| Fakturans innehåll | Momslagens tio punkter (datum, löpnummer, VAT-nr, namn/adress, omfattning, leveransdatum, underlag per sats, sats, momsbelopp eller omvänd-text) | Skatteverket, momslagens regler om fakturering |
| Dröjsmålsränta | Referensräntan + 8 procentenheter när inget avtalats; referensräntan uppdateras 1 jan och 1 jul | Räntelagen, Riksbanken |
| Påminnelseavgift | 60 kr mot näringsidkare; mot konsument bara om avtalat | Lag om ersättning för inkassokostnader |
| Arkivering | 7 år efter räkenskapsårets slut | Bokföringslagen |
| ROT-begäran | XML, schema version 6, max 100 köpare, ROT och RUT i skilda filer, senast 31 jan året efter betalning | Skatteverket, Rot och rut – företag |
| E-faktura | Krävs mot offentlig sektor (Peppol BIS Billing 3). Utredning om krav mellan företag, Dir. 2026:9, svar senast 2027-11-30. ViDA: gränsöverskridande obligatoriskt 2030-07-01 | Regeringen, Skatteverket, DIGG |

Dagens `lib/rot.ts` blir första regeln i mappen; `lib/quotes/math.ts` tar
satsen därifrån i stället för konstanten.

### 5. API först, med webhooks

Varje knapp i gränssnittet anropar samma tjänstelager som en integratör
skulle göra. Serveråtgärderna i Next är tunna skal runt `lib/core`.

- `app/api/v1/…`: REST över organisationens resurser (kunder, fakturor,
  betalningar, betalplaner, ROT, händelser). Autentisering med API-nycklar
  per organisation (`api_keys`, hashade, med scopes) eller sessionen.
- **Idempotensnycklar** på alla skrivande anrop, så att ett omsänt anrop
  aldrig skapar två fakturor.
- **Webhooks** (`webhook_endpoints`, `webhook_deliveries` med återförsök):
  `invoice.issued`, `invoice.sent`, `payment.received`, `invoice.paid`,
  `invoice.overdue`, `reminder.sent`, `rot_claim.sent`, `rot_claim.paid`.
- OpenAPI-specifikation genererad ur zod-schemana, publicerad på
  `/api/v1/openapi.json`. Versionen ligger i URL:en.
- Hastighetsgränser per nyckel. Loggning av varje anrop i `events`.

### 6. Öre, obrutna serier, loggbok och full export

- **Pengar är heltal i öre** (`bigint`) med `currency` på varje belopp.
  Dagens `int` i kronor på `quotes.total` migreras. `lib/core/money.ts` är
  det enda stället som avrundar, med svensk öresavrundning till hela kronor
  på fakturans slutsumma och tester för varje regel.
- **Nummerserier utan luckor** per organisation, serie och (valfritt) år:
  tabellen `number_series` med radlås i utfärdandets transaktion. Utkast har
  inget nummer. Postgres-sekvenser används inte för dokument.
- **`events`** är en loggbok som bara växer: `org_id`, vad (`aggregate_type`,
  `aggregate_id`), typ, data, vem, när. Tidslinjen i gränssnittet och
  webhooks läser därifrån. Inget raderas; utkast som tas bort får en
  händelse och `deleted_at`.
- **Full export** för en organisation: SIE4 per period, CSV för kunder,
  fakturor och betalningar, Peppol-XML per faktura, PDF-arkivet som zip, och
  en JSON-export av allt. Ingen inlåsning är ett säljargument mot Fortnox och
  ett lagkrav (räkenskapsinformation ska kunna lämnas ut).

## Datamodell, migration `0014_core.sql`

Grupperad; alla tabeller har `org_id`, `created_at`, och RLS.

```
Organisation   organizations, memberships, invitations, api_keys, org_settings,
               number_series, period_locks
Parter         customers (type privat|foretag|byggforetag, org_nr, vat_nr,
               peppol_id, einvoice_pref, default_terms), customer_contacts
Dokument       invoices (series, number, kind invoice|credit, status,
               customer_id, quote_id, project_id, plan_step_id, document jsonb,
               total_ore, vat_ore, rot_ore, pay_ore, paid_ore, currency,
               issued_on, due_on, delivered_on, ocr, pdf_path, sha256,
               sent_at, paid_at, credits_invoice_id),
               invoice_lines, payment_plans, payment_plan_steps,
               recurring_invoices, reminders
Pengar         payments (amount_ore, method, reference, paid_on,
               bank_transaction_id), payment_allocations (payment → invoice),
               bank_transactions (import, matched|unmatched|ignored)
Huvudbok       accounts, journal_entries, journal_lines
ROT            rot_claims, rot_claim_items
Loggbok        events, webhook_endpoints, webhook_deliveries
Befintligt     quotes.customer_id, quotes.org_id, change_orders.invoice_id,
               project_documents.kind = 'invoice'
```

Statusflöde för fakturor som i version 1: `draft → issued → sent →
partially_paid → paid`, `credited`, `void`; *förfallen* räknas ur `due_on`
och lagras inte. Kreditfaktura är en egen faktura med `kind = credit` och
negativa belopp; inget utfärdat raderas.

**Känsliga uppgifter.** Personnummer och fastighetsbeteckningar ligger i en
egen tabell `rot_buyers` med striktare RLS (bara `owner`/`admin`), krypterade
med `pgcrypto`, och visas aldrig i portalen. Supabase-projektet ligger i en
EU-region. Varje organisation får ett personuppgiftsbiträdesavtal när
produkten säljs (fas 5).

## Kodstruktur

```
lib/core/                  ramverksfritt, rena funktioner, testat
  money.ts                 öre, avrundning, formatering
  rules/                   regelverk per datum (moms, rot, rut, omvand, ranta, avgifter, deadlines)
  documents/invoice.ts     EN 16931-dokumentet (zod), svenska tillägg
  invoices/                skapa ur offert/betalplan/ÄTA, utfärda, kreditera, status
  ledger/posting.ts        händelse → verifikation
  payments/                registrera, allokera, matcha (OCR, belopp, datum)
  reminders/               förfallna, avgift, ränta, kedjor
  numbering.ts             obrutna serier
  events.ts                loggboken
lib/render/                pdf/, ubl/, sie/, csv/  (golden-file-tester)
lib/api/                   auth (nycklar, scopes), idempotens, webhooks, OpenAPI
app/api/v1/                REST
app/admin/(dashboard)/     ekonomi (dashboard), fakturor, kunder, rot, projekt
app/admin/invoice-actions.ts  tunna skal runt lib/core
app/(portal)/mitt-projekt/[id]/fakturor
app/faktura/[token]        publik fakturasida för kunder utan portalkonto
app/api/cron/              daglig körning: förfallna, påminnelser, återkommande, bankfil
```

Dagens `lib/quotes/math.ts` (testad) blir grunden för `lib/core/money.ts`
och radberäkningen; `components/admin/quotes/QuoteEditor.tsx` delas så att
radlistan återanvänds i fakturaredigeraren.

## Flöden

Som i version 1, nu uttryckta i kärnans termer. Prototypen visar varje steg.

- **Utfärda från offert.** Accepterad offert → *Skapa faktura* → utkast med
  kund, rader, kundtyp, ROT-personer, villkor, hänvisning. *Utfärda* kör i
  en transaktion: nummer ur serien, dokumentet fryses, hash, PDF till
  bucketen, verifikation, händelse `invoice.issued`. *Skicka*: mejl med PDF
  och länk (portal eller `/faktura/[token]`), händelse, webhook.
- **Betalplan och delfakturor.** Steg knyts till faser i tidplanen eller
  datum. När fasen bockas klar visas *Skapa faktura* i projektet och på
  dashboardens att-göra-lista; inget skapas av sig självt. Slutfakturan tar
  resten plus alla godkända ÄTA som egna rader med `change_order_id`.
  Projektets ruta *Ekonomi*: offert, ÄTA, fakturerat, betalt, kvar, ROT.
  ROT vid delfaktura räknas på stegets arbetsandel.
- **Kundtyper.** `privat` (inkl. moms, ROT), `foretag` (exkl. moms, momsrad),
  `byggforetag` (omvänd: ingen moms, köparens VAT-nr, texten; per rad kan
  *vanlig moms* sättas för ren varuförsäljning). Kundtypen avgör
  momskategori per rad i dokumentet och konteringen.
- **Betalningar.** Fas 1 manuellt. Fas 3: bankens inbetalningsrapport i
  **ISO 20022 camt.054** läses in till `bank_transactions` och matchas på
  OCR, sedan belopp och datum, med förslag för resten. Det gamla formatet
  BgMax slutar Bankgirot skicka efter 27 november 2026, så vi bygger aldrig
  för det. Swish Företag ger QR-kod på PDF och i portalen utan teknisk
  integration; Swish Handel (API, certifikat) först när vi vill kvittera
  betalningen direkt. Öppen bankdata (PSD2-API via en leverantör som Enable
  Banking eller Tink, inloggning med BankID) i fas 5 ger kontotransaktioner
  flera gånger per dag utan fil. Se avsnittet *Kopplingar* nedan.
- **Påminnelser.** Daglig körning. Admin ser förfallna överst på dashboarden
  och trycker *Påminn*, eller slår på kedjan per organisation: påminnelse
  efter N dagar, avgift och ränta enligt regelverket och kundtypen, inkasso
  som export till inkassobolag.
- **Kreditfaktura.** Hel eller del. Nytt nummer i serien, hänvisning,
  spegelvänd verifikation. Originalet *Krediterad* när krediten täcker det.
- **ROT-begäran.** Betalda fakturor med ROT → välj → XML (schema v6,
  validerad mot schemat) → ladda upp i e-tjänsten → *Skickad* → utbetalning
  registreras som betalning med `method = rot` och bokas 1930/1513. Avvisad
  begäran flaggas rött: kunden ska betala resten. Påminnelse i december om
  31 januari. Delbetalda fakturor hålls utanför filen tills allt är betalt.
- **Portalen.** Fliken *Fakturor*: belopp, förfallodatum, status, PDF,
  Swish-QR, bankgiro och OCR, tidslinje utan interna anteckningar, texten
  "ROT-avdraget begär vi när du har betalat".
- **Dashboarden (Ekonomi).** Räknas ur kärnan, inget skrivs in:

| Mått | Definition |
|---|---|
| Att få in | Summa `pay_ore − paid_ore` för utfärdade, ej krediterade fakturor |
| Förfallet | Samma, där `due_on < i dag` |
| Väntas in denna vecka | Förfallodatum inom veckan, ej betalt |
| Kassaprognos 8 veckor | Per vecka: förfallodatum på utfärdade fakturor plus planerade steg i betalplaner (datum eller fasens beräknade slut); förfallet räknas till innevarande vecka |
| Obetalt per ålder | Ej förfallet, 1–30, 31–60, över 60 dagar |
| Snitt dagar till betalning | `paid_at − issued_on` på betalda fakturor, rullande 12 månader |
| ROT hos Skatteverket | Summa i `rot_claims` med status `sent`; "klart att begära" = betalda ROT-fakturor utan begäran |
| Fakturerat per månad | Summa exkl. moms per utfärdandemånad |
| Moms, period | Underlag och utgående moms per sats, omvänd separat, ur verifikationerna |
| Att göra | Förfallna utan påminnelse, utkast, fakturerbara steg, ROT att begära, period ej exporterad |

- **Projektvyn, det som läggs till.** Kostnadssidan (leverantörsfakturor,
  timmar, material mot offert) och marginal per projekt i fas 4; betalplanen
  ritad på tidplanens axel; "upparbetat men ej fakturerat"; nästa händelse
  med datum; kundens ROT-utrymme märkt *enligt kundens uppgift* med en fråga
  till kunden i portalen.

## Kvalitet

- **Tester före gränssnitt:** egenskapsbaserade tester för pengar, avrundning
  och regelverk (summan av rader är alltid summan, ROT överskrider aldrig
  utrymmet, verifikationer balanserar alltid); golden-file-tester för PDF,
  UBL och SIE; RLS-tester per roll som försöker läsa en annan organisations
  rader; migrationstest mot en tom databas och mot Binaafys data.
- **Observerbarhet:** varje misslyckad utskick, bankfil och webhook syns på
  dashboarden som att-göra, inte bara i loggar.
- **Prestanda:** listor och dashboard läser materialiserade summor
  (`paid_ore` på fakturan, vyer per organisation), inte hela tabeller.

## Ordning och tid

| Fas | Innehåll | Tid |
|---|---|---|
| **0. Kärnan** | Migration 0014 med alla sex grundkraven: organisationer och roller (Binaafy fylls i, `admins` → `memberships`), öre, nummerserier, loggbok, regelverk, dokumentmodellen, huvudbok med konteringar, API-skelett med nycklar, idempotens och webhooks, exportformat som funktioner. Bara tester, inget gränssnitt. | 3–4 veckor |
| **1. Fakturering** | Kundregister, utkast → utfärda → skicka, PDF, tre kundtyper, manuell betalning, kreditfaktura, lista och redigerare, fakturan som dokument i portalen. Binaafy fakturerar härifrån. | 2 veckor |
| **2. Bygg** | Betalplan på projektet, delfakturor från faser, slutfaktura med ÄTA, rutan Ekonomi, ROT på fakturan, ROT-begäran som XML, ROT-status, fliken Fakturor i portalen. | 1,5 vecka |
| **3. Betalt i tid och dashboard** | Cron, förfallna, påminnelsekedja med avgift och ränta, camt.054-import och matchning, Swish-QR (Swish Företag), publik fakturasida, dashboarden Ekonomi. | 1,5 vecka |
| **4. Ekonomi** | SIE4-export med periodlåsning, momsunderlag, återkommande fakturor (01), kostnader och marginal per projekt, upparbetat. | 1,5 vecka |
| **5. Produkt** | Onboarding av en andra organisation, växling, `/app/[org]`, Peppol via accesspunkt (partner, inte egen), öppen bankdata via leverantör, Swish Handel med callback, BankID-inloggning, roller för revisor, personuppgiftsbiträdesavtal, prissättning, publik OpenAPI och utvecklarsidor. | när första externa kunden finns |

## Kopplingar: så fungerar Fortnox, och så gör vi

Fortnox är inte svårt att ersätta för att programmet är bra, utan för att
kopplingarna är många. Varje koppling nedan är antingen en fil, ett API eller
ett avtal med en bank, och ingen av dem är exklusiv för Fortnox.

| Koppling | Hur Fortnox gör det (2026) | Hur vi gör det | Fas |
|---|---|---|---|
| **Kontotransaktioner** | Egen bankkoppling per bank (SEB, Swedbank, Handelsbanken, Nordea, Danske, Länsförsäkringar …) och sedan sommaren 2026 en gratis Open Banking-koppling som hämtar transaktioner upp till fyra gånger per dag, aktiverad med Mobilt BankID | Öppen bankdata via en PSD2-leverantör (Enable Banking, Tink eller motsvarande): kunden godkänner med BankID, vi hämtar transaktioner och saldon via ett API. Egna bankavtal behövs inte. | 5 |
| **Inbetalningar med OCR** | Bankgiro Inbetalningar, läser filen från banken | Samma tjänst hos kundens bank, filformat ISO 20022 camt.054 (BgMax upphör 27 nov 2026). Filen hämtas från internetbanken eller via bankens filtjänst och laddas upp eller hämtas av cron. Matchning på OCR, belopp, datum. | 3 |
| **Swish** | Swish-QR på faktura och betalsida | Swish Företag: QR-kod på PDF och i portalen, ingen teknisk integration, avtal med kundens bank. Swish Handel (API, klientcertifikat per Swish-nummer, ca 3 kr per betalning hos Swedbank) när vi vill kvittera betalningen i realtid. | 3, 5 |
| **Utbetalningar** | Leverantörsbetalningar till internetbanken via bankkopplingen | Inte i produkten (vi fakturerar, betalar inte). Senare via PSD2-betalningsinitiering. | – |
| **E-faktura till företag och offentlig sektor** | Tredjepart (Qvalia) via Peppol | Peppol BIS Billing 3 ur vårt EN 16931-dokument, skickat via en accesspunkt vi avtalar med (Pagero, Qvalia, Unifiedpost). | 5 |
| **E-faktura till privatpersoner** | Kivra och internetbankens e-faktura | Kivra API för företag; bankernas e-faktura (via Bankgirot/Finansiell ID-Teknik) kräver avtal och är senare. | 5 |
| **ROT och RUT** | Skapar filen; uppladdning hos Skatteverket | Samma: XML enligt schema v6, uppladdning i e-tjänsten. Skatteverket har inget API för begäran. | 2 |
| **Skattekonto** | Koppling till Skatteverket visar skattekontot | Inte först; hör till bokföringsmodulen. | – |
| **Bokföring** | Är Fortnox | SIE4-export per period, eller push via Fortnox API (OAuth 2.0) för de kunder som har Fortnox hos sin konsult. | 4 |
| **Företagsuppgifter** | Hämtar namn och adress på org.nr | Bolagsverket via en leverantör (Roaring eller motsvarande) för att fylla i kund på org.nr; kreditupplysning (UC, Creditsafe) som tillval. | 5 |
| **Inloggning och signering** | BankID | BankID via leverantör (Criipto, Signicat eller liknande) för inloggning och för att kunden signerar offert och ÄTA. | 5 |
| **Kortbetalning** | Fortnox betalsida | Stripe eller liknande på betalsidan för småbelopp (Software-kunder). | 5 |
| **Integrationer utåt** | Fortnox API med hundratals appar | Vårt API v1 med webhooks (grundkrav 5); vi bygger dessutom en Fortnox-koppling själva, så att en kund kan behålla Fortnox för bokföring och fakturera hos oss. | 0, 4 |

Två saker att ta med sig. **Bankerna är nyckeln och de är öppna:** PSD2 gör
att varje bank måste ge tredjepartsleverantörer åtkomst till
kontoinformation, och leverantörerna säljer det som ett API med BankID-flöde,
så vi behöver inga egna bankavtal för att läsa transaktioner. **Allt som
rör pengar ut (Swish Handel, e-faktura via bank, PSD2-betalningar) kräver
avtal och ibland tillstånd**, så det ligger sist och köps hellre från en
leverantör än byggs.

Fas 0 är det som skiljer version 2 från version 1: ungefär tre till fyra
veckor innan Binaafy ser en faktura. Allt därefter är samma arbete som i
version 1, men på en grund som bär fler företag.

## Beslut som väntar

Rekommendationen står först.

1. **Namn på produkten.** Platshållare `[PRODUKTNAMN]` i kod och dokument
   tills det är bestämt; Binaafy-varumärket används bara för Binaafys egen
   organisation.
2. **Region.** Supabase och Vercel i EU (Stockholm eller Frankfurt) innan
   första kunddata läggs in. Rekommendation: ja, nu.
3. **Nummerserie.** Inställning per organisation: löpande eller per år.
   Binaafy: löpande från 10001.
4. **Peppol-accesspunkt.** Partner (Pagero, Qvalia, Unifiedpost) i stället
   för egen certifiering. Rekommendation: partner, i fas 5.
5. **Bokföring som modul.** Ja, men först när tre externa kunder frågar efter
   det. Huvudboken finns redan, så det är gränssnitt och deklarationer som
   tillkommer.
6. **Kontoplan.** BAS 2026 som standard, redigerbar per organisation.
   Rekommendation: ta de tio konton som behövs i tabellen ovan, inte hela
   BAS, och låt konsulten lägga till.

## Källor

- Skatteverket, [omvänd betalningsskyldighet inom byggsektorn](https://www.skatteverket.se/foretag/moms/sarskildamomsregler/byggverksamhet/omvandbetalningsskyldighetinombyggsektorn)
- Skatteverket, [momslagens regler om fakturering](https://www.skatteverket.se/foretag/moms/saljavarorochtjanster/momslagensregleromfakturering)
- Skatteverket, [regler för att importera fil till Rot och rut – företag](https://skatteverket.se/foretag/etjansterochblanketter/allaetjanster/tjanster/rotochrutforetag/reglerforattimporterafiltillrotochrut.4.76a43be412206334b89800033198.html)
- Fortnox, [integrationen Qvalia för Peppol](https://www.fortnox.se/integrationer/integration/qvalia-group-ab/qvalia) och [prislista](https://www.fortnox.se/program/prislista/)
- Comarch, [Sveriges utredning om obligatorisk e-fakturering](https://www.comarch.com/trade-and-services/data-management/legal-regulation-changes/sweden-launches-official-inquiry-into-mandatory-e-invoicing-implementation/)
- Forvis Mazars, [implementering av e-fakturering enligt ViDA](https://www.forvismazars.com/se/sv/vaara-tjaenster/skatt/indirekta-skatter-och-moms/implementering-av-e-fakturering-enligt-vida)
- Fortnox, [produktnyheter sommaren 2026, Open Banking-koppling](https://www.fortnox.se/produktnyheter/produktnyheter-sommaren-2026), [bankkopplingar](https://www.fortnox.se/kopplingar/bank) och [automatisk bokföring från kontoutdrag](https://www.fortnox.se/produkt/bokforingsprogram/automatisk-bokforing-fran-kontoutdrag)
- Danske Bank, [BgMax ersätts av ISO 20022 XML, sista dag 27 november 2026](https://danskeci.com/ci/transaction-banking/instructions/file-integrations/se-transformation---bg-max)
- Bankgirot, [teknisk manual Bankgiro Inbetalningar](https://www.bankgirot.se/globalassets/dokument/tekniska-manualer/bankgiroinbetalningar_tekniskmanual_sv.pdf)
- Swedbank, [Swish Handel](https://www.swedbank.se/foretag/betala-och-ta-betalt/swish/swish-handel.html) och Nordea, [Swish för företag](https://www.nordea.se/foretag/kundservice/guide-till-swish-foretag.html)
