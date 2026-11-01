# Legal compliance review — payroll, time, invoicing, quotes, GDPR

Date: 2026-10-31. Scope: the code on `main` (through migration 0044) for the four
business tools — lön (`lib/core/payroll`, `lib/core/rules`), tid
(`lib/core/hr`), fakturor (`lib/core/invoices`, `ledger`, `rot`, `reminders`,
`collections`, `payments`, `render/sie`, `render/ubl`) and offerter
(`lib/quotes`) — plus the cross-cutting legal layer (GDPR, terms, company
information on the website). Method: code reading with file:line evidence; every
2026 figure was checked against Skatteverket, Riksbanken, Försäkringskassan or
the statute text. Collective-agreement figures (Byggavtalet, Tjänstemannaavtalet)
could only be checked against secondary sources, and are marked as such.

This is a technical review of what the code does against what the law requires.
It is not legal advice; the HIGH items under "Inkasso" and "Terms and DPA"
should be confirmed with a lawyer before the product is sold to other companies.

---

## 1. Verdict

**Foundation is strong.** All legal constants that were checked for 2026 are
correct: arbetsgivaravgifter (31,42 / 10,21 / 0 % and the youth reduction),
Skatteverket's tax tables (17 golden vectors), engångsskatt brackets, AGI field
codes against the XSD, sjuklön, semesterlagen percentages, förmånsvärden,
traktamente, milersättning, prisbasbelopp, VAT rates, ROT 30 % / 50 000 kr,
inkasso fee ceilings, SIE4 and Peppol BIS 3 structure. Issued invoices, journal
entries, payslips and approved time are immutable at database level. Personal
numbers are encrypted per organisation with keys in Supabase Vault, decrypts are
logged, and the API only ever returns the masked form.

**But there are 1 critical and 15 high findings.** They fall in four groups:

| Group | What goes wrong today | Where |
|---|---|---|
| Wrong money on payslips | Semesterlön on variable pay paid every vacation month; procentregeln spread over 25 days instead of earned days; no slutlön; VAB and föräldraledighet share one cap | Lön |
| Wrong money on reminders | Riksbank reference rates wrong since July 2024, missing row for H2 2026; 60 kr fee charged to businesses without the agreement the law requires | Fakturor |
| Missing consumer protection | No ångerrätt information or ångerblankett on consumer quotes; no fast/ungefärligt price type, so the 15 % rule cannot be enforced; accepted quotes are mutable with no snapshot | Offerter |
| Missing legal documents | No användarvillkor and no personuppgiftsbiträdesavtal exist although registration says the user accepts them; privacy policy covers only the website forms | Juridik / GDPR |

Nothing found produces an invalid invoice or a wrong VAT amount.

---

## 2. Priority list (do in this order)

1. **Lön C1** — stop paying semesterlön on rörlig lön every vacation month (`lib/core/payroll/run.ts:453-467`). Before the next payroll run with vacation days.
2. **Fakturor H1** — fix the referensränta table (`lib/core/rules/index.ts:138-144`) and make `lateInterestPercentAt` refuse an `assumed` rate. Today every reminder and inkassokrav states 9,75 % where 10,00 % applies, and the inkassokrav prints a factually wrong reference rate.
3. **Fakturor H2** — stop charging påminnelseavgift to businesses unless the invoice carried a fee clause, and remove the words "enligt lag" (`lib/core/reminders/reminders.ts:118,129`).
4. **Lön H1, H2, H3** — procentregeln per-day divisor, slutlön/semesterersättning at termination, separate caps for VAB and föräldraledighet.
5. **Tid H5** — Byggavtalet contract draft prints ATF 38 h; the rule book and Byggnads say 40 h (`lib/core/hr/draft.ts:95`). Every contract generated so far for a Byggavtalet employee is wrong on this point.
6. **Offerter H1** — ångerrätt text + Konsumentverket's ångerblankett on every quote to a privatperson, and a recorded "start during ångerfrist" request.
7. **Juridik H1** — write and publish användarvillkor and a personuppgiftsbiträdesavtal, link them from the registration checkbox. Mandatory before any external organisation uses the product (GDPR art. 28(3)).
8. **Juridik H2** — rewrite the privacy policy to cover the product (admin accounts, customer portal, employee portal, ROT personnummer, sub-processors, transfers, retention per category).
9. **Tid H1** — audit trail for admin edits of submitted time; **Fakturor H3** — immutability triggers on `payments`, `payment_allocations`, `reminders`.
10. **Offerter H2, H3** — freeze a sent/accepted quote (hash + PDF snapshot) and add a price type (fast / ungefärligt / löpande) with the +15 % guard for consumers.
11. **Tid H2–H4** — ATL 11 § övertidsjournal, mertid/jourtid kinds, overtime derived from schedule not labels, semester beyond balance.
12. Everything MEDIUM below, then the dated-constant hygiene in section 8 before 2027.

