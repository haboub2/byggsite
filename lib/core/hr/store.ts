import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getDb } from "../db";
import { isDemo } from "../../leads";
import { currentOrgId, readOrgId } from "../org/current";
import { payrollRulesAt } from "../rules/payroll";
import { clocksForVersions, type EmployeeClockRow } from "./clocks";
import type { Actor, CoreEvent, EventType } from "../events";
import {
  maskPnr,
  pnrBirthDate,
  type Employee,
  type EmployeeContact,
  type EmployeeInput,
  type EmploymentDocument,
  type EmploymentInput,
  type EmploymentVersion,
  type TaxInput,
  type TaxVersion,
} from "./schema";

/**
 * The personnel register (supabase/migrations/0035_hr.sql), read and
 * written with the admin's session so RLS decides: owner, admin and
 * accountant read; owner and admin write. Personnummer and bank accounts go
 * through the database's functions, which encrypt them and log every
 * reveal; versions and contracts are only ever inserted. The clocks come
 * from employment_clocks() in the database.
 *
 * Demo mode keeps everything in memory (the PDFs under uploads/hr/) and
 * counts the clocks with the TypeScript reference.
 */

export const HR_BUCKET = "hr";

type EmployeeRow = {
  id: string;
  org_id: string;
  name: string;
  email: string;
  phone: string;
  street: string;
  postal_code: string;
  city: string;
  pnr_masked: string;
  birth_date: string | null;
  bank_clearing: string;
  bank_account_masked: string;
  user_id: string | null;
  is_owner: boolean;
  is_board_member: boolean;
  agreement: Employee["agreement"];
  emergency_contact: string;
  notes: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};
const EMPLOYEE_COLUMNS =
  "id, org_id, name, email, phone, street, postal_code, city, pnr_masked, birth_date, bank_clearing, bank_account_masked, user_id, is_owner, is_board_member, agreement, emergency_contact, notes, ended_at, created_at, updated_at";

