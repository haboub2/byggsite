import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getDb } from "../db";
import { isDemo } from "../../leads";
import { currentOrgId, readOrgId } from "../org/current";
import { getOrgSettings } from "../org/settings-store";
import { addDays, type IsoDate } from "../rules/index";
import { payrollRulesAt } from "../rules/payroll";
import { listPeriodLocks } from "../ledger/store";
import { HR_BUCKET, listEmployees, listEmployments, listTaxVersions, loadClocks, revealBankAccount } from "../hr/store";
import { listAbsences, listSchedules, listShifts, listTimeEntries, listTimeLocks, lockPeriod } from "../hr/time-store";
import { scheduleFromRules } from "../hr/absence";
import { blockHours } from "../hr/time";
import { inForce, versionsOn } from "../hr/schema";
import { addMonths } from "./employment-clocks";
import { DEFAULT_PAY_ITEMS } from "./pay-items.default";
import { indexTaxTable, parseTaxTableCsv, checkGoldenVectors, type TaxTableIndex, type TaxTableRow, type GoldenFile } from "./tax-tables";
import goldenJson from "./tax-tables.golden.json";
import { computeRun, earningYearHistory, payItemsOn, type RunCheck, type RunInput, type RunPerson, type RunResult } from "./run";
import { accrualLines, payslipJournal, reconciliationSums } from "./ledger";
import { salaryFile, salaryFileTotalOre } from "./bank-file";
import { parsePayrollSettings, payrollSettingsSchema, runPeriods, type PayrollConfirmed, type PayrollDecision, type PayrollSettings } from "./settings";
import type { JournalLine, PayItem, PayLineInput, PayslipDocument } from "./payslip";

/**
 * Payroll runs, payslips, bank files and the run's bookkeeping
 * (supabase/migrations/0039_payroll.sql), read and written with the
 * caller's session so RLS decides: owner and admin everything, the
 * accountant reads and computes, an employee their own approved payslips.
 * The app computes (run.ts); every step that stores, numbers, freezes,
 * books or reconciles goes through the database's functions.
 *
 * Demo mode keeps everything in memory with the same rules: four eyes
 * (the demo computes as "the accountant" so the demo owner can approve),
 * series L, frozen payslips, the time period locked at booking, and the
 * reconciliation gate. Tax tables in demo mode are the repository's sample
 * (tables 32–34).
 */

export type PayRunStatus = "draft" | "calculated" | "approved" | "paid" | "booked" | "closed";
export const RUN_STATUS_LABEL: Record<PayRunStatus, string> = {
  draft: "Utkast",
  calculated: "Beräknad",
  approved: "Godkänd",
  paid: "Bankfil skapad",
  booked: "Bokförd",
  closed: "Stängd",
};

export type RunTotals = {
  payslips?: number;
  grossOre?: number;
  taxOre?: number;
  netOre?: number;
  employerContributionOre?: number;
  vacationLiabilityOre?: number;
  pensionPremiumOre?: number;
  accrualsOre?: number;
  /** payroll_reconciliation() as it stood when the run was closed. */
  reconciliation?: Reconciliation;
};

export type PayRun = {
  id: string;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  timeFrom: IsoDate;
  timeTo: IsoDate;
  payDate: IsoDate;
  agiPeriod: string;
  status: PayRunStatus;
  checks: RunCheck[];
  checksAt: string | null;
  ruleSetValidFrom: IsoDate | null;
  taxTableImportId: string | null;
  totals: RunTotals;
  computedBy: string | null;
  computedByName: string | null;
  computedAt: string | null;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  bankFileId: string | null;
  journalEntryId: string | null;
  bookedAt: string | null;
  closedAt: string | null;
  createdAt: string;
};

export type StoredPayslip = {
  id: string;
  runId: string;
  employeeId: string;
  number: number | null;
  document: PayslipDocument;
  grossOre: number;
  taxOre: number;
  netOre: number;
  employerContributionOre: number;
  contributionRate: number;
  vacationLiabilityOre: number;
  pensionPremiumOre: number;
  pdfPath: string | null;
  pdfSha256: string | null;
  approvedAt: string | null;
  createdAt: string;
};

/** A payslip without its document, for lists. */
export type PayslipSummary = Omit<StoredPayslip, "document">;

export type Correction = {
  id: string;
  employeeId: string;
  originalPayslipId: string;
  originalRunId: string;
  agiPeriod: string;
  lines: PayLineInput[];
  reason: string;
  targetRunId: string | null;
  createdAt: string;
};

export type Reconciliation = {
  payslipsOre: number;
  linesOre: number;
  journalOre: number | null;
  bankOre: number | null;
  taxOre: number;
  journalTaxOre: number | null;
  contributionsOre: number;
  journalContributionsOre: number | null;
  ok: boolean;
};

export type TaxTableImportInfo = { id: string; year: number; sha256: string; rowCount: number; tables: number[]; importedAt: string; importedBy: string; demo?: boolean };

/* ---------- rows ---------- */

type RunRow = {
  id: string;
  period_start: string;
  period_end: string;
  time_period_start: string;
  time_period_end: string;
  pay_date: string;
  agi_period: string;
  status: PayRunStatus;
  checks: RunCheck[];
  checks_at: string | null;
  rule_set_valid_from: string | null;
  tax_table_import_id: string | null;
  totals: RunTotals;
  inputs_hash?: string | null;
  computed_by: string | null;
  computed_by_name: string | null;
  computed_at: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  bank_file_id: string | null;
  journal_entry_id: string | null;
  booked_at: string | null;
  closed_at: string | null;
  created_at: string;
};
const runFromRow = (r: RunRow): PayRun => ({
  id: r.id,
  periodStart: r.period_start,
  periodEnd: r.period_end,
  timeFrom: r.time_period_start,
  timeTo: r.time_period_end,
  payDate: r.pay_date,
  agiPeriod: r.agi_period,
  status: r.status,
  checks: r.checks ?? [],
  checksAt: r.checks_at,
  ruleSetValidFrom: r.rule_set_valid_from,
  taxTableImportId: r.tax_table_import_id,
  totals: r.totals ?? {},
  computedBy: r.computed_by,
  computedByName: r.computed_by_name,
  computedAt: r.computed_at,
  approvedBy: r.approved_by,
  approvedByName: r.approved_by_name,
  approvedAt: r.approved_at,
  bankFileId: r.bank_file_id,
  journalEntryId: r.journal_entry_id,
  bookedAt: r.booked_at,
  closedAt: r.closed_at,
  createdAt: r.created_at,
});

