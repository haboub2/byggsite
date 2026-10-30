import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getDb } from "../db";
import { isDemo } from "../../leads";
import { currentOrgId, readOrgId } from "../org/current";
import { HR_BUCKET } from "../hr/store";
import type { IsoDate } from "../rules/index";
import type { HousingRegion } from "../rules/benefits";
import { benefitMonth, type Benefit, type BenefitKind, type CarFuel, type MealsPerMonth } from "./benefits";
import { computeClaim, type ApprovedClaim, type CarType, type ClaimInput, type ClaimResult, type ExpenseKind, type ExpensePolicy, type LongStay, type MealsOnDay } from "./expenses";
import { getPayrollSettings } from "./run-store";
import type { PayslipDocument } from "./payslip";

/**
 * Förmåner, utlägg and the owners' planner snapshots
 * (supabase/migrations/0042_benefits_expenses.sql), read and written with
 * the caller's session so RLS decides: payroll readers read everything, an
 * employee their own benefits and claims and writes their own drafts,
 * owner and admin write benefits and approve claims. The amounts are
 * computed here (benefits.ts, expenses.ts) and the database checks them.
 *
 * Receipts lie in bucket hr under {org}/{person}/kvitto-{claim}-{n}.{ext}
 * with their SHA-256 on the claim; the claim lists a receipt before it is
 * uploaded (the bucket takes only a listed file); a failed upload takes
 * the entry off again, submit and approval refuse a listed receipt without
 * a file, and a file whose hash differs is never served. Demo mode keeps everything in memory and the
 * files under uploads/hr/; approving a run marks its claims paid there as
 * the database's trigger does.
 */

export type ClaimStatus = "draft" | "submitted" | "approved" | "rejected" | "paid";
export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = { draft: "Utkast", submitted: "Inskickat", approved: "Godkänt", rejected: "Avslaget", paid: "Betalt" };

export type Receipt = { path: string; sha256: string; size: number; contentType: string; name: string };

export type ExpenseClaim = {
  id: string;
  employeeId: string;
  kind: ExpenseKind;
  dateFrom: IsoDate;
  dateTo: IsoDate;
  description: string;
  amountOre: number | null;
  vatOre: number;
  distanceKm: number | null;
  carType: CarType | null;
  destination: string;
  departureTime: string | null;
  returnTime: string | null;
  nights: number;
  nightsWithoutLodging: number;
  meals: Record<IsoDate, MealsOnDay>;
  longStay: LongStay;
  farFromHome: boolean;
  taxFreeOre: number;
  taxableOre: number;
  computation: Record<string, unknown>;
  ruleVersion: string | null;
  receipts: Receipt[];
  status: ClaimStatus;
  submittedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  payslipId: string | null;
  paidAt: string | null;
  note: string;
  createdAt: string;
};

export type StoredBenefit = Benefit & { monthlyValueOre: number; ruleVersion: string; computation: Record<string, unknown>; createdAt: string };

export type PlannerSnapshot = { id: string; employeeId: string; year: number; inputs: Record<string, unknown>; result: Record<string, unknown>; ruleVersion: string; createdAt: string };

/* ---------- rows ---------- */