---

## 3. Lön (payroll)

### Coverage
Dated rule sets with sources and `unverified` flags; `payrollRulesAt()` refuses
years it does not know. Arbetsgivaravgifter 2026 correct incl. cohorts and the
youth reduction from 2026-04-01. Tax tables imported from Skatteverket and
golden-tested. AGI codes validated against the XSD 1.1 fixture; due dates match
Skatteverket's 2026 calendar. Sjuklön (80 %, karensavdrag 20 % of a week, 14
days, återinsjuknande 5 days, intyg day 8, FK after day 14) correct. Semester
25 days, 12 % / 0,43 %, saving rules correct. Förmåner and tax-free amounts
correct for 2026. BAS kontering, immutable verifikationer, four-eyes approval,
reconciliation gate, 7-year retention constant. Payslip content complete and
employees read their own via Min tid. Växa-stöd modelled as the 2026 refund.

### CRITICAL
**C1. Semesterlön on rörlig lön is paid in full every month vacation is taken.**
`lib/core/payroll/run.ts:453-467` → `sameSalaryVacationPay()` in
`lib/core/payroll/vacation.ts:133-146`. In `variable.mode === "total"` (the
statutory model, used for `agreement: "none"` and Byggavtalet månadslön) the line
is 12 % of the whole intjänandeår's OB/övertid and is pushed in every run where
`vacationDaysTaken > 0`. Vacation in July and October pays it twice. Semesterlagen
16 a § 3 st / 26 §: once, at the latest one month after the semesterår. Fix: pay
once per semesterår, store the paid amount per employee/year, subtract what has
been paid.

### HIGH
**H1. Procentregeln divides by contracted days, not earned paid days.**
`run.ts:502` passes `v.vacationDays` (25) where `vacation.ts:122-125` expects
earned days. A part-year timlön employee with 13 earned days gets roughly half
the semesterlön (7 §, 16 b §). Also imputed pay for semesterlönegrundande absence
(16 b § 2 st) is never carried into next year's basis (`run.ts:157-169, 497`).

**H2. No slutlön / semesterersättning at termination.** `run.ts:609` only warns;
`terminationCompensation()` (`vacation.ts:163`) and items 1521/1522 are never
used; corrections can only be added after the run closes, i.e. a month late.
Semesterlagen 30 §: within one month of the employment ending.

**H3. Semesterlönegrundande frånvaro caps applied wrongly.**
`lib/core/hr/balances.ts:119-125` lumps VAB and föräldraledighet into one
120-day pot. 17 a §: VAB has its own 120-day cap per intjänandeår, föräldrapenning
is 120 days per child, single parents 180; arbetsskada is exempt from the 180-day
sick cap. Parents and long-term sick get too few paid days.

