"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { hasAccess } from "@/lib/core/org/roles";
import { todayIso } from "@/lib/quotes/schema";
import { absenceInputSchema, lockInputSchema, scheduleInputSchema, shiftOfferSchema, timeEntryInputSchema } from "@/lib/core/hr/time-schema";
import {
  addAbsence,
  addTimeEntry,
  approveEntries,
  correctEntry,
  deleteAbsence,
  deleteShift,
  deleteTimeEntry,
  lockPeriod,
  offerShift,
  planShift,
  returnEntries,
  saveLeaveBalances,
  setProjectLeader,
  setSchedule,
  updateAbsence,
  withdrawShift,
} from "@/lib/core/hr/time-store";
import { loadPersonAbsence } from "@/lib/core/hr/person-time";
import type { ZodError } from "zod";

/**
 * Tid, Schema and the person page's Tid and Frånvaro tabs (docs/hr-lon.md,
 * phase 2). Every action checks for itself; the database checks again:
 * approving is can_approve_time() (owner, admin, or staff leading the
 * project), the accountant approves nothing, schedules, locks and absence
 * are owner and admin. Each action redirects back with a message.
 */

const NO_ACCESS = "Du saknar behörighet för det.";

/** Back to the page the form came from: only an admin path. */
function back(formData: FormData, fallback: string): string {
  const b = String(formData.get("back") ?? "");
  return /^\/admin\/[\w\-/?=&%.]*$/.test(b) && !b.includes("//") ? b : fallback;
}
const withMessage = (url: string, key: "ok" | "fel", text: string) => `${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(text)}`;
const isRedirect = (err: unknown) => Boolean(err && typeof err === "object" && "digest" in err);
const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
const firstIssue = (e: ZodError) => e.issues[0]?.message ?? "Några fält behöver rättas.";
const ids = (formData: FormData) =>
  String(formData.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/.test(s));
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

function refresh(employeeId?: string) {
  revalidatePath("/admin/tid");
  revalidatePath("/admin/schema");
  revalidatePath("/admin/idag");
  revalidatePath("/admin/projekt", "layout");
  if (employeeId) revalidatePath(`/admin/personal/${employeeId}`);
}

/** Runs `fn` and redirects back with its message, or the error. */
async function run(formData: FormData, fallback: string, fn: () => Promise<string>, employeeId?: string): Promise<never> {
  const to = back(formData, fallback);
  let ok = "";
  try {
    ok = await fn();
  } catch (err) {
    if (isRedirect(err)) throw err;
    redirect(withMessage(to, "fel", message(err, "Det gick inte.")));
  }
  refresh(employeeId);
  redirect(withMessage(to, "ok", ok));
}

/** Who approves: owner, admin and staff (the database limits staff to the projects they lead). Never the accountant. */
async function approver() {
  const check = await requireRole("time");
  if (!check.ok || !hasAccess(check.role, "write")) return null;
  return check;
}

/* ---------- Tid ---------- */

export async function approveTimeAction(formData: FormData): Promise<void> {
  const check = await approver();
  if (!check) redirect(withMessage(back(formData, "/admin/tid"), "fel", "Redovisningskonsulten och läsbehörigheten godkänner ingen tid."));
  await run(formData, "/admin/tid", async () => {
    const list = ids(formData);
    if (!list.length) throw new Error("Inget att godkänna.");
    const n = await approveEntries(list, check.email);
    return n === 1 ? "1 rad godkänd." : `${n} rader godkända.`;
  });
}

export async function returnTimeAction(formData: FormData): Promise<void> {
  const check = await approver();
  if (!check) redirect(withMessage(back(formData, "/admin/tid"), "fel", NO_ACCESS));
  await run(formData, "/admin/tid", async () => {
    const n = await returnEntries(ids(formData), text(formData, "note").slice(0, 200));
    return n === 1 ? "1 rad skickad tillbaka." : `${n} rader skickade tillbaka.`;
  });
}

/** Correct an approved row: a reversal and a replacement (if times or hours are given), both submitted. */
export async function correctTimeAction(formData: FormData): Promise<void> {
  const check = await approver();
  if (!check) redirect(withMessage(back(formData, "/admin/tid"), "fel", NO_ACCESS));
  await run(formData, "/admin/tid", async () => {
    const entryId = text(formData, "entryId");
    const removeOnly = formData.get("removeOnly") === "1";
    let replacement = null;
    if (!removeOnly) {
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
      if (!parsed.success) throw new Error(firstIssue(parsed.error));
      replacement = parsed.data;
    }
    await correctEntry(entryId, replacement, text(formData, "reason").slice(0, 200));
    return "Rättelsen är inskickad; godkänn den för att den ska gälla.";
  });
}

