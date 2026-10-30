"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { todayIso } from "@/lib/quotes/schema";
import { payrollRulesAt } from "@/lib/core/rules/payroll";
import {
  employeeContactSchema,
  employeeInputSchema,
  employmentInputSchema,
  formatPnr,
  normalizePnr,
  signInputSchema,
  taxInputSchema,
} from "@/lib/core/hr/schema";
import {
  addEmploymentVersion,
  addTaxVersion,
  createEmployee,
  getEmployee,
  listEmployments,
  loadClocks,
  revealPnr,
  setEmployeeBank,
  setEmployeePnr,
  signDocument,
  storeDocument,
  updateEmployeeContact,
} from "@/lib/core/hr/store";
import { clocksForVersions } from "@/lib/core/hr/clocks";
import { contractEmployer, renderContractPdf } from "@/lib/pdf/render-contract";
import type { ContentActionState } from "./content-actions";
import type { ZodError } from "zod";

/**
 * Personal (docs/hr-lon.md, phase 1). Every action checks for itself:
 * people, contracts and tax data are written by owner and admin (the
 * database's can_payroll_approve); the accountant reads the pages but every
 * action here refuses them. RLS and the database's functions check again.
 */

const LIST = "/admin/personal";
const NO_ACCESS = "Bara ägare och administratörer ändrar personal och avtal.";

function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}

function payload(formData: FormData): unknown {
  try {
    return JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return undefined;
  }
}

const isRedirect = (err: unknown) => Boolean(err && typeof err === "object" && "digest" in err);
const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
const id = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

/** A new person: contact details, personnummer and bank account, encrypted by the database. */
export async function createEmployeeAction(_prev: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const check = await requireRole("admin");
  if (!check.ok) return { error: NO_ACCESS };
  const parsed = employeeInputSchema(todayIso()).safeParse(payload(formData));
  if (!parsed.success) return { error: "Några fält behöver rättas innan personen kan sparas.", fieldErrors: fieldErrors(parsed.error) };
  try {
    const newId = await createEmployee(parsed.data);
    revalidatePath(LIST, "layout");
    redirect(`${LIST}/${newId}?skapad=1`);
  } catch (err) {
    if (isRedirect(err)) throw err;
    return { error: message(err, "Kunde inte lägga till personen.") };
  }
}

export async function saveEmployeeContactAction(_prev: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const check = await requireRole("admin");
  if (!check.ok) return { error: NO_ACCESS };
  const employeeId = id(formData, "id");
  const parsed = employeeContactSchema.safeParse(payload(formData));
  if (!parsed.success) return { error: "Några fält behöver rättas.", fieldErrors: fieldErrors(parsed.error) };
  try {
    await updateEmployeeContact(employeeId, parsed.data);
  } catch (err) {
    return { error: message(err, "Kunde inte spara.") };
  }
  revalidatePath(`${LIST}/${employeeId}`);
  return { ok: true, savedAt: new Date().toISOString() };
}

/** Change the personnummer (or add it) and the bank account; empty fields leave them as they are. */
export async function saveEmployeeSecretsAction(_prev: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const check = await requireRole("admin");
  if (!check.ok) return { error: NO_ACCESS };
  const employeeId = id(formData, "id");
  const raw = (payload(formData) ?? {}) as { pnr?: string; bankClearing?: string; bankAccount?: string; removeBank?: boolean };
  const errors: Record<string, string> = {};
  const pnr = raw.pnr?.trim() ? normalizePnr(raw.pnr, todayIso()) : null;
  if (raw.pnr?.trim() && !pnr) errors.pnr = "Personnumret stämmer inte (datum eller kontrollsiffra).";
  const account = (raw.bankAccount ?? "").replace(/\D/g, "");
  const clearing = (raw.bankClearing ?? "").replace(/[^\d-]/g, "");
  if (account && !/^\d{4,5}$/.test(clearing.replace(/\D/g, ""))) errors.bankClearing = "Clearingnumret har fyra eller fem siffror.";
  if (account && (account.length < 5 || account.length > 15)) errors.bankAccount = "Kontonumret har 5 till 15 siffror.";
  if (Object.keys(errors).length) return { error: "Några fält behöver rättas.", fieldErrors: errors };
  if (!pnr && !account && !raw.removeBank) return { error: "Skriv ett nytt personnummer eller kontonummer." };
  try {
    if (pnr) await setEmployeePnr(employeeId, pnr);
    if (account || raw.removeBank) await setEmployeeBank(employeeId, clearing, raw.removeBank ? "" : account);
  } catch (err) {
    return { error: message(err, "Kunde inte spara.") };
  }
  revalidatePath(`${LIST}/${employeeId}`);
  return { ok: true, savedAt: new Date().toISOString() };
}