type ClaimRow = {
  id: string;
  org_id?: string;
  employee_id: string;
  kind: ExpenseKind;
  date_from: string;
  date_to: string;
  description: string;
  amount_ore: number | null;
  vat_ore: number;
  distance_km: number | string | null;
  car_type: CarType | null;
  destination: string;
  departure_time: string | null;
  return_time: string | null;
  nights: number;
  nights_without_lodging: number;
  meals: Record<IsoDate, MealsOnDay>;
  long_stay: LongStay;
  far_from_home: boolean;
  tax_free_ore: number;
  taxable_ore: number;
  computation: Record<string, unknown>;
  rule_version: string | null;
  receipts: Receipt[];
  status: ClaimStatus;
  submitted_at: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  payslip_id: string | null;
  paid_at: string | null;
  note: string;
  created_at: string;
};
const CLAIM_COLUMNS =
  "id, employee_id, kind, date_from, date_to, description, amount_ore, vat_ore, distance_km, car_type, destination, departure_time, return_time, nights, nights_without_lodging, meals, long_stay, far_from_home, tax_free_ore, taxable_ore, computation, rule_version, receipts, status, submitted_at, approved_by_name, approved_at, rejected_reason, payslip_id, paid_at, note, created_at";
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
const claimFromRow = (r: ClaimRow): ExpenseClaim => ({
  id: r.id,
  employeeId: r.employee_id,
  kind: r.kind,
  dateFrom: r.date_from,
  dateTo: r.date_to,
  description: r.description,
  amountOre: r.amount_ore === null ? null : Number(r.amount_ore),
  vatOre: Number(r.vat_ore),
  distanceKm: r.distance_km === null ? null : Number(r.distance_km),
  carType: r.car_type,
  destination: r.destination,
  departureTime: hhmm(r.departure_time),
  returnTime: hhmm(r.return_time),
  nights: r.nights,
  nightsWithoutLodging: r.nights_without_lodging,
  meals: r.meals ?? {},
  longStay: r.long_stay,
  farFromHome: r.far_from_home,
  taxFreeOre: Number(r.tax_free_ore),
  taxableOre: Number(r.taxable_ore),
  computation: r.computation ?? {},
  ruleVersion: r.rule_version,
  receipts: r.receipts ?? [],
  status: r.status,
  submittedAt: r.submitted_at,
  approvedByName: r.approved_by_name,
  approvedAt: r.approved_at,
  rejectedReason: r.rejected_reason,
  payslipId: r.payslip_id,
  paidAt: r.paid_at,
  note: r.note,
  createdAt: r.created_at,
});

type BenefitRow = {
  id: string;
  employee_id: string;
  kind: BenefitKind;
  description: string;
  valid_from: string;
  valid_to: string | null;
  registration_number: string | null;
  car_model: string;
  first_registered_on: string | null;
  model_year: number | null;
  fuel: CarFuel | null;
  new_car_price_ore: number | null;
  extra_equipment_ore: number;
  vehicle_tax_ore: number;
  business_mil_per_year: number;
  fuel_paid_by_employer: boolean;
  private_fuel_ore: number;
  fuel_employee_payment_ore: number;
  meals: MealsPerMonth;
  housing_area_m2: number | string | null;
  housing_region: HousingRegion | null;
  market_value_ore: number;
  employee_payment_ore: number;
  monthly_value_ore: number;
  rule_version: string;
  computation: Record<string, unknown>;
  created_at: string;
};
const BENEFIT_COLUMNS =
  "id, employee_id, kind, description, valid_from, valid_to, registration_number, car_model, first_registered_on, model_year, fuel, new_car_price_ore, extra_equipment_ore, vehicle_tax_ore, business_mil_per_year, fuel_paid_by_employer, private_fuel_ore, fuel_employee_payment_ore, meals, housing_area_m2, housing_region, market_value_ore, employee_payment_ore, monthly_value_ore, rule_version, computation, created_at";
