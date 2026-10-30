"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { hasAccess } from "@/lib/core/org/roles";
import { todayIso } from "@/lib/quotes/schema";
import { formatOre, parseKronor } from "@/lib/core/money";
import { HOUSING_REGION_LABEL, type HousingRegion } from "@/lib/core/rules/benefits";
import { BENEFIT_KIND_LABEL, FUEL_LABEL, type Benefit, type BenefitKind, type CarFuel } from "@/lib/core/payroll/benefits";
import { approveClaim, deleteBenefit, endBenefit, getClaim, rejectClaim, saveBenefit } from "@/lib/core/payroll/benefits-store";

/**
 * Person › Utlägg and Förmåner (docs/hr-lon.md, section 11; phase 5).
 * Owner and admin approve claims and write benefits; each action checks
 * for itself and the database checks again (expense_approve refuses the
 * accountant and one's own claim; benefits' RLS and the freeze trigger).
 * The amounts are computed on the server from the rule book and the
 * organisation's policy, never taken from the form.
 */

const isRedirect = (err: unknown) => Boolean(err && typeof err === "object" && "digest" in err);
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const uuid = (formData: FormData, key: string) => {
  const v = text(formData, key);
  return /^[0-9a-f-]{36}$/.test(v) ? v : null;
};
const tab = (employeeId: string, flik: string, key: "ok" | "fel", message: string) => `/admin/personal/${employeeId}?flik=${flik}&${key}=${encodeURIComponent(message)}`;
const kr = (ore: number) => formatOre(ore, { currency: true });

async function approver() {
  const check = await requireRole("payroll");
  return check.ok && hasAccess(check.role, "admin") ? check : null;
}

async function run(employeeId: string, flik: string, fn: (who: { userId: string | null }) => Promise<string>): Promise<never> {
  const who = await approver();
  if (!who) redirect(tab(employeeId, flik, "fel", "Bara ägare och administratörer gör det."));
  let message = "";
  try {
    message = await fn(who);
  } catch (err) {
    if (isRedirect(err)) throw err;
    redirect(tab(employeeId, flik, "fel", err instanceof Error ? err.message : "Det gick inte."));
  }
  revalidatePath(`/admin/personal/${employeeId}`);
  revalidatePath("/admin/idag");
  revalidatePath("/min-tid");
  redirect(tab(employeeId, flik, "ok", message));
}

/* ---------- utlägg ---------- */

export async function approveClaimAction(formData: FormData): Promise<void> {
  const employeeId = uuid(formData, "employeeId") ?? "";
  await run(employeeId, "utlagg", async (who) => {
    const id = uuid(formData, "claimId");
    const claim = id ? await getClaim(id) : null;
    if (!claim || claim.employeeId !== employeeId) throw new Error("Utlägget finns inte.");
    const r = await approveClaim(claim.id, who.userId);
    return `Godkänt: ${kr(r.taxFreeOre)} skattefritt${r.taxableOre ? ` och ${kr(r.taxableOre)} skattepliktigt` : ""}. Betalas med nästa lönekörning.`;
  });
}

export async function rejectClaimAction(formData: FormData): Promise<void> {
  const employeeId = uuid(formData, "employeeId") ?? "";
  await run(employeeId, "utlagg", async () => {
    const id = uuid(formData, "claimId");
    const claim = id ? await getClaim(id) : null;
    if (!claim || claim.employeeId !== employeeId) throw new Error("Utlägget finns inte.");
    const reason = text(formData, "reason");
    if (reason.length < 3) throw new Error("Skriv varför utlägget avslås.");
    await rejectClaim(claim.id, reason);
    return "Utlägget är avslaget; personen ser varför på Min tid.";
  });
}

/* ---------- förmåner ---------- */

