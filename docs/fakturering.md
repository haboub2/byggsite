# Fakturering — en produktkärna, med Binaafy som första kund

Status: **version 2, skriven 2026-10-19. Fas 0–3 är kodade samma dag,
fas 4, det av fas 5 som går utan externa avtal och full export dagen
efter, se *Läge* nedan.** Version 1 samma dag beskrev en fakturamodul för Binaafy. Den här versionen beskriver en
**kärna som andra företag ska kunna använda i stället för Fortnox**, där
Binaafy är första kunden och det som byggs för Binaafy (offert → betalplan →
delfakturor → ÄTA → slutfaktura → ROT) är produktens första säljargument.
Prototypen av gränssnittet finns som design-canvas (sju skärmar: fakturalista,
faktura, projektekonomi, kundportal i mobil, PDF, ROT-begäran, dashboard).

## Läge 2026-10-20: full export (grundkrav 6)

Grundkrav 6 är uppfyllt: utöver SIE4 per period och Peppol-XML per faktura
finns nu CSV för kunder, fakturor och betalningar, PDF-arkivet som zip och
en JSON-fil med allt, under *Full export* på Bokföringen
(`/admin/ekonomi/export`). Provat i webbläsaren mot Binaafys databas: de
tre CSV-filerna började med BOM och hade fakturorna 10001–10006 (oktober
som intervall gav 10001–10003, 10005, 10006), zippen hade `index.csv` och
sex PDF:er (`Faktura-10001-Binaafy-Test-Testkund.pdf` …), och JSON-filen
hade 10001–10006 plus utkastet, 11 verifikationer, betalplanen och
händelseloggen med 112 öre-fält, alla heltal. Varje nedladdning syntes som
händelse med användaren som aktör.

| Del | Fil |
|---|---|
| Modellen | `lib/core/export/model.ts`: `ExportData` (allt för en organisation som vanliga poster), datumintervall (`fran`, `till`), utfärdade fakturor i nummerordning |
| CSV | `lib/core/export/csv.ts` (testad): kunder (även borttagna, med datum), fakturor (nummer, datum, förfallodag, kund, typ, netto, moms, totalt, ROT, att betala, betalt, kvar, status, OCR), betalningar (en rad per betalning och faktura, källan på svenska) |
| PDF-arkiv | `lib/core/export/archive.ts` (testad): utfärdade fakturor och kreditfakturor genom `renderInvoicePdf` fyra åt gången (`lib/pool.ts`, utbruten ur projektrapporten), namn från `lib/pdf/invoice-file-name.ts`, `index.csv` med fakturakolumnerna, filnamnet och dokumentets SHA-256 |
| JSON | `lib/core/export/json.ts` (testad): `{ exportedAt, schemaVersion: 1, format, org: { …, settings, numberSeries, accounts, periodLocks }, customers, invoices (med hela dokumentet), payments (med fördelning per faktura), journal, reminders, recurringInvoices, paymentPlans, rotClaims, bankTransactions, events }` |
| Läsningen | `lib/core/export/load.ts`: varje tabell i sidor om 1 000 med användarens session (RLS) och `org_id`, demoläget ur minnet; `logExport` |
| Nedladdning | `app/admin/(dashboard)/ekonomi/export/csv/route.ts` (`?typ=kunder\|fakturor\|betalningar&fran=&till=`), `…/pdf-arkiv/route.ts`, `…/json/route.ts`, alla med `requireRole("read")` via `lib/core/export/route-helpers.ts`; händelserna `export.csv`, `export.pdf_archive`, `export.json` (`aggregate_type` "export") |

Beslut:

- **CSV för svensk Excel:** UTF-8 med BOM, semikolon, decimalkomma utan
  tusentalsavgränsare, datum ÅÅÅÅ-MM-DD, CRLF. Fält med semikolon,
  citattecken eller radbrytning citeras. Text som Excel skulle köra som
  formel (`=`, `@`, `+`/`-` utan siffror efter) får en apostrof först;
  telefonnummer som `+46 70 …` lämnas.
- **Utkast kommer inte med i CSV och zip**, bara i JSON. Intervallet gäller
  fakturadatum respektive betaldatum; kundlistan är alltid hel. En
  kreditfaktura har alltid *Kvar* 0, som i fakturalistan.
- **PDF-arkivet har inte Swish-QR**, så att 500 fakturor inte blir 500 anrop
  till Swish; QR-koden gäller ändå bara kvarvarande belopp just då.
- **JSON-filen mappas fält för fält**, inte som databasrader, så att en
  migration ändrar `load.ts` men inte filen. Fält läggs bara till inom en
  schemaversion; ändras eller tas något bort blir det `schemaVersion: 2`.
  Listorna är sorterade, så två exporter av samma data skiljer sig bara i
  `exportedAt`. Länktoken för den publika fakturasidan exporteras inte.
- **Händelsen skrivs som system** med organisationen som routen redan
  kontrollerat, eftersom läsrollerna inte får skriva i `events` under RLS.
  Misslyckas loggningen levereras filen ändå och felet hamnar i loggen,
  som vid låsningen.
