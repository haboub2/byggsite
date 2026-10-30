# Skatteverket's APIs for payroll: what the vendor application needs

Status: **preparation, written 2026-10-30 (phase 6 of `docs/hr-lon.md`). Nothing
has been sent to Skatteverket.** This document says what the two APIs are,
what Skatteverket asks of a programvaruföretag, what the system already
produces, what has to change for API submission, and holds a filled-in
draft of the application for you to check and send. Swedish terms are kept
as Skatteverket uses them. Sources were read on 2026-10-30; the documents
are dated 2018–2024 and Skatteverket's Utvecklarportal may have moved on,
so check each item against the portal before sending anything.

## 1. The two services and why we want them

| Service | What it gives us | Today |
|---|---|---|
| **Arbetsgivardeklaration inlämning** (API, v1.6) with **Arbetsgivardeklaration hantera redovisningsperiod** (API, v1.0) | The AGI file we already build is read into the employer's *Eget utrymme* at Skatteverket, checked there, and a *djuplänk* takes the signer to Mina sidor to sign. The second API reads back status, the summeringsrapport and the *kvittens*, and locks or unlocks the period. | The owner downloads the XML from Lönerapporter and uploads it in the e-service, then marks it "lämnad" by hand. |
| **Fråga om skatteavdrag 2.0** (Partner API) | Each person's skatteform (A, F, FA), skattetabell and any jämkning (procentbeslut with giltig från/till) for an inkomstår, for up to 1 000 personnummer per call. | The table, column and jämkning are typed in from the A-skattsedel; `employee_tax.source` says where the row came from (`a-skattsedel`, `manual`, or `skatteverket-api`, which nothing writes yet). |

Neither API sends anything on its own. The AGI is still signed by a behörig
företrädare on Mina sidor with e-legitimation; the API only puts the
underlag there and gets the result back. This fits the plan's rule that the
system prepares and a person submits.

## 2. What Skatteverket asks of the vendor

From the Allmänna villkor for *Arbetsgivardeklaration inlämning via API*
(version 1.0, 2018-10-25), the avtal for *Fråga om skatteavdrag via öppet
API* and the avtal for *Hantera redovisningsperiod*, and the connection
pages on skatteverket.se.

**The company (section 4 of the terms, the same for every API).**
Registered in aktiebolagsregistret, for mervärdesskatt and as arbetsgivare,
godkänd för F-skatt, and free of skatteskulder at Kronofogden. Binaafy AB
is all of these; confirm the Kronofogden point the day the application is
sent.

**The agreement.** One avtal per API, signed by both parties, "gäller tills
vidare", each party bears its own costs, no fee. Bilaga A is the Allmänna
villkor with the tjänstebeskrivning and the förändringspolicy as
underbilagor. Skatteverket may audit ("inhämta skriftligt underlag",
"kalla till möte"), suspend on breach, and terminate with 30 days' notice
or at once on a legal change; we may terminate any time in writing to
Skatteverket, Att: Öppna API, 171 94 Solna. Rights cannot be transferred.

**Technical environment.** Personal data received from Skatteverket must be
processed "i en teknisk miljö som fysiskt befinner sig inom EU- eller
EES-området". Our Supabase project and the Next.js host must therefore be
in an EU region (check the project's region and the Vercel/host region
before applying; move if not).

**Personuppgifter (section 7).** Skatteverket processes under art. 6.1 e;
the employer (Slutanvändaren) is personuppgiftsansvarig for what is read
into Eget utrymme; **we are personuppgiftsbiträde for the employer**, and
Skatteverket asks that the vendor "självständigt skriftligen avtala om
fördelningen av personuppgiftsansvaret" with the employer. So the product
needs a personuppgiftsbiträdesavtal (PUB-avtal) with every organisation
that uses the API, and the processing register under Inställningar
(section 9 of the plan, rule 10) should list it.

**Upplysningsskyldighet (section 8).** The product must tell the user, at
the time and in the screen, that:

- reading the underlag into Eget utrymme does **not** fulfil the
  uppgiftsskyldighet; granskning and inlämning happen in Skatteverket's
  e-service on Mina sidor with e-legitimation;