### MEDIUM
- **M1** Drivmedelsförmån reported net instead of ruta 018 gross + ruta 098 employee payment (`benefits.ts:189-196`, `agi-format.ts:37-55`; 098 exists in the XSD fixture).
- **M2** No check that skattekolumn matches birth year (column 1 for born ≤1959 over-taxes every month) (`run.ts:387-389`, `tax.ts:21-34`).
- **M3** Sjuklön base excludes lost OB (SjLL 6 §: "lön och andra anställningsförmåner") (`sick-pay.ts:113`).
- **M4** Monthly semesterersättning for every SÄVA regardless of length; the law allows it only for employment intended ≤ 3 months (5 § 2 st) (`run.ts:539-542`, `contract.ts:232-234`).
- **M5** Negative corrections/kvittning without recorded consent (lag 1970:215) (`app/admin/(dashboard)/lon/[id]/page.tsx:523-545`).
- **M6** SINK (25 %, own AGI fields) and skolungdom intyg not supported (`tax.ts:21-34`).
- **M7** Undated SQL rule functions (`0038:25-29`, `0040:43-45`, `0042:56-60`, `0037:487-489`) will keep 2026 figures in 2027 while the app refuses to run.
- **M8** Friskvård 5 000 kr, gåvor, sjukvårdsförsäkring 60 % not modelled; any utlägg is tax-free without category (`expenses.ts:151-155`).
- **M9** Free meals on tjänsteresa reduce traktamente but never add kostförmån (`expenses.ts:131-134`).
- **M10** 1 000 kr rule frozen on projection; crossing it later does not trigger AGI corrections (`run.ts:548-550`).
- **M11** Obetald semester never deducted; balances can go negative (`balances.ts:161`).

### LOW
LAS 6 c § item 7 (notice for schedule changes) missing and the 7-day/1-month
information deadlines not surfaced (`contract.ts:136-147`); arbetsgivarintyg
cites repealed lag 1997:238, replaced by lag (2024:506) on 2025-10-01
(`EmployerCertificatePdf.tsx:149-150`); year-stamped UI texts and defaults
(`settings.ts:98,130-142`, `pay-items.default.ts:4`); hard-coded values outside
the rule book (`schema.ts:330`, `draft.ts:67`, `run.ts:420`); no retention job.

---

## 4. Tid (time, schedule, absence, stämpelklocka)

### Coverage
ATL 8 § limits in the rule book and checked by `atlWarnings()` (200 h/year,
48 h/4 weeks, 50 h/month, approximate dygnsvila/veckovila). Approved time
immutable by trigger; corrections are reversal + replacement; payroll locks its
period. Status changes and absence changes logged to the immutable `events`
table. Sjuklön and semester rules mirrored in SQL with parity tests. Clock-in
stores date, server time, project and shift only: no location, device or
biometrics. Employees see and edit only their own rows. Personnummer never leaves
the database unmasked except via logged reveals.

### HIGH
**H1. Admin can silently edit or delete submitted time.** RLS lets
`can_payroll_approve` update and delete `submitted` rows (`0037_time.sql:780-787`);
an approver's edit keeps the row `submitted` (`0038_time_fixes.sql:189-194`);
there is no `time_entries` event trigger and no `updated_by`. Bokföringslagen 7
kap., GDPR art. 5(2), ATL 11 §. Fix: after-update/delete trigger logging old and
new values, or force approver edits back to draft with a note.

**H2. ATL 11 § record (jourtid, övertid, mertid) cannot be produced.**
`TIME_KINDS` (`lib/core/hr/time.ts:20`) has no mertid, jour, extra övertid or
nödfall; `on_call` is beredskap, not jourtid; no report page. Part-timers' extra
hours are counted against the wrong limit or not at all (ATL 10 §).

**H3. Ordinary hours and the 48-hour average are never checked; övertid depends
on self-labelling.** `time.ts:264-291` sums only `kind === "overtime"`. A 55-hour
week entered as `work` raises nothing. ATL 5 § (40 h), 10 b § (48 h avg over 4
months), 15 § (rast after 5 h), 13 a § (night work) not checked.

**H4. Semesterersättning at termination never computed, and semester beyond the
balance neither refused nor deducted** (`vacation.ts:163` unused;
`balances.ts:161`). Same root as Lön H2/M11.

**H5. Byggavtalet ATF default 38 h instead of 40 h in generated contracts.**
`lib/core/hr/draft.ts:95` has the literal `"38"`; the rule book
(`rules/payroll.ts:455-456`) and Byggnads say 40 h. The signed PDF
(`contract.ts:139`) and the payslip accrual disagree. Fix: read the rule book.