- **Personnummer i klartext bara för owner/admin.** Efter 0023 ger
  `listClaims()` och fakturadokumenten personnumret maskerat
  (`ÅÅÅÅMMDD-XXXX`, dokumenten också med kryptotexten). När en owner eller
  admin hämtar JSON-filen öppnas varje maskerat nummer med samma
  databasfunktioner som XML-filen och fakturasidan (`rot_buyer_pnr`,
  `invoice_buyer_pnr`, via `openPersonalNumbers` i `load.ts`), så att filen
  är komplett utan krypteringsnyckeln; kryptotexten tas då bort ur
  dokumentet. `format.personalNumbers` säger `"plain"` eller `"masked"`, och
  händelsen `export.json` loggar vilket och hur många nummer som öppnades.
  Övriga roller får de maskerade numren. Felar en tabell eller ett
  personnummer felar hela JSON-exporten hellre än att en ofullständig fil
  levereras.

Kvar:

- ~~**ROT i JSON-exporten kräver 0023**~~ Gjort: 0023 är körd, och
  JSON-exporten som owner gav ROT-begäran 2610 och faktura 10005 med
  tolvsiffrigt personnummer, utan kryptotext, `format.personalNumbers`
  `"plain"` och händelsen `export.json` med `personalNumbersOpened: 2`.
  Det maskerade fallet (accountant, readonly, staff) är provat i testerna
  men inte med en sådan inloggning i webbläsaren.
- **Ett anrop per ROT-köpare** när personnumren öppnas räcker för Binaafy
  men blir långsamt med tusentals ROT-fakturor; då behövs en
  databasfunktion som öppnar alla i ett anrop.
- ~~**Filnamnen på fakturorna har webbplatsens varumärke**~~ Gjort:
  `invoiceFileName` tar säljarnamnet ur fakturans frysta dokument
  (`document.seller.name`, samma namn som e-postens "från"), så Testbolags
  fakturor heter `Faktura-1-Testbolag-AB-….pdf` i e-posten, påminnelsen,
  portalen, API:t och PDF-arkivet. Medvetet beslut: Binaafys heter efter
  företagsnamnet på fakturan, inte varumärket (`Binaafy-AB` om säljaren
  heter Binaafy AB), och namnet ändras aldrig när fakturan väl är utfärdad.
- **Allt byggs i minnet i ett anrop.** Zippen för en organisation med
  tusentals fakturor bör bli ett bakgrundsjobb som lägger filen i Storage
  och mejlar en länk; `maxDuration` är 300 s för zippen och 120 s för JSON.
- **Projektkostnaderna** (`project_costs`), offerterna och portalens
  projekt är inte med i JSON-filen; den täcker faktureringskärnan.
- **CSV för verifikationer** finns inte; SIE-filen och JSON-filen har dem.

Kontroll: 11 nya tester för exporten, 272 gröna totalt (`npm test`), lint (utan `.claude/worktrees`) och typkontroll rena.

## Läge 2026-10-20: fas 5 (produkt), det som går utan externa avtal

Migration 0021 är körd i Binaafys Supabase-projekt och provad där i
webbläsaren: organisationen **Testbolag AB** skapades via
`/admin/ny-organisation` (owner, serierna F och V från 1, kontoplan,
inställningar). Dess inställningar sparades och dess första utkast fick
Testbolags säljare och bankgiro. Fakturor och kunder i Testbolag var tomma
och växlaren bytte mellan organisationerna. Binaafys faktura gav 404 i
Testbolag, både i admin och med Testbolags API-nyckel. En inbjudan som
redovisningskonsult visade länken, eftersom MAIL_FROM är tom, och länken
spärrades för fel inloggad adress. En API-nyckel skapade, utfärdade och
betalade faktura 1 i Testbolag. Idempotent omsändning gav samma id, en annan
kropp gav 422 och nyckeln gav 401 efter återkallning. Peppol-XML:en för
faktura 1 kom ut utan anmärkningar, med köparens 0007:5566778899. Faktura
10005 gav 422, eftersom köparen är privatperson; med `?trots=1` kom filen ut
ändå. Cron levererade tre webhooks till httpbin.org med giltig X-Signature.

