import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getDb } from "../db";
import { isDemo } from "../../leads";
import { currentOrgId } from "../org/current";
import { getOrgSettings } from "../org/settings-store";
import { addDays, type IsoDate } from "../rules/index";
import { HR_BUCKET, listEmployees, listEmployments, revealPnr } from "../hr/store";
import { closeLeaveYearDemo, listAbsences, listSchedules, listTimeEntries } from "../hr/time-store";
import { scheduleFromRules } from "../hr/absence";
import { stockholmDateTime } from "../hr/time";
import { maskPnr } from "../hr/schema";
import { getPayrollSettings, listEmployeePayslips, listRunPayslips, listRuns, type StoredPayslip } from "./run-store";
import { agiBuild, agiRecords, agiXml, checkAgiXml, diffAgi, isAgiPeriod, type AgiBuild, type AgiDiffRow, type AgiRecord, type AgiRepayment } from "./agi";
import { foraBasis, foraFile, parseForaFile, type ForaLine } from "./fora";
import { collectumBasis, collectumFile, premiumCheck, type CollectumLine, type PremiumCheck } from "./collectum";
import { vaxaStodBasis, type VaxaStodBasis } from "./vaxa-stod";
import { semesterTransition, yearSummary, type SemesterTransitionRow, type YearSummaryRow } from "./year-end";
import { certificateContent, type CertificateContent, type LeavingReason } from "./certificate";
import { vacationModelFor } from "./settings";
import { AGI_FORMAT } from "../rules/agi-format";

/**
 * Arbetsgivardeklarationen, Fora, växa-stöd, årsskiftet and the
 * arbetsgivarintyg (supabase/migrations/0040_authorities.sql), read and
 * written with the caller's session so RLS decides: payroll readers read
 * and build, owner and admin store, mark filed and paid, an employee reads
 * their own intyg. The app writes the files (agi.ts, fora.ts) from what the
 * database sums (agi_build, pension_basis); the database refuses a file
 * whose sums are not its own. Nothing is ever sent: the owner uploads.
 *
 * Demo mode keeps everything in memory with the same rules, built from the
 * demo payroll's closed runs with the same pure functions.
 */

export type AgiStatus = "draft" | "filed" | "corrected";
export const AGI_STATUS_LABEL: Record<AgiStatus, string> = { draft: "Skapad, inte lämnad", filed: "Lämnad", corrected: "Ersatt" };

export type AgiDeclaration = {
  id: string;
  period: string;
  version: number;
  status: AgiStatus;
  schemaVersion: string;
  sha256: string;
  taxOre: number;
  contributionsOre: number;
  totals: AgiBuild["totals"];
  records: AgiRecord[];
  runIds: string[];
  filedAt: string | null;
  filedByName: string | null;
  paidAt: string | null;
  createdAt: string;
};

/** A version without its records and totals, for lists, Idag and the status checks. */
export type AgiDeclarationSummary = Omit<AgiDeclaration, "records" | "totals">;

export type Repayment = AgiRepayment & { repaidOn: IsoDate; createdAt: string };

export type PensionReport = { id: string; period: string; scheme: "fora" | "collectum"; version: number; status: AgiStatus; sha256: string; lines: ForaLine[]; totalOre: number; filedAt: string | null; createdAt: string };

export type EmployerCertificate = { id: string; employeeId: string; from: IsoDate; to: IsoDate; reason: LeavingReason; content: CertificateContent; storagePath: string; sha256: string; sizeBytes: number; createdAt: string };

export type VaxaClaim = { id: string; period: string; employeeId: string; monthNo: number; baseOre: number; cappedBaseOre: number; refundOre: number; appliedAt: string };

export type YearClosing = { id: string; year: number; vacationYearStart: IsoDate; semester: SemesterTransitionRow[]; summary: YearSummaryRow[]; closedAt: string };

/* ---------- rows ---------- */

type DeclarationRow = {
  id: string;
  period: string;
  version: number;
  status: AgiStatus;
  schema_version: string;
  sha256: string;
  tax_ore: number;
  contributions_ore: number;
  totals: AgiBuild["totals"];
  records: AgiRecord[];
  run_ids: string[];
  filed_at: string | null;
  filed_by_name: string | null;
  paid_at: string | null;
  created_at: string;
};
const SUMMARY_COLUMNS = "id, period, version, status, schema_version, sha256, tax_ore, contributions_ore, run_ids, filed_at, filed_by_name, paid_at, created_at";
const DECLARATION_COLUMNS = `${SUMMARY_COLUMNS}, totals, records`;
const summaryFromRow = (r: Omit<DeclarationRow, "records" | "totals">): AgiDeclarationSummary => ({
  id: r.id,
  period: r.period,
  version: r.version,
  status: r.status,
  schemaVersion: r.schema_version,
  sha256: r.sha256,
  taxOre: Number(r.tax_ore),
  contributionsOre: Number(r.contributions_ore),
  runIds: r.run_ids ?? [],
  filedAt: r.filed_at,
  filedByName: r.filed_by_name,
  paidAt: r.paid_at,
  createdAt: r.created_at,
});
const declarationFromRow = (r: DeclarationRow): AgiDeclaration => ({ ...summaryFromRow(r), totals: r.totals, records: r.records });