const benefitFromRow = (r: BenefitRow): StoredBenefit => ({
  id: r.id,
  employeeId: r.employee_id,
  kind: r.kind,
  description: r.description,
  validFrom: r.valid_from,
  validTo: r.valid_to,
  car:
    r.kind === "bil" && r.registration_number && r.first_registered_on && r.fuel && r.model_year !== null
      ? {
          registrationNumber: r.registration_number,
          model: r.car_model,
          firstRegisteredOn: r.first_registered_on,
          modelYear: r.model_year,
          fuel: r.fuel,
          newCarPriceOre: Number(r.new_car_price_ore ?? 0),
          extraEquipmentOre: Number(r.extra_equipment_ore),
          vehicleTaxOre: Number(r.vehicle_tax_ore),
          businessMilPerYear: r.business_mil_per_year,
          fuelPaidByEmployer: r.fuel_paid_by_employer,
          privateFuelOre: Number(r.private_fuel_ore ?? 0),
          fuelEmployeePaymentOre: Number(r.fuel_employee_payment_ore ?? 0),
        }
      : null,
  meals: r.meals ?? {},
  housing: r.housing_area_m2 !== null && r.housing_region ? { areaM2: Number(r.housing_area_m2), region: r.housing_region } : null,
  marketValueOre: Number(r.market_value_ore),
  employeePaymentOre: Number(r.employee_payment_ore),
  monthlyValueOre: Number(r.monthly_value_ore),
  ruleVersion: r.rule_version,
  computation: r.computation ?? {},
  createdAt: r.created_at,
});
const benefitToRow = (b: Benefit, value: { monthlyValueOre: number; ruleVersion: string; computation: Record<string, unknown> }) => ({
  employee_id: b.employeeId,
  kind: b.kind,
  description: b.description,
  valid_from: b.validFrom,
  valid_to: b.validTo,
  registration_number: b.car?.registrationNumber ?? null,
  car_model: b.car?.model ?? "",
  first_registered_on: b.car?.firstRegisteredOn ?? null,
  model_year: b.car?.modelYear ?? null,
  fuel: b.car?.fuel ?? null,
  new_car_price_ore: b.car?.newCarPriceOre ?? null,
  extra_equipment_ore: b.car?.extraEquipmentOre ?? 0,
  vehicle_tax_ore: b.car?.vehicleTaxOre ?? 0,
  business_mil_per_year: b.car?.businessMilPerYear ?? 0,
  fuel_paid_by_employer: b.car?.fuelPaidByEmployer ?? false,
  private_fuel_ore: b.car?.privateFuelOre ?? 0,
  fuel_employee_payment_ore: b.car?.fuelEmployeePaymentOre ?? 0,
  meals: b.meals,
  housing_area_m2: b.housing?.areaM2 ?? null,
  housing_region: b.housing?.region ?? null,
  market_value_ore: b.marketValueOre,
  employee_payment_ore: b.employeePaymentOre,
  monthly_value_ore: value.monthlyValueOre,
  rule_version: value.ruleVersion,
  computation: value.computation,
});

function fail(prefix: string, error: { message: string; code?: string }): never {
  const own = ["42501", "22023", "23505", "23514", "0A000", "P0001"].includes(error.code ?? "");
  if (error.code === "42501" && /row-level security|permission denied/.test(error.message)) throw new Error("Du saknar behörighet för det.");
  throw new Error(own ? error.message : `${prefix}: ${error.message}`);
}

/* ---------- demo ---------- */

type DemoBenefits = { benefits: BenefitRow[]; claims: ClaimRow[]; snapshots: PlannerSnapshot[] };
const g = globalThis as unknown as { __binaafyBenefits?: DemoBenefits };
const demo = (): DemoBenefits => (g.__binaafyBenefits ??= { benefits: [], claims: [], snapshots: [] });
const demoFile = (key: string) => path.join(process.cwd(), "uploads", "hr", ...key.split("/"));
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/**
 * Demo mode's pay_runs trigger: a run's approval marks the claims its
 * payslips carry as paid; a claim that is not approved and unpaid stops the
 * approval as the database does.
 */
export function demoPayClaims(slips: readonly { id: string; employeeId: string; document: PayslipDocument }[], final: boolean): void {
  for (const s of slips) {
    const ids = new Set(s.document.lines.filter((l) => l.source?.kind === "expense_claim").map((l) => l.source!.id));
    for (const id of ids) {
      const c = demo().claims.find((x) => x.id === id);
      if (!c || c.employee_id !== s.employeeId || c.status !== "approved" || c.payslip_id) throw new Error(`Utlägget ${id} för ${s.document.employeeName} är inte godkänt eller redan betalt; räkna om.`);
      if (final) Object.assign(c, { status: "paid", payslip_id: s.id, paid_at: new Date().toISOString() });
    }
  }
}