| Del | Fil |
|---|---|
| Migration 0021 | `supabase/migrations/0021_organizations.sql`: `create_organization` (security definer: org, owner, serier, `seed_org_accounts`, inställningar), `invitation_info`/`accept_invitation` (inloggad med den inbjudna adressen, 14 dagar, aldrig owner via inbjudan), `org_members` (e-post ur auth.users), triggern `memberships_guard` (alltid en owner, bara owners rör owners), `register_payment`/`mark_invoice_sent`/`mark_invoice_credited` med `can_write_org_or_system` (API:t kör med service role), webhook-kön som trigger på `events`, `webhook_deliveries.failed_at` |
| RLS-prov | `supabase/tests/0021_rls.sql`: två organisationer och en konsult i en transaktion som rullas tillbaka; körd i PGlite mot 0001–0021 |
| Inställningar | `lib/core/org/settings.ts` (zod: företaget på fakturan, betalning, villkor per kundtyp, dröjsmålsräntetext, påminnelser, räkenskapsår, kontoplansöverstyrningar; testad), `lib/core/org/settings-store.ts` (första organisationen faller tillbaka på Företaget, Offertuppgifter och miljövariablerna tills raden sparas; andra organisationer aldrig), `/admin/installningar` med `components/admin/org/OrgSettingsEditor.tsx` på `EditorForm` |
| Läsare av inställningarna | `lib/core/invoices/seller.ts`, `lib/core/reminders/store.ts`, `lib/core/invoices/send.ts`, `lib/pdf/render-invoice.tsx`, `lib/core/ledger/sie-export.ts` (räkenskapsåret i `#RAR`), konteringen via `currentChart()`, offerterna via `lib/quotes/profile.ts` (se 0022 nedan) |
| Sessionens organisation | `lib/core/org/current.ts` (cookien `org` bland användarens medlemskap, annars första; `currentOrgId()` för skrivning, `readOrgId()` för läsning, null för portalkunder), `lib/core/db.ts` (`asSystem(fn, orgId)`). Alla kärnstores filtrerar och skriver med org_id: kunder, fakturor, betalplaner, ROT, bankfil, verifikationer, kontoplan, låsta perioder, återkommande, projektkostnader, händelser, samt projekt- och offertlistorna |
| Roller | `lib/core/org/roles.ts` (testad), `lib/admin.ts` (`requireRole("read" \| "write" \| "admin")`; `checkAdmin()` = staff eller högre), `proxy.ts` (medlemskap i stället för `is_admin()`, läsare når bara Ekonomi, Bokföringen, fakturor, kunder, ROT, Organisation), menyn per roll |
| Organisation och onboarding | `/admin/organisation` (medlemmar, roller, inbjudningar), `/admin/ny-organisation`, `/admin/inbjudan/[token]` (inloggningslänk till den inbjudna adressen via `/mitt-projekt/callback?next=`), `lib/core/org/members.ts`, `app/admin/org-actions.ts`, växlaren `components/admin/OrgSwitcher.tsx` |
| Peppol | `lib/render/ubl/peppol-bis-billing-3.ts` (Invoice och CreditNote, golden file i testet), `lib/core/peppol/provider.ts` (gränssnittet och "manual"), `/admin/fakturor/[id]/peppol.xml` (validering, 422 med skälen, händelsen `invoice.einvoiced`), Peppol-id på kunden |
| API v1 | `lib/api/route.ts` (nyckel, scope, `asSystem` med nyckelns org, Idempotency-Key med platshållarrad), `lib/api/schemas.ts`, `lib/api/resources.ts`, `app/api/v1/customers`, `app/api/v1/invoices` (+ `/{id}`, `/issue`, `/payments`, `/pdf`), `lib/api/openapi.ts` genererad ur zod via `lib/api/zod-json-schema.ts`; testat i `lib/api/schemas.test.ts` |
| Nycklar och webhooks | `/admin/api`, `lib/api/admin-store.ts`, `lib/api/webhooks.ts` (signatur, backoff; testad), `lib/api/webhook-delivery.ts`, steget i `app/api/cron/invoices/route.ts` som nu kör varje organisation för sig |

Beslut i fas 5:

- **En sparad inställningsrad gäller som helhet.** Fallbacken till
  Företaget, Offertuppgifter och `SWISH_NUMBER`/`REMINDERS_*` gäller bara
  den första organisationen och bara tills `/admin/installningar` sparas.
  Binaafys rad är inte sparad än: sidan är förifylld, och ett klick på
  *Spara* tar över. En ny organisation får aldrig Binaafys uppgifter.
- **Läsning utan organisation är tillåten, skrivning inte.** En portalkund
  har inget medlemskap och läser med RLS som förut. Systemanrop utan
  organisation (den publika fakturasidan) läser på id. Varje insert kräver
  `currentOrgId()`, som hellre kastar än gissar.
- **Roller:** accountant och readonly läser; staff och uppåt skriver;
  owner/admin äger inställningar, medlemmar, nycklar och webbplatsens
  innehåll. Owner blir man bara genom att en owner ändrar rollen.
- **Peppol, tre avsteg från det första upplägget,** med regelnumren i
  filens huvud:
  - en enda `cbc:Note` på dokumentnivå (PEPPOL-EN16931-R002)
  - bankgiro som `PayeeFinancialAccount/ID` med `SE:BANKGIRO` i
    `FinancialInstitutionBranch/ID` (SE-R-007..010), inte som schemeID
  - F-skatt både som `PartyTaxScheme` TAX och som `CompanyLegalForm`

  ROT är inte rabatt och inte förskott: `PayableAmount` är hela beloppet
  inkl. moms. Avdraget och beloppet att betala står som text i Note och
  PaymentTerms, utan personnummer. **SFTI:s rekommendation för ROT ska
  verifieras innan första skarpa sändning.**