- when the underlag was saved in Eget utrymme, and when it was not and
  why (Skatteverket's kontrollresultat);
- what each felmeddelande the API returns means (the codes in the
  tjänstebeskrivning, section 4.1.2.2);
- what the djuplänk is for when it is shown;
- that Skatteverket auditloggar every call and keeps the logs up to five
  years.

**Marketing.** Skatteverket's logo may not be used; "Skatteverket" is named
as the source. Nothing that could harm trust in Skatteverket.

**Identities and authorisation (tjänstebeskrivning section 2.2 and 5.1.4,
"Börja använda API:er").**

- The software is identified with **client_id and client_secret** (API
  keys), one pair for the komplett testtjänst and another for the
  driftsatt tjänst; production keys arrive one by e-mail and one by SMS.
- The **extern användare** (the employer, or we on its behalf) is
  authenticated with an **organisationscertifikat** from a CA Skatteverket
  accepts (the page says "för närvarande … endast organisationslegitimationer
  som är utfärdade av Expisoft") or with **e-legitimation** (BankID) through
  Skatteverket's IDP; the AGI APIs use **OAuth 2.0 Authorization Code Grant
  over TLS 1.2**, Fråga om skatteavdrag 2.0 uses **Client Credentials
  Grant**. Each OAuth flow has its own token URI on the portal.
- The person or organisation must hold an **ombudsbehörighet** for the
  employer in Skatteverket's ombudsregister: firmatecknare,
  deklarationsombud or **registreringsombud arbetsgivardeklaration** (the
  last is the one an organisationscertifikat can carry; it may read in and
  edit but not sign). The employer's firmatecknare or VD registers it in the
  e-service Ombud och behörigheter.
- A cloud service may use **its own organisationscertifikat** for all its
  customers ("kan molntjänstleverantören använda ett eget
  Organisationscertifikatet"), and is then responsible that each customer
  only reaches its own data. That is our model: Binaafy's certificate,
  our row-level filter on `org_id`, and the employer's registreringsombud
  pointing at Binaafy AB's organisationsnummer.
- Only the organisation id that made an inlämning may read its
  kontrollresultat, save, cancel or delete it.
- Every call carries **skv_client_correlation_id** (our request id; up to
  36 characters), which Skatteverket returns and logs.

**Test before production.** Each API comes in three releases: *enkel
testtjänst* (mock, static data, open in the portal), *komplett testtjänst*
(sandbox, dynamic data, keys by form; test certificates from Expisoft and
test BankID), *driftsatt tjänst* (production, after the agreement). Test
keys never work in production. The sandbox answers within 3 s for up to
10 individuppgifter, 10 s to 100, a minute to 1 000; message size up to
100 MB in test and 300 MB in production.

## 3. The APIs in detail, as read

### Arbetsgivardeklaration inlämning v1.6 (base `/arbetsgivardeklaration/inlamning/v1/`)

Hosts `api.test.skatteverket.se` and `api.skatteverket.se`. HTTPS/REST, headers
`client_id`, `client_secret`, `SKV-client_correlationid`, OAuth bearer
token. Eight operations:

| Operation | Call | What it does |
|---|---|---|
| Läs in underlag | `POST /underlag` with the AGI **XML** (the schema we already write, `arbetsgivardeklaration_1.1.xsd`) | Returns an `inlamningId` (long, up to 16 digits). One message may hold several employers and periods. |
| Hämta kontrollresultat | `GET /underlag/{inlamningId}/kontrollresultat` | `PROCESSING`, then `DONE_SUCCESS` (saved in Eget utrymme), `DONE_FAILED` (errors; choose save or cancel within 24 h) or `DONE_REJECTED`. |
| Spara inlämning | `POST /underlag/{inlamningId}/spara` | Keeps an inlämning with errors as a draft to fix on Mina sidor. |
| Avbryt inlämning | `DELETE /underlag/{inlamningId}` | Removes a temporary inlämning with errors. |
| Ta bort sparad inlämning | `DELETE /arbetsgivare/{id}/redovisningsperioder/{YYYYMM}/inlamningar/{inlamningId}` | Removes what we read in from Eget utrymme. |
| Skapa granskningsunderlag | `POST /arbetsgivare/{id}/redovisningsperioder/{YYYYMM}/skapaGranskningsunderlag?lasPeriod=true|false` | Returns `link` (the djuplänk to Mina sidor), `tillstand` (`UNLOCKED`, `LOCKED_FOR_SIGNING`; 409 with `INCORRECT_DATA`, `SIGNING`, `RECEIVING`, `CALCULATING`) and a `meddelande`. Only after our own inlämning for that employer and period. |
| Kontrollera huvuduppgift / individuppgift | `POST /underlag/huvuduppgift/kontrollera`, `/underlag/individuppgift/kontrollera` | One HU or IU as **JSON** (the properties in bilaga A of the tjänstebeskrivning: `agRegistreradId`, `redovisningsPeriod`, `summaArbAvgSlf`, `summaSkatteavdr`, …) checked without saving; answers `success: true|false` only. |

Errors come as `{ kod, meddelandeTillAnvandare, meddelandeTillUtvecklare }`
(400 ogiltigt anrop, 403 scope `agd` missing, 404 kod 31 employer or period
missing, kod 32 inlämning missing, 409 the tillstånd above, 413 kod 27 too
large, 415 kod 30 not XML, 500, 503, 504).

### Arbetsgivardeklaration hantera redovisningsperiod v1.0 (base `/arbetsgivardeklaration/hanteraredovisningsperiod/v1/`)

Same hosts, headers and OAuth. Six operations under
`/arbetsgivare/{id}/redovisningsperioder/{YYYYMM}/…`: `grunddata`
(deklarationsdatum, betalningsdatum, anstånd, `statusEgetUtrymme` from
`READY_TO_RECEIVING` through `CALCULATED`, `SIGNING`, `SIGNED`, `signerad`,
`omprovningInitierad`, `statusUnderlag` OK/STOPP/WARNING/INFO, counts of IU
per status), `handelser` (the last 60 days, who did what), `summeringsrapport`
(Skatteverket's own sums for the period), `kvittenser` (one per signing), and
`POST …/las` and `…/lasUpp`. Rate limit answers 429. Skatteverket notes
(2024-03) that this description has errors about required fields and a
version 1.6 of the document is coming.

### Fråga om skatteavdrag 2.0 (base `/inkomstbeskattning/fraga-om-skatteavdrag/v2/`)

`GET …/{inkomstår}/huvudutbetalare/{orgnr 12 digits}/anstallda/{personnummer}`
for one person, `POST` with a JSON list for up to 1 000. Headers `client_id`,
`client_secret`, `skv_client_correlation_id`, `Accept: application/json`,
OAuth Client Credentials. Per person: `skatteform` (A, F, FA),
`skattetabell` (two digits), `procentbeslut` (two digits, when a jämkning
applies), `giltigFrom`, `giltigTom`, and a `felkod` (0 OK; 1 wrong number;
2 not in skatteregistret; 3 inkomstår not open; 10 cannot be shown, e.g.
not folkbokförd; 11 a jämkning exists that cannot be shown, such as several
skolungdom decisions, the table is given; 12, 13 retry). Inkomstår: the
current year, the previous year until 17 January, the next year from the
grundbeslut in mid December. Rate limit 10 calls/s and 10 000 queued
personnummer per user; wait 10 s on 429 or 503. Service window 03.00–03.30.
Note what it does **not** give: the **kolumn** (we derive it from the birth
year and the pay form as today), and jämkning as a monthly amount (only
percent decisions).

## 4. What the system already produces

- The AGI file in Skatteverket's XML schema 1.1 with the XSDs committed and
  every file validated by `xmllint` in the tests (`lib/core/payroll/agi.ts`,
  `lib/core/rules/agi-format.ts`); HU 487/497 and IU boxes 001, 011, 012,
  013, 018, 023, 131, ticks 050/051, specifikationsnummer per person,
  removals, versions with a diff before a refile (`agi_declarations`,
  0040/0041/0043).
- The status flow `draft → filed → corrected` on `agi_declarations`, set by
  hand ("Markera som lämnad") today.
- Masked and encrypted personnummer with a logged reveal
  (`revealPnr`), which the file writer uses; the API's `skv_client_correlation_id`
  can be our existing `X-Request-Id`.
- `employee_tax` versions with `source` already allowing
  `skatteverket-api`, `tableNo`, `columnNo`, `adjustmentPercent`,
  `adjustmentValidTo`, `mainEmployer`, `validFrom`; the run refuses a table
  that is not imported and warns on an expiring jämkning.
- Per-organisation everything: `org_id` on every row, the employer's
  organisationsnummer in `org_settings`, API keys per organisation
  (`api_keys`), webhooks, and the event log for every change.

## 5. What has to change for API submission

**Data.**

- `agi_declarations`: add `submission` jsonb (or columns): `inlamning_id`,
  `kontrollresultat` with its status and the problems Skatteverket listed,
  `granskningslank` (the djuplänk, short-lived), `tillstand`, and from the
  other API `kvittens` (id, signed at, by whom) and `skatteverket_sums`
  (the summeringsrapport) to compare with ours. New statuses between
  `draft` and `filed`: `uploaded` (in Eget utrymme, DONE_SUCCESS),
  `rejected` (DONE_FAILED/REJECTED; the version stays, a new one is made),
  and `filed` set **from the kvittens**, not by hand. "Markera som lämnad"
  stays as the fallback for the e-service path.
- `employee_tax`: a row with `source = 'skatteverket-api'`, `tableNo` and
  `adjustmentPercent`/`adjustmentValidTo` from the answer, `columnNo`
  derived as today, `note` with the `felkod` text when not 0; a nightly job
  before each run ("nightly refresh before a run", section 8 of the plan)
  that writes a new version only when something changed, and a check on the
  run when the answer is felkod 10 or 11 ("Skatteverket kan inte lämna
  tabellen; använd A-skattsedeln").
- A `skatteverket_calls` log (org, api, operation, correlation id, status,
  at) for the five-year audit question and support.
- Secrets: client_id/secret per environment and the organisationscertifikat
  (PKCS#12) in Vault (`0023`'s pattern), never in the repo or `.env` in
  clear; the certificate's expiry on Idag a month ahead.

**Code.**

- `lib/skatteverket/`: an OAuth client (Authorization Code Grant with the
  certificate for the AGI APIs; Client Credentials for FOS), token cache,
  retry on 429/503 with the 10 s wait, and the correlation id. The
  Authorization Code flow needs a redirect URI registered with Skatteverket
  (`https://<our host>/admin/skatteverket/callback`).
- `agiSubmit(declarationId)`: POST the stored XML (unchanged, so the
  SHA-256 still matches), poll `kontrollresultat`, store the outcome,
  then `skapaGranskningsunderlag` and show the djuplänk with the texts
  section 2 requires; `agiStatus(period)` from `grunddata` and
  `kvittenser` sets `filed` and stores the kvittens; `agiCompare(period)`
  puts Skatteverket's summeringsrapport next to our 487/497 on
  Lönerapporter.
- Lönerapporter › AGI gets "Skicka till Skatteverket" (owner/admin only),
  the status from Skatteverket, the link to sign, and the kvittens; Idag's
  AGI row follows the new statuses.
- Person › Skatt gets "Hämta från Skatteverket"; the nightly job writes the
  rows and logs `employee_tax.versioned`.
- The upplysningsskyldighet texts in the screens, the PUB-avtal in the
  registration flow, and the processing register entry.
- Tests: the tjänstebeskrivning's JSON examples as fixtures for the
  response parsing, the state machine of `tillstand`/`statusEgetUtrymme`,
  and the sandbox walked once by hand with Expisoft's test certificate
  and a test BankID before production.

**Operations.** An EU-region check of Supabase and the host, the
organisationscertifikat bought from Expisoft in Binaafy AB's name, the
customer's firmatecknare registering Binaafy AB as *registreringsombud
arbetsgivardeklaration* in Ombud och behörigheter (a step for "Kom igång
med lön"), and a support mailbox named in the application.

## 6. The application, drafted

Skatteverket's process (skatteverket.se › Om oss › Digitala samarbeten ›
Anslutning och support för våra API:er): one form per API, first "Begär
tillgång till komplett testtjänst", later "Begär tillgång till driftsatt
tjänst"; keys arrive by e-mail (and SMS for production); the avtal is
signed on paper in two copies. The form's fields are not published as a
list; the page names "Mejladress till kontaktperson" and recommends a
shared function mailbox, and says the application becomes an allmän
handling. The answers below cover what the forms and the avtal ask for.
Square brackets are yours to fill or confirm.

**Programvaruföretaget**

- Företag: Binaafy AB, organisationsnummer [559xxx-xxxx], [gatuadress],
  [postnummer] Göteborg.
- Registrerat för: F-skatt, mervärdesskatt, arbetsgivare. Inga skulder hos
  Kronofogden [kontrollera samma dag].
- Behörig firmatecknare som undertecknar avtalet: [Ibrahim Al Haboub,
  titel].
- Kontaktperson och funktionsbrevlåda: [api@binaafy.se], telefon
  [07x-xxx xx xx]. Teknisk kontakt: samma.
- Webbplats: [https://binaafy.se].

**Programvaran**

- Namn: Binaafy Lön (del av Binaafy, en webbtjänst för fakturering,
  projekt, personal och lön för mindre bygg- och tjänsteföretag).
- Anslutningstyp: **molntjänst** (en installation, flera arbetsgivare).
  Varje arbetsgivare är en egen organisation i tjänsten med egen
  behörighetsstyrning; data filtreras på organisationens id i varje
  databasfråga och genom radnivåsäkerhet.
- Teknisk miljö: [Supabase, region eu-…] och [värd, region eu-…], inom
  EU/EES. Ingen behandling utanför EU/EES.
- Identifiering av extern användare: organisationscertifikat utfärdat av
  Expisoft i Binaafy AB:s namn, med behörigheten registreringsombud
  arbetsgivardeklaration som varje arbetsgivare anmäler i Ombud och
  behörigheter. Inloggning med e-legitimation används inte i API-anropen;
  granskning och signering sker av arbetsgivarens behöriga företrädare på
  Mina sidor via djuplänken.
- Redirect-URI för OAuth 2.0 Authorization Code Grant:
  `https://[binaafy.se]/admin/skatteverket/callback` (test:
  `https://[staging.binaafy.se]/admin/skatteverket/callback`).
- Samma API-nycklar för flera driftsatta tjänster: ja, för
  Arbetsgivardeklaration inlämning och Hantera redovisningsperiod (samma
  system).

**Vilka API:er, i vilken ordning**

1. Arbetsgivardeklaration inlämning v1 — komplett testtjänst först, sedan
   driftsatt tjänst.
2. Arbetsgivardeklaration hantera redovisningsperiod v1 — samma två steg.
3. Fråga om skatteavdrag 2.0 — komplett testtjänst, sedan driftsatt
   tjänst (eget avtal).

**Syfte och användning (för "beskriv hur API:et ska användas")**

Binaafy Lön räknar lönen från godkänd tid, skapar lönebesked, bokföring och
bankfil, och bygger månadens arbetsgivardeklaration som XML enligt schema
1.1 med kontroll av summorna mot lönebeskeden. API:et ska läsa in detta
underlag till arbetsgivarens Eget utrymme, hämta kontrollresultatet och
skapa granskningsunderlaget, varefter arbetsgivarens behöriga företrädare
granskar och signerar på Mina sidor. Hantera redovisningsperiod används för
att visa periodens status, Skatteverkets summering och kvittensen i
tjänsten, och för att låsa perioden inför signering. Fråga om skatteavdrag
används inför varje lönekörning för att hämta skatteform, skattetabell och
jämkningsbeslut för de anställda hos den arbetsgivare lönen gäller
(huvudutbetalare = arbetsgivarens organisationsnummer), så att
skatteavdraget görs på aktuella uppgifter. Tjänsten informerar
användaren vid varje steg om att inläsningen inte fullgör
uppgiftsskyldigheten, om kontrollresultatet, om djuplänkens syfte och om
Skatteverkets auditloggning, enligt de allmänna villkorens avsnitt 8.

**Volym (uppskattning)**

- [2–10] arbetsgivare det första året, [5–50] individuppgifter per
  arbetsgivare och månad; en inlämning per arbetsgivare och
  redovisningsperiod, plus rättelser.
- Fråga om skatteavdrag: en fråga per arbetsgivare och månad med alla
  anställda (högst 1 000 personnummer per anrop), samt vid nyanställning.

**Personuppgifter**

- Binaafy AB är personuppgiftsbiträde för arbetsgivaren;
  personuppgiftsbiträdesavtal ingår i tjänstens avtal med arbetsgivaren
  [bifoga mall]. Personnummer lagras krypterade och visas maskerade;
  varje visning loggas. Auditlogg sparas [7 år, bokföringslagen].

**Testplan inför driftsatt tjänst**

- Komplett testtjänst med Expisofts testcertifikat och test-BankID: läs in
  en månad med tre–fyra individuppgifter (lön, bilförmån, arvode,
  skattefri ersättning), hämta kontrollresultat, skapa granskningsunderlag,
  följ djuplänken, hämta grunddata och kvittens; prova ett felaktigt
  underlag (DONE_FAILED) och ett borttag. Fråga om skatteavdrag med
  testpersonnummer ur portalens testfall, inklusive felkod 2, 3 och 11.

## 7. Open points for you

- The organisationscertifikat: Expisoft's price and lead time, and which
  name it is issued in (Binaafy AB).
- Whether the customers' firmatecknare are willing to register Binaafy AB
  as registreringsombud (the alternative is BankID per customer, which the
  cloud model does not fit).
- The EU region of Supabase and the host.
- Who signs the three avtal, and the support mailbox.
- Timing: the plan said "when the product has more than one customer";
  the komplett testtjänst can be requested before that at no cost.

## 8. Sources, read 2026-10-30

- Allmänna villkor för Skatteverkets API Arbetsgivardeklaration inlämning
  via API, version 1.0 (2018-10-25):
  <https://www7.skatteverket.se/portal-wapi/open/apier-och-oppna-data/utvecklarportalen/v1/getFile/allmanna-villkor-arbetsgivardeklaration-inlamning>
- Tjänstebeskrivning Arbetsgivardeklaration inlämning v1.6, dokumentversion
  1.8 (2021-01-08):
  <https://www7.skatteverket.se/portal-wapi/open/apier-och-oppna-data/utvecklarportalen/v1/getFile/tjanstebeskrivning-agd-inlamning-v1>
- Avtal och beskrivning, Arbetsgivardeklaration hantera redovisningsperiod
  v1.0, dokumentversion 1.5 (2024-03-21):
  <https://www7.skatteverket.se/portal-wapi/open/apier-och-oppna-data/utvecklarportalen/v1/getFile/avtal-arbetsgivardeklaration-hantera-redovisningsperiod>,
  <https://www7.skatteverket.se/portal-wapi/open/apier-och-oppna-data/utvecklarportalen/v1/getFile/tjanstebeskrivning-agd-hantera-redovisningsperiod>
- Avtal och tjänstebeskrivning, Fråga om skatteavdrag via öppet API 2.0,
  dokumentversion 1.8 (2024-04-24):
  <https://www7.skatteverket.se/portal-wapi/open/apier-och-oppna-data/utvecklarportalen/v1/getFile/avtal-api-fraga-om-skatteavdrag>,
  <https://www7.skatteverket.se/portal-wapi/open/apier-och-oppna-data/utvecklarportalen/v1/getFile/tjanstebeskrivning-fraga-om-skatteavdrag-2-0>
- Skatteverket, "Börja använda API:er" (test keys, production keys, OAuth2,
  Expisoft, ombudsbehörigheter):
  <https://www.skatteverket.se/omoss/digitalasamarbeten/borjaanvandaapier.4.77f3e230191ef88bf1d585.html>
- Skatteverket, "Anslutning och support för våra API:er och öppna data"
  (forms, redirect-URI, support hours):
  <https://www.skatteverket.se/omoss/digitalasamarbeten/anslutningochsupportforvaraapierochoppnadata.4.7c708f0e16bed42cd055bf0.html>
- The AGI file format itself: `lib/core/rules/agi-format.ts` (technical
  description 1.1.18.2, XSDs with their SHA-256).
