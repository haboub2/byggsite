"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { isDemo } from "@/lib/leads";
import { todayIso } from "@/lib/quotes/schema";
import { SELF_REPORTED_KINDS } from "@/lib/core/hr/absence";
import { addDays } from "@/lib/core/rules/index";
import { absenceInputSchema, timeEntryInputSchema } from "@/lib/core/hr/time-schema";
import { DEMO_PICK_COOKIE, stockholmClock } from "@/lib/core/hr/time";
import {
  addAbsence,
  addTimeEntry,
  answerShift,
  clockIn,
  clockOut,
  deleteAbsence,
  deleteTimeEntry,
  listAbsences,
  listTimeEntries,
  myEmployee,
  submitEntries,
  updateAbsence,
} from "@/lib/core/hr/time-store";
import { parseKronor } from "@/lib/core/money";
import { createClaim, deleteClaim, getClaim, submitClaim, type ClaimDraft } from "@/lib/core/payroll/benefits-store";
import type { CarType, LongStay, MealsOnDay } from "@/lib/core/payroll/expenses";

/**
 * /min-tid (docs/hr-lon.md, section 11): the employee's own day. Every
 * action works on the signed-in person only (myEmployee); the database's
 * RLS (is_self) and functions check the same. Each action redirects back
 * with a message.
 */

const HOME = "/min-tid";

const go = (key: "ok" | "fel", text: string): never => redirect(`${HOME}?${key}=${encodeURIComponent(text)}`);
const isRedirect = (err: unknown) => Boolean(err && typeof err === "object" && "digest" in err);
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

async function me() {
  const check = await requireRole("self");
  if (!check.ok) redirect("/admin/login?next=/min-tid");
  const pick = isDemo() ? ((await cookies()).get(DEMO_PICK_COOKIE)?.value ?? null) : null;
  const employee = await myEmployee(check.userId, pick);
  if (!employee) go("fel", "Din inloggning är inte kopplad till någon person i personalregistret.");
  return employee as NonNullable<typeof employee>;
}

async function run(fn: () => Promise<string>): Promise<never> {
  let ok = "";
  try {
    ok = await fn();
  } catch (err) {
    if (isRedirect(err)) throw err;
    go("fel", err instanceof Error ? err.message : "Det gick inte.");
  }
  revalidatePath(HOME);
  revalidatePath("/admin/tid");
  revalidatePath("/admin/idag");
  return go("ok", ok);
}

export async function clockInAction(formData: FormData): Promise<void> {
  const e = await me();
  await run(async () => {
    const time = stockholmClock();
    await clockIn(e.id, { date: todayIso(), time, projectId: text(formData, "projectId") || null, shiftId: text(formData, "shiftId") || null });
    return `Instämplad kl. ${time}.`;
  });
}

export async function clockOutAction(formData: FormData): Promise<void> {
  await me();
  await run(async () => {
    const time = stockholmClock();
    const breakMinutes = Math.max(0, Math.min(600, Math.round(Number(text(formData, "breakMinutes") || "0")) || 0));
    await clockOut(text(formData, "entryId"), time, breakMinutes);
    return `Utstämplad kl. ${time}. Skicka in veckan när den är klar.`;
  });
}