/** Owner/admin enter time for a person (submitted, ready to approve). */
export async function addTimeForAction(formData: FormData): Promise<void> {
  const check = await requireRole("admin");
  const employeeId = text(formData, "employeeId");
  if (!check.ok) redirect(withMessage(back(formData, "/admin/tid"), "fel", "Bara ägare och administratörer rapporterar tid åt andra."));
  await run(
    formData,
    `/admin/personal/${employeeId}?flik=tid`,
    async () => {
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
      if (!parsed.success) throw new Error(firstIssue(parsed.error));
      await addTimeEntry(employeeId, parsed.data, { status: "submitted" });
      return "Tiden är inlagd och inskickad.";
    },
    employeeId
  );
}

export async function deleteTimeAction(formData: FormData): Promise<void> {
  const check = await requireRole("admin");
  if (!check.ok) redirect(withMessage(back(formData, "/admin/tid"), "fel", NO_ACCESS));
  await run(formData, "/admin/tid", async () => {
    await deleteTimeEntry(text(formData, "entryId"));
    return "Raden är borttagen.";
  });
}

export async function lockPeriodAction(formData: FormData): Promise<void> {
  const check = await requireRole("admin");
  if (!check.ok) redirect(withMessage(back(formData, "/admin/tid"), "fel", "Bara ägare och administratörer låser perioder."));
  await run(formData, "/admin/tid", async () => {
    const parsed = lockInputSchema.safeParse({ from: text(formData, "from"), to: text(formData, "to"), note: text(formData, "note") });
    if (!parsed.success) throw new Error(firstIssue(parsed.error));
    await lockPeriod(parsed.data.from, parsed.data.to, parsed.data.note);
    return `Perioden ${parsed.data.from}–${parsed.data.to} är låst.`;
  });
}

export async function setProjectLeaderAction(formData: FormData): Promise<void> {
  const check = await requireRole("admin");
  if (!check.ok) redirect(withMessage(back(formData, "/admin/tid"), "fel", "Bara ägare och administratörer utser projektledare."));
  await run(formData, "/admin/tid", async () => {
    await setProjectLeader(text(formData, "projectId"), text(formData, "userId") || null);
    return "Projektledaren är sparad.";
  });
}

/* ---------- inringning ---------- */

export async function offerShiftAction(formData: FormData): Promise<void> {
  const check = await approver();
  if (!check) redirect(withMessage(back(formData, "/admin/tid"), "fel", NO_ACCESS));
  await run(formData, "/admin/tid", async () => {
    const parsed = shiftOfferSchema.safeParse({
      date: text(formData, "date"),
      start: text(formData, "start"),
      end: text(formData, "end"),
      breakMinutes: text(formData, "breakMinutes") || "0",
      projectId: text(formData, "projectId"),
      expiresAt: text(formData, "expiresAt"),
      note: text(formData, "note"),
      employeeIds: formData.getAll("employeeIds").map(String).filter(Boolean),
    });
    if (!parsed.success) throw new Error(firstIssue(parsed.error));
    if (parsed.data.date < todayIso()) throw new Error("Passet ligger bakåt i tiden.");
    await offerShift(parsed.data);
    return "Passet är erbjudet. Svaren syns här och på Idag.";
  });
}

export async function withdrawShiftAction(formData: FormData): Promise<void> {
  const check = await approver();
  if (!check) redirect(withMessage(back(formData, "/admin/tid"), "fel", NO_ACCESS));
  await run(formData, "/admin/tid", async () => {
    await withdrawShift(text(formData, "shiftId"));
    return "Erbjudandet är återkallat.";
  });
}

/* ---------- Schema ---------- */

export async function setScheduleAction(formData: FormData): Promise<void> {
  const check = await requireRole("admin");
  if (!check.ok) redirect(withMessage(back(formData, "/admin/schema"), "fel", "Bara ägare och administratörer lägger in scheman."));
  await run(formData, "/admin/schema", async () => {
    const days = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      weekday,
      on: formData.get(`on${weekday}`) === "on",
      start: text(formData, `start${weekday}`),
      end: text(formData, `end${weekday}`),
      breakMinutes: text(formData, `break${weekday}`) || "0",
    }));
    const parsed = scheduleInputSchema.safeParse({ employmentId: text(formData, "employmentId"), validFrom: text(formData, "validFrom"), name: text(formData, "name"), days });
    if (!parsed.success) throw new Error(firstIssue(parsed.error));
    await setSchedule(parsed.data);
    return "Schemat är sparat.";
  });
}

