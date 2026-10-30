"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { hasAccess } from "@/lib/core/org/roles";
import { todayIso } from "@/lib/quotes/schema";
import { parseKronor } from "@/lib/core/money";
import { isAgiPeriod } from "@/lib/core/payroll/agi";
import { LEAVING_REASONS, type LeavingReason } from "@/lib/core/payroll/certificate";
import {
  addRepayment,
  certificateContentFor,
  closeYear,
  markAgiFiled,
  markAgiPaid,
  markPensionFiled,
  storeAgi,
  storeCertificate,
  storeCollectumReport,
  storeForaReport,
  storeVaxaClaims,
} from "@/lib/core/payroll/authorities-store";
import { certificateEmployer, renderCertificatePdf } from "@/lib/pdf/render-authorities";
import { savePlannerSnapshot } from "@/lib/core/payroll/benefits-store";
import { ownerPlans } from "@/lib/core/payroll/planner-data";

/**
 * Lönerapporter's AGI, skattekonto, Fora, växa-stöd and årsskifte, and the
 * arbetsgivarintyg on Person › Lön (docs/hr-lon.md, phase 4). Every action
 * is owner/admin and checks for itself; the database checks again (the
 * accountant builds and reads but stores and marks nothing). Nothing is
 * sent anywhere: the files are downloaded and uploaded by the owner.
 */

const NO_ACCESS = "Bara ägare och administratörer gör det.";
const REPORTS = "/admin/rapporter";
const withMessage = (url: string, key: "ok" | "fel", text: string) => {
  const [base, hash] = url.split("#");
  return `${base}${base.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(text)}${hash ? `#${hash}` : ""}`;
};
const isRedirect = (err: unknown) => Boolean(err && typeof err === "object" && "digest" in err);
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const uuid = (formData: FormData, key: string) => {
  const v = text(formData, key);
  return /^[0-9a-f-]{36}$/.test(v) ? v : null;
};

function refresh() {
  revalidatePath(REPORTS);
  revalidatePath("/admin/idag");
  revalidatePath("/admin/personal", "layout");
  revalidatePath("/min-tid");
}

async function approver() {
  const check = await requireRole("payroll");
  return check.ok && hasAccess(check.role, "admin") ? check : null;
}

/** Runs `fn` as owner/admin and redirects to `to` with its message, or the error. */
async function run(to: string, fn: (who: { email: string }) => Promise<string>): Promise<never> {
  const check = await approver();
  if (!check) redirect(withMessage(to, "fel", NO_ACCESS));
  let ok = "";
  try {
    ok = await fn({ email: check.email ?? "" });
  } catch (err) {
    if (isRedirect(err)) throw err;
    redirect(withMessage(to, "fel", err instanceof Error ? err.message : "Det gick inte."));
  }
  refresh();
  redirect(withMessage(to, "ok", ok));
}

const period = (formData: FormData) => {
  const p = text(formData, "period");
  if (!isAgiPeriod(p)) throw new Error("Välj en månad.");
  return p;
};

/* ---------- AGI och skattekontot ---------- */

export async function storeAgiAction(formData: FormData): Promise<void> {
  const p = text(formData, "period");
  await run(`${REPORTS}?agi=${p}#agi`, async () => {
    const { version } = await storeAgi(period(formData));
    return `Version ${version} av arbetsgivardeklarationen för ${p} är skapad och fryst. Ladda ner filen, ladda upp den i Skatteverkets e-tjänst och signera; markera den sedan som lämnad.`;
  });
}

export async function markAgiFiledAction(formData: FormData): Promise<void> {
  const id = uuid(formData, "id");
  await run(`${REPORTS}#agi`, async (who) => {
    if (!id) throw new Error("Deklarationen finns inte.");
    await markAgiFiled(id, who.email);
    return "Deklarationen är markerad som lämnad.";
  });
}

export async function markAgiPaidAction(formData: FormData): Promise<void> {
  const id = uuid(formData, "id");
  const paid = text(formData, "paid") === "yes";
  await run(`${REPORTS}#skattekonto`, async () => {
    if (!id) throw new Error("Deklarationen finns inte.");
    await markAgiPaid(id, paid);
    return paid ? "Skattekontot är markerat som betalt." : "Markeringen är borttagen.";
  });
}

export async function addRepaymentAction(formData: FormData): Promise<void> {
  const payslipId = uuid(formData, "payslipId");
  await run(`${REPORTS}#agi`, async () => {
    if (!payslipId) throw new Error("Välj lönebeskedet.");
    const amount = parseKronor(text(formData, "amount"));
    await addRepayment(payslipId, amount, text(formData, "reason"), text(formData, "repaidOn") || todayIso());
    return "Återbetalningen är registrerad. Månadens AGI ska omprövas: skapa en ny version och se ändringen innan du laddar upp den.";
  });
}