- **API:et är camelCase som dokumentet**, belopp i öre. Idempotency-Key krävs
  på alla POST. Ett 5xx sparas inte, så klienten kan försöka igen.
- **Webhooks signeras** `X-Signature: t=<unix>,v1=<HMAC-SHA256("t.kropp")>`.
  Upp till 8 försök med 1, 2, 4 … minuters väntan, men cron går en gång om
  dygnet, så i praktiken blir det ett försök per dag tills cron körs oftare.

Kvar efter fas 5:

- **Externa avtal:** riktig Peppol-accesspunkt (Pagero, Qvalia,
  Unifiedpost) bakom `PeppolProvider`, öppen bankdata (Enable Banking,
  Tink), BankID-inloggning och signering (Criipto, Signicat), Swish Handel
  med callback.
- **Affär och juridik:** prissättning, personuppgiftsbiträdesavtal per
  organisation, produktnamnet.
- ~~**Offerterna och webbplatsen**~~ Gjort med 0022, se nedan.
  ~~**Projektrapporten**~~ läser sedan 2c6c741 avsändaren ur projektets
  organisation (`getQuoteProfile(project.org_id)`), företagsnamnet i stället
  för logotyp där ingen finns; `REPORT_VERSION` 2 ritar om cachade rapporter.
- **Brutet räkenskapsår:** SIE-filen följer inställningen, men
  verifikationsserien V numreras per kalenderår i databasen.
- **Rutt- och anropsgränser per nyckel**, loggning av varje API-anrop i
  `events` och fler resurser (betalplaner, ROT, händelser) i API:t.
- **Inbjudan via inloggningslänk** kräver att
  `<sajt>/mitt-projekt/callback**` finns bland Redirect URLs i Supabase
  Auth. Inbjudningsmejl kräver `MAIL_FROM`.
- ~~**Krypteringen av personnummer**~~ Gjort med 0023, se nedan.
- **Testdata:** Testbolag AB (kund, faktura 1 betald, en återkallad nyckel,
  webhook mot httpbin, en öppen inbjudan) ligger kvar. `reset-invoicing.sql`
  tar inte bort organisationer, så Testbolag tas bort separat före skarp
  drift.

Kontroll: 251 tester gröna (`npm test`), lint och typkontroll rena.

### Offerterna och webbplatsen per organisation (0022)

Migration 0022 är körd i Binaafys projekt och provad i webbläsaren med en
användare som är owner i både Binaafy och Testbolag. I Testbolag syns inga
innehållslänkar i menyn, och `/admin/innehall/*` skickas till Ekonomi.
Förfrågningar och offerter är tomma, CSV-exporten har bara rubrikraden,
och Binaafys förfrågan, offert och offert-PDF ger 404. Uppladdning till
galleriet ger 403. En provoffert i Testbolag (1010, borttagen) fick
Testbolags namn i stället för logotypen, Testbolags säljare, bankgiro och
undertecknare, och filnamnet `Offert-1010-Testbolag-AB.pdf`. I Binaafy är
innehållet, förfrågningarna och offert-PDF:en som förut.

| Del | Fil |
|---|---|
| Migration 0022 | `supabase/migrations/0022_site_org.sql`: `is_site_admin()` = owner/admin i `default_org()`; `content_blocks`, `content_history`, `services`, `projects`, `cases`, `gallery_images`, `admins` och bucketen `gallery` byter `is_admin()` mot den; `leads` läses och uppdateras med `can_write_org(org_id)`; `is_admin()` omdefinieras till `is_site_admin()` |
| RLS-prov | `supabase/tests/0022_rls.sql`: owner i en andra organisation, personal och owner i webbplatsens organisation, utloggad; körd i PGlite mot 0001–0022 (och fäller den gamla `is_admin()`) |
| Webbplatsens organisation | `lib/core/org/site.ts` (`siteOrgId()`, `isSiteOrg()`), rollen `"site"` i `lib/core/org/roles.ts` (testad), `requireRole("site")` och `check.site` i `lib/admin.ts`, `proxy.ts` (`/admin/innehall` bara för webbplatsens owner/admin), menyn, `app/admin/(dashboard)/innehall/layout.tsx`, innehålls-, case-, projekt- och uppladdningsåtgärderna |
| Offertens avsändare | `lib/quotes/profile.ts` (testad) och `profile-store.ts`: säljare, betalning, F-skatt, momsnummer och undertecknare ur `getOrgSettings(offertens org)`, läst som system så att portalen också får dem; texterna per sida ur Offertuppgifter bara för webbplatsens organisation, andra börjar tomt; logotyp och varumärke bara för webbplatsens organisation. Används av `lib/pdf/render.tsx`, `lib/quotes/send.ts`, PDF-routerna och `createQuoteFromTemplate` (betalningsvillkor per kundtyp) |
| Per organisation | `lib/quotes/store.ts` (enskild offert, ändring, borttagning, mallar), `lib/leads.ts` (lista, räknare, förfrågan, uppdatering), Bokföringens SIE-filnamn |