type PayslipRow = {
  id: string;
  run_id: string;
  employee_id: string;
  number: number | null;
  document: PayslipDocument;
  gross_ore: number;
  tax_ore: number;
  net_ore: number;
  employer_contribution_ore: number;
  contribution_rate: number | string;
  vacation_liability_ore: number;
  pension_premium_ore: number;
  pdf_path: string | null;
  pdf_sha256: string | null;
  approved_at: string | null;
  created_at: string;
};
const SUMMARY_COLUMNS =
  "id, run_id, employee_id, number, gross_ore, tax_ore, net_ore, employer_contribution_ore, contribution_rate, vacation_liability_ore, pension_premium_ore, pdf_path, pdf_sha256, approved_at, created_at";
const PAYSLIP_COLUMNS = `${SUMMARY_COLUMNS}, document`;
const summaryFromRow = (r: Omit<PayslipRow, "document">): PayslipSummary => ({
  id: r.id,
  runId: r.run_id,
  employeeId: r.employee_id,
  number: r.number,
  grossOre: Number(r.gross_ore),
  taxOre: Number(r.tax_ore),
  netOre: Number(r.net_ore),
  employerContributionOre: Number(r.employer_contribution_ore),
  contributionRate: Number(r.contribution_rate),
  vacationLiabilityOre: Number(r.vacation_liability_ore),
  pensionPremiumOre: Number(r.pension_premium_ore),
  pdfPath: r.pdf_path,
  pdfSha256: r.pdf_sha256,
  approvedAt: r.approved_at,
  createdAt: r.created_at,
});
const payslipFromRow = (r: PayslipRow): StoredPayslip => ({ ...summaryFromRow(r), document: r.document });

type CorrectionRow = {
  id: string;
  employee_id: string;
  original_payslip_id: string;
  original_run_id: string;
  agi_period: string;
  lines: PayLineInput[];
  reason: string;
  target_run_id: string | null;
  created_at: string;
};
const correctionFromRow = (r: CorrectionRow): Correction => ({
  id: r.id,
  employeeId: r.employee_id,
  originalPayslipId: r.original_payslip_id,
  originalRunId: r.original_run_id,
  agiPeriod: r.agi_period,
  lines: r.lines,
  reason: r.reason,
  targetRunId: r.target_run_id,
  createdAt: r.created_at,
});

/** Postgres errors from these functions carry their own Swedish message; keep it. */
function fail(prefix: string, error: { message: string; code?: string }): never {
  const own = ["42501", "22023", "23505", "23514", "0A000", "P0001"].includes(error.code ?? "");
  if (error.code === "42501" && /row-level security/.test(error.message)) throw new Error("Du saknar behörighet för det.");
  throw new Error(own ? error.message : `${prefix}: ${error.message}`);
}

/* ---------- demo ---------- */

type DemoPayroll = {
  settings: unknown;
  confirmed: PayrollConfirmed;
  settingsUpdatedAt: string | null;
  runs: RunRow[];
  payslips: PayslipRow[];
  corrections: CorrectionRow[];
  bankFiles: { id: string; run_id: string; xml: string; total_ore: number; created_at: string }[];
  journals: Record<string, { entry: string; lines: JournalLine[] }>;
  nextL: number;
  nextV: number;
};
const g = globalThis as unknown as { __binaafyPayroll?: DemoPayroll };
const demo = (): DemoPayroll =>
  (g.__binaafyPayroll ??= { settings: {}, confirmed: {}, settingsUpdatedAt: null, runs: [], payslips: [], corrections: [], bankFiles: [], journals: {}, nextL: 1, nextV: 1 });
/** Demo mode is always the owner; the demo computes as the accountant so the four-eyes rule can be walked through. */
export const DEMO_COMPUTER = { id: "00000000-0000-4000-8000-00000000dem1", name: "konsult@demo (redovisningskonsulten)" };
const demoRun = (id: string) => {
  const r = demo().runs.find((x) => x.id === id);
  if (!r) throw new Error("Körningen finns inte.");
  return r;
};
/**
 * Demo mode's payroll_inputs_hash(): what the run is computed from (time in
 * the period, absence from a year back, versions, tax rows, the people,
 * pending corrections, the semesterår), so approval can refuse a changed
 * underlag as the database does.
 */
