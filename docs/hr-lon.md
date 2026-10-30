# HR and payroll ("Personal och lön") — plan

Status: **plan, written 2026-10-30. Phase 0 (rule book, tax tables,
calculators), phase 1 (people, contracts, LAS clocks, migration 0035) and
phase 2 (time, schedules, absence, /min-tid, migration 0037) are built, see
the *Läge* sections below; payroll and AGI are not.** Written in English
because that is how the request was made; Swedish legal terms are kept in
Swedish because that is what Skatteverket, the law and the collective
agreements call them. "You" is Ibrahim (decisions, accounts, agreements), "a
session" is a coding session, "we" is both.

The module adds employees, contracts, time, absence, payroll, taxes and the
monthly reporting to Skatteverket (AGI) to `/admin`, for Binaafy first and as
part of the product later, on the same core the invoicing uses: several
organisations, öre, dated rule sets, documents that are never edited after
they are issued, a journal entry under every payslip, an event log, period
locks and full export (`docs/fakturering.md`, "De sex grundkraven").

Reliability is the design goal, not feature count. In payroll "reliable"
means: the number on the payslip, in the bookkeeping, in the AGI file and in
the bank file is the same number, computed from rules that carry the date
they were checked, from time that someone approved, and every change leaves
a trace. Every section below is written against that.

## Läge: phase 0 done (2026-10-30)

Pure TypeScript, no UI, no migration. `npm test` runs it all (the test
script now quotes its glob; before, 26 test files in subfolders never ran).

**Where things are**

| What | File |
|---|---|
| Rule book, every row of section 4 with its source URL and check date | `lib/core/rules/payroll.ts` (`payrollRulesAt`, `agiDueDate`, `unverifiedRules`) |
| Tax tables: parse Skatteverket's CSV, SHA-256, golden-vector gate, `tableTax`, `lumpSumTax` | `lib/core/payroll/tax-tables.ts`, vectors in `tax-tables.golden.json` |
| Import script | `npm run tax-tables:import -- 2026` (`supabase/import-tax-tables.ts`; `--file`, `--out`; no database yet) |
| Time → pay (OB, övertid bands, månadslön deductions, ATF) | `lib/core/payroll/time-to-pay.ts` |
| Sjuklön, karensavdrag, återinsjuknande, ten-in-twelve | `lib/core/payroll/sick-pay.ts` |
| Semester (7 §, procentregeln, sammalöneregeln, saving, skuld) | `lib/core/payroll/vacation.ts` |
| Preliminary tax, engångsskatt, jämkning, 30 % | `lib/core/payroll/tax.ts` |
| Arbetsgivaravgifter, AGI rounding, SAF-LO/ITP1 premium | `lib/core/payroll/contributions.ts` |
| LAS clocks (SÄVA, vikariat, provanställning) | `lib/core/payroll/employment-clocks.ts` |
| Pay item flags, frozen payslip, journal lines, `reconcile()` | `lib/core/payroll/payslip.ts`; seed `pay-items.default.ts` |
| Three hand-checked payslips | `lib/core/payroll/fixtures/*.test.ts` |

**Tax tables.** The 2026 monthly file (Skatteverket open data, SHA-256
`7482130d…c841f0`, 7 966 lines, tables 29–42) passes 17 golden vectors
read from SKVFS 2025:20's own table PDF. The repo keeps tables 32–34 as a
sample; the full file is downloaded by the script.

**Not verified** (kept, flagged `unverified` in the rule book, pinned by a
test):

- Rounding of a percent-based skatteavdrag (30 %, engångsskatt, jämkning):
  no primary text found; we drop the öre.
- LAS counting: Arbetsgivarverket counts a month as 30 days (12 months =
  360) and unbroken employment in calendar months; that the 361st day
  converts is our reading of "mer än tolv månader".
- Fora's reporting deadline (last day of the month after payout) was only
  seen in a search excerpt.

**Where section 4 below was wrong** (the rule book has the right value):

- Sjuklönekostnad is no longer reported in the AGI (ruta 499 was used for
  periods 2018-07 to 2024-06). The calculators still give the figure.
- Semesterlagen gives 12 % on variable pay under sammalöneregeln; 0,8 %
  per day is the agreements' semestertillägg (Byggavtalet and
  Tjänstemannaavtalet), with 4,6 % per day as the day value.
- The young people's reduction is enacted (lag 2026:100): born 2003–2007
  in 2026, from 2026-04-01 to 2027-09-30, 20,81 % up to 25 000 kr a month.
- The older rate is still born 1938–1958 in 2026 (moves to 1959 in 2027).
- Växa-stöd cap is 35 000 kr for hires after 2024-04-30, 25 000 kr before.
- SAF-LO is invoiced at 4,4 % in 2026 (employees are credited 4,5 %).
- Employers above 40 MSEK declare the AGI on the 26th but pay on the 12th.
- Vikariat converts after 730 days (AD 2019 nr 56: at least 731).
- Styrelsearvode is reported in ruta 011 and again in 023 ("varav").

**Changes to section 3 for phase 1:** `employee_tax.kind` is `table` or
`none`; there is no `percent` kind (a percent decided by Skatteverket is a
jämkning with its validity, and a main employer without a table is an
error, never a silent 30 %). `leave_balances` should store the semesterår
model (`startMonthDay`, earned the year before or the same year), see
`vacationYears()`.

**Before 2027:** `payrollRulesAt` refuses 2027 dates until a 2027 set and
2027 golden vectors are added (older rate moves to born 1959, the young
band to 2004–2008, new tables and engångsbelopp).

## Läge: phase 1 done (2026-10-30)

People, contracts, tax data and the LAS clocks, in the database and in
`/admin/personal`. Draft PR "HR fas 1: personal, anställningar och avtal
(0035)". 0035 is applied to the Supabase project; the review's fixes are in
`0036_hr_fixes.sql`, which must be applied after it.

**Where things are**