Beslut:

- **Webbplatsen har ingen org_id; den tillhör `default_org()`.** Bara den
  organisationens owner/admin skriver i den, och formulären på sajten lägger
  förfrågningarna där. En andra sajt kräver org_id på innehållet, vilket inte
  behövs nu.
- **Rättigheter i databasen följer användaren, inte cookien.** Den som är
  owner i båda organisationerna får fortfarande skriva webbplatsens innehåll
  enligt RLS när växlaren står på Testbolag; det är appen (proxy,
  `requireRole("site")`, filtren på `org_id`) som håller isär dem. En
  användare som bara är med i Testbolag stoppas av RLS också.
- **Förfrågningar är för personal och uppåt**, som offerterna; läsrollerna
  gäller ekonomin.

Kontroll: 255 tester gröna (`npm test`), lint (utan `.claude/worktrees`) och
typkontroll rena.

### Kryptering av personnummer (0023)

Migration 0023 är körd i Binaafys Supabase-projekt, efter att nyckeln
`rot_pnr_key` skapades i Vault, och `supabase/tests/0023_rot_pnr.sql` gick
igenom där. Provat i webbläsaren mot databasen:

- `/admin/rot` som förut
- faktura 10005 visar `19850412-XXXX`, och *Visa* ger owner hela numret
- XML-filen för den gamla begäran (ROT 2610) har `<Kopare>` med tolv
  siffror ur den krypterade kolumnen

En ny faktura i Testbolag AB med Skatteverkets testnummer 121212-1212
sparades som `19121212-XXXX` plus kryptotext. Den gick sedan att utfärda
och betala, ROT-sidan visade den maskerad, och den nya begärans XML fick
`<Kopare>191212121212</Kopare>`. Begäran markerades som skickad och sedan
avvisad, och fakturan blev begärbar igen. Serverloggen var utan fel.

**Upplägg: pgcrypto med nyckeln i Supabase Vault, i databasen.** Vault gick
att nå från security definer-funktioner (ägda av postgres), så det behövdes
ingen kryptering i applikationen och ingen nyckel i Vercels miljövariabler.
Nyckeln lämnar aldrig databasen och slumpades fram där med
`vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'),
'rot_pnr_key', …)`. Varje organisation får en egen härledd nyckel
(Vault-nyckeln plus org_id), så en kryptotext går inte att öppna i en annan
organisation. Krypteringen är `pgp_sym_encrypt` (AES-256) av det tolvsiffriga
numret.

**Personnumret låg på fler ställen än i `rot_buyers`.** Det fanns också i
klartext i fakturans dokument (`invoices.document -> se.rot.buyers`), som
alla medlemmar och portalkunden läser. `rot_buyers` fylls dessutom först när
en begäran skapas. Därför krypteras dokumentet också:

- En trigger på `invoices` och `recurring_invoices` byter varje klartext mot
  `ÅÅÅÅMMDD-XXXX` och lägger kryptotexten i `personalNumberSealed`, oavsett
  väg in: formuläret, API:t, offert, betalplan eller kreditering.
- `rot_buyers` får `personal_number_enc` (bytea) och
  `personal_number_masked`. Klartextkolumnen är borttagen, och kryptotexten
  går inte att välja ens för owner/admin (kolumnrättigheter).
- Klartext ges bara av `invoice_buyer_pnr()` och `rot_buyer_pnr()`, för
  owner/admin i organisationen eller service role. I appen sker det i
  XML-routen, med *Visa* på fakturasidan och i JSON-exporten för owner/admin.

| Del | Fil |
|---|---|
| Migration 0023 | `supabase/migrations/0023_rot_pnr_encryption.sql`: `rot_pnr_key` (Vault), `rot_pnr_normalize`, `rot_pnr_encrypt`/`_decrypt`, `rot_pnr_seal_document`, triggrarna `invoices_seal_pnr` och `recurring_invoices_seal_pnr`, `rot_buyer_from_invoice` (kopierar kryptotexten till en begäran utan att dekryptera), `rot_buyer_pnr`, `invoice_buyer_pnr`; krypterar befintliga fakturor (även utfärdade), mallar, sparade API-svar (`idempotency_keys`) och `rot_buyers`; avbryter utan ändringar om nyckeln saknas |
| Prov | `supabase/tests/0023_rot_pnr.sql`: owner, staff, readonly, accountant i A och owner i B, i en transaktion som rullas tillbaka; i PGlite med en ersättning för Vault (provnyckel i `vault.decrypted_secrets` i transaktionen), i Supabase med den riktiga nyckeln |
| Dokumentet | `lib/core/documents/invoice.ts`: `MASKED_PERSONAL_NUMBER`, `personalNumberSealed`, `hasRotPersonalNumber()` i `validateForIssue` |
| Visning | `lib/core/rot/pnr.ts` (`maskPersonalNumber`, `formatPersonalNumber`, `withPlaceholderPersonalNumbers`; testad), ROT-sidan, fakturasidan med `components/admin/invoices/RevealPersonalNumber.tsx` och `revealPersonalNumberAction`, fakturans PDF |
| ROT | `lib/core/rot/store.ts`: kandidaterna och begärandena bär det maskerade numret, `createClaim` via `rot_buyer_from_invoice`, `openClaimPersonalNumbers`, `openInvoiceBuyerPersonalNumber`; `app/admin/(dashboard)/rot/[id]/xml/route.ts` öppnar numren (403 för personal) |