/** What demo mode's run fingerprint takes from here (as payroll_inputs_hash in 0042). */
export function demoBenefitInputs(): unknown {
  return [demo().claims.filter((c) => c.status === "approved").map((c) => [c.id, c.tax_free_ore, c.taxable_ore]), demo().benefits.map((b) => [b.id, b.valid_from, b.valid_to, b.monthly_value_ore, b.private_fuel_ore, b.fuel_employee_payment_ore])];
}

/* ---------- benefits ---------- */

export async function listBenefits(employeeId?: string): Promise<StoredBenefit[]> {
  if (isDemo()) return demo().benefits.filter((b) => !employeeId || b.employee_id === employeeId).map(benefitFromRow).sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  const supabase = await getDb();
  let q = supabase.from("benefits").select(BENEFIT_COLUMNS);
  if (employeeId) q = q.eq("employee_id", employeeId);
  const org = await readOrgId();
  if (org) q = q.eq("org_id", org);
  const { data, error } = await q.order("valid_from", { ascending: false }).limit(1000);
  if (error) fail("Kunde inte hämta förmånerna", error);
  return (data as unknown as BenefitRow[]).map(benefitFromRow);
}

/** The value the screens show: the month of `asOf` (or the start), under that date's rules. */
export function previewBenefit(b: Benefit, asOf: IsoDate) {
  const date = asOf < b.validFrom ? b.validFrom : asOf;
  return benefitMonth(b, date);
}