### MEDIUM
- **M1** VAB and föräldraledighet share one 120-day cap; single-parent 180 unreachable (same as Lön H3).
- **M2** ATL limits not configurable per collective agreement (ATL 3 §) (`time.ts:210-216`).
- **M3** No retention/deletion for ended employees' time, absence (incl. sick = health data, art. 9) and clock data; the job promised in `docs/hr-lon.md:1634-1636` does not exist.
- **M4** The stämpelklocka is not a personalliggare (SFL 39 kap. 11 a–12 §§, SKVFS 2015:6: pnr, org nr, site id, real-time, 2-year retention, on-site access) and the UI does not say so. Sites above 4 PBB (236 800 kr in 2026) need ID06 or equivalent. Add the note; never use the word personalliggare.
- **M5** Byggavtalet OB/övertid bands (20/40/70, 30/50/70/100 %) confirmed only via a secondary source; helgdag list is a convention.
- **M6** ATL and sick helpers silently fall back to the 2026 rule set for 2027 while payroll refuses (`time.ts:210-216`, `absence.ts:54-60`).

### LOW
Föräldraledighetslagen 13 § two-month notice not checked; health data readable
by accountant role and `payroll` API scope (acceptable, document it); Min tid
shows one week only, no yearly totals/export (art. 15, ATL 11 §); Tjänstemannaavtalet
ATF 5→6 days from 2026-04-01 not marked unverified.

---

## 5. Fakturor (invoicing, ROT, reminders, inkasso, payments, bookkeeping)

### Coverage
Mervärdesskattelagen 17 kap. content complete, incl. per-rate VAT box,
öresavrundning row, credit-note reference, reverse charge with the exact text
"Omvänd betalningsskyldighet" and mandatory buyer VAT nr. Seller identification
incl. F-skatt flag. Gap-free DB-side numbering; issued invoices frozen and
undeletable; corrections via credit note / ändringsfaktura 384; SHA-256 on the
document. Journal immutable, balanced, period-locked. SIE4 structure and CP437
encoding correct. BAS kontering sound incl. 1513 ROT receivable and 3231 reverse
charge. ROT: labour only, privat only, property fields required, pnr encrypted,
XML V6 matches Skatteverket, claims only after full payment, 31 Jan deadline.
Reminders respect 60/180/450 kr ceilings; consumers get no fee unless opted in;
inkassokrav content and 8-day + 4 bank-day rule correct. Swish callback verified
and idempotent; camt.054 de-duplicated; matching requires confirmation. Peppol
BIS 3 mandatory elements incl. SE rules (0007, SE:BANKGIRO, F-skatt as TAX).

### CRITICAL — none.

### HIGH
**H1. Riksbank reference rates wrong, H2 2026 missing.**
`lib/core/rules/index.ts:138-144` has 2024-07-01 = 3,75, 2025-01-01 = 2,5,
2026-01-01 = 1,75 and no 2026-07-01 row. Räntelagen 9 §: the referensränta is
the policy rate rounded **up** to the nearest half point, so 3,75 and 1,75 are
impossible values. Riksbanken's table (verify on riksbank.se before editing):
2024-07-01 = 4,00, 2025-01-01 = 3,00, 2025-07-01 = 2,00, 2026-01-01 = 2,00,
2026-07-01 = 2,00. `lateInterestPercentAt` (`:156`) ignores the `assumed` flag,
so since 1 July 2026 reminders charge 9,75 % instead of 10,00 % and the
inkassokrav prints "referensränta 1,75 plus 8" (`CollectionPdf.tsx:139-140`), a
wrong statement in a formal demand (FFFS 2025:2). Fix: correct rows, add H2 2026,
refuse or warn on `assumed`, add a test that the latest row is < 6 months old.

**H2. 60 kr påminnelseavgift charged to every business without prior agreement,
and called statutory.** `reminders.ts:118` charges it for all `business`;
`:129` prints "Påminnelseavgift 60 kr enligt lag." Lag (1981:739) 2 §: a
reminder fee may only be charged "om avtal om det har träffats senast när
fordringen uppkom", for all debtors. The invoice carries no fee clause
(`InvoicePdf.tsx:206, 304`). Fix: print the clause in the invoice terms, charge
only when the frozen document contains it, change the wording to "enligt våra
villkor"; consider 450 kr förseningsersättning (4 a §) for B2B.

**H3. Payments, allocations and reminders are editable/deletable by staff.**
`0014_core.sql:579-586, 516-518`: `for all` policies, no `forbid_change`
trigger. Deleting a payment leaves `paid_ore` and the 1930/1510 entry in place.
Bokföringslagen 5 kap., BFNAR 2013:2 2.17–2.18. Fix: `forbid_change()` on
`payments`, `payment_allocations`, `reminders`, `collection_cases`; refunds as
negative payments (already modelled).