| What | File |
|---|---|
| Migration: tables, encryption, role `employee`, RLS, events, bucket `hr`, clocks | `supabase/migrations/0035_hr.sql` |
| Review fixes: periods with gaps, same-day tax corrections, signing old contracts, clocks per person | `supabase/migrations/0036_hr_fixes.sql` |
| SQL tests (RLS, encryption, versions, documents, the employee role, every clock case) | `supabase/tests/0035_rls.sql` |
| Run all migrations and SQL tests on a local Postgres, no Supabase | `supabase/tests/local/run.sh` (with `shim.sql`) |
| Clock cases shared by TypeScript and SQL; regenerate the SQL block | `lib/core/hr/clock-cases.ts`, `npx tsx supabase/tests/gen-0035-clocks.ts` |
| Types, zod, personnummer, versions → LAS periods, missing data, Idag rows | `lib/core/hr/{schema,clocks,missing,today,draft,format}.ts` |
| Store (RLS and the database's functions; memory in demo mode) | `lib/core/hr/store.ts` |
| Contract text per form (LAS 6 c §, SÄVA information, VD, styrelse) | `lib/core/hr/contract.ts`; PDF `lib/pdf/EmploymentContractPdf.tsx`, `lib/pdf/render-contract.tsx` |
| Server actions | `app/admin/hr-actions.ts` |
| Pages | `app/admin/(dashboard)/personal/` (list, `ny`, `[id]` with tabs, `[id]/dokument/[docId]` PDF) |
| Roles and access `payroll` | `lib/core/org/roles.ts`, `proxy.ts` |

**What the database does**

- `employees` with `pnr_enc`/`bank_account_enc` (pgp_sym_encrypt, keys
  `hr_pnr_key`, `hr_bank_key` in Vault, derived per organisation as in
  0023), `pnr_hash` (HMAC with `hr_pnr_hash_key`), `pnr_masked` and
  `birth_date` in clear. The migration creates the three Vault secrets if
  they are missing. No role can select the ciphertexts; `hr_employee_pnr()`
  and `hr_employee_bank_account()` decrypt for owner/admin only and write
  `employee.pnr_revealed` / `employee.bank_revealed` to `events` every time.
  New people go through `hr_create_employee()`.
- `employments` is versioned: an insert with `contract_id` closes the
  current version the day before (trigger), the same day replaces a version
  that never took effect; nothing else may change (`document_id` is set when
  a contract is signed). `employee_tax` rows are insert-only with
  `valid_from`; several rows may share a date and the last entered wins, so a
  wrong table is corrected by entering the row again (0036). `kind` is
  `table` or `none`, and a main employer without a table is a check
  violation. `employment_documents` are frozen except the one-time signing
  (`hr_sign_document()`, any date from the contract's start to today, so
  paper contracts from before the register can be recorded); the row is
  written before the PDF is uploaded, so a refused row never leaves an
  orphan file. The PDF lies in bucket `hr` under
  `{org}/{person}/{document}.pdf` with its SHA-256, and the app refuses to
  serve a file whose hash differs. `leave_balances` stores the semesterår
  model per row (`year_start_month_day`, `earning_model`); nothing fills
  the balances yet.
- Roles: `employee` added to `memberships` and `invitations`.
  **`is_org_member()` now leaves `employee` out**, so every existing policy
  (invoices, customers, the event log, the exports bucket, which 0035 also
  patches) keeps an employee out; they see their own membership row, their
  organisation's name and, through `is_self()`, their own HR rows and PDFs.
  An invitation with role `employee` links the login to the person by
  e-mail (trigger on `memberships`). `can_payroll_read` (owner, admin,
  accountant) reads everything HR; `can_payroll_approve` (owner, admin)
  writes. Personal events (`aggregate_type = 'employee'`) are hidden from
  staff and readonly by a restrictive policy and never leave through the
  public API.
- `employment_clocks(org, as_of, employee)` counts per person from the
  versions (`employment_periods()`: each version from max(start, valid_from)
  to min(end, valid_to, probation end); consecutive versions of one form in
  a contract are one period only when they touch, so an extension
  registered after the end date does not count the gap, 0036). People
  without SÄVA, vikariat or provanställning get zeros without counting;
  Idag skips the call when nobody has such a form. `las_clocks()` is a port of
  `employment-clocks.ts` with the same search; `las_rules()` holds the rule
  book's LAS values and `clock-parity.test.ts` fails if they drift.

**The app.** Personal list with form, pay form, agreement, clocks (days to
conversion; red within 30 days, or when the limit has passed while the
person still holds the form, which by LAS 5 a § already is tillsvidare) and
missing-data badges. Person page with the tabs of section 11: Anställning
(contracts, versions, "Skapa avtal (PDF)", download, "Markera som signerad"
with a date, a new version, a new contract) and Skatt (current row, history,
new row) have content; Lön, Tid, Frånvaro, Utlägg, Förmåner say which phase
fills them; Uppgifter holds contact details, a new personnummer or account,
and the person's history. The personnummer is masked until "Visa"
(owner/admin), which logs. Idag adds LAS rows (converting within 30 days,
or passed while still on the form), provanställningar ending within 14 days
and contracts ending within 30. Nav "Personal" for owner, admin and
accountant; staff and readonly do not see it and the proxy turns them away;
an employee reaches no admin page and lands in the portal.

**Verified**

- `npm test` (542 tests) and `npm run lint` (0 errors); `tsc` clean.
- All 34 earlier migrations plus 0035 and 0036 applied to Postgres 17 with the
  shim, and all 14 SQL test files pass, the earlier ones included after the
  `is_org_member` change. `0035_rls.sql` runs 44 clock cases (the reference
  test's cases and its 12 random SÄVA patterns, forwards and backwards)
  through `las_clocks()` with the reference's whole row as expectation.
- In demo mode in the browser: a tillsvidare, a vikariat chain, a SÄVA
  chain (three shifts in one month, an extension by a new version), a board
  member and a provanställning created through the forms, contracts
  generated, downloaded (PDF, hash checked) and signed, the reveal logged,
  the list and Idag rows correct. The same periods through `las_clocks()`
  give the same days and dates as the screen (350 of 360 → 2026-11-11;
  vikariat 791, converted 2026-05-31; provanställning ends 2026-11-09).

**Not verified, or not done**

- 0036 has not run against Supabase. Apply it after 0035 and run
  `supabase/tests/0035_rls.sql` in the SQL editor; it covers both.
- Nothing has run against Supabase: not Vault (`vault.create_secret` in
  the migration, the shim fakes it), not Storage policies on the real
  `storage.objects`, not supabase-js's RPC calls with these signatures, not
  RLS through PostgREST. Run `0035_rls.sql` in the SQL editor after
  applying 0035, and walk the demo steps above with a real login.
- Roles in the browser: demo mode is always owner, so the accountant's
  read-only pages and the employee's redirect were tested only in SQL and
  in `roles.test.ts`.
- The contract texts are written from LAS 6 c § and the agreements as
  summarised in this plan, not reviewed by a lawyer. The "vid behov"
  paragraph names a default (pass vardagar 06–18, 24 hours' notice) that
  you should confirm or override under Övriga villkor.
- `schedule_id` on `employments` has no table yet (phase 2). `leave_balances`
  has the model but no balances, and nothing reads it yet.
- E-signature, sending the contract by e-mail, and amendment/termination
  documents (the `kind` values exist, nothing creates them).
- Linking a login to a person other than by the invitation's e-mail.

## Läge: phase 2 done (2026-10-30)

Time, schedules, call-ins, absence and the employee's own page. Draft PR
"HR fas 2: tid, schema, frånvaro och /min-tid (0037)". 0037 is applied to
the Supabase project (2026-10-30, after 0036). Run
`supabase/tests/0037_time.sql` in the SQL editor to check it there.

**Where things are**

| What | File |
|---|---|
| Migration: schedules, shifts and offers, time entries, locks, absences and sick periods, project leader, RLS, events, functions | `supabase/migrations/0037_time.sql` |
| SQL tests (B sees nothing, employee, leader, accountant, lock, correction, call-in → SÄVA → clock, sick periods) | `supabase/tests/0037_time.sql` |
| Time rows → `WorkBlock[]`, sums, ISO weeks, ATL warnings | `lib/core/hr/time.ts` |
| Sick-period rule, `sickPay()` fed with the schedule and partial days, läkarintyg day, ten in twelve, semester days | `lib/core/hr/absence.ts` |
| Semester per semesterår (earned, taken, saved) with the stored model | `lib/core/hr/balances.ts` |
| Approved row → `project_costs` row (and its reversal) | `lib/core/hr/project-cost.ts` |
| Idag rows (läkarintyg, call-ins, time to approve) | `lib/core/hr/time-today.ts` |
| Form schemas | `lib/core/hr/time-schema.ts` |
| Store (RLS and the database's functions; memory in demo mode) | `lib/core/hr/time-store.ts`, loaders `lib/core/hr/person-time.ts` |
| Server actions | `app/admin/time-actions.ts`, `app/(portal)/min-tid/actions.ts` |
| Pages | `app/admin/(dashboard)/tid/`, `app/admin/(dashboard)/schema/`, the person page's Tid and Frånvaro tabs (`components/admin/hr/PersonTimeTab.tsx`, `PersonAbsenceTab.tsx`), `app/(portal)/min-tid/` |
| Roles `time` and `self`, `/min-tid` in the proxy, employee lands on `/min-tid` | `lib/core/org/roles.ts`, `proxy.ts` |

**What the database does**

- `schedules` + `schedule_rules`: one block per weekday (start, end, break),
  frozen once made. `employments.schedule_id` now has its foreign key; a
  version gets its schedule once (like the signed contract), a new version
  inherits the previous one's, and a new pattern on a version that has one
  is a new version from a chosen day (`hr_set_schedule()`; the working time
  is part of the contract). 0037 replaces `employments_version()` and
  `employments_freeze()` for this.
- `shifts` (planned, or offered) and `shift_offers` (one row per person
  offered). The pool is everyone not ended whose latest contract is a SÄVA
  with timlön (`shift_pool()`). `shift_answer()` with yes inserts a new
  one-day SÄVA from the person's latest timlön contract and points
  `shifts.sava_period_id` at it, so `employment_clocks()` counts the shift;
  the other offers expire. An accepted shift is frozen.
- `time_entries`: draft → submitted → approved → locked. Hours are
  computed from start, end and break in the database; equal start and end
  are refused (a 24-hour stretch is written as hours). After approval a row
  never changes: `time_correct()` adds a reversal (same day, kind, project,
  hours negated, `corrects_id`) and optionally a replacement, both
  submitted and approved as usual; each row is corrected at most once.
  Submitting, approving, returning, correcting and locking go through
  functions that write one event per person per batch.
- Approval (`time_approve()`) writes the `project_costs` row in the same
  transaction. The amount is computed in the app (`project-cost.ts`: timlön
  or månadslön via `monthlyToHourlyOre`, plus the arbetsgivaravgift rate
  for the person's birth year) from `time_cost_basis()`; the database
  checks that hours and project are the row's and refuses an approval of a
  project row without its cost. Cost rows from time (`time_entry_id`) can
  only be reversed by a correction; their hours may be negative.
- `time_locks`: no insert, update, delete or approval of time, and no
  absence change that touches the locked days. Locking refuses while drafts
  or submitted rows remain in the period, and marks the approved ones
  `locked`. A lock is never removed.
- `absences` (0,25 steps per day, open end for sjuk, läkarintyg date,
  approval) and `sick_periods`, linked by `sick_relink()` after every
  change: a spell starting at most `sick_rules().relapse_days` (5) days
  after the period's last day continues it. Overlapping sick spells are
  refused. Only owner/admin approve and record certificates.
- `portal_projects.leader_user_id`, set only by owner/admin and only to
  staff or higher; `can_approve_time(project)`. A leader (staff) cannot
  approve their own time; owner and admin can.
- RLS as section 10: an employee reads their own rows and writes their own
  drafts, submitted rows and unapproved absence; a leader sees and approves
  their projects' time (names through `time_people()`, no other personal
  data, no absence); payroll readers read everything; the accountant
  approves nothing. Personal events are `aggregate_type = 'employee'`;
  locks and offers to the pool are `'time'`, and neither leaves through the
  public API.

**The app.** Tid: the week per project and person with net hours and
status per day, approve a day, a person's week or everything submitted,
return with a note, the week's rows with Rätta on approved ones, ATL
warnings, locks, call-ins with who answered, and who leads each project
(admin). Schema: the month calendar (schedule hours, shifts, absence
codes), each person's weekly pattern with a form for a new one, planned
shifts. Person › Tid: the month by week with sums and ATL warnings, and
time entered for the person. Person › Frånvaro: absences with approve,
läkarintyg received, last sick day and remove; every sick spell day by day
from `sickPay()` (day numbers through återinsjuknande, karensavdrag once,
employer days 1–14, the läkarintyg day); semester per semesterår with
"Spara saldona" (writes `leave_balances`). Idag: missing läkarintyg (payroll
readers), unanswered call-ins and time waiting (those who approve). Nav: Tid
for owner, admin, staff and accountant; Schema for payroll. `/min-tid`
(mobile): stamp in and out on a project, today's shift, call-ins (yes/no),
the week with "Skicka in veckan", time added afterwards, report absence and
"Jag är frisk i dag", own contracts. Employees land there after login.

**Verified**

- `npm test` (571 tests), `npm run lint` (0 errors), `tsc` clean.
- All migrations through 0037 on Postgres with the shim; all 15 SQL test
  files pass, `0037_time.sql` included.
- In demo mode in the browser: a month salary person with a schedule and a
  behovsanställd created; a week reported from a phone-sized `/min-tid`
  (stamped in, rows added, the week submitted), approved on Tid with
  project costs (242,63 kr/h × 8 h = 1 941 kr, as hand-computed), Monday
  corrected from 8 to 7 h and the cost reversed, the week locked; a call-in
  offered, accepted on `/min-tid`, and a one-day SÄVA registered; sick
  spells 1–2 and 7–15 September as one period (one karensavdrag of
  1 181,60 kr, days 1–11, läkarintyg from 12 September, also on Idag) and a
  half-day spell in October as a new one; balances saved.

**Not verified, or not done**

- 0037 is applied, but nothing of the app has run against Supabase yet:
  not supabase-js's RPC calls with these signatures (`uuid[]` and `jsonb`
  arguments), not RLS through PostgREST, not the `leave_balances` upsert.
  `0037_time.sql` has not been reported run in the SQL editor.
- Roles in the browser: demo mode is always owner, so the leader's,
  accountant's and employee's views were tested only in SQL and
  `roles.test.ts`; the real employee login → `/min-tid` redirect was not
  walked.
- The database's `current_date` is UTC: on the evening of the day before,
  Swedish time, a shift may still count as "tomorrow" for acceptance.
- The ATL rest checks are approximations (documented in `atlWarnings`);
  they warn, never block.
- Project cost is pay + arbetsgivaravgift only: no övertid or OB premium,
  semester, pension or the young people's cap (phase 3 has those numbers).
  The hourly cost on a cost row is visible to every org member who sees
  project costs, staff included; a staff leader can also call
  `time_cost_basis()` for their projects' rows and see the person's pay.
- A planned shift assigned directly (Schema) is not an employment; only an
  accepted call-in creates a SÄVA. A behovsanställd's planned shift needs
  its own SÄVA registered under Anställning.
- Corrections of locked rows are refused; they belong in the next payroll
  run as retro lines (phase 3).
- Absence approval has no flow beyond the button (no notification).
  Semester requests from `/min-tid` are reports until approved.
- No payslips or expenses on `/min-tid` (phases 3 and 5).

**Where sections 3, 10 and 11 turned out wrong or thin**

- Section 3: one `shifts` table cannot hold a call-in to several people;
  `shift_offers` holds each person's answer. `time_entries.kind = 'ob'` is
  redundant (the band comes from the clock); it is kept as worked time. A
  correction is a pair (reversal + replacement), not one row. A
  `sick_periods` table was added. `leave_balances.paid_days` holds days
  taken. `project_costs` got `time_entry_id`.
- Section 10: "staff approve time for projects where they are
  project_leader" needed a project-leader field
  (`portal_projects.leader_user_id`) and a rule that a leader does not
  approve their own time. Staff need the names of the people on their
  projects without the personnel register: `time_people()`.
- Section 11: Tid is not a Personal page for access: staff reach it
  (`/admin/tid`, access `time`), Personal and Schema stay payroll-only.
  `/min-tid` is outside `/admin` with its own access `self` (employee, and
  owner/admin to try it).

---

## 1. What we build, and what we do not build first

**We build**

- A register of people and their **employment contracts**, modelled so that
  the legal form (tillsvidare, vikariat, särskild visstidsanställning,
  provanställning), the **pay form** (månadslön, timlön) and the **schedule**
  are three separate things. "Timanställd" is not an employment form in
  Swedish law; it is timlön on one of the forms above. "Vid behov" is a
  chain of short särskild visstidsanställning. "Långtidsvikariat" is a
  vikariat with a fixed schedule and a known end date. Modelling it this way
  is what lets the system apply LAS correctly to all of them.
- **Time and absence**, mobile first, per project, with approval. Worked
  hours, OB, övertid, sjuk, VAB, semester, föräldraledighet, tjänstledighet,
  permission, and call-in shifts for behovsanställda.
- **Payroll runs** that compute gross pay, sjuklön, semester, preliminary
  tax (skattetabell, engångsskatt, jämkning), arbetsgivaravgifter by age
  group, benefits, expenses, net pay, and produce an immutable payslip PDF,
  a journal entry, a bank file and the AGI file.
- **Owners and the board**: VD on salary, styrelsearvode as its own pay
  form, and a planner for the owners' löneuttag under the 3:12 rules.
- **Reports**: AGI per month, skattekonto amounts and dates, Fora/Collectum
  pay reporting, semesterlöneskuld, labour cost per project, arbetsgivarintyg,
  anställningsavtal, and the year-end checks.

**We do not build first**

- Ackordslön (Byggavtalet piece rates) and the full Byggavtalet rule book.
  We support the parts a small firm uses: timlön/månadslön, OB, övertid,
  13 % semester, arbetstidsförkortning as a setting.
- Direct API submission of AGI to Skatteverket. Their API is for approved
  software vendors with a signed agreement; we produce the XML file and
  upload it in Skatteverket's e-service with BankID in phase 4, and apply for
  the API when the product has more than one customer (section 9).
- Automatic bank payment. We produce the salary file; a person uploads and
  signs it in the bank. The system never moves money.
- Rekrytering, onboarding checklists, performance reviews. HR beyond what
  payroll and the law need is a later product decision.

---

## 2. The contract types and what the law makes the system do

| Form (LAS) | What it is | What the system must do |
|---|---|---|
| **Tillsvidare** | Permanent. Månadslön or timlön. | Notice periods by tenure (1–6 months). Semester 25 days. The default. |
| **Provanställning** | Trial, max 6 months, becomes tillsvidare automatically. | Warn 14 days before the end (the employer must give notice two weeks ahead to end it). Convert on day 1 after. |
| **Vikariat** | Replaces a named absent person or holds a vacant post. | Store who is replaced or which post. Count days: more than **2 years in 5 years** at the same employer converts to tillsvidare, and all vikariat time with us counts together. Warn at 90 and 30 days before. |
| **Långtidsvikariat** | Same legal form as vikariat. | Same counting; differs in practice: fixed schedule, usually månadslön, known end date, often a notice clause. A preset, not a separate form. |
| **Särskild visstidsanställning (SÄVA)** | Fixed term without a reason. Since 2022-10-01 it replaces allmän visstidsanställning. | Count days: more than **12 months in 5 years** converts. If a person has **three or more SÄVA in one calendar month, the days between them count too**. Written information to the employee that the form is SÄVA. Warn well ahead of 12 months. |
| **"Vid behov" / intermittent** | Not a form. Each accepted shift is a new short SÄVA. | Call-in offers from the schedule (SMS/push, accept or decline). Each accepted shift becomes a SÄVA period in the register, so the 12-month and three-in-a-month rules are counted on real data, not guessed. No pay between shifts, semesterersättning 12 % (13 % under Byggavtalet) paid per shift or per month. |
| **Säsong** | Seasonal. | Supported as a form; no conversion clock (LAS 5 a § converts only SÄVA and vikariat), only företrädesrätt under 25 §. No special UI. |
| **VD** | An employee, but LAS does not apply to företagsledare (1 § LAS). | Contract type "VD-avtal" with its own notice and severance terms, no LAS counting, no provanställning. Sjuklön and semester as for employees unless the contract says otherwise. Usually also an owner (next row). |
| **Owner in a fåmansföretag** | Employee of their own AB. | Salary is ordinary payroll. Flag `owner` on the employee for the 3:12 planner (section 6) and because växa-stöd and some benefits treat owners differently. |
| **Styrelseledamot** | Not employed; styrelsearvode is **inkomst av tjänst** decided by the bolagsstämma. | Pay form "arvode": arbetsgivaravgifter by age group as for salary, preliminary tax 30 % when we are not the main employer (or by the person's jämkning decision), reported per person in AGI. **No semester, no sjuklön, no LAS, no tjänstepension** unless agreed. No arbetsgivaravgift or skatteavdrag when the year's total to the person is under 1 000 kr. Since HFD 2017 the fee cannot be invoiced from the member's own company in the normal case. A review of this taxation is due 2027-10-31; the rule set carries the date. |
| **Tjänstemän** | White-collar staff (the software side). | Same forms as above; the difference is the collective agreement and pension: Tjänstemannaavtalet and ITP via Collectum instead of Byggavtalet and SAF-LO via Fora. A per-employee `agreement` setting decides OB/övertid tables, semester rule and which pension report the person lands in. |

Three design consequences:

1. `employments` is **versioned**. A contract change (pay rise, new form, new
   working time) is a new row with `valid_from`; the old row is closed, never
   edited. Payroll for a period reads the version valid in that period.
2. **Days are counted by the database**, from the rows, with the three
   statutory clocks (SÄVA 12/60 months, vikariat 24/60 months, provanställning
   6 months) exposed as a view and as a "to do" list on the payroll start
   page. A counting rule is a tested SQL function, not a reminder someone
   sets.
3. Every form produces a **written contract PDF** from a template that
   contains the information LAS 6 c § requires (more items since 2022:
   form, trial period, pay components and pay day, working time, right to
   training, social security contributions, collective agreement), signed
   with the same flow as quotes (download or send, later e-signature).

---

## 3. Data model (migration `0035_hr.sql`)

All tables carry `org_id`, RLS, `events`, and follow `0014_core.sql`. Money is
`bigint` öre. Personnummer and bank account numbers are encrypted with the
Vault pattern from `0023_rot_pnr_encryption.sql` (a key per secret name,
`pgp_sym_encrypt`, functions revoked from every role, decrypt only inside
security definer functions that check `can_admin_org`). A searchable
`pnr_hash` (keyed HMAC) allows lookup without decryption.

**People and contracts**

| Table | Purpose and key columns |
|---|---|
| `employees` | One row per person per org: name, contact, `pnr_enc`, `pnr_hash`, `birth_date` (for the avgift age group, derivable from pnr but stored so the rule needs no decryption), address, `bank_account_enc` + clearing (for the salary file), `user_id` (their login, nullable), `is_owner`, `is_board_member`, `agreement` ('byggavtalet','tjanstemannaavtalet','none'), `emergency_contact`, `ended_at`. |
| `employee_tax` | Versioned preliminary tax data: `kind` ('table','percent','none'), `table_no`, `column_no` (1 for most, 2 for those over 66 at the year's start, etc.), `adjustment_percent` + `adjustment_valid_to` (jämkning), `main_employer` (bool; false → 30 % on arvode and sidoinkomst), `source` ('a-skattsedel','skatteverket-api','manual'), `valid_from`. One row valid at any date. |
| `employments` | Versioned contract: `form` (tillsvidare, provanstallning, vikariat, sava, sasong, vd, uppdrag), `pay_form` (monthly, hourly, fee), `monthly_salary_ore` / `hourly_rate_ore`, `working_time_percent`, `schedule_id`, `substitute_for` (text or employee id), `probation_ends_on`, `starts_on`, `ends_on`, `notice_days`, `vacation_rule` ('procent','sammalon'), `vacation_days` (25 default), `vacation_percent` (12.0 or 13.0), `atf_hours_per_year` (arbetstidsförkortning), `pension_scheme` ('saf-lo','itp1','none'), `valid_from`, `valid_to`, `document_id`. |
| `employment_documents` | Generated contracts, amendments, arbetsgivarintyg, termination letters: frozen PDF in a private bucket `hr`, template version, signed_at. |
| `schedules`, `schedule_rules` | Weekly pattern per employment (days, start, end, break) used to compute scheduled hours, sjuklön per day, and to put shifts in the calendar. |
| `shifts` | Planned work: date, start, end, project_id, employee_id (nullable until filled), `offer_status` for call-ins (offered, accepted, declined, expired), `sava_period_id` once accepted. |

**Time and absence**

| Table | Purpose |
|---|---|
| `time_entries` | What actually happened, one row per block: employee, date, start/end or hours, `kind` (work, overtime, ob, travel, on_call), `project_id` (→ `portal_projects`), note, `source` (clock, manual, imported), `status` (draft, submitted, approved, locked), approver and time. Append-only after approval: a correction is a new row that references the old one and reverses it. |
| `absences` | sjuk, vab, semester, foraldraledig, tjanstledig, permission, kompledig: from/to with partial days (0.25 steps), `certificate_received_on` (läkarintyg from day 8), link to the sick period for återinsjuknande (within 5 days continues the same period, no new karens). |
| `leave_balances` | Per employee and semesterår: earned, paid, saved (up to 5 years), semesterlöneskuld in öre recomputed by payroll and stored per run for the balance sheet. |
| `time_locks` | Period per org after which time cannot be submitted or approved (set by the payroll run). |

**Payroll**

| Table | Purpose |
|---|---|
| `pay_items` | The löneartsregister: code, name, `kind` (salary, hourly, overtime, ob, sick_pay, sick_deduction, vacation_pay, vacation_deduction, fee, benefit, expense, mileage, per_diem, gross_adjustment, net_adjustment, retro), flags that decide everything downstream: `taxable`, `tax_mode` (table, lump_sum, none), `subject_to_employer_contribution`, `vacation_pay_basis`, `pension_reportable`, `agi_box`, `account` (debit), `counter_account`, `fora_category`. Seeded per org from a standard list; editable by admins, versioned. |
| `pay_runs` | Period (`period_start`, `period_end`, `pay_date`, `agi_period` = the month of `pay_date`), `status` (draft → calculated → approved → paid → booked → reported → closed), `checks` jsonb (the pre-run checklist with its results), `computed_by`, `approved_by` (must differ), `journal_entry_id`, `bank_file_id`, `agi_declaration_id`. |
| `payslips` | One per employee per run. `document` jsonb frozen at approval (every line, every rate, the rule set version, the tax table version), number from series `L`, PDF path, `net_ore`, `tax_ore`, `employer_contribution_ore`, `contribution_rate`. Immutable by trigger like `invoices`. |
| `payslip_lines` | The lines of the document as rows, for sums and reports. |
| `payroll_corrections` | A correction is a new payslip in a later run with retro lines pointing to the original; the AGI for the original month is re-filed. Never an edit. |
| `tax_tables` | Imported from Skatteverket's open data each December: year, table_no, column, income from/to, tax. `tax_table_imports` keeps the file hash, row count, import date and who ran it, and the import is refused unless a set of known test vectors from SKV 433 match. |
| `agi_declarations` | Per org and month: generated XML, `status` (draft, filed, corrected), filed_at, who, the sums (`total_tax`, `total_contributions`, box 499 sjuklönekostnad), and the per-person IU records as jsonb for diffing against a refile. |
| `pension_reports` | Fora (SAF-LO) and Collectum (ITP1) monthly reporting lines: employee, period, reported pay, scheme, status. |
| `bank_files` | Generated salary files (ISO 20022 pain.001 or the bank's löner format), frozen, with totals, never auto-sent. |
| `expense_claims` | Utlägg, milersättning (own car, 25 kr/mil 2026), traktamente (300/150 kr domestic 2026), receipts in the `hr` bucket, approval, paid through the next run as tax-free or taxable lines by rule. |
| `benefits` | Per employee: bil (Skatteverket's formula with registration number and nybilspris), kost, bostad, other; value per month and the rule version. |

**Views and functions**

- `employment_clocks(org)` → per person: SÄVA days in the last 60 months,
  vikariat days in the last 60 months, probation end, date of conversion,
  and days left. Backed by tests with the published examples (the
  "three SÄVA in a month" rule, the 360 vs 365 day questions).
- `run_payroll(run_id)`, `approve_payroll(run_id)`, `book_payroll(run_id)`:
  security definer like `issue_invoice`, numbered in series `L` and `V`,
  refusing locked periods, writing `events`.
- `payroll_reconciliation(run_id)` → the four sums (payslips, journal, AGI,
  bank file) and a boolean. A run cannot reach `closed` unless it is true.

---

## 4. The rule book for payroll (`lib/core/rules/payroll.ts`)

Same shape as `lib/core/rules/index.ts`: dated rule sets, `rulesAt(date)`,
never edit an old set. Everything below is a rule, nothing is a constant in
the calculators. The values are what we found on 2026-10-30; the first phase
verifies each against the primary source and records the check date in the
file, as the invoicing rule book does.

| Rule | 2026 value as found | Source to verify against | Notes for the model |
|---|---|---|---|
| Arbetsgivaravgifter, full | 31.42 % (ålderspension 10.21, sjukförsäkring 3.55, föräldraförsäkring 2.00, arbetsmarknad 2.64, arbetsskada 0.10, efterlevandepension 0.30, allmän löneavgift 12.62) | Skatteverket, arbetsgivaravgifter | Store the parts, the AGI wants the total. |
| Reduced by age | Only ålderspensionsavgift 10.21 % for people above the age threshold at the start of the year; 0 % for people born 1937 or earlier | Skatteverket | **Verify the birth-year cut-off for 2026**: sources repeat 2025's "born 1958 or earlier", and the riktålder changes in 2026. Rule keyed on birth year per income year. |
| Reduced for young people | 20.81 % on pay up to 25 000 kr/month for ages 19–23, for payments 2026-04-01 to 2027-09-30 | Skatteverket | **Verify that it was enacted and the exact age band**; sources disagree (18–22 vs 19–23). Modelled as a dated rule so it can be turned off. |
| Växa-stöd | From 2026 a **refund**: pay full avgift, apply afterwards in Skatteverket's e-service; up to two employees, 24 months, only ålderspensionsavgift on pay up to the cap (35 000 kr/month for hires after 2024-04-30 per secondary sources), conditions on hours (≥ 20 h/week), 3 months' duration, no earlier tie to the owners | Skatteverket, växa-stöd | We do not reduce anything in payroll; we produce the monthly basis for the application and warn that unclaimed months are lost. **Verify cap and conditions.** |
| Preliminary tax, table | Skattetabell per kommun total rate (kommun + region + begravningsavgift [+ kyrkoavgift]), column 1 for most employees, monthly table; whole kronor | Skatteverket open data, SKV 403, SKV 433 | Imported yearly (section 5). The employee's table and column come from the A-skattsedel or Skatteverket's "Fråga om skatteavdrag" API; manual entry with the source recorded until we have API access. |
| Preliminary tax, engångsbelopp | Column 1, 2026: 0 % to 25 041; 10 % to 82 800; 21 % to 192 000; 26 % to 477 600; 34 % to 660 000; 54 % above. Bracket by **estimated annual pay incl. the lump sum**. 30 % when there is no regular salary from us | Skatteverket, engångsbelopp; SKVFS 2025:21 | Used for retro pay, bonus, slutlön, semesterersättning at termination, and arvode when we are not the main employer. All ten tables imported, not just column 1. |
| Sidoinkomst / arvode | 30 % when we are not the main employer, or the jämkning percentage | Skatteverket SKV 401 | Default for styrelsearvode. |
| Jämkning | Percentage or amount decision with a validity period | Skatteverket | `employee_tax.adjustment_*`, expires automatically. |
| Sjuklön | Employer pays days 1–14 at 80 % of lost pay and benefits; **karensavdrag = 20 % of an average week's sjuklön**; återinsjuknande within 5 calendar days continues the period; läkarintyg from day 8; no new karens after 10 occasions in 12 months (allmänt högriskskydd); sjuklönekostnad reported in AGI box 499 | Sjuklönelagen, Försäkringskassan | Average week from the schedule, or from the last 3 months' hours for behovsanställda. |
| Semester | Semesterlagen: 25 days; **procentregeln 12 %** of semesterlönegrundande pay; **sammalöneregeln** monthly salary + 0.43 % per day; semesterersättning at termination; save up to 5 days/year for 5 years; semesterår default 1 April–31 March, or calendar year by setting | Semesterlagen | Timlön and SÄVA use procentregeln. Semesterlönegrundande absence (sjuk 180 days, föräldraledighet 120 days, VAB) handled in the basis. |
| Byggavtalet (Byggföretagen–Byggnads, 2025-05-01 to 2027-04-30) | Semester **13.0 %**; OB 20/40/70 % of utgående lön by time band; övertid 30/50/70/100 % by band (A–D); OB not paid on overtime hours; arbetstidsförkortning per agreement | The agreement text (Byggavtalet 2025) | Modelled as an `agreement` rule set with the bands as data, so a new agreement is a new dated set. Ackord out of scope. |
| Tjänstemannaavtalet (Byggföretagen) 2025–2027 | Övertid as compensation in money or time per the agreement; ITP1 | The agreement text | Only what phase 5 needs. |
| Arbetstidslagen | Övertid max 200 h/year and 48 h/4 weeks or 50 h/month; 11 h daily rest, 36 h weekly rest; records of övertid, mertid and jourtid must be kept | ATL | Warnings in time approval; the övertidsjournal is a report. |
| Pension, SAF-LO (Fora) | Employer premium 4.5 % up to 7.5 IBB/12 = **52 125 kr/month** in 2026 (4.4 % charged in 2026 thanks to STP surplus), 30 % above; reported **monthly** to Fora by the end of the month after pay; Fora invoices monthly. Insurance premiums (TFA, TGL, AGS, AGB, omställning) by Fora's table | Fora, Avtalat | We compute the expected premium for the project cost and the P&L accrual; Fora's invoice is the booked cost. |
| Pension, ITP1 (Collectum) | 4.5 % up to 7.5 IBB, 30 % above, monthly reporting | Collectum | Same shape, other recipient. |
| Basbelopp | Prisbasbelopp **59 200 kr** (SFS 2025:872); förhöjt 60 500 kr; inkomstbasbelopp **83 400 kr** (SFS 2025:1002) | Regeringen | Used for pension caps, SGI, 3:12. |
| Traktamente, inrikes | **300 kr** full day, **150 kr** half day and night; 210 kr after 3 months, 150 kr after 2 years at the same place | Skatteverket, traktamente | Byggfirmor pay this a lot; above the schedule it is taxable salary. |
| Milersättning | Own car **25 kr/mil**; company car 12 kr/mil, 9.50 kr/mil electric | Skatteverket | Tax-free part as a pay item, the excess taxable. |
| Förmåner | Bilförmån by Skatteverket's formula; skattefria gränser for friskvård (5 000 kr/year), julgåva, minnesgåva, mobil for work | Skatteverket | Phase 5. |
| AGI deadlines | By the 12th of the month after pay day (13 Apr, 13 Jul, 17 Aug, 14 Sep, 14 Dec in 2026 because of weekends; 18 Jan 2027 for December); 26th for turnover above 40 MSEK; payment to skattekontot the same day (17th in January and August) | Skatteverket | A rule that returns the deadline for a period; shown on Idag and on the run. |
| 3:12 from 2026 | **Löneuttagskravet is removed**; grundbelopp 4 IBB; lönebaserat utrymme 50 % of the wage sum above 8 IBB; the cap of 50 × own or related person's salary remains; the 4 % ownership threshold is gone; saved space is no longer uprated | Lag (SFS) on the 2026 change; Skatteverket | Planner only (section 6); no payroll effect. Verify the cap rule once Skatteverket publishes its 2026 guidance. |
| Retention | 7 years after the fiscal year (bokföringslagen); personnel records with a legal basis under GDPR; lönebesked and AGI basis kept with the bookkeeping | Bokföringslagen, GDPR | Same `retentionYears` as invoicing. |
| Tax rounding | Skatteavdrag per table in whole kronor; arbetsgivaravgifter rounded to whole kronor per AGI; öre everywhere internally | Skatteverket | One place rounds: `lib/core/money.ts`. |

---

## 5. Calculations (`lib/core/payroll/`)

Pure functions, each with a test file, input is data from the tables plus
`rulesAt(payDate)`; no I/O. Order inside a run, per employee:

1. **Time to pay lines.** Approved `time_entries` and `shifts` for the
   period → hours at base rate, OB per band, övertid per band, ATF
   accrual. Monthly salary → full salary, then deductions for unpaid
   absence (kalenderdagsavdrag or arbetsdagsavdrag by rule and agreement).
2. **Absence.** Sick periods → sjuklön 80 % per scheduled day, karensavdrag
   20 % of the weekly sjuklön, the five-day rule, the ten-occasion rule.
   Semester taken → semesterlön per rule, deduction of ordinary pay for
   månadslön. VAB and föräldraledighet → deduction only (Försäkringskassan
   pays). Semesterersättning for SÄVA and timlön per month or at the end.
3. **Fixed and variable items.** Arvode, bonus, retro, benefits (taxable
   value), expenses (tax-free and taxable parts), deductions (net).
4. **Bases.** Sum per flag: taxable gross, lump-sum gross, employer
   contribution base, vacation pay base, pension-reportable pay.
5. **Preliminary tax.** Table lookup on monthly taxable gross (column from
   `employee_tax`), engångsskatt on the lump-sum part by estimated annual
   pay, or the jämkning percentage; 30 % for non-main employer.
6. **Arbetsgivaravgifter.** Rate by birth year and income year, the young
   people's band if enacted, 0 below 1 000 kr/year for arvode. Stored per
   payslip with the rate used.
7. **Net pay** and rounding, then the document: every line carries its pay
   item version, amount, basis, rate, and the rule set date.
8. **Journal entry** from the pay items' accounts (section 7), one entry
   per run, balanced by trigger.
9. **Semesterlöneskuld** recomputed per employee after the run and the
   change booked.

Testing rule: each calculator has (a) unit tests with hand-computed cases,
(b) **golden cases** from the authorities' own examples (Skatteverket's SKV
433 test vectors for tables, Försäkringskassan's karensavdrag examples,
Semesterlagen examples), and (c) a property test that a payslip's lines
always sum to its totals and that the four reconciliation sums agree. A
rule change without a golden case does not merge.

---

## 6. Owners, VD and the board

- **VD** is an employee row with form `vd`. Payroll is identical; the
  differences are in the contract template (no LAS, agreed notice and
  severance) and in the clocks (none run).
- **Styrelsearvode** is an employee row (the person) with an employment of
  form `uppdrag` and pay form `fee`, started and ended by the stämma's
  decision, with a `decision_reference`. Paid per month, quarter or year
  as the stämma decided. Tax: 30 % by default (the board member usually has
  another main employer), table if we are the main employer, arbetsgivaravgift
  by age. No semester, no sjuklön, no pension unless a separate agreement is
  recorded. Reported per person in AGI like any pay. The system refuses
  invoices from a board member's company for the fee (HFD 2017 ref. 41)
  and says why.
- **Owners' löneuttag planner** (read-only, no payroll effect): for each
  owner, the year's salary so far, projected salary, the company's wage
  sum, and what the 2026 rules give as gränsbelopp (grundbelopp 4 IBB, or
  50 % of the wage sum above 8 IBB capped at 50 × own salary, using last
  year's wages for this year's dividend). It shows the trade-off between
  salary (pension rights, SGI, sjukpenning) and dividend, and links the
  numbers to Skatteverket. Decisions stay with you and the accountant; the
  planner shows the inputs they will ask for.
- **Owner-specific rules** the payroll applies automatically: no växa-stöd
  basis for owners and their relatives, benefits valued the same as for
  anyone else, and the "fåmansföretag" flag on the AGI where it is asked.

---

## 7. Bookkeeping under every payslip

One journal entry per run, in series `V`, dated on pay day, with the pay
items' accounts (BAS 2026, mapping editable in Inställningar › Lön):

| Debit | Credit | What |
|---|---|---|
| 7010 Löner kollektivanställda / 7210 Löner tjänstemän / 7220 Lön VD / 7240 Styrelsearvoden | 2710 Personalskatt, 1930 (via 2820 Löneskuld until the bank file is paid) | Gross pay, tax, net |
| 7081 / 7281 Sjuklön, 7082 / 7282 Semesterlön | same | Sick and vacation pay, so the AGI box 499 and the semester cost are visible |
| 7510 Lagstadgade sociala avgifter (7511–7519 by group if wanted) | 2731 Avräkning lagstadgade sociala avgifter | Arbetsgivaravgifter |
| 7090 / 7290 Förändring semesterlöneskuld | 2920 Upplupna semesterlöner | Earned-but-unpaid semester, and 7519 / 2941 for the avgifter on it |
| 7570 Premier för arbetsmarknadsförsäkringar / 7410 Pensionsförsäkringspremier | 2940/2950 Upplupna avgifter | Fora/Collectum accrual; the invoice books the real cost and 7533 särskild löneskatt 24.26 % on pension premiums |
| 7321 / 7331 Skattefria traktamenten och bilersättningar, 7322 / 7332 taxable | 2820 | Expenses |
| 7380–7389 Förmåner | 7399 Motkonto förmåner | Benefits (no cash) |

Project costing: approved `time_entries` with a `project_id` create
`project_costs` rows of kind `hours` with the real loaded cost (gross +
avgifter + semester + Fora percentage from settings), replacing today's
manual hourly rows for employees. Overtime and OB land on the project they
were worked on.

Period locks apply: a run cannot be booked into a locked month; a correction
goes into the open month with the AGI refile marked. The SIE export already
includes series `V`, so payroll flows into the accountant's system with no
new export.

---

## 8. Reporting to the authorities and others

| To | What | How, phase |
|---|---|---|
| **Skatteverket, AGI** | Monthly XML: huvuduppgift (HU) with totals and individuppgifter (IU) per person: bruttolön, förmåner, skatteavdrag, avgiftsunderlag, box 499 sjuklönekostnad, styrelsearvode in its box, specifikationsnummer per person per period for corrections | File generated in phase 4 against Skatteverket's current XML schema; uploaded in the e-service with BankID; `agi_declarations` stores the file and the per-person records; a refile replaces the period and the diff is shown first. API when we are an approved vendor. |
| **Skatteverket, skattekonto** | Pay tax + avgifter by the AGI deadline | Amount and date on Idag and in the run; bank file for the transfer optional. |
| **Skatteverket, Fråga om skatteavdrag** | Each employee's table, column and jämkning | Manual with source until vendor access; then nightly refresh before a run. |
| **Skatteverket, växa-stöd** | Monthly application basis | Report with the numbers to type into the e-service, phase 4. |
| **Fora** | Monthly pay per arbetare (SAF-LO + insurances) | CSV/XML in Fora's format or manual entry, phase 4. |
| **Collectum** | Monthly pay per tjänsteman (ITP1) | Same, phase 5. |
| **Försäkringskassan** | Sjuklönekostnad goes via AGI box 499; the employee's day 15+ claim needs our sjukanmälan | Reminder with the data, phase 4. |
| **Arbetsförmedlingen / a-kassa** | Arbetsgivarintyg | PDF from the data, phase 4. |
| **SCB** | Lönestrukturstatistik if selected | CSV, when asked. |
| **The employee** | Lönebesked PDF monthly, årsbesked, the AGI summary they can see on Skatteverket | In their portal page, phase 3. |
| **The accountant** | SIE, semesterskuld, löneskuld, Fora accrual, the reconciliation | Export page, phase 3–4. |

---

## 9. Reliability: the ten rules of this module

1. **Öre and dated rules.** No decimal money, no constant without a date.
2. **Imported, verified tables.** Tax tables come from Skatteverket's
   files, hashed, with golden vectors that must pass before the import is
   accepted. The year's tables must be present before the first run of the
   year; the run refuses otherwise.
3. **Approved time only.** A run reads approved time; unapproved time
   blocks the run and is listed by person.
4. **Pre-run checklist, stored.** Missing tax data, expiring jämkning,
   clocks about to convert, contract ending, missing bank account, pay above
   the pension cap, hours above ATL limits, employee turned 66/67 this
   year, AGI from last month not filed, period lock. The checklist and its
   outcome are saved on the run.
5. **Four eyes.** The person who computes cannot approve. Owner or admin
   approves; accountant can compute and read.
6. **Immutable payslips, corrections forward.** Like invoices: triggers
   forbid updates; a mistake becomes retro lines in the next run with an
   AGI refile, and the event log shows both.
7. **Reconciliation gate.** Payslips = journal = AGI = bank file, or the run
   does not close. The gate is a database function and a page.
8. **Everything logged.** Who saw a personnummer, who approved what, every
   file generated, with the `events` table and an access log for decrypts.
9. **Parallel run before go-live.** The first two months are computed here
   and checked line by line against Skatteverket's calculator and the
   current method; the plan's phase 3 is not done until they match.
10. **Least access and GDPR.** Payroll tables are readable only by owner,
    admin and accountant; employees read their own rows; pnr and bank
    accounts are encrypted; retention follows the rule book and a job
    removes what may be removed; a register of processing (art. 30) is a
    page under Inställningar.

---

## 10. Roles and access

Today's roles: `owner`, `admin`, `staff`, `accountant`, `readonly`
(`lib/core/org/roles.ts`, `can_write_org`, `can_admin_org`). Payroll adds:

| Role | Payroll access |
|---|---|
| owner, admin | Everything: people, contracts, tax data, runs, approval, settings. |
| accountant | Read everything, compute runs, generate files; cannot approve. |
| staff | Approve time for projects where they are `project_leader`; see their own payslips; no pay data of others. |
| **employee** (new) | Their own time, absence, payslips, contract, expenses, and the call-in offers. Mobile page `/min-tid` (or `/admin/min-tid`) built like the portal: one action per day. |
| readonly | Reports only, no personal data (masked). |

New database functions: `can_payroll_read(org)` (owner, admin, accountant),
`can_payroll_approve(org)` (owner, admin), `is_self(employee_id)`. RLS tests
like `supabase/tests/0021_rls.sql`: B never sees A's people, an employee
never sees another's row, an accountant cannot approve.

---

## 11. Screens

Under `/admin` a new section **Personal** (nav `access: "payroll"`), plus the
employee page:

| Page | Content |
|---|---|
| **Personal** | List with form, pay form, agreement, clocks (days to conversion), missing data badges. Add person. |
| **Person** | Tabs: Anställning (versions, documents, clocks), Skatt (table, column, jämkning, source, history), Lön (payslips), Tid (month view), Frånvaro (periods, balances), Utlägg, Förmåner. Personnummer masked until clicked, logged. |
| **Tid** | Week grid per project and person, approve by day or week, ATL warnings, lock. Call-in: offer a shift to the pool of behovsanställda, see who accepted. |
| **Schema** | Weekly patterns and the month calendar with shifts and absences. |
| **Lönekörning** | Wizard: period and pay day → checklist → compute → review per person (diff against last month, lines expandable) → approve (other person) → bank file → book → AGI file → close. Previous runs below with status. |
| **Rapporter** | AGI per month, skattekonto amounts and dates, Fora/Collectum, semesterlöneskuld, lönekostnad per project and month, övertidsjournal, arbetsgivarintyg, växa-stöd basis, the owners' planner. |
| **Inställningar › Lön** | Pay period and pay day, semesterår, agreements in use, OB/övertid tables, account mapping, pension schemes, number series `L`, who may approve, bank for the file, the processing register. |
| **Idag** | New rows: AGI due, skattekonto due, Fora due, clocks converting within 30 days, contracts ending, sick days needing läkarintyg, call-ins unanswered. |
| **/min-tid** (employee, mobile) | Clock in/out per project, today's shift, report absence, see payslips and contract, answer call-ins, submit expenses with a photo. |

---

## 12. Order and estimate

Each phase ends with tests green, a demo-mode walkthrough and a section
added to this document, as the invoicing work did. Sessions are coding
sessions of a day or so.

| Phase | What | Done when | Sessions |
|---|---|---|---|
| **0. Rule book and calculators** | `rules/payroll.ts` with every row in section 4 verified against its primary source and dated; tax table import with golden vectors; calculators for time→pay, sjuklön, semester, tax, avgifter, net; engångsskatt; clocks as SQL. No UI. | Golden cases pass; three hand-made payslips (månadslön, timlön with OB and sick days, styrelsearvode) match Skatteverket's calculator to the krona. | 3 |
| **1. People and contracts** | `0035_hr.sql` people, tax, employments, documents, RLS, encryption; Personal and Person pages; contract PDF templates for each form; clocks on the list and Idag; role `employee`. | A tillsvidare, a vikariat, a SÄVA chain and a board member exist with signed PDFs; clocks show correct days. | 3 |
| **2. Time, schedule, absence** | Schedules, shifts, call-ins, time entries with approval and locks, absences with sick-period logic, balances; `/min-tid` mobile; project_costs from approved time. | A week of real time for the team is approved from phones; a sick period with återinsjuknande computes right. | 4 |
| **3. Payroll run** | Pay items, runs, checklist, compute, review, four-eyes approval, payslip PDF, series L, journal entry, bank file, reconciliation gate, employee view. Parallel run for two months. | Two months match the current method line by line; the accountant accepts the SIE. | 4 |
| **4. Authorities** | AGI XML + refile diff, skattekonto, Fora file, box 499, arbetsgivarintyg, växa-stöd basis, Försäkringskassan reminders, year-end: semester transition, kontrolluppgift-free year summary. | An AGI file is accepted by Skatteverket's e-service for a real month. | 3 |
| **5. Owners, board, benefits, expenses** | Styrelsearvode flows end to end, VD contract, 3:12 planner, bilförmån and other benefits, utlägg/milersättning/traktamente with receipts, Tjänstemannaavtalet and Collectum. | The board's fees for a quarter are paid and reported; an owner sees the planner. | 3 |
| **6. Product** | Onboarding of a second organisation, pay item presets per agreement, API resources for employees/time/payslips with webhooks, Skatteverket vendor application for the AGI and skatteavdrag APIs, demo data. | A second org runs a payroll without us. | 3+ |

Phases 0 and 1 can run in parallel; 2 needs 1; 3 needs 0 and 2; 4 needs 3;
5 and 6 after 3. About 20 sessions to a payroll that files its own AGI.

### Before the first real payroll (your list)

- [ ] Which collective agreement, if any: Byggföretagen member (Byggavtalet + Tjänstemannaavtalet), hängavtal with Byggnads, or none. This decides semester 12 vs 13 %, OB/övertid tables, Fora and Collectum.
- [ ] Pay period and pay day: månadslön for the current month and timlön for the previous month, paid on the 25th, is the common choice.
- [ ] Semesterår: 1 April–31 March (law's default) or calendar year.
- [ ] Who approves payroll (must be someone other than whoever prepares it), and who the accountant user is.
- [ ] The bank and its salary file format (Bankgirot Löner, or ISO 20022 through the bank), and that the person signing has the bank role.
- [ ] Register at Skatteverket as arbetsgivare (if not done), and the first AGI period.
- [ ] Fora agreement (SAF-LO) and, for the software staff, Collectum (ITP1), with their customer numbers.
- [ ] Board: the stämma's decision on arvode per member and period, and each member's main-employer status (decides 30 % or table).
- [ ] Every employee's A-skattsedel or table/column, bank account, address, and signed contract in the new templates.
- [ ] Växa-stöd: whether the first hires qualify, from which month, and who applies monthly.
- [ ] The accountant's review of the account mapping in section 7 and of the first parallel run.

---

## 13. Sources, checked 2026-10-30

Primary sources are what phase 0 verifies against; the secondary ones are
what this plan's figures came from today, and several disagree with each
other (noted in section 4).

- Skatteverket: [Arbetsgivaravgifter och skatteavdrag, SKV 401](https://www.skatteverket.se/download/18.262c54c219391f2e9634df4/1736339078938/skatteavdrag-och-arbetsgivaravgifter-skv401-utgava30.pdf) · [Skattetabeller och teknisk beskrivning](https://www.skatteverket.se/foretag/arbetsgivare/arbetsgivaravgifterochskatteavdrag/skattetabeller/tekniskbeskrivningforskattetabeller.4.319dc1451507f2f99e86ee.html) · [Teknisk beskrivning SKV 433 2026](https://www.skatteverket.se/download/18.1522bf3f19aea8075ba55c/1766385913260/teknisk-beskrivning-skv-433-2026-utgava-36.pdf) · [Engångsbelopp](https://www.skatteverket.se/privat/skatter/arbeteochinkomst/askattsedelochskattetabeller/engangsbelopp.4.70ac421612e2a997f85800014872.html) · [Öppna data](https://www.skatteverket.se/apierochoppnadata/detharerbjudervi/oppnadatapsidata.4.361dc8c15312eff6fd1736c.html) and the [data catalogue](https://skatteverket.entryscape.net/store/9/metadata/2?recursive=dcat) · [Regler för växa-stöd](https://www.skatteverket.se/foretag/arbetsgivare/arbetsgivaravgifterochskatteavdrag/vaxastod/reglerforvaxastod.4.361dc8c15312eff6fd37447.html) · [Traktamente och bilersättning](https://www.skatteverket.se/foretag/arbetsgivare/lonochersattning/traktamenteochbilersattning.4.361dc8c15312eff6fd1703e.html) · [API: Fråga om skatteavdrag 2.0](https://www7.skatteverket.se/portal-wapi/open/apier-och-oppna-data/utvecklarportalen/v1/getFile/tjanstebeskrivning-fraga-om-skatteavdrag-2-0) · [API: arbetsgivardeklaration, villkor](https://www7.skatteverket.se/portal-wapi/open/apier-och-oppna-data/utvecklarportalen/v1/getFile/allmanna-villkor-arbetsgivardeklaration-inlamning) and [hantera redovisningsperiod](https://www7.skatteverket.se/portal-wapi/open/apier-och-oppna-data/utvecklarportalen/v1/getFile/avtal-arbetsgivardeklaration-hantera-redovisningsperiod)
- Arbetsgivaravgifter 2026 (secondary): [Fortnox](https://www.fortnox.se/fortnox-foretagsguide/driva-foretag/lon/arbetsgivaravgift-hur-mycket) · [Björn Lundén](https://bjornlunden.com/se/bjornkoll/blogg/arbetsgivaravgifter/) · [Talea](https://talea.se/arbetsgivare/guide/arbetsgivaravgifter-2026/)
- AGI deadlines 2026 (secondary): [Fortnox](https://www.fortnox.se/fortnox-foretagsguide/driva-foretag/lon/allt-om-arbetsgivardeklaration-pa-individniva-agi) · [Kronan Ekonomipartner](https://kronanekonomipartner.se/arbetsgivardeklaration/) · [FAR Online](https://www.faronline.se/dokument/rattserien/ratt-lon/a/rl_arbetsgivardeklarationpaindividnivaagi/)
- LAS: [Arbetsgivarverket, SÄVA](https://www.arbetsgivarverket.se/arbetsgivarguiden/tidsbegransade-anstallningar/sarskild-visstidsanstallning-sava) · [Simployer, counting SÄVA time](https://www.simployer.com/sv/artiklar/hur-raknas-anstallningstiden-i-sarskild-visstidsanstallning) · [Företagarna](https://www.foretagarna.se/juridisk-faq/anstallning/vad-betyder-det-att-allman-visstidsanstallning-ersatts-av-sarskild-visstidsanstallning/) · [Ledarna](https://www.ledarna.se/fragor-och-svar/nya-las/sarskild-visstidsanstallning/)
- Byggavtalet 2025–2027: [the agreement (PDF)](http://www.dib.nu/wp-content/uploads/2025/11/Byggavtalet-2025-Digital-utgava-1-1.pdf) · [Arbetsmiljöverket's copy](https://www.av.se/globalassets/filer/arbetsmiljoarbete-och-inspektioner/avtal-utstationering/byggforetagen-kollektivavtal-2025-2027.pdf) · [Tjänstemannaavtalet Byggföretagen 2025–2027](https://www.sverigesingenjorer.se/kollektivavtal/avtalsomrade/byggforetagen/?block=22154&mode=Index&resourcename=1.+Tj%C3%A4nstemannaavtalet+-+Byggf%C3%B6retagen+2025+-+2027.pdf) · [OB and övertid summary](https://byggexp.se/sv/blog/ob-overtid-byggavtalet-rakna)
- Fora: [Sänkt premie 2026](https://www.fora.se/om-fora/aktuellt/alla-nyheter/2026/sankt-premie-for-avtalspension-saf-lo/) · [Så funkar rapporteringen](https://www.fora.se/foretag/rapportera-loner-och-premier/sa-funkar-rapporteringen-till-fora/) · [Avtalat, premier arbetare](https://www.avtalat.se/arbetsgivare/kostnader-och-premier/premier-arbetare/)
- Styrelsearvode: [FAR Online](https://www.faronline.se/dokument/rattserien/ratt-lon/s/rl_styrelsearvode/) · [Azets on HFD practice](https://www.azets.se/blogg/ny-praxis-beskattning-av-styrelsearvode/) · [Styrelsen.se](https://www.styrelsen.se/styrelsearvode-brf/)
- Sjuklön: [Försäkringskassan, vägledning 2026:2](https://www.forsakringskassan.se/download/18.4ea7f1ee19c0e30b2af50/1770197105931/sarskilt-hogriskskydd-inkluderar-ersattning-for-hoga-sjuklonekostnader-till-arbetsgivare-vagledning-2026-2.pdf) · [Juridik.blog summary](https://www.juridik.blog/sjukskrivning-enligt-sjuklonelagen/)
- Engångsskatt: [FAR Online](https://www.faronline.se/dokument/rattserien/ratt-skatt/e/rs_engangsskatt/) · [Björn Lundén](https://bjornlunden.com/se/bjornkoll/blogg/skatteavdrag-pa-engangsbelopp/)
- 3:12 from 2026: [Företagarna](https://www.foretagarna.se/driva-eget-foretag/handbocker-och-guider/handbok-312-reglerna/nya-312-reglerna-fran-2026/) · [BDO](https://www.bdo.se/sv-se/artiklar-insikter/nya-3-12-regler-klubbas-%E2%80%93-sa-paverkas-du-som-famansforetagare) · [Grant Thornton](https://www.grantthornton.se/insikt/skattenyhet/nya-3-12-reglerna-2026-gransbelopp-utdelning/) · [Lindahl](https://www.lindahl.se/aktuellt/insikter/nya-312-regler-fran-2026-sa-paverkas-du-som-famansforetagare/)
- Basbelopp 2026: [SEB](https://seb.se/privat/pension-och-forsakring/pensionsspara/aktuella-basbelopp) · [Wolters Kluwer](https://www.wolterskluwer.com/sv-se/expert-insights/basbelopp) · [FAR Online](https://www.faronline.se/dokument/rattserien/ratt-lon/p/rl_prisbasbelopp/)
- Växa-stöd 2026: [Företagarna](https://www.foretagarna.se/nyheter/riks/2025/oktober/vaxa-stodet-blir-krangligare-fran-arsskiftet/) · [Prop. 2025/26:24](https://www.regeringen.se/contentassets/542ed05775614dc4ba988e3c43e3863f/anpassning-av-vissa-skatte--och-avgiftsnedsattningar-till-eus-regler-om-statsstod-prop-20252624.pdf) · [FAR Online](https://www.faronline.se/dokument/rattserien/ratt-skatt/v/rs_vaxastod/)
- Traktamente and milersättning 2026 (secondary): [Infobric, for byggföretag](https://infobric.com/se/artiklar/traktamente-2026-regler-belopp-och-vad-byggforetag-maste-ha-koll-pa/) · [Talea](https://talea.se/arbetsgivare/guide/traktamente-reseersattning-arbetsgivare/)