type PensionRow = { id: string; period: string; scheme: "fora" | "collectum"; version: number; status: AgiStatus; sha256: string; lines: ForaLine[]; total_ore: number; filed_at: string | null; created_at: string };
const pensionFromRow = (r: PensionRow): PensionReport => ({ id: r.id, period: r.period, scheme: r.scheme, version: r.version, status: r.status, sha256: r.sha256, lines: r.lines, totalOre: Number(r.total_ore), filedAt: r.filed_at, createdAt: r.created_at });

type CertificateRow = { id: string; employee_id: string; from_date: string; to_date: string; reason: LeavingReason; content: CertificateContent; storage_path: string; sha256: string; size_bytes: number; created_at: string };
const certificateFromRow = (r: CertificateRow): EmployerCertificate => ({ id: r.id, employeeId: r.employee_id, from: r.from_date, to: r.to_date, reason: r.reason, content: r.content, storagePath: r.storage_path, sha256: r.sha256, sizeBytes: r.size_bytes, createdAt: r.created_at });

function fail(prefix: string, error: { message: string; code?: string }): never {
  const own = ["42501", "22023", "23505", "23514", "0A000", "P0001"].includes(error.code ?? "");
  if (error.code === "42501" && /row-level security/.test(error.message)) throw new Error("Du saknar behörighet för det.");
  throw new Error(own ? error.message : `${prefix}: ${error.message}`);
}

/* ---------- demo ---------- */

type DemoAuthorities = {
  declarations: (DeclarationRow & { xml: string; build_hash: string })[];
  repayments: Repayment[];
  pension: (PensionRow & { file: string })[];
  certificates: CertificateRow[];
  vaxa: VaxaClaim[];
  years: YearClosing[];
};
const g = globalThis as unknown as { __binaafyAuthorities?: DemoAuthorities };
const demo = (): DemoAuthorities => (g.__binaafyAuthorities ??= { declarations: [], repayments: [], pension: [], certificates: [], vaxa: [], years: [] });
const demoFile = (key: string) => path.join(process.cwd(), "uploads", "hr", ...key.split("/"));
const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
/** What agi_build_hash() compares: each person's boxes and ticks, and 487. */
const buildHash = (b: AgiBuild) => sha256(JSON.stringify([b.people.map((p) => [p.employeeId, p.boxes, p.ticks]), b.totals.contributionsOre]));

/** Approved payslips of the closed runs with pay day in the month (the AGI's and Fora's month). */
async function closedSlipsPaidIn(period: string): Promise<StoredPayslip[]> {
  const runs = (await listRuns()).filter((r) => r.status === "closed" && r.payDate.slice(0, 7) === period);
  const slips = (await Promise.all(runs.map((r) => listRunPayslips(r.id)))).flat();
  return slips.filter((s) => s.approvedAt);
}

/* ---------- arbetsgivardeklarationen ---------- */

export async function listRepayments(period?: string): Promise<Repayment[]> {
  if (isDemo()) return demo().repayments.filter((r) => !period || r.period === period);
  const supabase = await getDb();
  let q = supabase.from("agi_repayments").select("id, employee_id, payslip_id, period, amount_ore, reason, repaid_on, created_at");
  if (period) q = q.eq("period", period);
  const { data, error } = await q.order("created_at");
  if (error) fail("Kunde inte hämta återbetalningarna", error);
  type Row = { id: string; employee_id: string; payslip_id: string; period: string; amount_ore: number; reason: string; repaid_on: string; created_at: string };
  return (data as Row[]).map((r) => ({ id: r.id, employeeId: r.employee_id, payslipId: r.payslip_id, period: r.period, amountOre: Number(r.amount_ore), reason: r.reason, repaidOn: r.repaid_on, createdAt: r.created_at }));
}

