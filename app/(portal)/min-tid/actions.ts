"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { isDemo } from "@/lib/leads";
import { todayIso } from "@/lib/quotes/schema";
import { SELF_REPORTED_KINDS } from "@/lib/core/hr/absence";
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
  const e = await me();
  await run(async () => {
    const id = text(formData, "entryId");
    const mine = await listTimeEntries({ from: "2000-01-01", to: "2999-12-31", employeeId: e.id });
    if (!mine.some((x) => x.id === id)) throw new Error("Raden finns inte.");
    await deleteTimeEntry(id);
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
    const last = new Date(`${back}T00:00:00Z`);
    last.setUTCDate(last.getUTCDate() - 1);
    const to = last.toISOString().slice(0, 10);
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

/** Demo mode only: whom /min-tid shows (there is no login). */
export async function demoPickAction(formData: FormData): Promise<void> {
  if (!isDemo()) redirect(HOME);
  (await cookies()).set(DEMO_PICK_COOKIE, text(formData, "employeeId"), { path: "/", httpOnly: true, sameSite: "lax" });
  redirect(HOME);
}