### MEDIUM
- **M1** ROT rate/cap taken from issue date, claim frozen at issue; the law keys on payment year (an invoice dated Dec 2025 at 50 % paid Jan 2026 is claimed at 50 %, Skatteverket pays 30 %) (`totals.ts:82`, `rot/store.ts:90,157`).
- **M2** 2025 rule set starts 50 % ROT on 2025-01-01 instead of 2025-05-12 (`rules/index.ts:104-109`).
- **M3** ROT claim `BetalningsDatum` = registration timestamp, not `payments.paid_on` (`rot/store.ts:92`); wrong year around New Year.
- **M4** "Säte" printed from postal city; aktiebolagslagen 28 kap. 5 § wants styrelsens säte. Add a `seat` setting (`InvoicePdf.tsx:192`).
- **M5** Reverse-charge statute reference cites the repealed 1994 law; correct is 16 kap. 13 § ML (2023:200) (`InvoicePdf.tsx:259`).
- **M6** Consumer late interest from due date even with < 30-day terms (räntelagen 4 §), and one "today" rate applied to the whole period instead of per half-year (`reminders.ts:119-121`).
- **M7** Partial credit notes do not reduce the demanded amount (`0015:139-141`, `store-types.ts:41-43`); reminders can demand money not owed.
- **M8** **Inkasso for other organisations.** Letters are in the creditor's name, but the platform dispatches them from `MAIL_FROM` for every tenant (`reminders/store.ts:51-68`). Inkassolagen 2 §: collecting "för annans räkning" needs a permit, since 2025-01-01 from Finansinspektionen. Get a legal opinion before marketing inkassokrav to other companies; always send from and reply-to the creditor; state in the terms that the customer is the inkassoutövare.
- **M9** Reverse-charge invoices with VAT-bearing material lines omit the per-rate taxable amount in the VAT box (`InvoicePdf.tsx:254-261`).
- **M10** Rejected ROT claim: no re-billing flow and 1513 stays open (`rot/store.ts:331-346`).

### LOW
`#TRANS` writes text in the transdat position (`sie4.ts:104-105`); consumer unit
prices incl. VAT only (acceptable); 3591 is not a BAS account (use 3590/3690);
no kundförlust write-off (6351/6352, VAT recovery); 384 and ROT in Peppol not
yet verified against SFTI (documented, keep blocked); `lib/rot.ts` duplicates
the rule book; issue date can be backdated freely; VAT-return deadline comment.

---

## 6. Offerter (quotes)

### Coverage
Validity date printed and stated in the mail (Avtalslagen). ROT 30 % / 50 000 kr
correct for 2026, labour only, privat + bygg only, shown as "preliminärt" with
the ownership/tax-room caveats and the right to re-bill. VAT presentation per
customer type (incl. for privat, excl. + VAT row for företag). Seller name, org
nr, VAT nr, F-skatt on the PDF. Own villkor cards (payment, start, warranty,
exclusions, ÄTA sentence). Quote personnummer encrypted like invoices (0024),
masked in PDF and never in mail or URL. Quote → invoice carries customer type,
VAT, line kind, ROT persons, payment days and the quote reference. Public
request form is data-minimal, links the policy, stores `consent_at`, keeps no IP.

### HIGH
**H1. No ångerrätt information or ångerblankett for consumer quotes.**
Distansavtalslagen 2 kap. 2 § p. 9–11, 10–12 §§, 15 §. The PDF invites a
distance acceptance ("svara på mejlet", `QuotePdf.tsx:605`) and the Bygg default
intro is a hembesök (`defaults.ts:73`), but no text, no blankett, no field
recording the consumer's express request to start work within 14 days. Without
the information the ångerfrist runs up to one year and work done cannot be
charged. Fix: mandatory "Ångerrätt" card for `customer.type === "privat"`,
Konsumentverket's blankett as last page, a `startDuringWithdrawal` record,
summary in `send.ts`, and block `accepted` without it.