async function demoInputsHash(run: PayRun): Promise<string> {
  const [entries, absences, versions, tax, people, corrections, { settings }] = await Promise.all([
    listTimeEntries({ from: run.timeFrom, to: run.timeTo }),
    listAbsences({ from: addMonths(run.timeFrom, -12), to: run.timeTo }),
    listEmployments(),
    listTaxVersions(),
    listEmployees(),
    listCorrections(),
    getPayrollSettings(),
  ]);
  const state = {
    time: entries.map((t) => [t.id, t.status === "locked" ? "approved" : t.status, t.hours, t.start, t.end, t.breakMinutes, t.kind, t.correctsId]),
    absences: absences.map((a) => [a.id, a.kind, a.from, a.to, a.extent, !!a.approvedAt]),
    versions: versions.map((v) => [v.id, v.scheduleId]),
    tax: tax.map((t) => t.id),
    people: people.map((e) => [e.id, e.birthDate, e.agreement, e.endedAt]),
    corrections: corrections.filter((c) => c.targetRunId === null || c.targetRunId === run.id).map((c) => c.id),
    vacationYear: settings.vacationYear,
  };
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

const demoFile = (key: string) => path.join(process.cwd(), "uploads", "hr", ...key.split("/"));

/* ---------- settings ---------- */

export async function getPayrollSettings(): Promise<{ settings: PayrollSettings; confirmed: PayrollConfirmed; updatedAt: string | null }> {
  if (isDemo()) return { settings: parsePayrollSettings(demo().settings), confirmed: demo().confirmed, updatedAt: demo().settingsUpdatedAt };
  const supabase = await getDb();
  const { data, error } = await supabase.from("payroll_settings").select("data, confirmed, updated_at").eq("org_id", await currentOrgId()).maybeSingle();
  if (error) fail("Kunde inte hämta lönebesluten", error);
  const row = data as { data: unknown; confirmed: PayrollConfirmed; updated_at: string } | null;
  return { settings: parsePayrollSettings(row?.data), confirmed: row?.confirmed ?? {}, updatedAt: row?.updated_at ?? null };
}

/** Saves one decision (its fields merged into the settings) and marks it confirmed now. */
export async function savePayrollDecision(decision: PayrollDecision, patch: Partial<PayrollSettings>): Promise<void> {
  const current = await getPayrollSettings();
  const merged = payrollSettingsSchema.parse({ ...current.settings, ...patch });
  const confirmed = { ...current.confirmed, [decision]: new Date().toISOString() };
  if (isDemo()) {
    Object.assign(demo(), { settings: merged, confirmed, settingsUpdatedAt: new Date().toISOString() });
    return;
  }
  const supabase = await getDb();
  const org = await currentOrgId();
  const { error } = await supabase.from("payroll_settings").upsert({ org_id: org, data: merged, confirmed }, { onConflict: "org_id" });
  if (error) fail("Kunde inte spara lönebeslutet", error);
}

/* ---------- register and tax tables ---------- */

type PayItemRow = {
  code: string;
  name: string;
  kind: PayItem["kind"];
  version: number;
  valid_from: string;
  taxable: boolean;
  tax_mode: PayItem["flags"]["taxMode"];
  subject_to_employer_contribution: boolean;
  vacation_pay_basis: boolean;
  pension_reportable: boolean;
  agi_box: string | null;
  account: string;
  counter_account: string;
  fora_category: string | null;
};

/** Every version of every pay item, as payItemsOn() takes them. */
export async function listPayItems(): Promise<(PayItem & { validFrom: IsoDate })[]> {
  if (isDemo()) return DEFAULT_PAY_ITEMS.map((i) => ({ ...i, validFrom: "2026-01-01" }));
  const supabase = await getDb();
  let q = supabase.from("pay_items").select("code, name, kind, version, valid_from, taxable, tax_mode, subject_to_employer_contribution, vacation_pay_basis, pension_reportable, agi_box, account, counter_account, fora_category");
  const org = await readOrgId();
  if (org) q = q.eq("org_id", org);
  const { data, error } = await q.order("code").order("version");
  if (error) fail("Kunde inte hämta löneartsregistret", error);
  return (data as PayItemRow[]).map((r) => ({
    code: r.code,
    name: r.name,
    kind: r.kind,
    version: r.version,
    validFrom: r.valid_from,
    flags: {
      taxable: r.taxable,
      taxMode: r.tax_mode,
      subjectToEmployerContribution: r.subject_to_employer_contribution,
      vacationPayBasis: r.vacation_pay_basis,
      pensionReportable: r.pension_reportable,
      agiBox: r.agi_box,
      account: r.account,
      counterAccount: r.counter_account,
      foraCategory: r.fora_category,
    },
  }));
}

let demoTables: { info: TaxTableImportInfo; rows: TaxTableRow[] } | null = null;
async function demoTaxTables() {
  if (!demoTables) {
    const file = parseTaxTableCsv(await fs.readFile(path.join(process.cwd(), "lib/core/payroll/fixtures/skattetabell-manad-2026.sample.csv")));
    const tables = [...new Set(file.rows.map((r) => r.tableNo))].sort((a, b) => a - b);
    // The sample holds three tables: check the golden vectors that fall in them.
    const golden = goldenJson as GoldenFile;
    const results = checkGoldenVectors(indexTaxTable(file.rows), { ...golden, vectors: golden.vectors.filter((v) => tables.includes(v.table)) });
    if (results.some((r) => !r.ok)) throw new Error("Demo: provfilens skattetabeller klarar inte kontrollvektorerna.");
    demoTables = { info: { id: "demo-2026", year: file.year, sha256: file.sha256, rowCount: file.rows.length, tables, importedAt: "2026-10-30T00:00:00Z", importedBy: "demo (provfil)", demo: true }, rows: file.rows };
  }
  return demoTables;
}

export async function listTaxTableImports(): Promise<TaxTableImportInfo[]> {
  if (isDemo()) return [(await demoTaxTables()).info];
  const supabase = await getDb();
  // Only finished imports (completed_at): one that stopped halfway is never used.
  const { data, error } = await supabase
    .from("tax_table_imports")
    .select("id, year, sha256, row_count, tables, imported_at, imported_by")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(20);
  if (error) fail("Kunde inte hämta skattetabellerna", error);
  return (data as { id: string; year: number; sha256: string; row_count: number; tables: number[]; imported_at: string; imported_by: string }[]).map((r) => ({
    id: r.id,
    year: r.year,
    sha256: r.sha256,
    rowCount: r.row_count,
    tables: r.tables,
    importedAt: r.imported_at,
    importedBy: r.imported_by,
  }));
}

/** The year's latest import, with the rows of the tables the people use. */
async function loadTaxTable(year: number, tables: readonly number[]): Promise<{ importId: string; version: string; index: TaxTableIndex } | null> {
  if (isDemo()) {
    const t = await demoTaxTables();
    return t.info.year === year ? { importId: t.info.id, version: t.info.sha256, index: indexTaxTable(t.rows) } : null;
  }
  const imp = (await listTaxTableImports()).find((i) => i.year === year);
  if (!imp) return null;
  const wanted = [...new Set(tables)];
  const rows: TaxTableRow[] = [];
  if (wanted.length) {
    const supabase = await getDb();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("tax_tables")
        .select("table_no, column_no, income_from_kr, income_to_kr, tax_kr, percent")
        .eq("import_id", imp.id)
        .in("table_no", wanted)
        .order("table_no")
        .order("column_no")
        .order("income_from_kr")
        .range(from, from + 999);
      if (error) fail("Kunde inte hämta skattetabellen", error);
      const page = data as { table_no: number; column_no: number; income_from_kr: number; income_to_kr: number | null; tax_kr: number | null; percent: number | string | null }[];
      for (const r of page) {
        rows.push({
          year,
          tableNo: r.table_no,
          column: r.column_no,
          incomeFromOre: r.income_from_kr * 100,
          incomeToOre: r.income_to_kr === null ? null : r.income_to_kr * 100 + 99,
          taxOre: r.tax_kr === null ? null : r.tax_kr * 100,
          percent: r.percent === null ? null : Number(r.percent),
        });
      }
      if (page.length < 1000) break;
    }
  }
  return { importId: imp.id, version: imp.sha256, index: indexTaxTable(rows) };
}

/* ---------- reads ---------- */