export async function saveBenefit(b: Benefit, today: IsoDate): Promise<string> {
  const m = previewBenefit(b, today);
  const row = benefitToRow(b, { monthlyValueOre: m.valueOre, ruleVersion: m.ruleVersion, computation: m.computation });
  if (isDemo()) {
    const id = crypto.randomUUID();
    demo().benefits.push({ ...row, id, created_at: new Date().toISOString() } as BenefitRow);
    return id;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("benefits").insert({ ...row, org_id: await currentOrgId() }).select("id").single();
  if (error) fail("Kunde inte spara förmånen", error);
  return (data as { id: string }).id;
}

/** Sets the last day; the database refuses a day before the last paid month. */
export async function endBenefit(id: string, validTo: IsoDate): Promise<void> {
  if (isDemo()) {
    const b = demo().benefits.find((x) => x.id === id);
    if (!b) throw new Error("Förmånen finns inte.");
    if (validTo < b.valid_from) throw new Error("Slutdatumet ligger före startdatumet.");
    b.valid_to = validTo;
    return;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("benefits").update({ valid_to: validTo }).eq("id", id).select("id");
  if (error) fail("Kunde inte avsluta förmånen", error);
  if (!data?.length) throw new Error("Förmånen finns inte, eller du saknar behörighet.");
}

export async function deleteBenefit(id: string): Promise<void> {
  if (isDemo()) {
    demo().benefits = demo().benefits.filter((x) => x.id !== id);
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.from("benefits").delete().eq("id", id);
  if (error) fail("Kunde inte ta bort förmånen", error);
}

/* ---------- expense claims ---------- */

export async function listClaims(q: { employeeId?: string; status?: ClaimStatus } = {}): Promise<ExpenseClaim[]> {
  if (isDemo())
    return demo()
      .claims.filter((c) => (!q.employeeId || c.employee_id === q.employeeId) && (!q.status || c.status === q.status))
      .map(claimFromRow)
      .sort((a, b) => b.dateFrom.localeCompare(a.dateFrom) || b.createdAt.localeCompare(a.createdAt));
  const supabase = await getDb();
  let sel = supabase.from("expense_claims").select(CLAIM_COLUMNS);
  if (q.employeeId) sel = sel.eq("employee_id", q.employeeId);
  if (q.status) sel = sel.eq("status", q.status);
  const org = await readOrgId();
  if (org) sel = sel.eq("org_id", org);
  const { data, error } = await sel.order("date_from", { ascending: false }).limit(1000);
  if (error) fail("Kunde inte hämta utläggen", error);
  return (data as unknown as ClaimRow[]).map(claimFromRow);
}

export async function getClaim(id: string): Promise<ExpenseClaim | null> {
  if (isDemo()) {
    const r = demo().claims.find((c) => c.id === id);
    return r ? claimFromRow(r) : null;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("expense_claims").select(CLAIM_COLUMNS).eq("id", id).maybeSingle();
  if (error) fail("Kunde inte hämta utlägget", error);
  return data ? claimFromRow(data as unknown as ClaimRow) : null;
}

/** The claim's inputs as the calculator takes them. */
export function claimInput(c: Pick<ExpenseClaim, "kind" | "dateFrom" | "dateTo" | "amountOre" | "vatOre" | "distanceKm" | "carType" | "departureTime" | "returnTime" | "nightsWithoutLodging" | "meals" | "longStay" | "farFromHome">): ClaimInput {
  if (c.kind === "utlagg") return { kind: "utlagg", dateFrom: c.dateFrom, dateTo: c.dateTo, amountOre: c.amountOre ?? 0, vatOre: c.vatOre };
  if (c.kind === "milersattning") return { kind: "milersattning", dateFrom: c.dateFrom, dateTo: c.dateTo, distanceKm: c.distanceKm ?? 0, carType: c.carType ?? "egen" };
  return {
    kind: "traktamente",
    dateFrom: c.dateFrom,
    dateTo: c.dateTo,
    departureTime: c.departureTime ?? "08:00",
    returnTime: c.returnTime ?? "17:00",
    nightsWithoutLodging: c.nightsWithoutLodging,
    meals: c.meals,
    longStay: c.longStay,
    farFromHome: c.farFromHome,
  };
}

export const expensePolicy = async (): Promise<ExpensePolicy> => (await getPayrollSettings()).settings.expenses;

export type ClaimDraft = Omit<ExpenseClaim, "id" | "employeeId" | "taxFreeOre" | "taxableOre" | "computation" | "ruleVersion" | "receipts" | "status" | "submittedAt" | "approvedByName" | "approvedAt" | "rejectedReason" | "payslipId" | "paidAt" | "createdAt">;

/** A new draft with the amounts as they would be paid today (the approval computes them again). */
export async function createClaim(employeeId: string, d: ClaimDraft): Promise<{ id: string; result: ClaimResult }> {
  const result = computeClaim(claimInput(d), await expensePolicy());
  const id = crypto.randomUUID();
  const row = {
    id,
    employee_id: employeeId,
    kind: d.kind,
    date_from: d.dateFrom,
    date_to: d.dateTo,
    description: d.description,
    amount_ore: d.amountOre,
    vat_ore: d.vatOre,
    distance_km: d.distanceKm,
    car_type: d.carType,
    destination: d.destination,
    departure_time: d.departureTime,
    return_time: d.returnTime,
    nights: d.nights,
    nights_without_lodging: d.nightsWithoutLodging,
    meals: d.meals,
    long_stay: d.longStay,
    far_from_home: d.farFromHome,
    tax_free_ore: result.taxFreeOre,
    taxable_ore: result.taxableOre,
    computation: result.computation,
    rule_version: result.ruleVersion,
    note: d.note,
  };
  if (isDemo()) {
    demo().claims.push({ ...row, receipts: [], status: "draft", submitted_at: null, approved_by_name: null, approved_at: null, rejected_reason: null, payslip_id: null, paid_at: null, created_at: new Date().toISOString() });
    return { id, result };
  }
  const supabase = await getDb();
  const { error } = await supabase.from("expense_claims").insert({ ...row, org_id: await currentOrgId() });
  if (error) fail("Kunde inte spara utlägget", error);
  return { id, result };
}

export async function deleteClaim(id: string): Promise<void> {
  if (isDemo()) {
    const c = demo().claims.find((x) => x.id === id);
    if (!c || (c.status !== "draft" && c.status !== "submitted")) throw new Error("Bara ett utkast eller ett inskickat utlägg kan tas bort.");
    demo().claims = demo().claims.filter((x) => x.id !== id);
    return;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("expense_claims").delete().eq("id", id).select("id");
  if (error) fail("Kunde inte ta bort utlägget", error);
  if (!data?.length) throw new Error("Utlägget kan inte tas bort (bara utkast, och inskickade av en administratör).");
}

const RECEIPT_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" };
export const RECEIPT_ACCEPT = Object.keys(RECEIPT_TYPES).join(",");
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

/** Freezes a receipt: listed on the claim with its SHA-256 first, then uploaded (never overwritten). */
export async function addReceipt(claimId: string, file: { bytes: Buffer; contentType: string; name: string }): Promise<void> {
  const ext = RECEIPT_TYPES[file.contentType];
  if (!ext) throw new Error("Kvittot ska vara en bild (JPG, PNG, WebP, HEIC) eller en PDF.");
  if (!file.bytes.length || file.bytes.length > RECEIPT_MAX_BYTES) throw new Error("Kvittot får vara högst 10 MB.");
  const claim = await getClaim(claimId);
  if (!claim) throw new Error("Utlägget finns inte.");
  if (claim.status !== "draft" && claim.status !== "submitted") throw new Error("Kvitton läggs till innan utlägget är godkänt.");
  const org = isDemo() ? "demo" : await currentOrgId();
  const n = claim.receipts.length + 1;
  const key = `${org}/${claim.employeeId}/kvitto-${claim.id}-${n}.${ext}`;
  const hash = sha256(file.bytes);
  const name = file.name.slice(0, 120);
  if (isDemo()) {
    const target = demoFile(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.bytes, { flag: "wx" });
    demo().claims.find((c) => c.id === claimId)!.receipts.push({ path: key, sha256: hash, size: file.bytes.length, contentType: file.contentType, name });
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("expense_add_receipt", { p_id: claimId, p_path: key, p_sha256: hash, p_size: file.bytes.length, p_content_type: file.contentType, p_name: name });
  if (error) fail("Kunde inte registrera kvittot", error);
  const up = await supabase.storage.from(HR_BUCKET).upload(key, file.bytes, { contentType: file.contentType, cacheControl: "60", upsert: false });
  if (up.error) {
    // The listed receipt has no file behind it: take it off the claim (the database allows that only while no object exists).
    const { error: removeError } = await supabase.rpc("expense_remove_receipt", { p_id: claimId, p_path: key });
    throw new Error(`Kvittot kunde inte sparas (${up.error.message})${removeError ? "; ta bort det och lägg till det igen" : ""}. Försök igen.`);
  }
}

/** A receipt's bytes, checked against the hash recorded when it was added. */
export async function readReceipt(claim: ExpenseClaim, index: number): Promise<{ bytes: Buffer; receipt: Receipt }> {
  const receipt = claim.receipts[index];
  if (!receipt) throw new Error("Kvittot finns inte.");
  let bytes: Buffer;
  if (isDemo()) bytes = await fs.readFile(demoFile(receipt.path));
  else {
    const supabase = await getDb();
    const { data, error } = await supabase.storage.from(HR_BUCKET).download(receipt.path);
    if (error || !data) throw new Error(`Kunde inte hämta kvittot: ${error?.message ?? "saknas"}`);
    bytes = Buffer.from(await data.arrayBuffer());
  }
  if (sha256(bytes) !== receipt.sha256) throw new Error("Kvittot stämmer inte med det som frystes. Det visas inte.");
  return { bytes, receipt };
}

export async function submitClaim(id: string): Promise<void> {
  if (isDemo()) {
    const c = demo().claims.find((x) => x.id === id);
    if (!c || c.status !== "draft") throw new Error("Bara ett utkast kan skickas in.");
    if (c.kind === "utlagg" && !c.receipts.length) throw new Error("Ett utlägg behöver ett kvitto; fotografera det och lägg till det.");
    if (c.tax_free_ore + c.taxable_ore <= 0) throw new Error("Utlägget har inget belopp.");
    Object.assign(c, { status: "submitted", submitted_at: new Date().toISOString() });
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("expense_submit", { p_id: id });
  if (error) fail("Kunde inte skicka in utlägget", error);
}

/** Approves with the amounts computed now from the rule book and the organisation's policy. */
export async function approveClaim(id: string): Promise<ClaimResult> {
  const claim = await getClaim(id);
  if (!claim) throw new Error("Utlägget finns inte.");
  const result = computeClaim(claimInput(claim), await expensePolicy());
  if (isDemo()) {
    const c = demo().claims.find((x) => x.id === id)!;
    if (c.status !== "submitted") throw new Error(`Bara ett inskickat utlägg kan godkännas (det är ${CLAIM_STATUS_LABEL[c.status].toLowerCase()}).`);
    Object.assign(c, { status: "approved", tax_free_ore: result.taxFreeOre, taxable_ore: result.taxableOre, computation: result.computation, rule_version: result.ruleVersion, approved_by_name: "demo@localhost", approved_at: new Date().toISOString() });
    return result;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("expense_approve", { p_id: id, p_tax_free: result.taxFreeOre, p_taxable: result.taxableOre, p_computation: result.computation, p_rule_version: result.ruleVersion });
  if (error) fail("Kunde inte godkänna utlägget", error);
  return result;
}

export async function rejectClaim(id: string, reason: string): Promise<void> {
  if (isDemo()) {
    const c = demo().claims.find((x) => x.id === id);
    if (!c || c.status !== "submitted") throw new Error("Bara ett inskickat utlägg kan avslås.");
    if (!reason.trim()) throw new Error("Skriv varför utlägget avslås.");
    Object.assign(c, { status: "rejected", rejected_reason: reason.trim() });
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("expense_reject", { p_id: id, p_reason: reason });
  if (error) fail("Kunde inte avslå utlägget", error);
}

/** The approved, unpaid claims the next run pays. */
export async function approvedUnpaidClaims(): Promise<(ApprovedClaim & { employeeId: string })[]> {
  return (await listClaims({ status: "approved" })).map((c) => ({ id: c.id, employeeId: c.employeeId, kind: c.kind, dateFrom: c.dateFrom, dateTo: c.dateTo, description: c.description || c.destination, taxFreeOre: c.taxFreeOre, taxableOre: c.taxableOre, computation: c.computation }));
}

/* ---------- the planner ---------- */

export async function listPlannerSnapshots(employeeId?: string): Promise<PlannerSnapshot[]> {
  if (isDemo()) return demo().snapshots.filter((s) => !employeeId || s.employeeId === employeeId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const supabase = await getDb();
  let q = supabase.from("owner_planner_snapshots").select("id, employee_id, year, inputs, result, rule_version, created_at");
  if (employeeId) q = q.eq("employee_id", employeeId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
  if (error) fail("Kunde inte hämta planeringarna", error);
  return (data as { id: string; employee_id: string; year: number; inputs: Record<string, unknown>; result: Record<string, unknown>; rule_version: string; created_at: string }[]).map((r) => ({
    id: r.id,
    employeeId: r.employee_id,
    year: r.year,
    inputs: r.inputs,
    result: r.result,
    ruleVersion: r.rule_version,
    createdAt: r.created_at,
  }));
}

export async function savePlannerSnapshot(s: Omit<PlannerSnapshot, "id" | "createdAt">): Promise<void> {
  if (isDemo()) {
    demo().snapshots.push({ ...s, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.from("owner_planner_snapshots").insert({ org_id: await currentOrgId(), employee_id: s.employeeId, year: s.year, inputs: s.inputs, result: s.result, rule_version: s.ruleVersion });
  if (error) fail("Kunde inte spara planeringen", error);
}