**H2. Sent/accepted quotes are fully mutable; no version, hash or PDF snapshot.**
`lib/quotes/store.ts:205-238`, `app/admin/quote-actions.ts:89-144`: any status
can be edited, set in any direction or hard-deleted (invoices then lose
`quote_id`). No `accepted_at/by`, no quote events. Fix: on `sent` store
`sent_hash` + PDF; on `accepted` store who/when/hash and refuse if the data
changed; DB trigger refusing data updates in `sent`/`accepted` (use
`duplicateQuote` for revisions); refuse delete when accepted or referenced.

**H3. No price type (fast / ungefärlig / löpande); +15 % guard impossible.**
`lib/quotes/schema.ts:101-127`; the cover always prints one "Att betala";
`from-quote.ts:78-104` and `invoice-actions.ts:69-77` copy lines with no
comparison to the quote. Konsumenttjänstlagen 36 § 2 st (approximate price may
not be exceeded by more than 15 %), 37 §; the public page promises "fast pris"
(`app/(site)/bygg/offert/page.tsx:8,24`) while timpris templates exist. Fix:
`priceType` field, printed in Facts and summary, carried to the invoice, warn or
block when a consumer invoice exceeds quote × 1,15 (ungefärlig) or any excess
without a linked ÄTA (fast).

### MEDIUM
- **M1** The after-ROT figure is the most prominent price; full price incl. VAT must lead (prisinformationslagen 6–7, 10 §§) (`QuotePdf.tsx:272-293, 444-451`, `send.ts:36,48`).
- **M2** No standard-contract reference (Hantverkarformuläret 17 / ABS 18 / AB 04 / ABT 06) and no attachment mechanism (`schema.ts:92-99`).
- **M3** `fSkatt` defaults to `true` for every new organisation (`org/settings.ts:35`, `quotes/profile.ts:32`); prints "Godkänd för F-skatt" before anyone confirmed it. Default to false. Insurance text hard-coded while `settings.insurance` is never printed.
- **M4** Quote pnr and declined/expired quotes kept forever; lead 24-month deletion promised but not implemented; policy does not mention quotes/ROT/portal (see section 7).
- **M5** Acceptance after expiry and backward status changes uncontrolled; invoice creation does not require `accepted` (`quote-actions.ts:113-121`).

### LOW
No tokenised customer acceptance exists (if built: token hash, IP/UA, hash of
accepted version, confirmation to both parties, H1 text before the button);
ROT per-person room assumed full; public page copy vs. templates; quote numbers
global across organisations.

---

## 7. Juridik / GDPR / website (cross-cutting)

### What is good
Per-organisation encryption of personnummer and bank accounts with keys in
Supabase Vault (0023, 0024, 0035); decrypts are events; masked everywhere else
incl. API and PDFs. Cookie banner before GA4, GA loads only on `granted`
(`components/Analytics.tsx`). API request log keeps no bodies, query strings or
keys, pruned at 90 days. Employees have self-service access to payslips,
certificates and documents (art. 15). No geolocation in the stämpelklocka. Lead
forms are data-minimal, link the policy and record `consent_at`. Private HR
bucket, write-once documents.

### HIGH
**H1. Användarvillkor and personuppgiftsbiträdesavtal do not exist.**
`components/RegistrationForm.tsx:78` makes the registrant confirm they "godkänner
användarvillkoren och personuppgiftsbiträdesavtalet", but there is no terms page,
no DPA document and no link anywhere in the app (grep for villkor/biträde finds
only the checkbox and the design docs). When another company uses the product,
Binaafy processes their employees' payroll and sick-absence data (art. 9) and
their customers' personnummer as a **processor**; GDPR art. 28(3) requires a
written contract with the art. 28 content (instructions, confidentiality,
security, sub-processors, assistance, deletion/return, audit). Acceptance of a
non-existent document is not a contract. Fix: write both documents (DPA with
sub-processor list: Supabase, Resend, Vercel/Netlify, Google if GA on; location
of processing; retention; breach notice 72 h support), publish them at
`/villkor` and `/personuppgiftsbitradesavtal`, link them from the checkbox,
store the accepted version with `accepted_at`.