/** The personnummer in clear for owner/admin; the database writes the reveal to the event log. */
export async function revealPnrAction(employeeId: string): Promise<{ pnr?: string; error?: string }> {
  const check = await requireRole("admin");
  if (!check.ok) return { error: "Bara ägare och administratörer ser personnummer." };
  try {
    const pnr = await revealPnr(employeeId, "visning i Personal");
    revalidatePath(`${LIST}/${employeeId}`);
    return pnr ? { pnr: formatPnr(pnr) } : { error: "Inget personnummer är inlagt." };
  } catch (err) {
    return { error: message(err, "Kunde inte visa personnumret.") };
  }
}

/** A new contract, or a new version of one (contractId set): the database closes the version before. */
export async function addEmploymentAction(_prev: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const check = await requireRole("admin");
  if (!check.ok) return { error: NO_ACCESS };
  const employeeId = id(formData, "employeeId");
  const parsed = employmentInputSchema.safeParse(payload(formData));
  if (!parsed.success) return { error: "Några fält behöver rättas innan anställningen kan sparas.", fieldErrors: fieldErrors(parsed.error) };
  try {
    if (!(await getEmployee(employeeId))) return { error: "Personen finns inte." };
    await addEmploymentVersion(employeeId, parsed.data);
  } catch (err) {
    return { error: message(err, "Kunde inte spara anställningen.") };
  }
  revalidatePath(LIST, "layout");
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function addTaxAction(_prev: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const check = await requireRole("admin");
  if (!check.ok) return { error: NO_ACCESS };
  const employeeId = id(formData, "employeeId");
  const parsed = taxInputSchema.safeParse(payload(formData));
  if (!parsed.success) return { error: "Några fält behöver rättas.", fieldErrors: fieldErrors(parsed.error) };
  try {
    await addTaxVersion(employeeId, parsed.data);
  } catch (err) {
    return { error: message(err, "Kunde inte spara skatteuppgifterna.") };
  }
  revalidatePath(LIST, "layout");
  return { ok: true, savedAt: new Date().toISOString() };
}

export type DocumentActionState = { ok?: boolean; error?: string; documentId?: string };

/** Render the contract for an employment version and freeze it: PDF in the hr bucket, row with its hash. */
export async function generateContractAction(_prev: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  const check = await requireRole("admin");
  if (!check.ok) return { error: NO_ACCESS };
  const employeeId = id(formData, "employeeId");
  const employmentId = id(formData, "employmentId");
  try {
    const today = todayIso();
    const [employee, versions, { employer, logo }] = await Promise.all([getEmployee(employeeId), listEmployments(employeeId), contractEmployer()]);
    const employment = versions.find((v) => v.id === employmentId);
    if (!employee || !employment) return { error: "Anställningen finns inte." };
    if (!employer.orgNr || !employer.street) return { error: "Organisationsnummer och adress saknas under Inställningar › Företaget; avtalet behöver dem." };
    // The clock row as the database counts it, so the SÄVA information states the same days as the list.
    const clocks = employment.form === "sava" ? ((await loadClocks(today, employeeId)).get(employeeId) ?? clocksForVersions(versions, today, payrollRulesAt(today))) : null;
    const pnr12 = employee.pnrMasked ? await revealPnr(employeeId, "anställningsavtal") : null;
    const { pdf, content } = await renderContractPdf({ employer, employee, pnr12, employment, clocks, today }, logo);
    const documentId = await storeDocument({
      employeeId,
      employmentId,
      title: content.title,
      template: content.template,
      templateVersion: content.templateVersion,
      pdf,
    });
    revalidatePath(`${LIST}/${employeeId}`);
    return { ok: true, documentId };
  } catch (err) {
    return { error: message(err, "Kunde inte skapa avtalet.") };
  }
}

export async function signDocumentAction(_prev: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  const check = await requireRole("admin");
  if (!check.ok) return { error: NO_ACCESS };
  const parsed = signInputSchema.safeParse({ documentId: id(formData, "documentId"), signedOn: id(formData, "signedOn") });
  if (!parsed.success) return { error: "Välj datumet då avtalet skrevs under." };
  if (parsed.data.signedOn > todayIso()) return { error: "Signeringsdatumet kan inte vara i framtiden." };
  try {
    await signDocument(parsed.data.documentId, parsed.data.signedOn);
  } catch (err) {
    return { error: message(err, "Kunde inte markera avtalet.") };
  }
  revalidatePath(LIST, "layout");
  return { ok: true, documentId: parsed.data.documentId };
}