const KINDS = Object.keys(BENEFIT_KIND_LABEL) as BenefitKind[];
const FUELS = Object.keys(FUEL_LABEL) as CarFuel[];
const REGIONS = Object.keys(HOUSING_REGION_LABEL) as HousingRegion[];
const date = (v: string, what: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${what}: välj ett datum.`);
  return v;
};
const kronor = (formData: FormData, key: string, what: string, required = false): number => {
  const v = text(formData, key);
  if (!v) {
    if (required) throw new Error(`${what}: ange ett belopp.`);
    return 0;
  }
  try {
    const ore = parseKronor(v);
    if (ore < 0) throw new Error();
    return ore;
  } catch {
    throw new Error(`${what}: kronor, t.ex. 450 000.`);
  }
};
const count = (formData: FormData, key: string) => {
  const n = Number(text(formData, key) || "0");
  if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error("Antalet måltider är ett heltal per månad.");
  return n;
};

/** The benefit from the form; the value is computed by saveBenefit from the rule book. */
function benefitFrom(formData: FormData, employeeId: string): Benefit {
  const kind = text(formData, "kind") as BenefitKind;
  if (!KINDS.includes(kind)) throw new Error("Välj vilken förmån.");
  const validFrom = date(text(formData, "validFrom"), "Från");
  const validTo = text(formData, "validTo") ? date(text(formData, "validTo"), "Till") : null;
  if (validTo && validTo < validFrom) throw new Error("Slutdatumet ligger före startdatumet.");
  const base: Benefit = {
    id: "",
    employeeId,
    kind,
    description: text(formData, "description").slice(0, 200),
    validFrom,
    validTo,
    car: null,
    meals: {},
    housing: null,
    marketValueOre: 0,
    employeePaymentOre: kronor(formData, "employeePayment", "Den anställdes betalning"),
  };
  if (kind === "bil") {
    const reg = text(formData, "registrationNumber").toUpperCase().replace(/\s/g, "");
    if (!/^[A-Z0-9]{2,7}$/.test(reg)) throw new Error("Registreringsnumret: bokstäver och siffror, t.ex. ABC123.");
    const fuel = text(formData, "fuel") as CarFuel;
    if (!FUELS.includes(fuel)) throw new Error("Välj drivmedel.");
    const modelYear = Number(text(formData, "modelYear"));
    if (!Number.isInteger(modelYear) || modelYear < 1950 || modelYear > 2100) throw new Error("Årsmodellen: fyra siffror.");
    const mil = Number(text(formData, "businessMil") || "0");
    if (!Number.isFinite(mil) || mil < 0) throw new Error("Tjänstekörningen i mil per år.");
    return {
      ...base,
      car: {
        registrationNumber: reg,
        model: text(formData, "carModel").slice(0, 120),
        firstRegisteredOn: date(text(formData, "firstRegisteredOn"), "Skattepliktig första gången"),
        modelYear,
        fuel,
        newCarPriceOre: kronor(formData, "newCarPrice", "Nybilspriset", true),
        extraEquipmentOre: kronor(formData, "extraEquipment", "Extrautrustningen"),
        vehicleTaxOre: kronor(formData, "vehicleTax", "Fordonsskatten"),
        businessMilPerYear: Math.round(mil),
        fuelPaidByEmployer: text(formData, "fuelPaidByEmployer") === "on",
      },
    };
  }
  if (kind === "kost") {
    const meals = { breakfast: count(formData, "breakfast"), lunchOrDinner: count(formData, "lunchOrDinner"), fullDays: count(formData, "fullDays") };
    if (!meals.breakfast && !meals.lunchOrDinner && !meals.fullDays) throw new Error("Ange hur många måltider i månaden.");
    return { ...base, meals };
  }
  if (kind === "bostad") {
    const area = Number(text(formData, "areaM2").replace(",", "."));
    const region = text(formData, "region") as HousingRegion;
    if (!(area > 0 && area < 10_000)) throw new Error("Bostadsytan i m².");
    if (!REGIONS.includes(region)) throw new Error("Välj område.");
    return { ...base, housing: { areaM2: area, region } };
  }
  if (!base.description) throw new Error("Beskriv förmånen.");
  return { ...base, marketValueOre: kronor(formData, "marketValue", "Marknadsvärdet per månad", true) };
}

export async function saveBenefitAction(formData: FormData): Promise<void> {
  const employeeId = uuid(formData, "employeeId") ?? "";
  await run(employeeId, "formaner", async () => {
    const b = benefitFrom(formData, employeeId);
    await saveBenefit(b, todayIso());
    return `${BENEFIT_KIND_LABEL[b.kind]} är sparad; nästa lönekörning tar med den.`;
  });
}

export async function endBenefitAction(formData: FormData): Promise<void> {
  const employeeId = uuid(formData, "employeeId") ?? "";
  await run(employeeId, "formaner", async () => {
    const id = uuid(formData, "benefitId");
    if (!id) throw new Error("Förmånen finns inte.");
    await endBenefit(id, date(text(formData, "validTo"), "Sista dag"));
    return "Förmånen är avslutad.";
  });
}

export async function deleteBenefitAction(formData: FormData): Promise<void> {
  const employeeId = uuid(formData, "employeeId") ?? "";
  await run(employeeId, "formaner", async () => {
    const id = uuid(formData, "benefitId");
    if (!id) throw new Error("Förmånen finns inte.");
    await deleteBenefit(id);
    return "Förmånen är borttagen.";
  });
}