**H2. The privacy policy covers only the website forms.**
`app/(site)/integritetspolicy/page.tsx` describes offertförfrågan, kontakt and
brief. It is linked from the admin login, yet says nothing about: admin user
accounts (Binaafy as controller), the customer portal (mitt-projekt), the
employee portal (min-tid), ROT personnummer and property data on quotes and
invoices, who the sub-processors are, transfers outside the EU (Resend and
Vercel/Netlify are US companies), lawful basis per purpose, retention per
category, or the rights procedure for employees of customer organisations (whose
controller is their employer). Art. 13/14. It also says IP addresses are
collected, while `lead-handler.ts` does not persist them. Fix: a product section
for each role (admin, portal customer, employee), a sub-processor list, transfer
mechanism (EU region or DPF/SCC), retention table, and a dated version.

### MEDIUM
- **M1. Promised retention is not implemented.** Policy: leads "raderas" after 24 months; `docs/hr-lon.md:1634-1636` promises a deletion job and an art. 30 register. There is no job for leads, quotes, HR, time or clock data; customers are only soft-deleted; `employees` cannot be deleted at all (`0035:212`). Art. 5(1)(e). Fix: a scheduled job keyed on the 7-year rule-book retention (`rules/payroll.ts:687-691`) and shorter periods for drafts/notes/clock minutes; a lead purge; and write the art. 30 register (a document is enough).
- **M2. Hosting region unresolved.** `docs/fakturering-checklista.md:43-49` still has "Supabase och Vercel i EU" open; `vercel.json` sets no function region (default is US-East). Payroll and health data processed in US function memory is a Chapter V transfer. Set an EU region (Supabase eu-north-1 / Vercel arn1) or document the DPF/SCC basis in the DPA.
- **M3. Company identification on the website.** E-handelslagen 8 § requires name, address, e-mail, org nr and VAT nr for an information-society service. The footer prints org nr only if set and never the VAT nr; `lib/content/defaults.ts:19,64` default both to empty. Verify the live content and print the VAT nr.
- **M4. Policy vs. consent banner mismatch.** The policy (section Cookies) says no tracking cookies and that GA would be preceded by a banner "and the policy updated"; the GA4 banner is live. Describe GA4, the `localStorage` consent key, and give a way to withdraw consent (there is no UI to reopen the banner; withdrawal must be as easy as consent, art. 7(3)).

### LOW
- Lawful basis for lead forms is framed as consent via a required checkbox; a required checkbox is not freely given consent — frame it as art. 6(1)(b) (steps before a contract) and keep the checkbox as information acknowledgement.
- "Godkänn" is the primary button and "Endast nödvändiga" a ghost button in `components/CookieConsent.tsx`; IMY/EDPB expect equal prominence.
- Portal and Min tid pages have no privacy link of their own.
- Health data (sick absence, intyg date) is readable by the `accountant` role and `payroll` API scope — defensible under art. 9(2)(b), but it belongs in the art. 30 register and the API could return only extent and dates.

---

## 8. Dated constants: a calendar

Everything below is correct today and will silently go stale. Put these in a
recurring checklist.

| When | What | Where |
|---|---|---|
| 1 Jan and 1 Jul | Referensränta row (Riksbanken) | `lib/core/rules/index.ts:138` |
| Dec each year | New payroll rule set: arbetsgivaravgift cohorts, PBB/IBB, traktamente, milersättning, engångsskatt brackets, förmånsvärden, tax tables import | `lib/core/rules/payroll.ts`, `rules/benefits.ts`, `supabase/import-tax-tables.ts` |
| Dec each year | The undated SQL copies: `employer_contribution_rules`, `agi_rules`, `expense_rules`, `sick_rules` | `0037:487`, `0038:25`, `0040:43`, `0042:56` (give them a date parameter) |
| Dec each year | ROT/RUT rate and caps in **two** places | `rules/index.ts:104-115`, `lib/rot.ts:15-21` |
| 2027-04-30 | Byggavtalet 2025–2027 expires; OB/övertid bands, 13 %, ATF | `rules/payroll.ts:426-464` |
| 2027-09-30 | Youth reduction window ends | `rules/payroll.ts:694-713`, `0038:29` |
| Yearly | AGI due-date table, Collectum cutoffs | `rules/payroll.ts:660-665`, `agi-format.ts:170-185` |
| Yearly | Year-stamped UI texts ("BAS 2026", "25 kr/mil") | `settings.ts:130-142`, `installningar/lon/page.tsx`, `pay-items.default.ts:4` |

