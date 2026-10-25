# Checklista: från byggt system till skarp fakturering

Skriven 2026-10-22. Systemet är kodat, kört mot databasen och mergat till
main (fas 0–5, full export, krypterade personnummer, rättelser). Det här är
det som återstår för att det ska fungera som planerat, i den ordning det
bör göras. "Du" är Ibrahim (avtal, konton, beslut), "Opus" är en kodsession,
"vi" är båda. Status: `[ ]` kvar, `[x]` gjort, `[~]` påbörjat.

Lagtexten bakom besluten står i `docs/fakturering.md` under respektive läge.

---

## 1. Driftsättning: det som måste vara på plats innan första riktiga fakturan

- [x] **Miljövariabler i Vercel** (gjort 2026-10-25, inklusive CRON_SECRET). Project → Settings →
  Environment Variables, Production. Kopiera värdena från `.env.local`:
  `RESEND_API_KEY`, `MAIL_FROM` (noreply@binaafy.se, domänen är verifierad i
  Resend), `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`. Påminnelsernas
  inställningar ligger i appen (punkt 3), inte i miljövariabler. Redeploya
  efteråt.
- [x] **Kontrollera att Vercel-bygget av main är grönt** (gjort 2026-10-25: /fakturering svarar live). Vercel →
  Deployments. Ingen av oss har tittat efter merge:arna.
- [x] **Rensa testdata** (gjort 2026-10-23). Kör `supabase/reset-invoicing.sql` i
  SQL-editorn: tar bort testfakturor, betalningar, verifikat och nollställer
  nummerserierna. Ta sedan bort Testbolag AB för hand (organisationen,
  medlemskapet, API-nyckeln och webhooken), skriptet rör inte
  organisationer. Gör det innan första riktiga fakturan, annars får den fel
  nummer.
- [x] **Bestäm startnummer** (gjort: serien går från 10001). Serien börjar på 1 efter reset.
  Vill du börja på 10001 (som planen säger) så sätt det i
  `number_counters` i samma SQL-körning; be mig om raden.
- [x] **Inställningar › Företaget på fakturan** (du, 10 min). Kontrollera namn, adress,
  org.nr, momsreg.nr `SE559603347101` mot registreringsbeviset, e-post och
  telefon. Det här fryses in på varje faktura.
- [x] **Inställningar › Betalning** (du, 5 min). Bankgiro, Swish-nummer
  (företag, börjar på 123), betalningsvillkor per kundtyp. Kryssa
  "Bankgirot har OCR-avtal" först när punkt 2 är klar.
- [ ] **Offertuppgifter › Logotyp** (du). Samma logotyp används på
  faktura, offert och projektrapport.