Beslut:

- **Fakturans PDF visar `ÅÅÅÅMMDD-XXXX`.** Skatteverkets krav på fakturan
  nämner fastighet, kostnader och skattereduktion men inte personnumret,
  som behövs i begäran. PDF:er som redan har skickats har kvar numret.
- **Utfärdade fakturors dokument skrevs om en gång.** Låset
  (`invoices_freeze`) och `updated_at` var avstängda under just den
  uppdateringen. `sha256` räknades om för det krypterade dokumentet, och
  triggern gör samma sak om `issue_invoice` någon gång får en klartext.
- **Personal får skapa en begäran men inte ladda ner filen.** Tidigare föll
  personalens begäran på RLS i `rot_buyers`. Nu kopierar
  `rot_buyer_from_invoice` kryptotexten, medan XML-filen, som innehåller
  numren, är för owner/admin.
- **Ingen hash för att känna igen samma köpare.** Koden behöver den inte,
  och en hash av ett personnummer går att gissa sig tillbaka från.
- **Nyckeln ska ha en kopia utanför Supabase,** i lösenordshanteraren.
  Försvinner den går personnumren inte att läsa.

Kvar:

- ~~**Offerterna**~~ Gjort med 0024, se nedan.
- **Ingen logg över vem som öppnat ett nummer** i `invoice_buyer_pnr` och
  `rot_buyer_pnr`; JSON-exporten loggar sina egna.
- **Nyckelbyte** saknas och kräver omkryptering av alla rader.
- **Det maskerade numret kontrolleras inte mot kryptotexten.** Personal kan
  i teorin para ihop fel maskering med en kryptotext i samma organisation.
  Det påverkar bara visningen; XML-filen tar kryptotexten.
- **Personal ser länken till XML-filen** och får 403 med en förklaring;
  ROT-sidan kunde dölja den efter roll.
- **Testdata:** faktura 2 i Testbolag AB (kunden Tolvan Prov, betald, en
  avvisad testbegäran) ligger kvar och tas bort med Testbolag.

Kontroll: 270 tester gröna (`npm test`, med de pågående sessionernas),
lint (utan `.claude/worktrees`) och typkontroll rena; PGlite mot 0001–0023
med gamla klartextrader före 0023, och 0021_rls, 0022_rls och 0023_rot_pnr
gröna.

### Personnummer i offerterna (0024)

`quotes.data.rotPersons[].personalNumber` låg i klartext, och offertens PDF
(även i kundportalen) skrev ut numret. Migration 0024 gör samma sak som 0023
gör för fakturorna, med 0023:s nyckel och funktioner. Migrationen är körd i
Binaafys Supabase-projekt. Provat i webbläsaren mot databasen, i Testbolag AB:

- offert 1013 sparades med testnumret 121212-1212; formuläret visar sedan
  `19121212-XXXX`, och PDF:en visar "Tolvan Offertprov (19121212-XXXX)"
  utan det fullständiga numret
- fakturautkastet från offerten fick `19121212-XXXX` och offertens kryptotext;
  faktura 3 utfärdades och betalades
- begäran "Prov 0024" för faktura 3 gav `<Kopare>191212121212</Kopare>` i
  XML-filen. Begäran ligger kvar oskickad och tas bort med Testbolag, liksom
  offerten, kunden Tolvan Offertprov och fakturan

Ändringen:

- En trigger på `quotes` och `quote_templates` byter varje klartext mot
  `ÅÅÅÅMMDD-XXXX` och lägger kryptotexten i `personalNumberSealed`.
  Befintliga offerter krypteras i migrationen utan att `updated_at` ändras.
- Offertschemat tar emot det maskerade numret bara med kryptotexten bredvid
  ("Skriv hela personnumret igen." annars). Formuläret visar det maskerade
  numret; ett nytt nummer ersätter kryptotexten och krypteras när det sparas.
- Offertens PDF visar `ÅÅÅÅMMDD-XXXX`, även i demoläget. Kundportalen visar
  offerten bara som den PDF:en.
- `rotBuyersFromQuote()` i `lib/core/invoices/from-quote.ts`, som även
  betalplanen använder, kopierar det maskerade numret och kryptotexten till
  fakturans `se.rot.buyers`. Fakturans trigger lämnar dem orörda, så
  `invoice_buyer_pnr()` och ROT-begäran får hela numret. Offerten har ingen
  egen funktion för att öppna numret; det behövs först på fakturan.