---

## 9. Documented limitations (already acknowledged in the design docs)

Ackord and the full Byggavtalet rule book; ATF payout and helglön; off-cycle
runs; AGI not submitted via API; bank file not sent; Peppol via manual provider,
384 and ROT in Peppol unverified; ROT XML not yet tried in Skatteverket's
e-service; no supplier invoices or bookkeeping UI; Fora/Collectum layouts are the
app's own; arbetsgivarintyg is not form SO 11; parallel payroll run still to be
done by the owner; demo mode holds plaintext pnr in memory.

---

## 10. Sources used for 2026 figures

Skatteverket "Belopp och procent 2026"; Skatteverket rot- och rutarbete and
schemalager V6; Skatteverket arbetsgivardeklaration deadlines; SKVFS 2025:11,
2025:20, 2025:21; Försäkringskassan aktuella belopp; Riksbanken referensränta;
lagen.nu for ATL 1982:673, semesterlagen 1977:480, sjuklönelagen 1991:1047,
inkassolagen 1974:182, lag 1981:739, räntelagen 1975:635, mervärdesskattelagen
2023:200, distansavtalslagen 2005:59, konsumenttjänstlagen 1985:716; FFFS 2025:2;
prop. 2025/26:24 (växa-stöd); Byggnads 2025 information sheets (ATF 40 h).

---

## 11. Status 2026-11-01: fixes as pull requests

| PR | Findings | Content |
|---|---|---|
| #27 | Fakturor H1, H2, M6 | Riksbankens referensränta rättad + H2 2026; påminnelseavgift bara när fakturan bar klausulen; konsumentränta tidigast 30 dagar efter faktura. Rapporten ingår. |
| #28 | Lön C1, H1, H3; Tid H5, M1 | Semesterlön på rörlig lön en gång per semesterår; procentregeln per intjänad dag; VAB/föräldraledighet egna tak; ATF 40 h. |
| #29 (bygger på #28) | Lön H2, M11; Tid H4 | Slutlön med semesterersättning; obetald semester; rad på Idag. |
| #30 | Juridik H1, H2, M3, M4, LOW | Användarvillkor, personuppgiftsbiträdesavtal, ny integritetspolicy, cookieinställningar, momsreg.nr i sidfoten, terms_version (0047). Juristgranskning krävs före extern försäljning. |
| #31 | Fakturor H3; Tid H1 | Oföränderliga betalningar, allokeringar, påminnelser och inkassoärenden (0045); loggning och skäl vid ändring av inskickad tid. |
| #32 | Offerter H1, H2, H3, M1, M2, M3, M5 | Ångerrätt och ångerblankett; pristyp med 15 %-spärr vid fakturering; låsta skickade/accepterade offerter (0046); priset inkl. moms först; standardvillkor; F-skatt av som förval. |
| #33 | Tid H2, H3, M2, M6, L5 | Mertid och jourtid, övertidens slag, övertid över avtalets arbetstid, 10 b §, rast, natt, övertidsjournal (0048). |

Merge order: #27, #28, #29, #30, #31, #32, #33. #31 and #33 both touch
`lib/core/hr/time.ts`, `time-store.ts` and `lib/core/events.ts`; #32 adds
quote events to `events.ts` as well. Expect small conflicts in the event
list and the time store when the later ones are merged.

Migrations added: 0045 (immutability), 0046 (quotes), 0047 (terms version),
0048 (ATL). None has been run against a database here; run them on a test
project first, in that order.

Still open after these PRs (the owner's or a later task): Lön M1–M10 (AGI
098, skattekolumn check, OB in sjuklön, SÄVA ≤ 3 months, kvittning consent,
SINK, dated SQL rules for 2027, friskvård/gåvor, kostförmån on tjänsteresa,
1 000 kr refile), Fakturor M1–M5, M7–M10 and the inkasso-on-behalf opinion
(M8), Offerter M4 and Juridik M1 (retention jobs, art. 30 register), Juridik
M2 (EU region), the single-parent flag on employees (Lön H3), the parallel
payroll run, and the lawyer review of #30.