const employeeFromRow = (r: EmployeeRow): Employee => ({
  id: r.id,
  orgId: r.org_id,
  name: r.name,
  email: r.email,
  phone: r.phone,
  street: r.street,
  postalCode: r.postal_code,
  city: r.city,
  pnrMasked: r.pnr_masked,
  birthDate: r.birth_date,
  bankClearing: r.bank_clearing,
  bankAccountMasked: r.bank_account_masked,
  userId: r.user_id,
  isOwner: r.is_owner,
  isBoardMember: r.is_board_member,
  agreement: r.agreement,
  emergencyContact: r.emergency_contact,
  notes: r.notes,
  endedAt: r.ended_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

type EmploymentRow = {
  id: string;
  employee_id: string;
  contract_id: string;
  version: number;
  form: EmploymentVersion["form"];
  pay_form: EmploymentVersion["payForm"];
  monthly_salary_ore: number | null;
  hourly_rate_ore: number | null;
  fee_ore: number | null;
  fee_period: EmploymentVersion["feePeriod"];
  decision_reference: string;
  title: string;
  workplace: string;
  working_time_percent: number | string;
  weekly_hours: number | string | null;
  substitute_for: string;
  probation_ends_on: string | null;
  starts_on: string;
  ends_on: string | null;
  notice_days: number | null;
  pay_day: number | null;
  vacation_rule: EmploymentVersion["vacationRule"];
  vacation_days: number;
  vacation_percent: number | string | null;
  atf_hours_per_year: number | string;
  pension_scheme: EmploymentVersion["pensionScheme"];
  terms: string;
  change_reason: string;
  valid_from: string;
  valid_to: string | null;
  document_id: string | null;
  created_at: string;
};

const num = (v: number | string | null): number | null => (v === null ? null : Number(v));

const employmentFromRow = (r: EmploymentRow): EmploymentVersion => ({
  id: r.id,
  employeeId: r.employee_id,
  contractId: r.contract_id,
  version: r.version,
  form: r.form,
  payForm: r.pay_form,
  monthlySalaryOre: num(r.monthly_salary_ore),
  hourlyRateOre: num(r.hourly_rate_ore),
  feeOre: num(r.fee_ore),
  feePeriod: r.fee_period,
  decisionReference: r.decision_reference,
  title: r.title,
  workplace: r.workplace,
  workingTimePercent: Number(r.working_time_percent),
  weeklyHours: num(r.weekly_hours),
  substituteFor: r.substitute_for,
  probationEndsOn: r.probation_ends_on,
  startsOn: r.starts_on,
  endsOn: r.ends_on,
  noticeDays: r.notice_days,
  payDay: r.pay_day,
  vacationRule: r.vacation_rule,
  vacationDays: r.vacation_days,
  vacationPercent: num(r.vacation_percent),
  atfHoursPerYear: Number(r.atf_hours_per_year),
  pensionScheme: r.pension_scheme,
  terms: r.terms,
  changeReason: r.change_reason,
  validFrom: r.valid_from,
  validTo: r.valid_to,
  documentId: r.document_id,
  createdAt: r.created_at,
});

const employmentToRow = (e: EmploymentInput) => ({
  contract_id: e.contractId,
  form: e.form,
  pay_form: e.payForm,
  monthly_salary_ore: e.payForm === "monthly" ? e.monthlySalary : null,
  hourly_rate_ore: e.payForm === "hourly" ? e.hourlyRate : null,
  fee_ore: e.payForm === "fee" ? e.fee : null,
  fee_period: e.payForm === "fee" ? e.feePeriod : null,
  decision_reference: e.decisionReference,
  title: e.title,
  workplace: e.workplace,
  working_time_percent: e.workingTimePercent ?? 100,
  weekly_hours: e.weeklyHours,
  substitute_for: e.form === "vikariat" ? e.substituteFor : "",
  probation_ends_on: e.form === "provanstallning" ? e.probationEndsOn : null,
  starts_on: e.startsOn,
  ends_on: e.endsOn,
  notice_days: e.noticeDays,
  pay_day: e.payDay,
  vacation_rule: e.vacationRule,
  vacation_days: e.vacationRule === "none" ? 0 : (e.vacationDays ?? 25),
  vacation_percent: e.vacationRule === "procent" ? e.vacationPercent : null,
  atf_hours_per_year: e.atfHoursPerYear ?? 0,
  pension_scheme: e.pensionScheme,
  terms: e.terms,
  change_reason: e.changeReason,
  valid_from: e.validFrom ?? e.startsOn,
});

type TaxRow = {
  id: string;
  employee_id: string;
  kind: TaxVersion["kind"];
  table_no: number | null;
  column_no: number | null;
  adjustment_percent: number | string | null;
  adjustment_monthly_change_ore: number | null;
  adjustment_valid_to: string | null;
  main_employer: boolean;
  source: TaxVersion["source"];
  valid_from: string;
  note: string;
  created_at: string;
};
const taxFromRow = (r: TaxRow): TaxVersion => ({
  id: r.id,
  employeeId: r.employee_id,
  kind: r.kind,
  tableNo: r.table_no,
  columnNo: r.column_no,
  adjustmentPercent: num(r.adjustment_percent),
  adjustmentMonthlyChangeOre: num(r.adjustment_monthly_change_ore),
  adjustmentValidTo: r.adjustment_valid_to,
  mainEmployer: r.main_employer,
  source: r.source,
  validFrom: r.valid_from,
  note: r.note,
  createdAt: r.created_at,
});

type DocumentRow = {
  id: string;
  employee_id: string;
  employment_id: string;
  kind: EmploymentDocument["kind"];
  title: string;
  template: string;
  template_version: string;
  storage_path: string;
  sha256: string;
  size_bytes: number;
  signed_at: string | null;
  created_at: string;
};
const documentFromRow = (r: DocumentRow): EmploymentDocument => ({
  id: r.id,
  employeeId: r.employee_id,
  employmentId: r.employment_id,
  kind: r.kind,
  title: r.title,
  template: r.template,
  templateVersion: r.template_version,
  storagePath: r.storage_path,
  sha256: r.sha256,
  sizeBytes: r.size_bytes,
  signedAt: r.signed_at,
  createdAt: r.created_at,
});

/* ---------- demo ---------- */

type DemoStore = {
  employees: (EmployeeRow & { pnr: string | null; bank_account: string })[];
  employments: EmploymentRow[];
  tax: TaxRow[];
  documents: DocumentRow[];
  events: CoreEvent[];
};
const g = globalThis as unknown as { __binaafyHr?: DemoStore };
const demo = (): DemoStore => (g.__binaafyHr ??= { employees: [], employments: [], tax: [], documents: [], events: [] });
const DEMO_ACTOR: Actor = { kind: "user", id: "demo", name: "demo@localhost" };
function demoLog(employeeId: string, type: EventType, data: CoreEvent["data"] = {}) {
  demo().events.push({ orgId: "demo", aggregateType: "employee", aggregateId: employeeId, type, data, actor: DEMO_ACTOR, at: new Date().toISOString() });
}
const demoFile = (key: string) => path.join(process.cwd(), "uploads", "hr", ...key.split("/"));

/** Postgres errors from the HR functions carry their own Swedish message; keep it. */
function fail(prefix: string, error: { message: string; code?: string }): never {
  const own = error.code === "42501" || error.code === "22023" || error.code === "23505" || error.code === "0A000" || error.code === "P0001";
  throw new Error(own ? error.message : `${prefix}: ${error.message}`);
}

/* ---------- people ---------- */

export async function listEmployees(): Promise<Employee[]> {
  if (isDemo()) return demo().employees.map(employeeFromRow).sort((a, b) => a.name.localeCompare(b.name, "sv"));
  const supabase = await getDb();
  let q = supabase.from("employees").select(EMPLOYEE_COLUMNS);
  const org = await readOrgId();
  if (org) q = q.eq("org_id", org);
  const { data, error } = await q.order("name").limit(2000);
  if (error) fail("Kunde inte hämta personalen", error);
  return (data as unknown as EmployeeRow[]).map(employeeFromRow);
}

export async function getEmployee(id: string): Promise<Employee | null> {
  if (isDemo()) {
    const r = demo().employees.find((e) => e.id === id);
    return r ? employeeFromRow(r) : null;
  }
  const supabase = await getDb();
  let q = supabase.from("employees").select(EMPLOYEE_COLUMNS).eq("id", id);
  const org = await readOrgId();
  if (org) q = q.eq("org_id", org);
  const { data, error } = await q.maybeSingle();
  if (error) fail("Kunde inte hämta personen", error);
  return data ? employeeFromRow(data as unknown as EmployeeRow) : null;
}

export async function createEmployee(input: EmployeeInput): Promise<string> {
  const account = input.bankAccount.replace(/\D/g, "");
  if (isDemo()) {
    if (input.pnr && demo().employees.some((e) => e.pnr === input.pnr)) throw new Error("Det finns redan en person med det personnumret.");
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    demo().employees.push({
      id,
      org_id: "demo",
      name: input.name,
      email: input.email,
      phone: input.phone,
      street: input.street,
      postal_code: input.postalCode,
      city: input.city,
      pnr: input.pnr,
      pnr_masked: input.pnr ? maskPnr(input.pnr) : "",
      birth_date: input.pnr ? pnrBirthDate(input.pnr) : null,
      bank_clearing: account ? input.bankClearing : "",
      bank_account: account,
      bank_account_masked: account ? `••••${account.slice(-4)}` : "",
      user_id: null,
      is_owner: input.isOwner,
      is_board_member: input.isBoardMember,
      agreement: input.agreement,
      emergency_contact: input.emergencyContact,
      notes: input.notes,
      ended_at: null,
      created_at: now,
      updated_at: now,
    });
    demoLog(id, "employee.created", { name: input.name });
    return id;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("hr_create_employee", {
    p_org: await currentOrgId(),
    p_employee: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      street: input.street,
      postalCode: input.postalCode,
      city: input.city,
      isOwner: input.isOwner,
      isBoardMember: input.isBoardMember,
      agreement: input.agreement,
      emergencyContact: input.emergencyContact,
      notes: input.notes,
    },
    p_pnr12: input.pnr,
    p_bank_clearing: input.bankClearing,
    p_bank_account: account,
  });
  if (error) fail("Kunde inte lägga till personen", error);
  return data as string;
}

export async function updateEmployeeContact(id: string, c: EmployeeContact): Promise<void> {
  const row = {
    name: c.name,
    email: c.email,
    phone: c.phone,
    street: c.street,
    postal_code: c.postalCode,
    city: c.city,
    is_owner: c.isOwner,
    is_board_member: c.isBoardMember,
    agreement: c.agreement,
    emergency_contact: c.emergencyContact,
    notes: c.notes,
  };
  if (isDemo()) {
    const r = demo().employees.find((e) => e.id === id);
    if (!r) throw new Error("Personen finns inte.");
    Object.assign(r, row, { updated_at: new Date().toISOString() });
    demoLog(id, "employee.updated");
    return;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("employees").update(row).eq("id", id).eq("org_id", await currentOrgId()).select("id");
  if (error) fail("Kunde inte spara personen", error);
  if (!data?.length) throw new Error("Kunde inte spara: personen finns inte eller du saknar behörighet.");
}

export async function setEmployeePnr(id: string, pnr12: string): Promise<void> {
  if (isDemo()) {
    const r = demo().employees.find((e) => e.id === id);
    if (!r) throw new Error("Personen finns inte.");
    if (demo().employees.some((e) => e.id !== id && e.pnr === pnr12)) throw new Error("Det finns redan en person med det personnumret.");
    Object.assign(r, { pnr: pnr12, pnr_masked: maskPnr(pnr12), birth_date: pnrBirthDate(pnr12) });
    demoLog(id, "employee.updated", { fields: ["pnr"] });
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("hr_employee_set_pnr", { p_employee: id, p_pnr12: pnr12 });
  if (error) fail("Kunde inte spara personnumret", error);
}

export async function setEmployeeBank(id: string, clearing: string, account: string): Promise<void> {
  const digits = account.replace(/\D/g, "");
  if (isDemo()) {
    const r = demo().employees.find((e) => e.id === id);
    if (!r) throw new Error("Personen finns inte.");
    Object.assign(r, { bank_clearing: digits ? clearing : "", bank_account: digits, bank_account_masked: digits ? `••••${digits.slice(-4)}` : "" });
    demoLog(id, "employee.updated", { fields: ["bank_account"] });
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("hr_employee_set_bank", { p_employee: id, p_clearing: clearing, p_account: digits });
  if (error) fail("Kunde inte spara kontot", error);
}

/** The personnummer in clear, for owner/admin; the database logs the reveal with the reason. */
export async function revealPnr(id: string, reason: string): Promise<string | null> {
  if (isDemo()) {
    const r = demo().employees.find((e) => e.id === id);
    if (!r) throw new Error("Personen finns inte.");
    if (r.pnr) demoLog(id, "employee.pnr_revealed", { reason });
    return r.pnr;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("hr_employee_pnr", { p_employee: id, p_reason: reason });
  if (error) fail("Kunde inte visa personnumret", error);
  return (data as string | null) ?? null;
}

/* ---------- employments ---------- */

/** Every version of every contract, for one person or the whole organisation, oldest first. */
export async function listEmployments(employeeId?: string): Promise<EmploymentVersion[]> {
  if (isDemo()) {
    return demo()
      .employments.filter((r) => !employeeId || r.employee_id === employeeId)
      .map(employmentFromRow)
      .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.version - b.version);
  }
  const supabase = await getDb();
  let q = supabase.from("employments").select("*");
  if (employeeId) q = q.eq("employee_id", employeeId);
  const org = await readOrgId();
  if (org) q = q.eq("org_id", org);
  const { data, error } = await q.order("starts_on").order("version").limit(5000);
  if (error) fail("Kunde inte hämta anställningarna", error);
  return (data as EmploymentRow[]).map(employmentFromRow);
}

/** A new contract (contractId null) or a new version of one; the database closes the previous version. */
export async function addEmploymentVersion(employeeId: string, input: EmploymentInput): Promise<string> {
  const row = employmentToRow(input);
  if (isDemo()) {
    const s = demo();
    const id = crypto.randomUUID();
    let version = 1;
    let contractId = id;
    if (input.contractId) {
      const prev = s.employments.find((r) => r.contract_id === input.contractId && r.valid_to === null);
      if (!prev || prev.employee_id !== employeeId) throw new Error("Anställningen finns inte eller är avslutad.");
      if (row.valid_from < prev.valid_from) throw new Error(`Den nya versionen kan gälla tidigast från ${prev.valid_from}.`);
      const d = new Date(`${row.valid_from}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      prev.valid_to = d.toISOString().slice(0, 10);
      version = prev.version + 1;
      contractId = input.contractId;
    }
    s.employments.push({
      ...row,
      id,
      employee_id: employeeId,
      contract_id: contractId,
      version,
      valid_to: null,
      document_id: null,
      created_at: new Date().toISOString(),
    });
    demoLog(employeeId, version === 1 ? "employment.created" : "employment.versioned", { form: row.form, version, validFrom: row.valid_from });
    return id;
  }
  const supabase = await getDb();
  const { data, error } = await supabase
    .from("employments")
    .insert({ ...row, org_id: await currentOrgId(), employee_id: employeeId })
    .select("id")
    .single();
  if (error) fail("Kunde inte spara anställningen", error);
  return data.id as string;
}

/* ---------- tax ---------- */

export async function listTaxVersions(employeeId?: string): Promise<TaxVersion[]> {
  if (isDemo()) return demo().tax.filter((r) => !employeeId || r.employee_id === employeeId).map(taxFromRow).sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  const supabase = await getDb();
  let q = supabase.from("employee_tax").select("*");
  if (employeeId) q = q.eq("employee_id", employeeId);
  const org = await readOrgId();
  if (org) q = q.eq("org_id", org);
  const { data, error } = await q.order("valid_from", { ascending: false }).order("created_at", { ascending: false }).limit(5000);
  if (error) fail("Kunde inte hämta skatteuppgifterna", error);
  return (data as TaxRow[]).map(taxFromRow);
}

export async function addTaxVersion(employeeId: string, t: TaxInput): Promise<void> {
  const row = {
    kind: t.kind,
    table_no: t.tableNo,
    column_no: t.columnNo,
    adjustment_percent: t.adjustmentPercent,
    adjustment_monthly_change_ore: t.adjustmentMonthlyChangeOre,
    adjustment_valid_to: t.adjustmentValidTo,
    main_employer: t.mainEmployer,
    source: t.source,
    valid_from: t.validFrom,
    note: t.note,
  };
  if (isDemo()) {
    demo().tax.push({ ...row, id: crypto.randomUUID(), employee_id: employeeId, created_at: new Date().toISOString() });
    demoLog(employeeId, "employee_tax.versioned", { kind: t.kind, validFrom: t.validFrom });
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.from("employee_tax").insert({ ...row, org_id: await currentOrgId(), employee_id: employeeId });
  if (error) fail("Kunde inte spara skatteuppgifterna", error);
}

/* ---------- documents ---------- */

export async function listDocuments(employeeId?: string): Promise<EmploymentDocument[]> {
  if (isDemo()) return demo().documents.filter((r) => !employeeId || r.employee_id === employeeId).map(documentFromRow).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const supabase = await getDb();
  let q = supabase.from("employment_documents").select("*");
  if (employeeId) q = q.eq("employee_id", employeeId);
  const org = await readOrgId();
  if (org) q = q.eq("org_id", org);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(5000);
  if (error) fail("Kunde inte hämta avtalen", error);
  return (data as DocumentRow[]).map(documentFromRow);
}

export async function getDocument(id: string): Promise<EmploymentDocument | null> {
  if (isDemo()) {
    const r = demo().documents.find((d) => d.id === id);
    return r ? documentFromRow(r) : null;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("employment_documents").select("*").eq("id", id).maybeSingle();
  if (error) fail("Kunde inte hämta avtalet", error);
  return data ? documentFromRow(data as DocumentRow) : null;
}

/**
 * Freezes a generated contract: the PDF goes to the private bucket under
 * {org}/{person}/{document}.pdf (never overwritten), the row records its
 * SHA-256, template and version.
 */
export async function storeDocument(input: {
  employeeId: string;
  employmentId: string;
  title: string;
  template: string;
  templateVersion: string;
  pdf: Buffer;
}): Promise<string> {
  const id = crypto.randomUUID();
  const sha256 = createHash("sha256").update(input.pdf).digest("hex");
  const org = await currentOrgId();
  const key = `${org}/${input.employeeId}/${id}.pdf`;
  const row = {
    id,
    employee_id: input.employeeId,
    employment_id: input.employmentId,
    kind: "contract" as const,
    title: input.title,
    template: input.template,
    template_version: input.templateVersion,
    storage_path: key,
    sha256,
    size_bytes: input.pdf.length,
  };
  if (isDemo()) {
    const target = demoFile(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, input.pdf, { flag: "wx" });
    demo().documents.push({ ...row, signed_at: null, created_at: new Date().toISOString() });
    demoLog(input.employeeId, "employment_document.created", { documentId: id, template: input.template, sha256 });
    return id;
  }
  const supabase = await getDb();
  // The row first: if it is refused, no PDF with a personnummer is left in
  // the bucket without a row (there is no delete policy). If the upload then
  // fails, the row says so (readDocumentFile refuses it) and a new contract
  // can be made.
  const { error } = await supabase.from("employment_documents").insert({ ...row, org_id: org });
  if (error) fail("Kunde inte spara avtalet", error);
  const up = await supabase.storage.from(HR_BUCKET).upload(key, input.pdf, { contentType: "application/pdf", cacheControl: "60", upsert: false });
  if (up.error) throw new Error(`Avtalet registrerades men PDF:en kunde inte sparas (${up.error.message}). Skapa avtalet igen.`);
  return id;
}

/** The frozen PDF's bytes, checked against the hash recorded when it was made. */
export async function readDocumentFile(doc: EmploymentDocument): Promise<Buffer> {
  let bytes: Buffer;
  if (isDemo()) {
    bytes = await fs.readFile(demoFile(doc.storagePath));
  } else {
    const supabase = await getDb();
    const { data, error } = await supabase.storage.from(HR_BUCKET).download(doc.storagePath);
    if (error || !data) throw new Error(`Kunde inte hämta PDF:en: ${error?.message ?? "saknas"}`);
    bytes = Buffer.from(await data.arrayBuffer());
  }
  if (createHash("sha256").update(bytes).digest("hex") !== doc.sha256) throw new Error("PDF:en stämmer inte med den som frystes. Den visas inte.");
  return bytes;
}

export async function signDocument(id: string, signedOn: string): Promise<void> {
  if (isDemo()) {
    const d = demo().documents.find((x) => x.id === id);
    if (!d) throw new Error("Avtalet finns inte.");
    if (d.signed_at) throw new Error("Avtalet är redan markerat som signerat.");
    const version = demo().employments.find((x) => x.id === d.employment_id);
    const start = demo().employments.filter((x) => x.contract_id === version?.contract_id).reduce((m, x) => (x.starts_on < m ? x.starts_on : m), version?.starts_on ?? signedOn);
    if (signedOn < start) throw new Error(`Signeringsdatumet ska vara mellan anställningens start (${start}) och i dag.`);
    d.signed_at = signedOn;
    const e = demo().employments.find((x) => x.id === d.employment_id);
    if (e) e.document_id = id;
    demoLog(d.employee_id, "employment_document.signed", { documentId: id, signedAt: signedOn });
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("hr_sign_document", { p_document: id, p_signed_on: signedOn });
  if (error) fail("Kunde inte markera avtalet", error);
}

/* ---------- clocks and history ---------- */

/** The LAS clocks on `asOf`, counted by the database (the reference in demo mode): everyone, or one person. */
export async function loadClocks(asOf: string, employeeId?: string): Promise<Map<string, EmployeeClockRow>> {
  if (isDemo()) {
    const rules = payrollRulesAt(asOf);
    const all = await listEmployments(employeeId);
    return new Map(
      demo()
        .employees.filter((e) => !employeeId || e.id === employeeId)
        .map((e) => [e.id, { employee_id: e.id, ...clocksForVersions(all.filter((v) => v.employeeId === e.id), asOf, rules) }])
    );
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("employment_clocks", { p_org: await currentOrgId(), p_as_of: asOf, p_employee: employeeId ?? null });
  if (error) fail("Kunde inte räkna LAS-klockorna", error);
  return new Map((data as EmployeeClockRow[]).map((r) => [r.employee_id, r]));
}

/** A person's history from the event log, newest first. */
export async function listEmployeeEvents(employeeId: string, limit = 50): Promise<CoreEvent[]> {
  if (isDemo()) return demo().events.filter((e) => e.aggregateId === employeeId).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  const supabase = await getDb();
  const { data, error } = await supabase
    .from("events")
    .select("org_id, aggregate_type, aggregate_id, type, data, actor, created_at")
    .eq("aggregate_type", "employee")
    .eq("aggregate_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("Kunde inte hämta historiken", error);
  return (data ?? []).map((r) => ({
    orgId: r.org_id as string,
    aggregateType: "employee",
    aggregateId: r.aggregate_id as string,
    type: r.type as EventType,
    data: (r.data ?? {}) as CoreEvent["data"],
    actor: r.actor as Actor,
    at: r.created_at as string,
  }));
}
