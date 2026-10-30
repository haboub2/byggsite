"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { isDemo } from "@/lib/leads";
import { hasAccess } from "@/lib/core/org/roles";
import { todayIso } from "@/lib/quotes/schema";
import { parseKronor } from "@/lib/core/money";
import { stockholmClock } from "@/lib/core/hr/time";
import { addCorrection, approveRun, bookRun, calculateRun, closeRun, createBankFile, createRun, discardRun, getPayslip, getRun, savePayrollDecision, storePayslipPdf } from "@/lib/core/payroll/run-store";
import { seedDemoPayroll } from "@/lib/core/payroll/demo-seed";
import { PAYROLL_DECISIONS, payrollSettingsSchema, type PayrollDecision, type PayrollSettings } from "@/lib/core/payroll/settings";
import { payslipEmployer, renderPayslipPdf } from "@/lib/pdf/render-payslip";

/**
 * Lönekörning, Inställningar › Lön and the payslip's Rätta (docs/hr-lon.md,
 * phase 3). Every action checks for itself; the database checks again:
 * creating and computing a run is can_payroll_read() (owner, admin,
 * accountant), approving (never by the one who computed), the bank file,
 * booking, closing, corrections and the settings are can_payroll_approve()
 * (owner, admin). Each action redirects back with a message.
 */

const NO_ACCESS = "Du saknar behörighet för det.";
const withMessage = (url: string, key: "ok" | "fel", text: string) => `${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(text)}`;
const isRedirect = (err: unknown) => Boolean(err && typeof err === "object" && "digest" in err);
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const uuid = (formData: FormData, key: string) => {
  const v = text(formData, key);
  return /^[0-9a-f-]{36}$/.test(v) ? v : null;
};

function refresh(runId?: string) {
  revalidatePath("/admin/lon");
  revalidatePath("/admin/idag");
  revalidatePath("/admin/rapporter");
  revalidatePath("/admin/personal", "layout");
  revalidatePath("/min-tid");
  if (runId) revalidatePath(`/admin/lon/${runId}`);
}

/** Runs `fn` and redirects to `to` with its message, or the error. */
async function run(to: string, fn: () => Promise<string>, runId?: string): Promise<never> {
  let ok = "";
  try {
    ok = await fn();
  } catch (err) {
    if (isRedirect(err)) throw err;
    redirect(withMessage(to, "fel", err instanceof Error ? err.message : "Det gick inte."));
  }
  refresh(runId);
  redirect(withMessage(to, "ok", ok));
}

/** Owner, admin and the accountant: create, check and compute. */
async function reader() {
  const check = await requireRole("payroll");
  return check.ok ? check : null;
}
/** Owner and admin: approve, bank file, book, close, correct, settings. */
async function approver() {
  const check = await requireRole("payroll");
  return check.ok && hasAccess(check.role, "admin") ? check : null;
}

/* ---------- the run ---------- */

export async function createRunAction(formData: FormData): Promise<void> {
  if (!(await reader())) redirect(withMessage("/admin/lon", "fel", NO_ACCESS));
  const month = text(formData, "month");
  const payDate = text(formData, "payDate");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !/^\d{4}-\d{2}-\d{2}$/.test(payDate)) redirect(withMessage("/admin/lon", "fel", "Välj månad och lönedag."));
  let id = "";
  try {
    id = await createRun(month, payDate);
  } catch (err) {
    redirect(withMessage("/admin/lon", "fel", err instanceof Error ? err.message : "Körningen kunde inte skapas."));
  }
  refresh(id);
  redirect(`/admin/lon/${id}?ok=${encodeURIComponent("Körningen är skapad. Kör kontrollistan.")}`);
}

export async function checkRunAction(formData: FormData): Promise<void> {
  const id = uuid(formData, "runId");
  const to = `/admin/lon/${id}`;
  if (!id || !(await reader())) redirect(withMessage(to, "fel", NO_ACCESS));
  await run(
    to,
    async () => {
      const r = await calculateRun(id, todayIso(), { store: false });
      const blocks = r.checks.filter((c) => c.level === "block").length;
      return blocks ? `Kontrollistan har ${blocks} punkter som stoppar körningen.` : "Kontrollistan är sparad; inget stoppar körningen.";
    },
    id
  );
}