export async function planShiftAction(formData: FormData): Promise<void> {
  const check = await requireRole("admin");
  if (!check.ok) redirect(withMessage(back(formData, "/admin/schema"), "fel", NO_ACCESS));
  await run(formData, "/admin/schema", async () => {
    const employeeId = text(formData, "employeeId");
    const parsed = shiftOfferSchema.safeParse({
      date: text(formData, "date"),
      start: text(formData, "start"),
      end: text(formData, "end"),
      breakMinutes: text(formData, "breakMinutes") || "0",
      projectId: text(formData, "projectId"),
      note: text(formData, "note"),
    });
    if (!parsed.success) throw new Error(firstIssue(parsed.error));
    if (!employeeId) throw new Error("Välj vem passet gäller.");
    await planShift(employeeId, parsed.data);
    return "Passet är planerat.";
  });
}

export async function deleteShiftAction(formData: FormData): Promise<void> {
  const check = await requireRole("admin");
  if (!check.ok) redirect(withMessage(back(formData, "/admin/schema"), "fel", NO_ACCESS));
  await run(formData, "/admin/schema", async () => {
    await deleteShift(text(formData, "shiftId"));
    return "Passet är borttaget.";
  });
}

/* ---------- Frånvaro ---------- */

export async function addAbsenceAction(formData: FormData): Promise<void> {
  const check = await requireRole("admin");
  const employeeId = text(formData, "employeeId");
  if (!check.ok) redirect(withMessage(back(formData, "/admin/personal"), "fel", NO_ACCESS));
  await run(
    formData,
    `/admin/personal/${employeeId}?flik=franvaro`,
    async () => {
      const parsed = absenceInputSchema.safeParse({ kind: text(formData, "kind"), from: text(formData, "from"), to: text(formData, "to"), extent: text(formData, "extent") || "1", note: text(formData, "note") });
      if (!parsed.success) throw new Error(firstIssue(parsed.error));
      const id = await addAbsence(employeeId, parsed.data);
      // Entered by the employer: approved at once.
      await updateAbsence(id, { approved: true });
      return "Frånvaron är registrerad.";
    },
    employeeId
  );
}

/** Approve, record a läkarintyg, end a sickness, or remove: one form, one field each. */
export async function updateAbsenceAction(formData: FormData): Promise<void> {
  const check = await requireRole("admin");
  const employeeId = text(formData, "employeeId");
  if (!check.ok) redirect(withMessage(back(formData, "/admin/personal"), "fel", NO_ACCESS));
  await run(
    formData,
    `/admin/personal/${employeeId}?flik=franvaro`,
    async () => {
      const id = text(formData, "absenceId");
      const op = text(formData, "op");
      if (op === "approve") {
        await updateAbsence(id, { approved: true });
        return "Frånvaron är godkänd.";
      }
      if (op === "certificate") {
        const on = text(formData, "date");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) throw new Error("Välj datumet då intyget kom.");
        await updateAbsence(id, { certificateReceivedOn: on });
        return "Läkarintyget är registrerat.";
      }
      if (op === "end") {
        const on = text(formData, "date");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) throw new Error("Välj sista sjukdagen.");
        await updateAbsence(id, { to: on });
        return "Sjukdomen är avslutad.";
      }
      if (op === "delete") {
        await deleteAbsence(id);
        return "Frånvaron är borttagen.";
      }
      throw new Error("Okänd åtgärd.");
    },
    employeeId
  );
}

/** Recompute the semester balances from contracts and absences and store them in leave_balances. */
export async function saveBalancesAction(formData: FormData): Promise<void> {
  const check = await requireRole("admin");
  const employeeId = text(formData, "employeeId");
  if (!check.ok) redirect(withMessage(back(formData, "/admin/personal"), "fel", NO_ACCESS));
  await run(
    formData,
    `/admin/personal/${employeeId}?flik=franvaro`,
    async () => {
      const p = await loadPersonAbsence(employeeId, todayIso());
      await saveLeaveBalances(employeeId, p.model, p.balances);
      return `Semestersaldona för ${p.balances.length} semesterår är sparade.`;
    },
    employeeId
  );
}