- [x] **Supabase Auth → Redirect URLs** (gjort 2026-10-25, Site URL https://www.binaafy.se och tre callback-adresser). Lägg till
  `https://binaafy.se/mitt-projekt/callback**` så att inbjudningar och
  portalinloggning via länk fungerar.
- [ ] **Supabase och Vercel i EU** (du, beslut). Planen rekommenderar att
  flytta till EU-region innan första externa kundens data läggs in. För
  Binaafys egna fakturor spelar det ingen roll nu.
- [ ] **Provfakturera dig själv** (vi, 20 min). En riktig faktura på
  1 kr till en privat testkund med din egen e-post, betala via Swish,
  registrera betalningen, kontrollera verifikatet under Ekonomi, kreditera.
  Då vet vi att hela kedjan går i produktion, inte bara lokalt.

## 2. Banken: få in betalningar automatiskt

Allt här är avtal med din bank, ingen kod. Koden för filen och matchningen
finns redan (`Fakturor › Bank`).

- [ ] **Bankgiro Inbetalningar med OCR** (du, banken, 1–2 veckor
  handläggning). Beställ tjänsten "Bankgiro Inbetalningar" på ditt bankgiro.
  Välj **OCR-referens med hård kontroll: längdsiffra och kontrollsiffra**,
  det är exakt så våra OCR-nummer är byggda, så banken avvisar felskrivna
  referenser. Välj **filformat ISO 20022 camt.054** (inte BgMax, det
  upphör 27 november 2026). Välj att filen ska finnas i internetbanken
  för nedladdning.
- [ ] **Kryssa "Bankgirot har OCR-avtal" i Inställningar › Betalning** (du)
  när banken bekräftat. Då skrivs OCR-numret på fakturan som obligatoriskt
  att ange; utan avtalet betalar kunden med fakturanumret som meddelande.
- [ ] **Rutin för filen** (du, 5 min per gång). Ladda ner camt.054-filen
  från internetbanken och ladda upp den under `Fakturor › Bank`. Systemet
  matchar på OCR, i andra hand fakturanummer, belopp och namn, och visar
  konfidensen. Du klickar *Registrera* per rad; inget bokförs av sig
  självt. En gång om dagen räcker.
- [ ] **Automatisk hämtning av filen** (Opus, senare). Bankernas filtjänster
  (t.ex. SEB:s eller Swedbanks filkommunikation via SFTP) kräver eget
  avtal och certifikat. Vänta med detta tills uppladdningen blir ett
  dagligt irritationsmoment. Alternativet är öppen bankdata, punkt 2 nedan.
- [ ] **Öppen bankdata (PSD2)** (du avtal, Opus kod, 1–2 veckor). En
  leverantör som Enable Banking eller Tink ger ett API där du godkänner
  med BankID och vi hämtar transaktionerna flera gånger per dag. Då
  försvinner filhanteringen helt, och matchningen körs av cron. Kräver
  konto hos leverantören (Enable Banking har en gratis utvecklarnivå) och
  ett förnyat BankID-samtycke var 90:e dag. Kod: en `BankProvider` bakom
  samma matchning som filen använder.
- [ ] **Swish Företag** (du, banken, några dagar). Avtal på ditt
  Swish-nummer för företag. Ingen teknisk koppling: QR-koden på fakturan
  och på den publika fakturasidan pekar på ditt nummer med OCR som
  meddelande. Betalningen syns i Swish-appen och på kontoutdraget, och
  registreras i dag för hand (eller via bankfilen/öppen bankdata, där
  Swish-insättningar kommer med OCR i meddelandet).
- [ ] **Swish Handel** (du avtal, Opus kod, senare). Ger ett API med
  callback som kvitterar betalningen i samma sekund kunden swishar. Kräver
  avtal med banken, klientcertifikat per Swish-nummer och kostar per
  betalning. Vänta tills Swish-betalningarna är många; Swish Företag plus
  bankdata täcker tills dess.

## 3. Mejl, påminnelser och inkasso

- [ ] **Fakturamejlet skarpt** (du, 5 min). Skicka en faktura till dig
  själv från produktionen och kontrollera avsändare, PDF och länk till den
  publika fakturasidan. Testat lokalt via Resend, inte från Vercel.
- [x] **Flera mottagare per kund** (gjort 2026-10-22, commit 6d75690). Fakturor till ekonomi@ och projektledare, kopia till
  er själva. Kräver migration 0026, som sessionen ber dig köra.
- [ ] **Påminnelser** (du, beslut, `Inställningar › Påminnelser`).
  Regelverket är klart: dröjsmålsränta referensränta + 8 procentenheter,
  påminnelseavgift 60 kr bara till företag om inte era villkor säger annat.
  Där ställer du dagar efter förfallodagen, dagar mellan påminnelser och
  kryssar "Skicka påminnelser automatiskt varje morgon" om den dagliga
  körningen (cron 06:00 UTC) ska sköta det. Rekommendation: för hand de
  första månaderna.
- [ ] **Inkasso** (Opus, senare, en dag). Export av en förfallen faktura
  med påminnelsehistorik till inkassobolag (fil eller API hos t.ex.
  Intrum, Svea). Inte byggt; krävs först när en kund inte betalar.

## 4. ROT

- [ ] **Första riktiga ROT-begäran** (du, 15 min). Begäran skapas under
  ROT när fakturan är betald, laddas ner som XML och laddas upp i
  Skatteverkets e-tjänst "Rot och rut – företag". XML:en följer schema v6
  men är inte provad i e-tjänsten; första uppladdningen är provet. Om
  Skatteverket klagar på något fält, skicka felet till mig så rättas det
  samma dag.
- [ ] **Registrera utbetalningen** (du, per begäran). När Skatteverket
  betalar ut, markera begäran som utbetald under ROT så bokförs den
  (1513 → 1930). Avslag markeras också där, så mellanskillnaden
  faktureras kunden.
- [ ] **Kundens personnummer och fastighet** (personalen, per faktura).
  Krävs i fakturan för ROT; personnumret krypteras i databasen och syns
  bara maskerat utom för owner/admin.

## 5. Bokföring och revisor

- [ ] **Fråga revisorn vilket program** (du, ett mejl). SIE4-filen under
  `Ekonomi › Export` läses av alla svenska bokföringsprogram (Fortnox,
  Visma, Björn Lundén, Bokio). Skicka ett provexport av en månad och be
  revisorn importera och kontrollera kontona (1510, 1513, 1930, 3001,
  3231, 2611, 3740, 3591, 8313).
- [ ] **Räkenskapsår och kontoplan** (du med revisorn, 10 min). Står i
  `Inställningar › Bokföring` (räkenskapsårets första dag och de konton
  konteringen använder). Binaafy har kalenderår; brutet räkenskapsår
  fungerar i SIE-filen men verifikationsserien numreras per kalenderår,
  en känd begränsning.
- [ ] **Periodlåsning som rutin** (du, månadsvis). Exportera månaden, lås
  perioden under Export. En låst period kan inte få nya verifikat med
  datum i den; rättelser hamnar i den öppna perioden, som bokföringslagen
  vill.
- [ ] **Fortnox-koppling** (Opus, senare, 2–3 dagar). Push av verifikat
  via Fortnox API (OAuth 2.0) för kunder som vill behålla Fortnox hos sin
  konsult. Byggs när en extern kund ber om det; SIE-filen räcker för
  Binaafy.
- [ ] **Leverantörsfakturor och kostnader** (beslut). Kostnader läggs in
  för hand per projekt i dag och syns i projektets marginal, men bokförs
  inte här. Inköpen bokförs i revisorns program. Bokföringsmodul med
  leverantörsreskontra är ett eget projekt, planerat först när tre externa
  kunder frågar.

## 6. E-faktura

- [ ] **Peppol till företag och offentlig sektor** (du avtal, Opus 1–2
  dagar). Vi genererar redan Peppol BIS Billing 3-XML ur fakturan
  (`Ladda ner Peppol-XML` på fakturan), men den måste skickas via en
  accesspunkt. Välj partner: Pagero, Qvalia eller Unifiedpost; alla har
  API och tar en avgift per faktura eller månad. Kod: en `PeppolProvider`
  mot partnerns API, som redan är förberedd som gränssnitt. Behövs bara
  när en företagskund eller kommun kräver e-faktura.
- [ ] **E-faktura till privatpersoner** (senare). Kivra (API för företag,
  avtal) eller bankernas e-faktura (via Bankgirot, tyngre avtal).
  Mejl med PDF och publik betalsida med Swish-QR räcker för
  privatkunderna nu.

## 7. Portalen och kunden

- [ ] **Publik fakturasida** (du, 5 min). Varje faktura har en länk
  `/faktura/<token>` med PDF, Swish-QR och betalstatus. Öppna en i
  produktion och kontrollera att den fungerar utan inloggning.
- [ ] **Portalens fakturaflik** (du, 5 min). Logga in som en testkund i
  `/mitt-projekt` och se att fakturorna och PDF:erna syns.
- [ ] **BankID-inloggning och signering** (du avtal, Opus 2–3 dagar,
  senare). Via Criipto eller Signicat; för inloggning i portalen och för
  att kunden signerar offert och ÄTA. Kostar per signering. Magisk länk
  via e-post fungerar tills dess.

## 8. Kod som är kvar (Opus)

Allt här är känt, dokumenterat i `docs/fakturering.md` och går att beställa
som en session var.

- [x] **Kvittning vid "Rätta belopp" på betalda fakturor** (kodat
  2026-10-25, migration 0028, inte körd i Supabase än): betalningen flyttas
  från originalet till den nya fakturan när den utfärdas, i en transaktion.
  Se *Läge 2026-10-25: kvittning* i `docs/fakturering.md`.
- [ ] **Ratt- och anropsgränser per API-nyckel**, loggning av varje
  API-anrop och fler resurser i API:t (betalplaner, ROT, händelser).
- [ ] **PDF-arkivet som bakgrundsjobb** när en organisation har tusentals
  fakturor (i dag byggs zippen i ett anrop, max 300 s).
- [ ] **Dashboarden visar "period ej exporterad"** och påminner om
  låsning.
- [ ] **Brutet räkenskapsår** i verifikationsserien.
- [ ] **`invoice.corrected` som webhook-händelse** om en integratör behöver
  den.
- [ ] **Lint-konfigurationen** ska undanta `.claude/worktrees`, annars
  rapporterar `npm run lint` tusentals fel från byggmappar.

## 9. Produkten: innan någon annan än Binaafy använder det

- [ ] **Produktnamn** (du). Platshållare `[PRODUKTNAMN]` i kod och
  dokument tills det är bestämt.
- [ ] **Personuppgiftsbiträdesavtal** (du, jurist eller mall). Varje
  organisation som lägger in sina kunder i systemet behöver ett avtal med
  er som biträde. Mall från IMY:s vägledning eller en standardmall.
- [ ] **Prissättning** (du). Per organisation och månad, per faktura, eller
  gratis för Binaafy och betalt för andra.
- [ ] **Företagsuppgifter på org.nr** (du avtal, Opus en dag, senare).
  Roaring eller motsvarande för att fylla i kund från organisationsnummer
  och, som tillval, kreditupplysning.
- [ ] **Inbjudningar och roller provade med ett riktigt andra konto** (vi).
  RLS-proven körs i PGlite; ett riktigt konto som bara är medlem i en
  annan organisation har inte provats i webbläsaren.

---

## Kortaste vägen till "det bara funkar"

1. Punkt 1 i sin helhet (en kväll).
2. Bankgiro Inbetalningar med OCR och camt.054 beställt (en blankett,
   sedan vänta).
3. Swish Företag beställt.
4. Provfaktura till dig själv, sedan första riktiga fakturan.
5. Första bankfilen uppladdad när avtalet är klart; från då matchas
   betalningarna.
6. Första ROT-begäran uppladdad hos Skatteverket.
7. Revisorn får en SIE-fil efter första månaden.

Allt annat kan vänta tills det behövs.