/* ---------- Fora ---------- */

export async function storeForaAction(formData: FormData): Promise<void> {
  await run(`${REPORTS}#fora`, async () => {
    await storeForaReport(period(formData));
    return "Fora-underlaget är skapat och fryst. Ladda ner det och rapportera på Foras Mina sidor; markera det sedan som lämnat.";
  });
}

export async function markForaFiledAction(formData: FormData): Promise<void> {
  const id = uuid(formData, "id");
  await run(`${REPORTS}#fora`, async () => {
    if (!id) throw new Error("Rapporten finns inte.");
    await markPensionFiled(id);
    return "Fora-rapporten är markerad som lämnad.";
  });
}

export async function storeCollectumAction(formData: FormData): Promise<void> {
  await run(`${REPORTS}#collectum`, async () => {
    await storeCollectumReport(period(formData));
    return "Collectum-underlaget är skapat och fryst. Rapportera lönerna i Collectums internetkontor; markera det sedan som lämnat.";
  });
}

export async function markCollectumFiledAction(formData: FormData): Promise<void> {
  const id = uuid(formData, "id");
  await run(`${REPORTS}#collectum`, async () => {
    if (!id) throw new Error("Rapporten finns inte.");
    await markPensionFiled(id);
    return "Collectum-rapporten är markerad som lämnad.";
  });
}

/* ---------- växa-stöd och årsskiftet ---------- */

export async function storeVaxaAction(formData: FormData): Promise<void> {
  await run(`${REPORTS}#vaxa`, async () => {
    const n = await storeVaxaClaims(period(formData));
    return `Ansökan är registrerad för ${n === 1 ? "en anställd" : `${n} anställda`}.`;
  });
}

export async function closeYearAction(formData: FormData): Promise<void> {
  const year = Number(text(formData, "year"));
  await run(`${REPORTS}?ar=${year}#arsskifte`, async () => {
    if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error("Välj ett år.");
    await closeYear(year, todayIso());
    return `Årsskiftet ${year} är gjort: semesteråret är stängt och årssammanställningen sparad.`;
  });
}

/* ---------- arbetsgivarintyg ---------- */

export async function createCertificateAction(formData: FormData): Promise<void> {
  const employeeId = uuid(formData, "employeeId");
  const to = `/admin/personal/${employeeId}?flik=lon`;
  await run(to, async () => {
    if (!employeeId) throw new Error("Personen finns inte.");
    const reason = text(formData, "reason") as LeavingReason;
    if (!LEAVING_REASONS.includes(reason)) throw new Error("Välj varför anställningen upphörde (eller att den pågår).");
    const last = text(formData, "to");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(last)) throw new Error("Välj sista dagen intyget gäller.");
    const today = todayIso();
    const { employer, logo } = await certificateEmployer();
    const content = await certificateContentFor({ employeeId, to: last, reason, reasonText: text(formData, "reasonText").slice(0, 600), today, employer });
    const pdf = await renderCertificatePdf(content, logo);
    await storeCertificate(content, pdf);
    return "Arbetsgivarintyget är skapat och fryst. Personen ser det också på /min-tid.";
  });
}

/* ---------- ägarnas löneuttag ---------- */

/** Saves the planner's inputs and result for an owner and year (owner_planner_snapshots); informational only. */
export async function saveOwnerPlanAction(formData: FormData): Promise<void> {
  await run(`${REPORTS}#agare`, async () => {
    const employeeId = uuid(formData, "employeeId");
    const year = Number(text(formData, "year"));
    if (!employeeId) throw new Error("Planeraren gäller ägare.");
    const share = Number(text(formData, "ownershipPercent").replace(",", "."));
    if (!(share > 0 && share <= 100)) throw new Error("Ägarandelen är en procent mellan 0 och 100.");
    let plannedMonthlyOre: number;
    try {
      plannedMonthlyOre = parseKronor(text(formData, "plannedMonthly") || "0");
    } catch {
      throw new Error("Månadslönen skrivs i kronor.");
    }
    if (plannedMonthlyOre < 0) throw new Error("Månadslönen kan inte vara negativ.");
    const plan = (await ownerPlans(todayIso(), { employeeId, ownershipPercent: share, plannedMonthlyOre })).find((p) => p.owner.id === employeeId);
    if (!plan || plan.input.year !== year) throw new Error("Planeraren gäller ägare, för innevarande år.");
    await savePlannerSnapshot({ employeeId, year, inputs: { ...plan.input, plannedMonthlyOre }, result: { ...plan.result }, ruleVersion: plan.result.ruleVersion });
    return `Planeringen för ${plan.owner.name} är sparad.`;
  });
}