export async function computeRunAction(formData: FormData): Promise<void> {
  const id = uuid(formData, "runId");
  const to = `/admin/lon/${id}`;
  if (!id || !(await reader())) redirect(withMessage(to, "fel", NO_ACCESS));
  await run(
    to,
    async () => {
      const r = await calculateRun(id, todayIso(), { store: true });
      const blocks = r.checks.filter((c) => c.level === "block");
      if (blocks.length) throw new Error(`Körningen räknades inte: ${blocks.map((b) => b.text).join(" ")}`);
      return `Lönen är beräknad för ${r.payslips.length} personer. Granska och låt en annan person godkänna.`;
    },
    id
  );
}

export async function discardRunAction(formData: FormData): Promise<void> {
  const id = uuid(formData, "runId");
  if (!id || !(await reader())) redirect(withMessage("/admin/lon", "fel", NO_ACCESS));
  await run("/admin/lon", async () => {
    await discardRun(id);
    return "Körningen är borttagen.";
  });
}

export async function approveRunAction(formData: FormData): Promise<void> {
  const id = uuid(formData, "runId");
  const to = `/admin/lon/${id}`;
  const check = await approver();
  if (!id || !check) redirect(withMessage(to, "fel", "Bara ägare och administratörer godkänner löner."));
  await run(
    to,
    async () => {
      const employer = await payslipEmployer();
      const r = await approveRun(id, check.userId, (slip) => renderPayslipPdf(slip, employer));
      return r.pdfErrors.length ? `Lönen är godkänd (${r.approved} lönebesked), men ${r.pdfErrors.length} PDF:er kunde inte sparas: ${r.pdfErrors.join("; ")}` : `Lönen är godkänd: ${r.approved} lönebesked numrerade och frysta, och tidsperioden är låst.`;
    },
    id
  );
}

/** A payslip whose PDF failed at approval: render it again from the frozen document. */
export async function payslipPdfAction(formData: FormData): Promise<void> {
  const id = uuid(formData, "payslipId");
  const slip = id ? await getPayslip(id) : null;
  const to = slip ? `/admin/lon/${slip.runId}` : "/admin/lon";
  if (!slip || !(await approver())) redirect(withMessage(to, "fel", NO_ACCESS));
  await run(
    to,
    async () => {
      await storePayslipPdf(slip, await renderPayslipPdf(slip));
      return "PDF:en är sparad.";
    },
    slip.runId
  );
}

export async function bankFileAction(formData: FormData): Promise<void> {
  const id = uuid(formData, "runId");
  const to = `/admin/lon/${id}`;
  if (!id || !(await approver())) redirect(withMessage(to, "fel", "Bara ägare och administratörer skapar lönefilen."));
  await run(
    to,
    async () => {
      const today = todayIso();
      await createBankFile(id, `${today}T${stockholmClock()}:00`);
      return "Lönefilen är skapad. Ladda ner den och ladda upp den i banken; systemet skickar den aldrig.";
    },
    id
  );
}

export async function bookRunAction(formData: FormData): Promise<void> {
  const id = uuid(formData, "runId");
  const to = `/admin/lon/${id}`;
  if (!id || !(await approver())) redirect(withMessage(to, "fel", "Bara ägare och administratörer bokför löner."));
  await run(
    to,
    async () => {
      await bookRun(id);
      return "Lönen är bokförd i serien V.";
    },
    id
  );
}

export async function closeRunAction(formData: FormData): Promise<void> {
  const id = uuid(formData, "runId");
  const to = `/admin/lon/${id}`;
  if (!id || !(await approver())) redirect(withMessage(to, "fel", "Bara ägare och administratörer stänger en körning."));
  await run(
    to,
    async () => {
      await closeRun(id);
      return "Avstämningen går ihop och körningen är stängd.";
    },
    id
  );
}

/** Rätta: one retro line (a pay item, an amount, a text) for the next open run; the original is never edited. */
export async function correctionAction(formData: FormData): Promise<void> {
  const id = uuid(formData, "payslipId");
  const slip = id ? await getPayslip(id) : null;
  const to = slip ? `/admin/lon/${slip.runId}` : "/admin/lon";
  if (!slip || !(await approver())) redirect(withMessage(to, "fel", "Bara ägare och administratörer rättar lönebesked."));
  await run(
    to,
    async () => {
      const code = text(formData, "code");
      const reason = text(formData, "reason");
      let amountOre: number;
      try {
        amountOre = parseKronor(text(formData, "amount"));
      } catch {
        throw new Error("Beloppet: kronor, minus för ett avdrag.");
      }
      if (!amountOre) throw new Error("Ange ett belopp.");
      if (reason.length < 3) throw new Error("Skriv varför lönebeskedet rättas.");
      const original = await getRun(slip.runId);
      const lineText = text(formData, "text") || `Rättelse lönebesked L${slip.number} (${original?.periodStart.slice(0, 7) ?? ""})`;
      await addCorrection(slip.id, [{ code, text: lineText, quantity: null, unit: null, unitPriceOre: null, basisOre: null, ratePercent: null, amountOre }], reason);
      return `Rättelsen läggs i nästa körning som retroaktiv rad och redovisas i arbetsgivardeklarationen för den månad den betalas, inte i ${original?.agiPeriod ?? "originalmånaden"}.`;
    },
    slip.runId
  );
}