| Del | Fil |
|---|---|
| Migration 0024 | `supabase/migrations/0024_quote_pnr.sql`: `rot_pnr_seal_persons`, `rot_pnr_seal_quote`, triggrarna `quotes_seal_pnr` och `quote_templates_seal_pnr`; krypterar befintliga offerter och mallar; avbryter utan ändringar om nyckeln saknas |
| Prov | `supabase/tests/0024_quote_pnr.sql`: owner och staff i A, owner i B; offert, mall och faktura från offerten, i en transaktion som rullas tillbaka (Vault ersätts i PGlite) |
| Kod | `lib/quotes/schema.ts`, `components/admin/quotes/QuoteEditor.tsx`, `lib/pdf/QuotePdf.tsx`, `lib/core/invoices/from-quote.ts` och `from-plan.ts` (testad i `from-quote.test.ts`) |

Kontroll: 274 tester gröna (`npm test`), lint (utan `.claude/**`) och
typkontroll rena; PGlite mot 0001–0024 med en gammal klartextoffert före
0024, och 0021_rls, 0022_rls, 0023_rot_pnr och 0024_quote_pnr gröna.

## Läge 2026-10-20: fas 0–4 kodade och körda mot Supabase

Migrationerna 0001–0020 är körda i Binaafys Supabase-projekt, och hela
flödet för fas 0–4 är provat där i webbläsaren med testdata (kund, fakturor
10001–10006, offert, projekt med betalplan, ROT-begäran, bankfil,
påminnelse, låst period, återkommande fakturor, projektkostnader).
Testdatan tas bort med `supabase/reset-invoicing.sql` före skarp drift.
`npm run db:check` läser av kärnans tillstånd i projektet.

**Fas 4 kodad 2026-10-20** och provad mot databasen (oktober 2026 visar
verifikationerna V1–V11 och momsrutorna, SIE-filen börjar med
`#FLAGGA 0` och är PC8-kodad, augusti 2026 är låst och händelsen
`export.sie` loggad; två återkommande mallar gav i cron faktura 10006
utfärdad automatiskt och ett utkast, och en andra körning samma dag gav
ingenting; två kostnader på projektet gav täckningsbidrag och marginal):

| Del | Fil |
|---|---|
| Perioder och moms | `lib/core/ledger/period.ts` (rena funktioner, testade): månadens intervall, föregående månad, saldon per konto, momsunderlag med momsdeklarationens rutor 05/06/07/42 (försäljning), 10/11/12 (utgående moms) och 41 (byggtjänster, omvänd), rörelse på 1510, 1513 och 1930, låsning bara av månader som är slut, filnamnet |
| Huvudboken som den lagras | `lib/core/ledger/store.ts`: verifikationer med rader per datumintervall, kontoplanen, `period_locks`, `lockPeriod` (insert med `default_org()`, 23505 = redan låst, händelsen `export.sie`); demo-läget läser fakturastorens huvudbok |
| SIE-export | `lib/core/ledger/sie-export.ts` (företaget från Företaget, kalenderår som räkenskapsår), `app/admin/(dashboard)/ekonomi/export/sie/route.ts` (GET `?period=ÅÅÅÅ-MM`, PC8, bilaga `<företag>-<period>.se`, bara admin) |
| Sidan Bokföringen | `app/admin/(dashboard)/ekonomi/export/page.tsx`: 12 månader att välja, nyckeltal, momsdeklarationens rutor, *Lås perioden*, saldon per konto, verifikationer, låsta perioder; `app/admin/export-actions.ts`; länken *Till bokföringen* på Ekonomi. Triggern `journal_entries_check_lock` (0014) stoppar nya verifikationer i en låst månad |
| Återkommande fakturor | `lib/core/invoices/recurring-schedule.ts` (testad: månad, kvartal, år, månadsslut), `lib/core/invoices/recurring.ts` (mot `recurring_invoices`: skapa från faktura, pausa, ta bort, `runDueRecurring` med optimistisk flytt av `next_on`), `app/admin/(dashboard)/fakturor/aterkommande/page.tsx`, `app/admin/recurring-actions.ts`, knappen *Gör återkommande* på fakturan, steget i `app/api/cron/invoices/route.ts` |
| Projektkostnader | `supabase/migrations/0020_project_costs.sql` (`project_costs`, RLS: medlemmar i organisationen läser, personal skriver på egna projekt; kunden ser inget), `lib/core/projects/costs.ts`, `app/admin/cost-actions.ts` |
| Marginal och upparbetat | `lib/core/projects/economy.ts` (testad): kostnader per typ, fakturerat exkl. moms, täckningsbidrag, marginal i procent, upparbetat ej fakturerat; delen *Kostnader och marginal* i `components/admin/projects/ProjectEconomy.tsx` |

Beslut i fas 4:

- **Låsning är ett eget klick, inte en följd av nedladdningen.** En låst
  månad tar inte emot verifikationer, så den som laddar ner oktober mitt i
  oktober ska inte stoppa resten av månadens fakturor. Bara månader som är
  slut kan låsas. Rättelser görs med en verifikation i en öppen period.