export async function addOwnTimeAction(formData: FormData): Promise<void> {
  const e = await me();
  await run(async () => {
    const parsed = timeEntryInputSchema.safeParse({
      date: text(formData, "date"),
      start: text(formData, "start"),
      end: text(formData, "end"),
      breakMinutes: text(formData, "breakMinutes") || "0",
      hours: text(formData, "hours"),
      kind: text(formData, "kind") || "work",
      projectId: text(formData, "projectId"),
      note: text(formData, "note"),
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Några fält behöver rättas.");
    if (parsed.data.date > todayIso()) throw new Error("Tid rapporteras i efterhand, inte för kommande dagar.");
    await addTimeEntry(e.id, parsed.data);
    return "Raden är sparad som utkast.";
  });
}

export async function deleteOwnTimeAction(formData: FormData): Promise<void> {
  await me();
  await run(async () => {
    // RLS lets a person delete only their own drafts; anything else removes no row and deleteTimeEntry says so.
    await deleteTimeEntry(text(formData, "entryId"));
    return "Raden är borttagen.";
  });
}

/** Submit every draft of the week (or the ones listed). */
export async function submitOwnAction(formData: FormData): Promise<void> {
  const e = await me();
  await run(async () => {
    const from = text(formData, "from");
    const to = text(formData, "to");
    const drafts = (await listTimeEntries({ from, to, employeeId: e.id })).filter((x) => x.status === "draft");
    if (!drafts.length) throw new Error("Inga utkast att skicka in.");
    const n = await submitEntries(drafts.map((x) => x.id));
    return n === 1 ? "1 rad inskickad för godkännande." : `${n} rader inskickade för godkännande.`;
  });
}

export async function reportAbsenceAction(formData: FormData): Promise<void> {
  const e = await me();
  await run(async () => {
    const parsed = absenceInputSchema.safeParse({ kind: text(formData, "kind"), from: text(formData, "from"), to: text(formData, "to"), extent: text(formData, "extent") || "1", note: text(formData, "note") });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Några fält behöver rättas.");
    if (!SELF_REPORTED_KINDS.includes(parsed.data.kind)) throw new Error("Den frånvaron kommer du överens om med arbetsgivaren.");
    await addAbsence(e.id, parsed.data);
    return parsed.data.kind === "sjuk" ? "Sjukanmälan är skickad. Krya på dig!" : "Frånvaron är anmäld.";
  });
}

/** "Frisk igen": the sickness ends the day before. */
export async function backFromSickAction(formData: FormData): Promise<void> {
  const e = await me();
  await run(async () => {
    const id = text(formData, "absenceId");
    const back = text(formData, "date") || todayIso();
    const a = (await listAbsences({ employeeId: e.id })).find((x) => x.id === id);
    if (!a || a.kind !== "sjuk" || a.to) throw new Error("Det finns ingen pågående sjukanmälan.");
    const to = addDays(back, -1);
    if (to < a.from) {
      await deleteAbsence(id);
      return "Sjukanmälan är borttagen.";
    }
    await updateAbsence(id, { to });
    return `Välkommen tillbaka! Sjuk ${a.from}–${to}.`;
  });
}

export async function answerShiftAction(formData: FormData): Promise<void> {
  const e = await me();
  await run(async () => {
    const accept = text(formData, "answer") === "ja";
    await answerShift(text(formData, "shiftId"), accept, e.id);
    return accept ? "Passet är ditt." : "Tack för svaret.";
  });
}

/* ---------- utlägg ---------- */

const CAR_TYPES: CarType[] = ["egen", "formansbil", "formansbil_el"];
const LONG_STAYS: LongStay[] = ["none", "after3months", "after2years"];
const day = (v: string, what: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${what}: välj ett datum.`);
  return v;
};
const clock = (v: string, what: string) => {
  if (!/^\d{1,2}:\d{2}$/.test(v)) throw new Error(`${what}: klockslag, t.ex. 07:30.`);
  return v;
};
const whole = (formData: FormData, key: string, max: number) => {
  const n = Number(text(formData, key) || "0");
  if (!Number.isInteger(n) || n < 0 || n > max) throw new Error("Antalen är heltal.");
  return n;
};

/**
 * Meals given on the trip as counts: breakfasts from the last day back (the
 * hotel's breakfast the morning after), lunches and dinners from the first
 * day forward. The reduction per day is frukost 20 %, lunch and middag 35 %
 * each of that day's amount, so only which day a meal fell on matters.
 */
function mealsByDay(from: string, to: string, counts: { breakfast: number; lunch: number; dinner: number }): Record<string, MealsOnDay> {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const out: Record<string, MealsOnDay> = {};
  const put = (d: string, k: keyof MealsOnDay) => (out[d] = { ...out[d], [k]: true });
  days.slice().reverse().slice(0, counts.breakfast).forEach((d) => put(d, "breakfast"));
  days.slice(0, counts.lunch).forEach((d) => put(d, "lunch"));
  days.slice(0, counts.dinner).forEach((d) => put(d, "dinner"));
  return out;
}

/** A new claim as a draft; the receipt is added next, then it is sent in. */
export async function createOwnClaimAction(formData: FormData): Promise<void> {
  const e = await me();
  await run(async () => {
    const kind = text(formData, "kind");
    const dateFrom = day(text(formData, "dateFrom"), "Datum");
    const dateTo = text(formData, "dateTo") ? day(text(formData, "dateTo"), "Hemkomst") : dateFrom;
    if (dateTo < dateFrom) throw new Error("Hemkomsten ligger före avresan.");
    if (dateFrom > todayIso()) throw new Error("Utlägg lämnas i efterhand.");
    const base: ClaimDraft = {
      kind: "utlagg",
      dateFrom,
      dateTo,
      description: text(formData, "description").slice(0, 400),
      amountOre: null,
      vatOre: 0,
      distanceKm: null,
      carType: null,
      destination: "",
      departureTime: null,
      returnTime: null,
      nights: 0,
      nightsWithoutLodging: 0,
      meals: {},
      longStay: "none",
      farFromHome: true,
      note: "",
    };
    let draft: ClaimDraft;
    if (kind === "utlagg") {
      let amountOre: number;
      let vatOre: number;
      try {
        amountOre = parseKronor(text(formData, "amount"));
        vatOre = text(formData, "vat") ? parseKronor(text(formData, "vat")) : 0;
      } catch {
        throw new Error("Beloppen skrivs i kronor, t.ex. 450 eller 89,50.");
      }
      if (!base.description) throw new Error("Skriv vad du köpte.");
      draft = { ...base, kind, dateTo: dateFrom, amountOre, vatOre };
    } else if (kind === "milersattning") {
      const km = Number(text(formData, "distanceKm").replace(",", "."));
      if (!(km > 0 && km < 10_000)) throw new Error("Ange hur många kilometer du körde i tjänsten.");
      const carType = text(formData, "carType") as CarType;
      if (!CAR_TYPES.includes(carType)) throw new Error("Välj bil.");
      if (!base.description) throw new Error("Skriv vart och varför du körde.");
      draft = { ...base, kind, dateTo: dateFrom, distanceKm: Math.round(km * 10) / 10, carType };
    } else if (kind === "traktamente") {
      const destination = text(formData, "destination").slice(0, 200);
      if (!destination) throw new Error("Ange resmålet.");
      const longStay = (text(formData, "longStay") || "none") as LongStay;
      if (!LONG_STAYS.includes(longStay)) throw new Error("Välj hur länge du varit på orten.");
      const nights = Math.round((Date.parse(dateTo) - Date.parse(dateFrom)) / 86_400_000);
      const without = whole(formData, "nightsWithoutLodging", 400);
      if (without > nights) throw new Error(`Resan har ${nights} nätter.`);
      draft = {
        ...base,
        kind,
        destination,
        departureTime: clock(text(formData, "departureTime"), "Avresa"),
        returnTime: clock(text(formData, "returnTime"), "Hemkomst"),
        nights,
        nightsWithoutLodging: without,
        meals: mealsByDay(dateFrom, dateTo, { breakfast: whole(formData, "breakfasts", 400), lunch: whole(formData, "lunches", 400), dinner: whole(formData, "dinners", 400) }),
        longStay,
        farFromHome: text(formData, "farFromHome") === "on",
      };
    } else throw new Error("Välj vad du vill få ersättning för.");
    const { result } = await createClaim(e.id, draft);
    const note = result.notes.length ? ` ${result.notes.join(" ")}` : "";
    return kind === "utlagg" ? `Sparat som utkast. Lägg till ett foto av kvittot och skicka in.${note}` : `Sparat som utkast; skicka in det när det stämmer.${note}`;
  });
}

async function ownClaim(id: string, employeeId: string) {
  const c = /^[0-9a-f-]{36}$/.test(id) ? await getClaim(id) : null;
  if (!c || c.employeeId !== employeeId) throw new Error("Utlägget finns inte.");
  return c;
}

export async function submitOwnClaimAction(formData: FormData): Promise<void> {
  const e = await me();
  await run(async () => {
    const c = await ownClaim(text(formData, "claimId"), e.id);
    await submitClaim(c.id);
    return "Inskickat för godkännande. Det betalas med lönen när det är godkänt.";
  });
}

export async function deleteOwnClaimAction(formData: FormData): Promise<void> {
  const e = await me();
  await run(async () => {
    const c = await ownClaim(text(formData, "claimId"), e.id);
    if (c.status !== "draft") throw new Error("Bara ett utkast kan tas bort.");
    await deleteClaim(c.id);
    return "Utkastet är borttaget.";
  });
}

/** Demo mode only: whom /min-tid shows (there is no login). */
export async function demoPickAction(formData: FormData): Promise<void> {
  if (!isDemo()) redirect(HOME);
  (await cookies()).set(DEMO_PICK_COOKIE, text(formData, "employeeId"), { path: "/", httpOnly: true, sameSite: "lax" });
  redirect(HOME);
}