/* ---------- Inställningar › Lön ---------- */

const DECISION_FIELDS: Record<PayrollDecision, (formData: FormData) => Partial<PayrollSettings>> = {
  period: (f) => ({ variablePeriod: text(f, "variablePeriod") === "same" ? "same" : "previous" }),
  payDay: (f) => ({ payDay: Number(text(f, "payDay")) }),
  vacationYear: (f) => ({ vacationYear: text(f, "vacationYear") === "calendar" ? "calendar" : "law" }),
  agreement: (f) => ({ agreement: text(f, "agreement") as PayrollSettings["agreement"] }),
  approvers: (f) => ({ approvers: f.getAll("approvers").map(String).filter((v) => /^[0-9a-f-]{36}$/.test(v)) }),
  bank: (f) => ({ bank: { iban: text(f, "iban"), bic: text(f, "bic"), customerId: text(f, "customerId") } }),
  accounts: (f) => ({ accounts: Object.fromEntries(Object.keys(payrollSettingsSchema.shape.accounts.removeDefault().shape).map((k) => [k, text(f, k)])) as PayrollSettings["accounts"] }),
  pension: (f) => ({ pension: { foraCustomerNo: text(f, "foraCustomerNo"), foraFokId: text(f, "foraFokId"), collectumCustomerNo: text(f, "collectumCustomerNo") } }),
  agi: (f) => ({ agi: { largeEmployer: text(f, "largeEmployer") === "yes", contactName: text(f, "contactName"), contactPhone: text(f, "contactPhone"), contactEmail: text(f, "contactEmail") } }),
  vaxaStod: (f) => ({ vaxaStod: { employeeIds: f.getAll("vaxaEmployees").map(String).filter((v) => /^[0-9a-f-]{36}$/.test(v)) } }),
  expenses: (f) => {
    // Kronor in the form; empty pays the schablon.
    const kr = (key: string): number | null => {
      const v = text(f, key);
      if (!v) return null;
      try {
        return parseKronor(v);
      } catch {
        throw new Error("Beloppen skrivs i kronor, t.ex. 25 eller 9,50.");
      }
    };
    return {
      expenses: {
        ownCarPerMilOre: kr("ownCarPerMil") ?? 2_500,
        companyCarPerMilOre: kr("companyCarPerMil"),
        companyElectricCarPerMilOre: kr("companyElectricCarPerMil"),
        perDiemFullDayOre: kr("perDiemFullDay"),
        perDiemHalfDayOre: kr("perDiemHalfDay"),
        perDiemNightOre: kr("perDiemNight"),
      },
    };
  },
};

export async function savePayrollSettingsAction(formData: FormData): Promise<void> {
  const to = "/admin/installningar/lon";
  if (!(await approver())) redirect(withMessage(to, "fel", "Bara ägare och administratörer ändrar lönebesluten."));
  const decision = text(formData, "decision") as PayrollDecision;
  if (!PAYROLL_DECISIONS.includes(decision)) redirect(withMessage(to, "fel", "Okänt beslut."));
  await run(to, async () => {
    const patch = DECISION_FIELDS[decision](formData);
    const parsed = payrollSettingsSchema.partial().safeParse(patch);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Några fält behöver rättas.");
    await savePayrollDecision(decision, patch);
    return "Beslutet är sparat och bekräftat.";
  });
}

/* ---------- demo ---------- */

export async function seedDemoPayrollAction(formData: FormData): Promise<void> {
  if (!isDemo() || !(await approver())) redirect(withMessage("/admin/lon", "fel", "Bara i demoläget."));
  await run("/admin/lon", async () => {
    await seedDemoPayroll(text(formData, "month"), todayIso());
    return "Anna, Bo och Cecilia är tillagda med en månads godkänd tid och frånvaro. Skapa körningen.";
  });
}