/** The month's AGI as it stands now, from the closed runs and the repayments (agi_build). */
export async function buildAgi(period: string): Promise<AgiBuild> {
  if (!isAgiPeriod(period)) throw new Error("Välj en månad.");
  if (isDemo()) {
    const open = (await listRuns()).filter((r) => (r.status === "approved" || r.status === "paid" || r.status === "booked") && r.payDate.slice(0, 7) === period);
    const slips = (await closedSlipsPaidIn(period)).map((s) => ({ payslipId: s.id, runId: s.runId, employeeId: s.employeeId, document: s.document }));
    return agiBuild(period, slips, await listRepayments(period), open);
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("agi_build", { p_org: await currentOrgId(), p_period: period });
  if (error) fail("Kunde inte bygga arbetsgivardeklarationen", error);
  return data as AgiBuild;
}

/** The month's payslips a repayment can be recorded against: number and ruta 011 per payslip (agi_repayment_add caps per payslip). */
export async function agiPayslips(period: string): Promise<{ id: string; employeeId: string; name: string; number: number | null; cashOre: number }[]> {
  return (await closedSlipsPaidIn(period)).map((s) => ({
    id: s.id,
    employeeId: s.employeeId,
    name: s.document.employeeName,
    number: s.number,
    cashOre: s.document.lines.filter((l) => l.item.flags.agiBox === "011").reduce((sum, l) => sum + l.amountOre, 0),
  }));
}

/** Every version with its records (the preview and the diffs), newest first; optionally one month. */
export async function listAgiDeclarations(period?: string): Promise<AgiDeclaration[]> {
  const order = (a: AgiDeclaration, b: AgiDeclaration) => b.period.localeCompare(a.period) || b.version - a.version;
  if (isDemo()) return demo().declarations.map(declarationFromRow).filter((d) => !period || d.period === period).sort(order);
  const supabase = await getDb();
  let q = supabase.from("agi_declarations").select(DECLARATION_COLUMNS);
  if (period) q = q.eq("period", period);
  const { data, error } = await q.order("period", { ascending: false }).order("version", { ascending: false }).limit(500);
  if (error) fail("Kunde inte hämta arbetsgivardeklarationerna", error);
  return (data as DeclarationRow[]).map(declarationFromRow);
}

/** Every version without records and totals, newest first (lists, Idag, the "filed" checks). */
export async function listAgiDeclarationSummaries(): Promise<AgiDeclarationSummary[]> {
  if (isDemo()) return demo().declarations.map(summaryFromRow).sort((a, b) => b.period.localeCompare(a.period) || b.version - a.version);
  const supabase = await getDb();
  const { data, error } = await supabase.from("agi_declarations").select(SUMMARY_COLUMNS).order("period", { ascending: false }).order("version", { ascending: false }).limit(500);
  if (error) fail("Kunde inte hämta arbetsgivardeklarationerna", error);
  return (data as Omit<DeclarationRow, "records" | "totals">[]).map(summaryFromRow);
}

export async function getAgiDeclaration(id: string): Promise<AgiDeclarationSummary | null> {
  return (await listAgiDeclarationSummaries()).find((d) => d.id === id) ?? null;
}

export type AgiPreview = { build: AgiBuild; latest: AgiDeclaration | null; records: AgiRecord[]; diff: AgiDiffRow[]; unchanged: boolean };

/** What storing the month now would give: the records with their specifikationsnummer and the diff against the latest version. Pass the month's versions if they are loaded. */
export async function previewAgi(period: string, loaded?: readonly AgiDeclaration[]): Promise<AgiPreview> {
  const [build, declarations, employees] = await Promise.all([buildAgi(period), loaded ?? listAgiDeclarations(period), listEmployees()]);
  const latest = declarations.find((d) => d.period === period) ?? null;
  const masked = new Map(employees.map((e) => [e.id, e.pnrMasked]));
  const records = agiRecords(build, latest?.records ?? [], (id) => masked.get(id) ?? "");
  const diff = latest ? diffAgi(latest.records, records) : [];
  return { build, latest, records, diff, unchanged: !!latest && diff.length === 0 && latest.contributionsOre === build.totals.contributionsOre };
}

/**
 * A new version of the month: the personnummer revealed for the file
 * (owner/admin, logged per person), the file written and checked against
 * the build, then frozen by agi_store(), which checks it all again.
 */
export async function storeAgi(period: string): Promise<{ id: string; version: number }> {
  const { build, latest, records, unchanged } = await previewAgi(period);
  if (build.problems.length) throw new Error(`Månaden går inte att deklarera: ${build.problems.join(" ")}`);
  if (unchanged && latest) throw new Error(`Ingenting har ändrats sedan version ${latest.version} av ${period}.`);
  const [{ settings }, org] = await Promise.all([getPayrollSettings(), isDemo() ? Promise.resolve(null) : currentOrgId()]);
  const company = (await getOrgSettings(org ?? undefined)).company;
  if (!company.orgNr) throw new Error("Organisationsnumret saknas (Inställningar › Företaget); AGI behöver arbetsgivarens identitet.");
  const pnr = new Map<string, string>();
  for (const r of records) {
    const p = await revealPnr(r.employeeId, `arbetsgivardeklaration ${period}`);
    pnr.set(r.employeeId, (p ?? "").replace(/\D/g, ""));
  }
  const xml = agiXml({
    period,
    employerId: company.orgNr,
    contact: { name: settings.agi.contactName || company.signer, phone: settings.agi.contactPhone || company.phone, email: settings.agi.contactEmail || company.email },
    programName: "Binaafy",
    createdAt: stockholmDateTime(),
    records,
    payeeId: (id) => pnr.get(id) ?? "",
    totals: build.totals,
  });
  const problems = checkAgiXml(xml, records, build.totals, period);
  if (problems.length) throw new Error(`Filen stämmer inte med månaden: ${problems.join(" ")}`);
  if (isDemo()) {
    const version = (latest?.version ?? 0) + 1;
    for (const d of demo().declarations) if (d.period === period && d.status === "draft") d.status = "corrected";
    const id = crypto.randomUUID();
    demo().declarations.push({
      id,
      period,
      version,
      status: "draft",
      schema_version: AGI_FORMAT.schemaVersion,
      sha256: sha256(xml),
      tax_ore: build.totals.taxOre,
      contributions_ore: build.totals.contributionsOre,
      totals: build.totals,
      records,
      run_ids: build.runIds,
      filed_at: null,
      filed_by_name: null,
      paid_at: null,
      created_at: new Date().toISOString(),
      xml,
      build_hash: buildHash(build),
    });
    return { id, version };
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("agi_store", { p_org: org, p_period: period, p_xml: xml, p_records: records });
  if (error) fail("Kunde inte spara arbetsgivardeklarationen", error);
  const stored = await getAgiDeclaration(data as string);
  return { id: data as string, version: stored?.version ?? (latest?.version ?? 0) + 1 };
}

export async function markAgiFiled(id: string, byName: string): Promise<void> {
  if (isDemo()) {
    const d = demo().declarations.find((x) => x.id === id);
    if (!d) throw new Error("Deklarationen finns inte.");
    if (d.status !== "draft") throw new Error(`Version ${d.version} är redan ${d.status === "filed" ? "lämnad" : "ersatt"}.`);
    for (const x of demo().declarations) if (x.period === d.period && x.status === "filed") x.status = "corrected";
    Object.assign(d, { status: "filed", filed_at: new Date().toISOString(), filed_by_name: byName });
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("agi_mark_filed", { p_id: id });
  if (error) fail("Kunde inte markera deklarationen som lämnad", error);
}

export async function markAgiPaid(id: string, paid: boolean): Promise<void> {
  if (isDemo()) {
    const d = demo().declarations.find((x) => x.id === id);
    if (!d) throw new Error("Deklarationen finns inte.");
    if (paid && d.status !== "filed") throw new Error(`Version ${d.version} är inte lämnad; markera den som lämnad innan skattekontot markeras betalt.`);
    d.paid_at = paid ? (d.paid_at ?? new Date().toISOString()) : null;
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("agi_mark_paid", { p_id: id, p_paid: paid });
  if (error) fail("Kunde inte markera skattekontot", error);
}

/** The frozen file (with personnummer), owner/admin; checked against its hash. */
export async function getAgiXml(id: string): Promise<{ xml: string; declaration: AgiDeclarationSummary } | null> {
  const declaration = await getAgiDeclaration(id);
  if (!declaration) return null;
  let xml: string;
  if (isDemo()) xml = demo().declarations.find((d) => d.id === id)?.xml ?? "";
  else {
    const supabase = await getDb();
    const { data, error } = await supabase.rpc("agi_xml", { p_id: id });
    if (error) fail("Kunde inte hämta AGI-filen", error);
    xml = data as string;
  }
  if (sha256(xml) !== declaration.sha256) throw new Error("Filen stämmer inte med den som frystes. Den lämnas inte ut.");
  return { xml, declaration };
}

/** What a stored version changed against the one before (agi_diff, from the stored records of the loaded versions). */
export function storedAgiDiff(all: readonly AgiDeclaration[], id: string): AgiDiffRow[] {
  const d = all.find((x) => x.id === id);
  if (!d) return [];
  const prev = all.find((x) => x.period === d.period && x.version === d.version - 1);
  return prev ? diffAgi(prev.records, d.records) : [];
}

/** Salary the employee paid back (återkrav) for a payslip in a closed run: refiles the month it was paid. */
export async function addRepayment(payslipId: string, amountOre: number, reason: string, repaidOn: IsoDate): Promise<string> {
  if (isDemo()) {
    const closed = (await listRuns()).filter((r) => r.status === "closed");
    const slip = (await Promise.all(closed.map((r) => listRunPayslips(r.id)))).flat().find((s) => s.id === payslipId);
    if (!slip) throw new Error("Återbetalningen gäller ett lönebesked i en stängd körning.");
    const cash = slip.document.lines.filter((l) => l.item.flags.agiBox === "011").reduce((s, l) => s + l.amountOre, 0);
    const done = demo().repayments.filter((r) => r.payslipId === payslipId).reduce((s, r) => s + r.amountOre, 0);
    if (amountOre <= 0 || amountOre + done > cash) throw new Error(`Återbetalningen ska vara mer än 0 och högst lönebeskedets kontanta lön (${(cash - done) / 100} kr kvar).`);
    if (reason.trim().length < 3) throw new Error("Skriv varför lönen betalades tillbaka.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(repaidOn) || repaidOn < slip.document.payDate) throw new Error("Dagen för återbetalningen ska vara lönedagen eller senare.");
    const id = crypto.randomUUID();
    demo().repayments.push({ id, employeeId: slip.employeeId, payslipId, period: slip.document.payDate.slice(0, 7), amountOre, reason: reason.trim(), repaidOn, createdAt: new Date().toISOString() });
    return id;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("agi_repayment_add", { p_payslip: payslipId, p_amount: amountOre, p_reason: reason, p_repaid_on: repaidOn });
  if (error) fail("Kunde inte registrera återbetalningen", error);
  return data as string;
}

/* ---------- Fora ---------- */

export async function foraLines(period: string): Promise<ForaLine[]> {
  if (!isAgiPeriod(period)) throw new Error("Välj en månad.");
  if (isDemo()) return foraBasis(period, (await closedSlipsPaidIn(period)).map((s) => ({ payslipId: s.id, employeeId: s.employeeId, document: s.document })));
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("pension_basis", { p_org: await currentOrgId(), p_period: period, p_scheme: "fora" });
  if (error) fail("Kunde inte hämta Fora-underlaget", error);
  return data as ForaLine[];
}

export async function listPensionReports(): Promise<PensionReport[]> {
  if (isDemo()) return demo().pension.map(pensionFromRow).sort((a, b) => b.period.localeCompare(a.period) || b.version - a.version);
  const supabase = await getDb();
  const { data, error } = await supabase
    .from("pension_reports")
    .select("id, period, scheme, version, status, sha256, lines, total_ore, filed_at, created_at")
    .order("period", { ascending: false })
    .order("version", { ascending: false })
    .limit(500);
  if (error) fail("Kunde inte hämta pensionsrapporterna", error);
  return (data as PensionRow[]).map(pensionFromRow);
}

/** The month's Fora file, frozen; personnummer revealed for the file (logged). */
export async function storeForaReport(period: string): Promise<string> {
  const [lines, { settings }, reports] = await Promise.all([foraLines(period), getPayrollSettings(), listPensionReports()]);
  if (!lines.length) throw new Error(`Ingen med SAF-LO fick lön utbetald i ${period}. Fora vill ändå ha minst en arbetare med 0 kr när ingen lön alls betalats; gör det på Mina sidor.`);
  const latest = reports.find((r) => r.period === period && r.scheme === "fora");
  if (latest && JSON.stringify(latest.lines.map((l) => [l.employeeId, l.payOre])) === JSON.stringify(lines.map((l) => [l.employeeId, l.payOre]))) throw new Error(`Ingenting har ändrats sedan version ${latest.version}.`);
  const pnr = new Map<string, string>();
  for (const l of lines) pnr.set(l.employeeId, (await revealPnr(l.employeeId, `Fora-rapport ${period}`)) ?? "");
  const file = foraFile({ period, fokId: settings.pension.foraFokId, lines, pnr: (id) => pnr.get(id) ?? "" });
  const total = lines.reduce((s, l) => s + l.payOre, 0);
  if (parseForaFile(file).totalOre !== total) throw new Error("Fora-filen stämmer inte med underlaget.");
  if (isDemo()) {
    for (const r of demo().pension) if (r.period === period && r.scheme === "fora" && r.status === "draft") r.status = "corrected";
    const id = crypto.randomUUID();
    demo().pension.push({ id, period, scheme: "fora", version: (latest?.version ?? 0) + 1, status: "draft", sha256: sha256(file), lines, total_ore: total, filed_at: null, created_at: new Date().toISOString(), file });
    return id;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("pension_report_store", { p_org: await currentOrgId(), p_period: period, p_scheme: "fora", p_file: file, p_lines: lines });
  if (error) fail("Kunde inte spara Fora-rapporten", error);
  return data as string;
}

export async function markPensionFiled(id: string): Promise<void> {
  if (isDemo()) {
    const d = demo().pension.find((x) => x.id === id);
    if (!d || d.status !== "draft") throw new Error("Rapporten är redan lämnad eller ersatt.");
    for (const x of demo().pension) if (x.period === d.period && x.scheme === d.scheme && x.status === "filed") x.status = "corrected";
    Object.assign(d, { status: "filed", filed_at: new Date().toISOString() });
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("pension_report_mark_filed", { p_id: id });
  if (error) fail("Kunde inte markera rapporten", error);
}

export async function getPensionFile(id: string): Promise<{ file: string; report: PensionReport } | null> {
  const report = (await listPensionReports()).find((r) => r.id === id);
  if (!report) return null;
  let file: string;
  if (isDemo()) file = demo().pension.find((r) => r.id === id)?.file ?? "";
  else {
    const supabase = await getDb();
    const { data, error } = await supabase.rpc("pension_report_file", { p_id: id });
    if (error) fail("Kunde inte hämta filen", error);
    file = data as string;
  }
  if (sha256(file) !== report.sha256) throw new Error("Filen stämmer inte med den som frystes.");
  return { file, report };
}

/* ---------- Collectum ---------- */

export async function collectumLines(period: string): Promise<CollectumLine[]> {
  if (!isAgiPeriod(period)) throw new Error("Välj en månad.");
  if (isDemo()) return collectumBasis(period, (await closedSlipsPaidIn(period)).map((s) => ({ payslipId: s.id, employeeId: s.employeeId, document: s.document })));
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("collectum_basis", { p_org: await currentOrgId(), p_period: period });
  if (error) fail("Kunde inte hämta Collectum-underlaget", error);
  return data as CollectumLine[];
}

/** The month's ITP1 premium on the reported pay against what the runs accrued, with the särskild löneskatt. */
export async function collectumPremiums(period: string, lines: readonly CollectumLine[]): Promise<PremiumCheck[]> {
  const slips = await closedSlipsPaidIn(period);
  const accrued = new Map<string, number>();
  for (const s of slips) if (s.document.context?.pension.scheme === "itp1") accrued.set(s.employeeId, (accrued.get(s.employeeId) ?? 0) + s.pensionPremiumOre);
  return premiumCheck(period, lines, accrued);
}

/** The month's Collectum file, frozen; personnummer revealed for the file (logged). */
export async function storeCollectumReport(period: string): Promise<string> {
  const [lines, { settings }, reports] = await Promise.all([collectumLines(period), getPayrollSettings(), listPensionReports()]);
  if (!lines.length) throw new Error(`Ingen med ITP1 fick lön utbetald i ${period}.`);
  const latest = reports.find((r) => r.period === period && r.scheme === "collectum");
  if (latest && JSON.stringify(latest.lines.map((l) => [l.employeeId, l.payOre])) === JSON.stringify(lines.map((l) => [l.employeeId, l.payOre]))) throw new Error(`Ingenting har ändrats sedan version ${latest.version}.`);
  const pnr = new Map<string, string>();
  for (const l of lines) pnr.set(l.employeeId, (await revealPnr(l.employeeId, `Collectum-rapport ${period}`)) ?? "");
  const file = collectumFile({ period, customerNo: settings.pension.collectumCustomerNo, lines, pnr: (id) => pnr.get(id) ?? "" });
  const total = lines.reduce((s, l) => s + l.payOre, 0);
  if (parseForaFile(file).totalOre !== total) throw new Error("Collectum-filen stämmer inte med underlaget.");
  if (isDemo()) {
    for (const r of demo().pension) if (r.period === period && r.scheme === "collectum" && r.status === "draft") r.status = "corrected";
    const id = crypto.randomUUID();
    demo().pension.push({ id, period, scheme: "collectum", version: (latest?.version ?? 0) + 1, status: "draft", sha256: sha256(file), lines, total_ore: total, filed_at: null, created_at: new Date().toISOString(), file });
    return id;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("pension_report_store", { p_org: await currentOrgId(), p_period: period, p_scheme: "collectum", p_file: file, p_lines: lines });
  if (error) fail("Kunde inte spara Collectum-rapporten", error);
  return data as string;
}

/* ---------- växa-stöd ---------- */

export async function vaxaStodFor(period: string): Promise<VaxaStodBasis> {
  if (!isAgiPeriod(period)) throw new Error("Välj en månad.");
  const [slips, employees, versions, { settings }] = await Promise.all([closedSlipsPaidIn(period), listEmployees(), listEmployments(), getPayrollSettings()]);
  const chosen = new Set(settings.vaxaStod.employeeIds);
  return vaxaStodBasis(
    period,
    employees
      .filter((e) => chosen.has(e.id) || slips.some((s) => s.employeeId === e.id))
      .map((e) => ({
        employeeId: e.id,
        name: e.name,
        isOwner: e.isOwner,
        chosen: chosen.has(e.id),
        versions: versions.filter((v) => v.employeeId === e.id),
        payslips: slips.filter((s) => s.employeeId === e.id).map((s) => ({ contributionBaseOre: s.document.contributions.baseOre, category: s.document.contributions.category })),
      })),
  );
}

export async function listVaxaClaims(): Promise<VaxaClaim[]> {
  if (isDemo()) return [...demo().vaxa];
  const supabase = await getDb();
  const { data, error } = await supabase.from("vaxa_stod_claims").select("*").order("period", { ascending: false });
  if (error) fail("Kunde inte hämta växa-stödet", error);
  type Row = { id: string; period: string; employee_id: string; month_no: number; base_ore: number; capped_base_ore: number; refund_ore: number; applied_at: string };
  return (data as Row[]).map((r) => ({ id: r.id, period: r.period, employeeId: r.employee_id, monthNo: r.month_no, baseOre: Number(r.base_ore), cappedBaseOre: Number(r.capped_base_ore), refundOre: Number(r.refund_ore), appliedAt: r.applied_at }));
}

/** Ansökt i e-tjänsten: the eligible rows of the month are recorded (the month's AGI must be filed first). */
export async function storeVaxaClaims(period: string): Promise<number> {
  const [basis, declarations, claims] = await Promise.all([vaxaStodFor(period), listAgiDeclarationSummaries(), listVaxaClaims()]);
  if (!declarations.some((d) => d.period === period && d.status === "filed")) throw new Error(`Lämna arbetsgivardeklarationen för ${period} innan du ansöker om växa-stöd.`);
  const rows = basis.rows.filter((r) => r.eligible && !claims.some((c) => c.period === period && c.employeeId === r.employeeId));
  if (!rows.length) throw new Error("Ingen i månaden har rätt till växa-stöd, eller ansökan är redan registrerad.");
  if (isDemo()) {
    for (const r of rows) demo().vaxa.push({ id: crypto.randomUUID(), period, employeeId: r.employeeId, monthNo: r.monthNo ?? 1, baseOre: r.baseOre, cappedBaseOre: r.cappedBaseOre, refundOre: r.refundOre, appliedAt: new Date().toISOString() });
    return rows.length;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("vaxa_stod_claim_store", {
    p_org: await currentOrgId(),
    p_period: period,
    p_rows: rows.map((r) => ({ employeeId: r.employeeId, monthNo: r.monthNo, baseOre: r.baseOre, cappedBaseOre: r.cappedBaseOre, refundOre: r.refundOre })),
  });
  if (error) fail("Kunde inte registrera ansökan", error);
  return data as number;
}

/* ---------- årsskiftet ---------- */

export type YearEndPreview = { year: number; closing: { from: IsoDate; to: IsoDate }; opening: { from: IsoDate; to: IsoDate }; rows: SemesterTransitionRow[]; summary: YearSummaryRow[]; closed: YearClosing | null; semesterEnded: boolean };

export async function listYearClosings(): Promise<YearClosing[]> {
  if (isDemo()) return [...demo().years].sort((a, b) => b.year - a.year);
  const supabase = await getDb();
  const { data, error } = await supabase.from("year_closings").select("id, year, vacation_year_start, semester, summary, semester_closed_at").order("year", { ascending: false });
  if (error) fail("Kunde inte hämta årsskiftena", error);
  type Row = { id: string; year: number; vacation_year_start: string; semester: SemesterTransitionRow[]; summary: YearSummaryRow[]; semester_closed_at: string };
  return (data as Row[]).map((r) => ({ id: r.id, year: r.year, vacationYearStart: r.vacation_year_start, semester: r.semester, summary: r.summary, closedAt: r.semester_closed_at }));
}

/** The year's summary per person from the closed runs paid in it (year_summary). */
export async function summaryForYear(year: number): Promise<YearSummaryRow[]> {
  if (isDemo()) {
    const runs = (await listRuns()).filter((r) => r.status === "closed" && r.payDate.startsWith(`${year}-`));
    const slips = (await Promise.all(runs.map((r) => listRunPayslips(r.id)))).flat().filter((s) => s.approvedAt);
    const repaid = (await listRepayments()).filter((r) => r.period.startsWith(`${year}-`));
    return yearSummary(
      slips.map((s) => ({ employeeId: s.employeeId, number: s.number, document: s.document, employerContributionOre: s.employerContributionOre })),
      repaid,
    );
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("year_summary", { p_org: await currentOrgId(), p_year: year });
  if (error) fail("Kunde inte hämta årssammanställningen", error);
  return data as YearSummaryRow[];
}

export async function previewYearEnd(year: number, today: IsoDate): Promise<YearEndPreview> {
  const [{ settings }, employees, versions, absences, schedules, closings, summary] = await Promise.all([
    getPayrollSettings(),
    listEmployees(),
    listEmployments(),
    listAbsences(),
    listSchedules(),
    listYearClosings(),
    summaryForYear(year),
  ]);
  const model = vacationModelFor(settings);
  const latestSchedule = (id: string) => schedules.filter((s) => s.employeeId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const t = semesterTransition({
    year,
    model,
    people: employees.map((e) => {
      const s = latestSchedule(e.id);
      return { employeeId: e.id, name: e.name, versions: versions.filter((v) => v.employeeId === e.id), absences: absences.filter((a) => a.employeeId === e.id), schedule: s ? scheduleFromRules(s.rules) : null };
    }),
  });
  return { year, ...t, summary, closed: closings.find((c) => c.year === year) ?? null, semesterEnded: today > t.closing.to };
}

/** Årsskiftet: the semester transition stored and frozen, the summary saved; once per year (year_close). */
export async function closeYear(year: number, today: IsoDate): Promise<string> {
  const p = await previewYearEnd(year, today);
  if (p.closed) throw new Error(`Årsskiftet för ${year} är redan gjort.`);
  if (!p.semesterEnded) throw new Error(`Semesteråret som slutar ${p.closing.to} har inte slutat ännu.`);
  if (isDemo()) {
    const { settings } = await getPayrollSettings();
    const model = vacationModelFor(settings);
    for (const r of p.rows) await closeLeaveYearDemo(r.employeeId, model, r);
    const id = crypto.randomUUID();
    demo().years.push({ id, year, vacationYearStart: p.closing.from, semester: p.rows, summary: p.summary, closedAt: new Date().toISOString() });
    return id;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("year_close", { p_org: await currentOrgId(), p_year: year, p_rows: p.rows });
  if (error) fail("Kunde inte göra årsskiftet", error);
  return data as string;
}

/* ---------- arbetsgivarintyg ---------- */

export async function listCertificates(employeeId?: string): Promise<EmployerCertificate[]> {
  if (isDemo()) return demo().certificates.filter((c) => !employeeId || c.employee_id === employeeId).map(certificateFromRow).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const supabase = await getDb();
  let q = supabase.from("employer_certificates").select("*");
  if (employeeId) q = q.eq("employee_id", employeeId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) fail("Kunde inte hämta arbetsgivarintygen", error);
  return (data as CertificateRow[]).map(certificateFromRow);
}

export async function getCertificate(id: string): Promise<EmployerCertificate | null> {
  if (isDemo()) {
    const r = demo().certificates.find((c) => c.id === id);
    return r ? certificateFromRow(r) : null;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("employer_certificates").select("*").eq("id", id).maybeSingle();
  if (error) fail("Kunde inte hämta intyget", error);
  return data ? certificateFromRow(data as CertificateRow) : null;
}

/** The intyg's content from the register: contracts, approved time, absence and approved payslips; the personnummer revealed (logged). */
export async function certificateContentFor(input: { employeeId: string; to: IsoDate; reason: LeavingReason; reasonText: string; today: IsoDate; employer: CertificateContent["employer"] }): Promise<CertificateContent> {
  const employee = (await listEmployees()).find((e) => e.id === input.employeeId);
  if (!employee) throw new Error("Personen finns inte.");
  const from = addDays(input.to, -400);
  const [versions, entries, absences, slips, pnr] = await Promise.all([
    listEmployments(input.employeeId),
    listTimeEntries({ from, to: input.to, employeeId: input.employeeId }),
    listAbsences({ employeeId: input.employeeId }),
    listEmployeePayslips(input.employeeId),
    revealPnr(input.employeeId, "arbetsgivarintyg"),
  ]);
  if (!pnr) throw new Error(`${employee.name}: personnummer saknas; intyget behöver det.`);
  return certificateContent({
    employee: { id: employee.id, name: employee.name, pnr: `${pnr.slice(0, 8)}-${pnr.slice(8)}` },
    employer: input.employer,
    versions,
    timeEntries: entries,
    absences,
    payslips: slips.map((s) => s.document),
    to: input.to,
    reason: input.reason,
    reasonText: input.reasonText,
    today: input.today,
  });
}

/**
 * Freezes an intyg: the row first (its path is {org}/{person}/{id}.pdf, which
 * the employee may read), then the PDF; the stored content has the
 * personnummer masked.
 */
export async function storeCertificate(content: CertificateContent, pdf: Buffer): Promise<string> {
  const id = crypto.randomUUID();
  const org = isDemo() ? "demo" : await currentOrgId();
  const key = `${org}/${content.employee.id}/${id}.pdf`;
  const stored: CertificateContent = { ...content, employee: { ...content.employee, pnr: maskPnr(content.employee.pnr.replace(/\D/g, "")) } };
  const row = { id, employee_id: content.employee.id, from_date: content.from, to_date: content.to, reason: content.reason, content: stored, storage_path: key, sha256: sha256(pdf), size_bytes: pdf.length };
  if (isDemo()) {
    const target = demoFile(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, pdf, { flag: "wx" });
    demo().certificates.push({ ...row, created_at: new Date().toISOString() });
    return id;
  }
  const supabase = await getDb();
  const { error } = await supabase.from("employer_certificates").insert({ ...row, org_id: org });
  if (error) fail("Kunde inte spara intyget", error);
  const up = await supabase.storage.from(HR_BUCKET).upload(key, pdf, { contentType: "application/pdf", cacheControl: "60", upsert: false });
  if (up.error) throw new Error(`Intyget registrerades men PDF:en kunde inte sparas (${up.error.message}). Skapa intyget igen.`);
  return id;
}

/** The frozen PDF's bytes, checked against the hash recorded when it was made. */
export async function readCertificatePdf(c: EmployerCertificate): Promise<Buffer> {
  let bytes: Buffer;
  if (isDemo()) bytes = await fs.readFile(demoFile(c.storagePath));
  else {
    const supabase = await getDb();
    const { data, error } = await supabase.storage.from(HR_BUCKET).download(c.storagePath);
    if (error || !data) throw new Error(`Kunde inte hämta PDF:en: ${error?.message ?? "saknas"}`);
    bytes = Buffer.from(await data.arrayBuffer());
  }
  if (sha256(bytes) !== c.sha256) throw new Error("PDF:en stämmer inte med den som frystes. Den visas inte.");
  return bytes;
}