- **Momsunderlaget är bara försäljningssidan.** Ruta 05–12, 41 och 42 ur
  huvudboken; 06, 07 och 08 uppstår aldrig ur en faktura och står som noll.
  Inköp och ingående moms (48) hör till bokföringen. Påminnelseavgifter
  och dröjsmålsränta ligger utanför momsen och syns bara som saldon.
- **Räkenskapsåret är kalenderåret** i SIE-filen (`#RAR 0`) tills
  `org_settings` har ett räkenskapsår.
- **En återkommande mall som ligger efter tar igen ett intervall per
  körning**, så att en pausad och återupptagen avtalskund aldrig får flera
  fakturor samma morgon. Fakturan avser perioden från datumet till dagen
  före nästa (BG-14). Sista dagen i en månad förblir sista dagen (28 feb →
  31 mar); en dag som saknas blir månadens sista (31 jan → 28 feb), och
  därefter följer mallen månadsslutet. ROT och ÄTA-kopplingar följer inte
  med till mallen. Utskicket sker alltid för hand.
- **Upparbetat räknas ärligt och enkelt:** klara faser vägda efter sina
  dagar i tidplanen som andel av offerten exkl. moms, minus det som är
  fakturerat av offerten exkl. moms. ÄTA (faser och fakturarader) räknas
  inte på någon sida. Negativt betyder förskott, vilket en betalplan med
  30 % vid start ger.
- **Kostnader är interna siffror, inte bokföring:** de kan tas bort, och
  timmar räknas med ett internt timpris (vad timmen kostar företaget).

Kvar efter fas 4:

- **Fortnox-koppling** (push av verifikationer via Fortnox API) är inte
  byggd; SIE-filen täcker alla bokföringsprogram tills vidare.
- ~~**Övrig full export**~~ (CSV för kunder, fakturor och betalningar,
  PDF-arkivet som zip, JSON av allt) är gjord, se *Läge 2026-10-20: full
  export*; ~~**Peppol-XML**~~ gjordes i fas 5.
- **Att göra på dashboarden** visar ännu inte "period ej exporterad", och
  låsningen har ingen påminnelse.
- **Kostnader läses in för hand.** Leverantörsfakturor som fil eller via
  bokföringen, och tidrapportering från fältet, är inte byggt. Kostnaderna
  syns inte i SIE-filen (inköp bokförs i bokföringsprogrammet).
- **Återkommande fakturor skickas inte automatiskt**; utkast och utfärdade
  fakturor skickas med knappen på fakturan. Mallen ändras genom att ta bort
  den och göra en ny från en uppdaterad faktura.
- **Räkenskapsår och kontoplan per organisation** i `org_settings` (fas 5).
- RLS-regeln att kunden inte ser `project_costs` följer av att kunder
  saknar `memberships`; den är inte provad med ett kundkonto i
  webbläsaren.

Kontroll: 213 tester gröna (`npm test`), lint och typkontroll rena.

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
| PDF-mallen (2026-10-21) | Klassisk svensk faktura av Fortnox-typ i offertens typsnitt, svart på vitt med tunna linjer: namn eller logotyp, "Faktura"/"Kreditfaktura" med nummer, datum och "Sida n(m)", fakturaadressen i fönsterkuvertets läge, två kolumner villkor (tomma fält skrivs ut, så alla fakturor har samma form; Kundnr, Ert ordernr, Leveransvillkor och Leveranssätt saknar fält i dokumentet och står tomma, liksom Artnr), artikeltabellen ned till summarutan (Netto, Exkl. moms, Moms, vid ROT Inkl. moms och ROT-avdrag, Öresavr, ATT BETALA), momsspecifikation per sats, ROT- och omvänd moms-texterna, "Betalas till bankgiro …, ange OCR …" och Swish-QR:en, sidfot med adress, kontakt, konton och säte (ortens namn), org.nr, momsreg.nr och F-skatt. Säljaren ur det frysta dokumentet, logotypen ur organisationens profil (`getQuoteProfile`, annars namnet). Fler rader fortsätter på nästa sida under samma huvud; summarutan bara på sista. Ingen faxrad. Testad i `lib/pdf/invoice-pdf.test.ts` (faktura, kredit, ROT, omvänd, logotyp med Swish, 40 rader på två sidor; `INVOICE_PDF_OUT=<mapp>` sparar filerna) |
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

- ~~**Migrationerna mot Supabase.**~~ Gjort 2026-10-20: 0001–0020 är
  körda i Binaafys projekt, se läget ovan.
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
- ~~**Projektets kostnadssida**~~ och "upparbetat men ej fakturerat":
  gjort i fas 4.
- **Peppol-renderaren** (`lib/render/ubl`) väntar till fas 5; dokumentet är
  redan format efter standarden.
- ~~**Kryptering av personnummer**~~ gjort med 0023 (fas 5).
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
egen tabell `rot_buyers` med striktare RLS (bara `owner`/`admin`), och
personnumren är krypterade med `pgcrypto` och nyckel i Supabase Vault, även i
fakturadokumentet (0023). De visas aldrig i portalen. Supabase-projektet ligger i en
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