export async function listRuns(): Promise<PayRun[]> {
  if (isDemo()) return demo().runs.map(runFromRow).sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  const supabase = await getDb();
  let q = supabase.from("pay_runs").select("*");
  const org = await readOrgId();
  if (org) q = q.eq("org_id", org);
  const { data, error } = await q.order("period_start", { ascending: false }).limit(120);
  if (error) fail("Kunde inte hämta lönekörningarna", error);
  return (data as RunRow[]).map(runFromRow);
}

export async function getRun(id: string): Promise<PayRun | null> {
  if (isDemo()) {
    const r = demo().runs.find((x) => x.id === id);
    return r ? runFromRow(r) : null;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("pay_runs").select("*").eq("id", id).maybeSingle();
  if (error) fail("Kunde inte hämta lönekörningen", error);
  return data ? runFromRow(data as RunRow) : null;
}

export async function listRunPayslips(runId: string): Promise<StoredPayslip[]> {
  if (isDemo()) return demo().payslips.filter((p) => p.run_id === runId).map(payslipFromRow).sort((a, b) => a.document.employeeName.localeCompare(b.document.employeeName, "sv"));
  const supabase = await getDb();
  const { data, error } = await supabase.from("payslips").select(PAYSLIP_COLUMNS).eq("run_id", runId).limit(2000);
  if (error) fail("Kunde inte hämta lönebeskeden", error);
  return (data as PayslipRow[]).map(payslipFromRow).sort((a, b) => a.document.employeeName.localeCompare(b.document.employeeName, "sv"));
}

/** A person's approved payslips, newest first (the Lön tab and /min-tid; RLS limits an employee to their own). */
export async function listEmployeePayslips(employeeId: string): Promise<StoredPayslip[]> {
  if (isDemo()) return demo().payslips.filter((p) => p.employee_id === employeeId && p.approved_at).map(payslipFromRow).sort((a, b) => b.document.payDate.localeCompare(a.document.payDate));
  const supabase = await getDb();
  const { data, error } = await supabase.from("payslips").select(PAYSLIP_COLUMNS).eq("employee_id", employeeId).not("approved_at", "is", null).limit(500);
  if (error) fail("Kunde inte hämta lönebeskeden", error);
  return (data as PayslipRow[]).map(payslipFromRow).sort((a, b) => b.document.payDate.localeCompare(a.document.payDate));
}

export async function getPayslip(id: string): Promise<StoredPayslip | null> {
  if (isDemo()) {
    const p = demo().payslips.find((x) => x.id === id);
    return p ? payslipFromRow(p) : null;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("payslips").select(PAYSLIP_COLUMNS).eq("id", id).maybeSingle();
  if (error) fail("Kunde inte hämta lönebeskedet", error);
  return data ? payslipFromRow(data as PayslipRow) : null;
}

/** Approved payslips with pay dates in [from, to] (history, reports). */
export async function listApprovedPayslips(range: { from: IsoDate; to: IsoDate }): Promise<(StoredPayslip & { run: PayRun })[]> {
  const runs = (await listRuns()).filter((r) => r.approvedAt && r.payDate >= range.from && r.payDate <= range.to);
  if (!runs.length) return [];
  const byId = new Map(runs.map((r) => [r.id, r]));
  let slips: StoredPayslip[];
  if (isDemo()) slips = demo().payslips.filter((p) => byId.has(p.run_id)).map(payslipFromRow);
  else {
    const supabase = await getDb();
    const { data, error } = await supabase.from("payslips").select(PAYSLIP_COLUMNS).in("run_id", [...byId.keys()]).limit(10_000);
    if (error) fail("Kunde inte hämta lönebeskeden", error);
    slips = (data as PayslipRow[]).map(payslipFromRow);
  }
  return slips.map((s) => ({ ...s, run: byId.get(s.runId) as PayRun }));
}

/** Approved payslips with pay dates in [from, to], without their documents (lists and picking the ones to open). */
export async function listApprovedPayslipSummaries(range: { from: IsoDate; to: IsoDate }): Promise<(PayslipSummary & { run: PayRun })[]> {
  const runs = (await listRuns()).filter((r) => r.approvedAt && r.payDate >= range.from && r.payDate <= range.to);
  if (!runs.length) return [];
  const byId = new Map(runs.map((r) => [r.id, r]));
  let rows: PayslipSummary[];
  if (isDemo()) rows = demo().payslips.filter((p) => byId.has(p.run_id)).map(summaryFromRow);
  else {
    const supabase = await getDb();
    const { data, error } = await supabase.from("payslips").select(SUMMARY_COLUMNS).in("run_id", [...byId.keys()]).limit(10_000);
    if (error) fail("Kunde inte hämta lönebeskeden", error);
    rows = (data as Omit<PayslipRow, "document">[]).map(summaryFromRow);
  }
  return rows.map((s) => ({ ...s, run: byId.get(s.runId) as PayRun }));
}

/** Each person's latest approved payslip with a pay date in the range (a run's diff, the semesterlöneskuld): summaries first, then only those documents. */
export async function latestPayslipPerPerson(range: { from: IsoDate; to: IsoDate }, excludeRunId?: string): Promise<Map<string, StoredPayslip>> {
  const latest = new Map<string, PayslipSummary & { run: PayRun }>();
  for (const s of (await listApprovedPayslipSummaries(range)).filter((x) => x.runId !== excludeRunId).sort((a, b) => a.run.payDate.localeCompare(b.run.payDate))) latest.set(s.employeeId, s);
  const docs = await getPayslips([...latest.values()].map((s) => s.id));
  return new Map(docs.map((d) => [d.employeeId, d]));
}

export async function getPayslips(ids: readonly string[]): Promise<StoredPayslip[]> {
  if (!ids.length) return [];
  if (isDemo()) return demo().payslips.filter((p) => ids.includes(p.id)).map(payslipFromRow);
  const supabase = await getDb();
  const { data, error } = await supabase.from("payslips").select(PAYSLIP_COLUMNS).in("id", [...ids]);
  if (error) fail("Kunde inte hämta lönebeskeden", error);
  return (data as PayslipRow[]).map(payslipFromRow);
}

export async function listCorrections(q: { employeeId?: string } = {}): Promise<Correction[]> {
  if (isDemo()) return demo().corrections.filter((c) => !q.employeeId || c.employee_id === q.employeeId).map(correctionFromRow);
  const supabase = await getDb();
  let s = supabase.from("payroll_corrections").select("*");
  if (q.employeeId) s = s.eq("employee_id", q.employeeId);
  const org = await readOrgId();
  if (org) s = s.eq("org_id", org);
  const { data, error } = await s.order("created_at").limit(1000);
  if (error) fail("Kunde inte hämta rättelserna", error);
  return (data as CorrectionRow[]).map(correctionFromRow);
}

/** The run's journal entry: its number and lines. */
export async function runJournalEntry(run: PayRun): Promise<{ entry: string; lines: JournalLine[] } | null> {
  if (isDemo()) return demo().journals[run.id] ?? null;
  if (!run.journalEntryId) return null;
  const supabase = await getDb();
  const { data, error } = await supabase.from("journal_entries").select("fiscal_year, number, journal_lines(account, debit_ore, credit_ore, text)").eq("id", run.journalEntryId).maybeSingle();
  if (error) fail("Kunde inte hämta verifikationen", error);
  if (!data) return null;
  const d = data as { fiscal_year: number; number: number; journal_lines: { account: string; debit_ore: number; credit_ore: number; text: string | null }[] };
  return {
    entry: `V ${d.fiscal_year}-${d.number}`,
    lines: d.journal_lines.map((l) => ({ account: l.account, debitOre: Number(l.debit_ore), creditOre: Number(l.credit_ore), text: l.text ?? "" })).sort((a, b) => a.account.localeCompare(b.account)),
  };
}

export async function getBankFileXml(run: PayRun): Promise<{ xml: string; createdAt: string } | null> {
  if (isDemo()) {
    const f = demo().bankFiles.find((b) => b.run_id === run.id);
    return f ? { xml: f.xml, createdAt: f.created_at } : null;
  }
  if (!run.bankFileId) return null;
  const supabase = await getDb();
  const { data, error } = await supabase.from("bank_files").select("xml, created_at").eq("id", run.bankFileId).maybeSingle();
  if (error) fail("Kunde inte hämta bankfilen", error);
  return data ? { xml: (data as { xml: string }).xml, createdAt: (data as { created_at: string }).created_at } : null;
}

/** payroll_reconciliation(): net pay from payslips, lines, journal and bank file, plus tax and contributions against the journal. */
export async function reconcileRun(run: PayRun): Promise<Reconciliation> {
  if (isDemo()) {
    const slips = await listRunPayslips(run.id);
    const docs = slips.map((s) => s.document);
    const { settings } = await getPayrollSettings();
    const j = demo().journals[run.id]?.lines ?? null;
    const bank = demo().bankFiles.find((b) => b.run_id === run.id);
    const sums = reconciliationSums({ docs, journal: j, bankTotalOre: bank ? salaryFileTotalOre(bank.xml) : null, netAccount: settings.accounts.net });
    const net = (account: string) => (j ? j.filter((l) => l.account === account).reduce((s, l) => s + l.creditOre - l.debitOre, 0) : null);
    const taxOre = docs.reduce((s, d) => s + d.totals.taxOre, 0);
    const contributionsOre = docs.reduce((s, d) => s + d.totals.employerContributionOre, 0);
    const journalTaxOre = net(settings.accounts.tax);
    const journalContributionsOre = net(settings.accounts.contributionLiability);
    return { ...sums, taxOre, journalTaxOre, contributionsOre, journalContributionsOre, ok: sums.ok && journalTaxOre === taxOre && journalContributionsOre === contributionsOre };
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("payroll_reconciliation", { p_run: run.id });
  if (error) fail("Kunde inte stämma av körningen", error);
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, number | boolean | null>;
  const n = (k: string) => (r[k] === null || r[k] === undefined ? null : Number(r[k]));
  return {
    payslipsOre: n("payslips_ore") ?? 0,
    linesOre: n("lines_ore") ?? 0,
    journalOre: n("journal_ore"),
    bankOre: n("bank_ore"),
    taxOre: n("tax_ore") ?? 0,
    journalTaxOre: n("journal_tax_ore"),
    contributionsOre: n("contributions_ore") ?? 0,
    journalContributionsOre: n("journal_contributions_ore"),
    ok: r.ok === true,
  };
}

/* ---------- the run's input ---------- */

/** Everything computeRun() needs for a run, read with the caller's rights. */
export async function loadRunInput(run: PayRun, today: IsoDate): Promise<RunInput> {
  const histFrom = addMonths(run.timeFrom, -3);
  const absFrom = addMonths(run.timeFrom, -12);
  const year = Number(run.payDate.slice(0, 4));
  const [{ settings, confirmed }, employees, versions, tax, entries, absences, schedules, shifts, clocks, items, periodLocks, timeLocks, earlier, corrections] = await Promise.all([
    getPayrollSettings(),
    listEmployees(),
    listEmployments(),
    listTaxVersions(),
    listTimeEntries({ from: histFrom, to: run.timeTo }),
    listAbsences({ from: absFrom, to: run.timeTo }),
    listSchedules(),
    listShifts({ from: run.timeFrom, to: run.timeTo }),
    loadClocks(today),
    listPayItems(),
    listPeriodLocks(),
    listTimeLocks(),
    listApprovedPayslips({ from: `${year - 2}-01-01`, to: run.payDate }),
    listCorrections(),
  ]);
  const rules = payrollRulesAt(run.payDate);
  const vacationModel = settings.vacationYear === "calendar" ? "01-01" : "04-01";
  const people: RunPerson[] = [];
  for (const e of employees) {
    if (e.endedAt && e.endedAt < run.timeFrom && e.endedAt < run.periodStart) continue;
    const mine = versions.filter((v) => v.employeeId === e.id);
    if (!mine.length) continue;
    // The schedule of the version that applies at the end of the time period (or the salary month).
    const at = versionsOn(mine, run.timeTo).filter((v) => inForce(v, run.timeTo))[0] ?? versionsOn(mine, run.periodEnd)[0] ?? null;
    const sched = at?.scheduleId ? schedules.find((s) => s.id === at.scheduleId) : null;
    const shiftHours: Record<IsoDate, number> = {};
    for (const s of shifts) if (s.employeeId === e.id && (s.offerStatus === null || s.offerStatus === "accepted")) shiftHours[s.date] = (shiftHours[s.date] ?? 0) + blockHours(s.start, s.end, s.breakMinutes);
    const own = earlier.filter((p) => p.employeeId === e.id && p.runId !== run.id).sort((a, b) => a.run.payDate.localeCompare(b.run.payDate));
    const thisYear = own.filter((p) => p.run.payDate.startsWith(String(year)));
    // The intjänandeår that pays for this year's semester (the year before the current semesterår).
    const yearStart = `${run.payDate.slice(0, 4)}-${vacationModel}`;
    const currentYearFrom = run.payDate >= yearStart ? yearStart : `${year - 1}-${vacationModel}`;
    const paidByFrom = `${Number(currentYearFrom.slice(0, 4)) - 1}-${vacationModel}`;
    const paidBy = earningYearHistory(
      own.map((p) => p.document),
      paidByFrom,
      currentYearFrom
    );
    people.push({
      employee: e,
      versions: mine,
      tax: tax.filter((t) => t.employeeId === e.id),
      timeEntries: entries.filter((t) => t.employeeId === e.id),
      absences: absences.filter((a) => a.employeeId === e.id),
      schedule: sched ? scheduleFromRules(sched.rules) : null,
      shiftHours,
      history: {
        yearToDateCashGrossOre: thisYear.reduce((s, p) => s + p.document.totals.cashGrossOre, 0),
        yearToDateTaxOre: thisYear.reduce((s, p) => s + p.document.totals.taxOre, 0),
        vacationLiabilityOre: own.length ? own[own.length - 1].vacationLiabilityOre : 0,
        vacationBasisPaidByYearOre: paidBy.vacationBasisOre,
        variablePayPaidByYearOre: paidBy.variablePayOre,
      },
      corrections: corrections.filter((c) => c.employeeId === e.id && (c.targetRunId === null || c.targetRunId === run.id)).map((c) => ({ id: c.id, lines: c.lines, reason: c.reason })),
      clock: clocks.get(e.id) ?? null,
    });
  }
  const tables = tax.filter((t) => t.kind === "table" && t.tableNo !== null).map((t) => t.tableNo as number);
  return {
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    timeFrom: run.timeFrom,
    timeTo: run.timeTo,
    payDate: run.payDate,
    rules,
    payItems: payItemsOn(items, run.payDate),
    taxTable: await loadTaxTable(year, tables),
    settings,
    confirmed,
    people,
    ledgerLocked: periodLocks.some((l) => run.payDate >= l.periodStart && run.payDate <= l.periodEnd),
    timeLocked: timeLocks.some((l) => l.from <= run.timeFrom && l.to >= run.timeTo),
    today,
  };
}

/* ---------- the steps ---------- */

export async function createRun(month: string, payDate: IsoDate): Promise<string> {
  if (isDemo()) {
    const { settings } = await getPayrollSettings();
    const p = runPeriods(month, settings);
    if (demo().runs.some((r) => r.period_start === p.periodStart)) throw new Error(`Det finns redan en lönekörning för ${month}.`);
    if (payDate < p.timeFrom || payDate > addDays(p.periodEnd, 62)) throw new Error(`Lönedagen ${payDate} passar inte perioden ${month}.`);
    const id = crypto.randomUUID();
    demo().runs.push({
      id,
      period_start: p.periodStart,
      period_end: p.periodEnd,
      time_period_start: p.timeFrom,
      time_period_end: p.timeTo,
      pay_date: payDate,
      agi_period: payDate.slice(0, 7),
      status: "draft",
      checks: [],
      checks_at: null,
      rule_set_valid_from: null,
      tax_table_import_id: null,
      totals: {},
      computed_by: null,
      computed_by_name: null,
      computed_at: null,
      approved_by: null,
      approved_by_name: null,
      approved_at: null,
      bank_file_id: null,
      journal_entry_id: null,
      booked_at: null,
      closed_at: null,
      created_at: new Date().toISOString(),
    });
    return id;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("payroll_run_create", { p_org: await currentOrgId(), p_period: `${month}-01`, p_pay_date: payDate });
  if (error) fail("Kunde inte skapa lönekörningen", error);
  return data as string;
}

/**
 * The checklist and, with `store`, the computation: computeRun() over the
 * run's input; the checklist is always saved on the run (rule 4); the
 * payslips only when nothing blocks.
 */
export async function calculateRun(runId: string, today: IsoDate, opts: { store: boolean }): Promise<RunResult> {
  const run = await getRun(runId);
  if (!run) throw new Error("Körningen finns inte.");
  if (run.status !== "draft" && run.status !== "calculated") throw new Error("Körningen är redan godkänd; rätta i nästa körning.");
  const result = computeRun(await loadRunInput(run, today));
  const blocked = result.checks.some((c) => c.level === "block");
  const payload = {
    checks: result.checks,
    ruleSetValidFrom: result.ruleSetValidFrom,
    taxTableImportId: result.taxTableImportId,
    payslips: result.payslips.map((p) => ({ employeeId: p.employeeId, document: p.document, vacationLiabilityOre: p.vacationLiabilityOre, pensionPremiumOre: p.pensionPremiumOre, correctionIds: p.correctionIds })),
  };
  if (isDemo()) {
    const r = demoRun(runId);
    r.checks = result.checks;
    r.checks_at = new Date().toISOString();
    if (opts.store && !blocked) {
      demo().payslips = demo().payslips.filter((p) => p.run_id !== runId);
      for (const c of demo().corrections) if (c.target_run_id === runId) c.target_run_id = null;
      for (const p of result.payslips) {
        demo().payslips.push({
          id: crypto.randomUUID(),
          run_id: runId,
          employee_id: p.employeeId,
          number: null,
          document: p.document,
          gross_ore: p.document.totals.cashGrossOre,
          tax_ore: p.document.totals.taxOre,
          net_ore: p.document.totals.netOre,
          employer_contribution_ore: p.document.totals.employerContributionOre,
          contribution_rate: p.document.contributions.ratePercent,
          vacation_liability_ore: p.vacationLiabilityOre,
          pension_premium_ore: p.pensionPremiumOre,
          pdf_path: null,
          pdf_sha256: null,
          approved_at: null,
          created_at: new Date().toISOString(),
        });
        for (const c of demo().corrections) if (p.correctionIds.includes(c.id)) c.target_run_id = runId;
      }
      const sum = (f: (p: (typeof result.payslips)[number]) => number) => result.payslips.reduce((s, p) => s + f(p), 0);
      Object.assign(r, {
        status: "calculated",
        rule_set_valid_from: result.ruleSetValidFrom,
        tax_table_import_id: result.taxTableImportId,
        computed_by: DEMO_COMPUTER.id,
        computed_by_name: DEMO_COMPUTER.name,
        computed_at: new Date().toISOString(),
        totals: {
          payslips: result.payslips.length,
          grossOre: sum((p) => p.document.totals.cashGrossOre),
          taxOre: sum((p) => p.document.totals.taxOre),
          netOre: sum((p) => p.document.totals.netOre),
          employerContributionOre: sum((p) => p.document.totals.employerContributionOre),
          vacationLiabilityOre: sum((p) => p.vacationLiabilityOre),
          pensionPremiumOre: sum((p) => p.pensionPremiumOre),
        },
      });
      r.inputs_hash = await demoInputsHash(runFromRow(r));
    }
    return result;
  }
  const supabase = await getDb();
  if (!opts.store || blocked) {
    const { error } = await supabase.rpc("payroll_run_store_checks", { p_run: runId, p_checks: result.checks });
    if (error) fail("Kunde inte spara kontrollistan", error);
    return result;
  }
  const { error } = await supabase.rpc("payroll_run_store_result", { p_run: runId, p_result: payload });
  if (error) fail("Kunde inte spara lönen", error);
  return result;
}

export async function discardRun(runId: string): Promise<void> {
  if (isDemo()) {
    const r = demoRun(runId);
    if (r.status !== "draft" && r.status !== "calculated") throw new Error("En godkänd körning tas inte bort; rätta i nästa körning.");
    demo().runs = demo().runs.filter((x) => x.id !== runId);
    demo().payslips = demo().payslips.filter((p) => p.run_id !== runId);
    for (const c of demo().corrections) if (c.target_run_id === runId) c.target_run_id = null;
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("payroll_run_discard", { p_run: runId });
  if (error) fail("Kunde inte ta bort körningen", error);
}

/**
 * Four eyes: the database refuses the person who computed. Then each
 * payslip's PDF is rendered from the frozen document and stored once in
 * bucket hr; a PDF that fails is made again from the run page.
 */
export async function approveRun(runId: string, actorUserId: string | null, render: (slip: StoredPayslip, run: PayRun) => Promise<Buffer>): Promise<{ approved: number; pdfErrors: string[] }> {
  if (isDemo()) {
    const r = demoRun(runId);
    if (r.status !== "calculated") throw new Error(`Bara en beräknad körning kan godkännas (den är ${RUN_STATUS_LABEL[r.status].toLowerCase()}).`);
    if (r.computed_by === (actorUserId ?? "demo")) throw new Error("Den som räknade lönen kan inte godkänna den; en annan ägare eller administratör godkänner.");
    const { settings } = await getPayrollSettings();
    if (settings.approvers.length && !settings.approvers.includes(actorUserId ?? "")) throw new Error("Du är inte en av godkännarna i lönebesluten.");
    const open = (await listTimeEntries({ from: r.time_period_start, to: r.time_period_end })).filter((t) => t.status === "draft" || t.status === "submitted");
    if (open.length) throw new Error(`Tid i perioden är inte godkänd (${open.length} rader). Räkna om körningen.`);
    const slips = demo().payslips.filter((p) => p.run_id === runId).sort((a, b) => a.document.employeeName.localeCompare(b.document.employeeName, "sv"));
    if (slips.some((p) => p.net_ore < 0)) throw new Error("Ett lönebesked har negativ nettolön; lägg avdraget som en fordran i stället.");
    if (r.inputs_hash !== (await demoInputsHash(runFromRow(r)))) throw new Error("Underlaget har ändrats efter beräkningen; räkna om.");
    if (!(await listTimeLocks()).some((l) => l.from <= r.time_period_start && l.to >= r.time_period_end)) await lockPeriod(r.time_period_start, r.time_period_end, `Lönekörning ${r.period_start.slice(0, 7)}`);
    const now = new Date().toISOString();
    for (const p of slips) Object.assign(p, { number: demo().nextL++, approved_at: now });
    Object.assign(r, { status: "approved", approved_by: actorUserId ?? "demo", approved_by_name: "demo@localhost", approved_at: now });
  } else {
    const supabase = await getDb();
    const { error } = await supabase.rpc("payroll_run_approve", { p_run: runId });
    if (error) fail("Kunde inte godkänna lönen", error);
  }
  const run = (await getRun(runId)) as PayRun;
  const slips = await listRunPayslips(runId);
  const pdfErrors: string[] = [];
  for (const s of slips) {
    try {
      await storePayslipPdf(s, await render(s, run));
    } catch (err) {
      pdfErrors.push(`${s.document.employeeName}: ${err instanceof Error ? err.message : "PDF:en kunde inte sparas"}`);
    }
  }
  return { approved: slips.length, pdfErrors };
}

const payslipKey = async (s: StoredPayslip) => `${isDemo() ? "demo" : await currentOrgId()}/${s.employeeId}/payslip-${s.id}.pdf`;

/** Freezes the PDF once: bucket hr, {org}/{person}/payslip-{id}.pdf, with its SHA-256 on the row. */
export async function storePayslipPdf(s: StoredPayslip, pdf: Buffer): Promise<void> {
  if (!s.approvedAt) throw new Error("PDF:en görs när lönebeskedet är godkänt.");
  if (s.pdfPath) return;
  const sha256 = createHash("sha256").update(pdf).digest("hex");
  const key = await payslipKey(s);
  if (isDemo()) {
    const target = demoFile(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, pdf);
    const row = demo().payslips.find((p) => p.id === s.id);
    if (row) Object.assign(row, { pdf_path: key, pdf_sha256: sha256 });
    return;
  }
  const supabase = await getDb();
  const up = await supabase.storage.from(HR_BUCKET).upload(key, pdf, { contentType: "application/pdf", cacheControl: "60", upsert: false });
  if (up.error && !/exists|Duplicate/i.test(up.error.message)) throw new Error(up.error.message);
  const { error } = await supabase.rpc("payslip_attach_pdf", { p_payslip: s.id, p_path: key, p_sha256: sha256, p_size: pdf.length });
  if (error) fail("Kunde inte spara lönebeskedets PDF", error);
}

/** The frozen PDF, checked against its hash. */
export async function readPayslipPdf(s: StoredPayslip): Promise<Buffer> {
  if (!s.pdfPath || !s.pdfSha256) throw new Error("Lönebeskedet har ingen PDF ännu.");
  let bytes: Buffer;
  if (isDemo()) bytes = await fs.readFile(demoFile(s.pdfPath));
  else {
    const supabase = await getDb();
    const { data, error } = await supabase.storage.from(HR_BUCKET).download(s.pdfPath);
    if (error || !data) throw new Error(`Kunde inte hämta PDF:en: ${error?.message ?? "saknas"}`);
    bytes = Buffer.from(await data.arrayBuffer());
  }
  if (createHash("sha256").update(bytes).digest("hex") !== s.pdfSha256) throw new Error("PDF:en stämmer inte med den som frystes. Den visas inte.");
  return bytes;
}

/**
 * The salary file: each account decrypted for owner/admin (logged per
 * person), one transfer per positive net pay, stored frozen; the database
 * checks the file's sums against the payslips.
 */
export async function createBankFile(runId: string, createdAt: string): Promise<void> {
  const run = await getRun(runId);
  if (!run) throw new Error("Körningen finns inte.");
  if (run.status !== "approved") throw new Error("Bankfilen görs efter godkännandet, en gång.");
  const [{ settings }, slips, org] = await Promise.all([getPayrollSettings(), listRunPayslips(runId), isDemo() ? Promise.resolve(null) : currentOrgId()]);
  const company = (await getOrgSettings(org ?? undefined)).company;
  const employees = new Map((await listEmployees()).map((e) => [e.id, e]));
  const payments = [];
  for (const s of slips.filter((x) => x.netOre > 0)) {
    const e = employees.get(s.employeeId);
    const account = await revealBankAccount(s.employeeId, `lönefil ${run.periodStart.slice(0, 7)}`);
    payments.push({ reference: `L${s.number}`, name: s.document.employeeName, clearing: e?.bankClearing ?? "", account: account ?? "", amountOre: s.netOre });
  }
  const messageId = `LON-${run.periodStart.slice(0, 7)}-${run.id.slice(0, 8)}`;
  const file = salaryFile({
    messageId,
    createdAt,
    executionDate: run.payDate,
    period: run.periodStart.slice(0, 7),
    debtor: { name: company.legalName || "Arbetsgivaren", orgNr: company.orgNr, iban: settings.bank.iban, bic: settings.bank.bic, customerId: settings.bank.customerId || undefined },
    payments,
  });
  if (isDemo()) {
    const r = demoRun(runId);
    const net = slips.filter((x) => x.netOre > 0).reduce((s, x) => s + x.netOre, 0);
    if (salaryFileTotalOre(file.xml) !== net) throw new Error("Bankfilen stämmer inte med lönebeskeden.");
    const id = crypto.randomUUID();
    demo().bankFiles.push({ id, run_id: runId, xml: file.xml, total_ore: file.totalOre, created_at: new Date().toISOString() });
    Object.assign(r, { status: "paid", bank_file_id: id });
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("payroll_bank_file_store", { p_run: runId, p_xml: file.xml, p_message_id: messageId, p_execution_date: run.payDate });
  if (error) fail("Kunde inte spara bankfilen", error);
}

/** The journal entry in series V on pay day (the payslips' part by the database, the accruals from ledger.ts); locks the time period. */
export async function bookRun(runId: string): Promise<void> {
  const run = await getRun(runId);
  if (!run) throw new Error("Körningen finns inte.");
  const [{ settings }, slips] = await Promise.all([getPayrollSettings(), listRunPayslips(runId)]);
  const ledgerSlips = slips.map((s) => ({
    document: s.document,
    group: s.document.context?.group ?? ("salaried" as const),
    vacationLiabilityChangeOre: s.document.context?.vacation.liabilityChangeOre ?? 0,
    pensionPremiumOre: s.pensionPremiumOre,
  }));
  const accruals = accrualLines(ledgerSlips, settings.accounts);
  if (isDemo()) {
    const r = demoRun(runId);
    if (r.status !== "paid") throw new Error(`Körningen bokförs efter bankfilen (den är ${RUN_STATUS_LABEL[r.status].toLowerCase()}).`);
    if ((await listPeriodLocks()).some((l) => r.pay_date >= l.periodStart && r.pay_date <= l.periodEnd)) throw new Error(`Perioden för ${r.pay_date} är låst (exporterad till bokföringen).`);
    const lines = [...payslipJournal(slips.map((s) => s.document), settings.accounts), ...accruals];
    demo().journals[runId] = { entry: `V ${r.pay_date.slice(0, 4)}-${demo().nextV++} (demo)`, lines };
    Object.assign(r, { status: "booked", journal_entry_id: runId, booked_at: new Date().toISOString(), totals: { ...r.totals, accrualsOre: accruals.reduce((s, l) => s + l.debitOre, 0) } });
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("payroll_run_book", { p_run: runId, p_accruals: accruals });
  if (error) fail("Kunde inte bokföra lönen", error);
}

export async function closeRun(runId: string): Promise<void> {
  if (isDemo()) {
    const r = demoRun(runId);
    if (r.status !== "booked") throw new Error("Körningen stängs efter bokföringen.");
    const rec = await reconcileRun(runFromRow(r));
    if (!rec.ok) throw new Error(`Avstämningen går inte ihop: lönebesked ${rec.payslipsOre}, rader ${rec.linesOre}, verifikation ${rec.journalOre}, bankfil ${rec.bankOre} (öre).`);
    Object.assign(r, { status: "closed", closed_at: new Date().toISOString(), totals: { ...r.totals, reconciliation: rec } });
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("payroll_run_close", { p_run: runId });
  if (error) fail("Kunde inte stänga körningen", error);
}

/** Rätta: retro lines for the next run, pointing at the original (which never changes). */
export async function addCorrection(payslipId: string, lines: PayLineInput[], reason: string): Promise<string> {
  if (isDemo()) {
    const p = demo().payslips.find((x) => x.id === payslipId);
    if (!p) throw new Error("Lönebeskedet finns inte.");
    const r = demoRun(p.run_id);
    if (r.status !== "closed") throw new Error("Rätta efter att körningen är stängd; innan dess räknas den om.");
    const id = crypto.randomUUID();
    demo().corrections.push({ id, employee_id: p.employee_id, original_payslip_id: p.id, original_run_id: p.run_id, agi_period: r.agi_period, lines, reason, target_run_id: null, created_at: new Date().toISOString() });
    return id;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("payroll_correction_add", { p_payslip: payslipId, p_lines: lines, p_reason: reason });
  if (error) fail("Kunde inte spara rättelsen", error);
  return data as string;
}
