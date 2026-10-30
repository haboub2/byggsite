import "server-only";
import { getDb } from "../db";
import { isDemo } from "../../leads";
import { currentOrgId, readOrgId } from "../org/current";
import { addDays, type IsoDate } from "../rules/index";
import type { Actor, CoreEvent, EventType } from "../events";
import { listProjects } from "../../portal/store";
import { demoAddTimeCost, demoTimeCostRate } from "../projects/costs";
import { addEmploymentVersion, listEmployees, listEmployments } from "./store";
import { linkSickPeriods, sickRules, type Absence, type AbsenceKind, type ScheduleRule } from "./absence";
import { projectCostFor, type CostBasis, type ProjectCostRow } from "./project-cost";
import { blockHours, isReversal, stockholmLocalToIso, type TimeEntry, type TimeKind, type TimeSource, type TimeStatus } from "./time";
import { versionsOn, inForce, type Employee, type EmploymentInput, type EmploymentVersion } from "./schema";
import type { AbsenceInput, ScheduleInput, ShiftOfferInput, TimeEntryInput } from "./time-schema";
import type { VacationBalance } from "./balances";
import type { VacationYearModel } from "../payroll/vacation";

/**
 * Time, schedules, shifts and absence (supabase/migrations/0037_time.sql),
 * read and written with the caller's session so RLS decides: payroll
 * readers see everything, a project's leader its rows, an employee their
 * own. Submitting, approving (with the project cost), returning,
 * correcting, locking, schedules and call-ins go through the database's
 * functions; drafts and absences are plain rows.
 *
 * Demo mode keeps everything in memory, applies the same rules (approved
 * rows frozen, locks, sick periods, a SÄVA per accepted shift) and is
 * always the owner.
 */

/* ---------- records ---------- */

export type Shift = {
  id: string;
  date: IsoDate;
  start: string;
  end: string;
  breakMinutes: number;
  projectId: string | null;
  employeeId: string | null;
  offerStatus: "offered" | "accepted" | "declined" | "expired" | null;
  expiresAt: string | null;
  savaPeriodId: string | null;
  note: string;
  offers: ShiftOffer[];
  createdAt: string;
};
export type ShiftOffer = { shiftId: string; employeeId: string; status: "offered" | "accepted" | "declined" | "expired"; answeredAt: string | null };
export type TimeLock = { id: string; from: IsoDate; to: IsoDate; note: string; lockedAt: string };
export type Schedule = { id: string; employeeId: string; name: string; createdAt: string; rules: ScheduleRule[] };
export type Person = { id: string; name: string; userId: string | null; endedAt: IsoDate | null };
export type TimeProject = { id: string; title: string; leaderUserId: string | null; status: string };

/** An offer still open: offered, no one has taken it and the deadline has not passed. */
export const openOffer = (s: Shift, now = new Date()) => s.offerStatus === "offered" && (!s.expiresAt || new Date(s.expiresAt) > now);

/* ---------- rows ---------- */

type TimeRow = {
  id: string;
  employee_id: string;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  hours: number | string;
  kind: TimeKind;
  project_id: string | null;
  shift_id: string | null;
  note: string;
  source: TimeSource;
  status: TimeStatus;
  corrects_id: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
const entryFromRow = (r: TimeRow): TimeEntry => ({
  id: r.id,
  employeeId: r.employee_id,
  workDate: r.work_date,
  start: hhmm(r.start_time),
  end: hhmm(r.end_time),
  breakMinutes: r.break_minutes,
  hours: Number(r.hours),
  kind: r.kind,
  projectId: r.project_id,
  shiftId: r.shift_id,
  note: r.note,
  source: r.source,
  status: r.status,
  correctsId: r.corrects_id,
  submittedAt: r.submitted_at,
  approvedBy: r.approved_by,
  approvedAt: r.approved_at,
  createdAt: r.created_at,
});

type AbsenceRow = {
  id: string;
  employee_id: string;
  kind: AbsenceKind;
  from_date: string;
  to_date: string | null;
  extent: number | string;
  certificate_received_on: string | null;
  sick_period_id: string | null;
  note: string;
  approved_at: string | null;
  created_at: string;
};
const absenceFromRow = (r: AbsenceRow): Absence => ({
  id: r.id,
  employeeId: r.employee_id,
  kind: r.kind,
  from: r.from_date,
  to: r.to_date,
  extent: Number(r.extent) as Absence["extent"],
  certificateReceivedOn: r.certificate_received_on,
  sickPeriodId: r.sick_period_id,
  note: r.note,
  approvedAt: r.approved_at,
  createdAt: r.created_at,
});

type ShiftRow = {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  project_id: string | null;
  employee_id: string | null;
  offer_status: Shift["offerStatus"];
  offer_expires_at: string | null;
  sava_period_id: string | null;
  note: string;
  created_at: string;
};
type OfferRow = { shift_id: string; employee_id: string; status: ShiftOffer["status"]; answered_at: string | null };
const shiftFromRow = (r: ShiftRow, offers: readonly OfferRow[]): Shift => ({
  id: r.id,
  date: r.shift_date,
  start: r.start_time.slice(0, 5),
  end: r.end_time.slice(0, 5),
  breakMinutes: r.break_minutes,
  projectId: r.project_id,
  employeeId: r.employee_id,
  offerStatus: r.offer_status,
  expiresAt: r.offer_expires_at,
  savaPeriodId: r.sava_period_id,
  note: r.note,
  offers: offers.filter((o) => o.shift_id === r.id).map((o) => ({ shiftId: o.shift_id, employeeId: o.employee_id, status: o.status, answeredAt: o.answered_at })),
  createdAt: r.created_at,
});

type LockRow = { id: string; period_start: string; period_end: string; note: string; locked_at: string };
const lockFromRow = (r: LockRow): TimeLock => ({ id: r.id, from: r.period_start, to: r.period_end, note: r.note, lockedAt: r.locked_at });

type RuleRow = { weekday: number; start_time: string; end_time: string; break_minutes: number };
type ScheduleRow = { id: string; employee_id: string; name: string; created_at: string; schedule_rules: RuleRow[] };
const scheduleFromRow = (r: ScheduleRow): Schedule => ({
  id: r.id,
  employeeId: r.employee_id,
  name: r.name,
  createdAt: r.created_at,
  rules: [...r.schedule_rules].sort((a, b) => a.weekday - b.weekday).map((x) => ({ weekday: x.weekday, start: x.start_time.slice(0, 5), end: x.end_time.slice(0, 5), breakMinutes: x.break_minutes })),
});

/** Postgres errors from these tables and functions carry their own Swedish message; keep it. */
function fail(prefix: string, error: { message: string; code?: string }): never {
  const own = ["42501", "22023", "23505", "23P01", "0A000", "P0001", "23514"].includes(error.code ?? "");
  if (error.code === "23505" && /reversal|replacement/.test(error.message)) throw new Error("Raden är redan rättad; rätta ersättningsraden i stället.");
  if (error.code === "23505" && /open_clock/.test(error.message)) throw new Error("Du är redan instämplad; stämpla ut först.");
  if (error.code === "42501" && /row-level security/.test(error.message)) throw new Error("Du saknar behörighet för det.");
  throw new Error(own ? error.message : `${prefix}: ${error.message}`);
}

/* ---------- demo ---------- */

type DemoTime = {
  entries: (TimeRow & { approved_by: string | null })[];
  absences: AbsenceRow[];
  shifts: ShiftRow[];
  offers: OfferRow[];
  locks: LockRow[];
  schedules: ScheduleRow[];
  leaders: Record<string, string | null>;
  balances: { employee_id: string; year_start_month_day: string; earning_model: VacationYearModel["earning"]; vacation_year_start: string; earned_days: number; paid_days: number; saved_days: number; updated_at: string }[];
};
const g = globalThis as unknown as {
  __binaafyTime?: DemoTime;
  __binaafyHr?: { employments: { id: string; schedule_id?: string | null }[]; events: CoreEvent[] };
};
const demo = (): DemoTime => (g.__binaafyTime ??= { entries: [], absences: [], shifts: [], offers: [], locks: [], schedules: [], leaders: {}, balances: [] });
const DEMO_ACTOR: Actor = { kind: "user", id: "demo", name: "demo@localhost" };
/** The person's history (the HR demo store's event list), as the database's hr_log() does. */
function demoLog(employeeId: string, type: EventType, data: CoreEvent["data"] = {}) {
  g.__binaafyHr?.events.push({ orgId: "demo", aggregateType: "employee", aggregateId: employeeId, type, data, actor: DEMO_ACTOR, at: new Date().toISOString() });
}
const demoLocked = (date: IsoDate) => demo().locks.some((l) => date >= l.period_start && date <= l.period_end);
function demoGuardDate(date: IsoDate) {
  if (demoLocked(date)) throw new Error(`Perioden för ${date} är låst; tid kan inte rapporteras, ändras eller godkännas där.`);
}
function demoEntry(id: string) {
  const r = demo().entries.find((e) => e.id === id);
  if (!r) throw new Error("Tidraden finns inte.");
  return r;
}
function demoRelink(employeeId: string) {
  const s = demo();
  const mine = s.absences.filter((a) => a.employee_id === employeeId && a.kind === "sjuk");
  for (const p of linkSickPeriods(mine.map(absenceFromRow), sickRules(mine[0]?.from_date ?? "2026-01-01").sickPay.relapseDays)) {
    const keep = mine.find((a) => a.id === p.absenceIds[0])?.sick_period_id ?? crypto.randomUUID();
    for (const id of p.absenceIds) {
      const row = mine.find((a) => a.id === id);
      if (row) row.sick_period_id = keep;
    }
  }
  for (const a of s.absences) if (a.kind !== "sjuk") a.sick_period_id = null;
}

/** A version as the input addEmploymentVersion takes, to copy it in demo mode (a new schedule, an accepted shift). */
const inputFromVersion = (v: EmploymentVersion): EmploymentInput => ({
  contractId: v.contractId,
  form: v.form,
  payForm: v.payForm,
  monthlySalary: v.monthlySalaryOre,
  hourlyRate: v.hourlyRateOre,
  fee: v.feeOre,
  feePeriod: v.feePeriod,
  decisionReference: v.decisionReference,
  title: v.title,
  workplace: v.workplace,
  workingTimePercent: v.workingTimePercent,
  weeklyHours: v.weeklyHours,
  substituteFor: v.substituteFor,
  probationEndsOn: v.probationEndsOn,
  startsOn: v.startsOn,
  endsOn: v.endsOn,
  noticeDays: v.noticeDays,
  payDay: v.payDay,
  vacationRule: v.vacationRule,
  vacationDays: v.vacationDays,
  vacationPercent: v.vacationPercent,
  atfHoursPerYear: v.atfHoursPerYear,
  pensionScheme: v.pensionScheme,
  terms: v.terms,
  changeReason: v.changeReason,
  validFrom: v.validFrom,
});

/* ---------- people and projects ---------- */

/** Names for the time pages (time_people(): payroll readers and staff, no personal data). */
export async function timePeople(): Promise<Person[]> {
  if (isDemo()) return (await listEmployees()).map((e) => ({ id: e.id, name: e.name, userId: e.userId, endedAt: e.endedAt }));
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("time_people", { p_org: await currentOrgId() });
  if (error) fail("Kunde inte hämta personalen", error);
  return ((data ?? []) as { id: string; name: string; user_id: string | null; ended_at: string | null }[]).map((r) => ({ id: r.id, name: r.name, userId: r.user_id, endedAt: r.ended_at }));
}

/** The organisation's projects for time, id and title (time_projects(): an employee may pick one but sees nothing else of it). */
export async function timeProjects(): Promise<TimeProject[]> {
  if (isDemo()) {
    return (await listProjects()).map((p) => ({ id: p.id, title: p.title, leaderUserId: demo().leaders[p.id] ?? null, status: p.status }));
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("time_projects", { p_org: await currentOrgId() });
  if (error) fail("Kunde inte hämta projekten", error);
  return ((data ?? []) as { id: string; title: string; leader_user_id: string | null; status: string }[]).map((r) => ({ id: r.id, title: r.title, leaderUserId: r.leader_user_id, status: r.status }));
}

/** Owner/admin name a project's leader (staff who may approve its time), or none. */
export async function setProjectLeader(projectId: string, userId: string | null): Promise<void> {
  if (isDemo()) {
    demo().leaders[projectId] = userId;
    return;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("portal_projects").update({ leader_user_id: userId }).eq("id", projectId).eq("org_id", await currentOrgId()).select("id");
  if (error) fail("Kunde inte spara projektledaren", error);
  if (!data?.length) throw new Error("Projektet finns inte.");
}

/** Members who may lead a project (owner, admin, staff), for the leader picker. */
export async function leaderCandidates(): Promise<{ userId: string; email: string; role: string }[]> {
  if (isDemo()) return [{ userId: "demo", email: "demo@localhost", role: "owner" }];
  const { listMembers } = await import("../org/members");
  const members = await listMembers();
  return members.filter((m) => m.role === "owner" || m.role === "admin" || m.role === "staff").map((m) => ({ userId: m.userId, email: m.email, role: m.role }));
}

/** The pool of behovsanställda: not ended, latest contract a SÄVA with timlön. */
export async function shiftPool(): Promise<Person[]> {
  if (isDemo()) {
    const [people, versions] = await Promise.all([listEmployees(), listEmployments()]);
    return people
      .filter((e) => !e.endedAt)
      .filter((e) => {
        const last = versions.filter((v) => v.employeeId === e.id).sort((a, b) => b.startsOn.localeCompare(a.startsOn) || b.version - a.version)[0];
        return last?.form === "sava" && last.payForm === "hourly";
      })
      .map((e) => ({ id: e.id, name: e.name, userId: e.userId, endedAt: e.endedAt }));
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("shift_pool", { p_org: await currentOrgId() });
  if (error) fail("Kunde inte hämta poolen", error);
  return ((data ?? []) as { employee_id: string; name: string }[]).map((r) => ({ id: r.employee_id, name: r.name, userId: null, endedAt: null }));
}

/** The signed-in user's own person in the current organisation; in demo mode the person picked on /min-tid. */
export async function myEmployee(userId: string | null, demoPick?: string | null): Promise<Employee | null> {
  const people = isDemo() ? await listEmployees() : null;
  if (people) return people.find((e) => e.id === demoPick) ?? null;
  if (!userId) return null;
  const supabase = await getDb();
  const { data, error } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", userId)
    .eq("org_id", await currentOrgId())
    .maybeSingle();
  if (error) fail("Kunde inte hämta din person", error);
  if (!data) return null;
  const { getEmployee } = await import("./store");
  return getEmployee(data.id as string);
}

/* ---------- time entries ---------- */

export async function listTimeEntries(q: { from: IsoDate; to: IsoDate; employeeId?: string; projectId?: string }): Promise<TimeEntry[]> {
  if (isDemo()) {
    return demo()
      .entries.filter((r) => r.work_date >= q.from && r.work_date <= q.to && (!q.employeeId || r.employee_id === q.employeeId) && (!q.projectId || r.project_id === q.projectId))
      .map(entryFromRow)
      .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.createdAt.localeCompare(b.createdAt));
  }
  const supabase = await getDb();
  let s = supabase.from("time_entries").select("*").gte("work_date", q.from).lte("work_date", q.to);
  if (q.employeeId) s = s.eq("employee_id", q.employeeId);
  if (q.projectId) s = s.eq("project_id", q.projectId);
  const org = await readOrgId();
  if (org) s = s.eq("org_id", org);
  const { data, error } = await s.order("work_date").order("created_at").limit(10_000);
  if (error) fail("Kunde inte hämta tiden", error);
  return (data as TimeRow[]).map(entryFromRow);
}

/** How many submitted rows wait for approval (the top bar's count), without reading them. */
export async function countWaitingEntries(): Promise<number> {
  if (isDemo()) return demo().entries.filter((r) => r.status === "submitted").length;
  const supabase = await getDb();
  let s = supabase.from("time_entries").select("id", { count: "exact", head: true }).eq("status", "submitted");
  const org = await readOrgId();
  if (org) s = s.eq("org_id", org);
  const { count, error } = await s;
  if (error) fail("Kunde inte räkna tiden", error);
  return count ?? 0;
}

/** Submitted rows waiting for approval, as far back as they go (Idag). */
export async function listWaitingEntries(): Promise<TimeEntry[]> {
  if (isDemo()) return demo().entries.filter((r) => r.status === "submitted").map(entryFromRow);
  const supabase = await getDb();
  let s = supabase.from("time_entries").select("*").eq("status", "submitted");
  const org = await readOrgId();
  if (org) s = s.eq("org_id", org);
  const { data, error } = await s.order("work_date").limit(2000);
  if (error) fail("Kunde inte hämta tiden", error);
  return (data as TimeRow[]).map(entryFromRow);
}

const entryRow = (i: TimeEntryInput) => ({
  work_date: i.date,
  start_time: i.start,
  end_time: i.end,
  break_minutes: i.start ? i.breakMinutes : 0,
  hours: i.hours,
  kind: i.kind,
  project_id: i.projectId,
  note: i.note,
});

/** A new row (a draft, or submitted at once) for a person; the database computes the hours from the times. */
export async function addTimeEntry(employeeId: string, input: TimeEntryInput, opts: { status?: "draft" | "submitted"; source?: TimeSource; shiftId?: string | null } = {}): Promise<string> {
  const row = { ...entryRow(input), status: opts.status ?? "draft", source: opts.source ?? "manual", shift_id: opts.shiftId ?? null };
  if (isDemo()) {
    demoGuardDate(input.date);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    demo().entries.push({ ...row, id, employee_id: employeeId, corrects_id: null, submitted_at: row.status === "submitted" ? now : null, approved_by: null, approved_at: null, created_at: now });
    if (row.status === "submitted") demoLog(employeeId, "time.submitted", { entries: 1, hours: input.hours });
    return id;
  }
  const supabase = await getDb();
  // Inserted as a draft and submitted through time_submit(), which writes the event.
  const { data, error } = await supabase
    .from("time_entries")
    .insert({ ...row, status: "draft", org_id: await currentOrgId(), employee_id: employeeId })
    .select("id")
    .single();
  if (error) fail("Kunde inte spara tiden", error);
  if (row.status === "submitted") await submitEntries([data.id as string]);
  return data.id as string;
}

/** Change a draft or a submitted row; a submitted row the person changes goes back to draft (0038), one a payroll approver changes stays submitted. */
export async function updateTimeEntry(id: string, input: TimeEntryInput): Promise<void> {
  const row = entryRow(input);
  if (isDemo()) {
    const r = demoEntry(id);
    if (r.status === "approved" || r.status === "locked") throw new Error("En godkänd tidrad ändras inte; gör en rättelse.");
    demoGuardDate(r.work_date);
    demoGuardDate(input.date);
    // Demo mode is always the owner (a payroll approver): a submitted row stays submitted, as in the database.
    Object.assign(r, row, { hours: input.start && input.end ? blockHours(input.start, input.end, input.breakMinutes) : input.hours });
    return;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("time_entries").update(row).eq("id", id).select("id");
  if (error) fail("Kunde inte spara tiden", error);
  if (!data?.length) throw new Error("Raden går inte att ändra (godkänd, eller inte din).");
}

export async function deleteTimeEntry(id: string): Promise<void> {
  if (isDemo()) {
    const r = demoEntry(id);
    if (r.status === "approved" || r.status === "locked") throw new Error("En godkänd tidrad tas inte bort; gör en rättelse.");
    demoGuardDate(r.work_date);
    demo().entries = demo().entries.filter((e) => e.id !== id);
    return;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("time_entries").delete().eq("id", id).select("id");
  if (error) fail("Kunde inte ta bort raden", error);
  if (!data?.length) throw new Error("Raden går inte att ta bort (inskickad, godkänd eller inte din).");
}

/** Clock in: an open row with a start and no end. */
export async function clockIn(employeeId: string, at: { date: IsoDate; time: string; projectId: string | null; shiftId?: string | null }): Promise<string> {
  if (isDemo()) {
    if (demo().entries.some((e) => e.employee_id === employeeId && e.start_time && !e.end_time)) throw new Error("Du är redan instämplad; stämpla ut först.");
    demoGuardDate(at.date);
    const id = crypto.randomUUID();
    demo().entries.push({
      id,
      employee_id: employeeId,
      work_date: at.date,
      start_time: at.time,
      end_time: null,
      break_minutes: 0,
      hours: 0,
      kind: "work",
      project_id: at.projectId,
      shift_id: at.shiftId ?? null,
      note: "",
      source: "clock",
      status: "draft",
      corrects_id: null,
      submitted_at: null,
      approved_by: null,
      approved_at: null,
      created_at: new Date().toISOString(),
    });
    return id;
  }
  const supabase = await getDb();
  const { data, error } = await supabase
    .from("time_entries")
    .insert({ org_id: await currentOrgId(), employee_id: employeeId, work_date: at.date, start_time: at.time, hours: 0, source: "clock", project_id: at.projectId, shift_id: at.shiftId ?? null })
    .select("id")
    .single();
  if (error) fail("Kunde inte stämpla in", error);
  return data.id as string;
}

/** Clock out: the end and the break; the hours follow. */
export async function clockOut(entryId: string, time: string, breakMinutes: number): Promise<void> {
  if (isDemo()) {
    const r = demoEntry(entryId);
    if (!r.start_time || r.end_time) throw new Error("Du är inte instämplad.");
    if (r.start_time.slice(0, 5) === time) throw new Error("Start och slut är samma klockslag.");
    const hours = blockHours(r.start_time, time, breakMinutes);
    if (hours <= 0) throw new Error("Rasten är längre än passet.");
    Object.assign(r, { end_time: time, break_minutes: breakMinutes, hours });
    return;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("time_entries").update({ end_time: time, break_minutes: breakMinutes }).eq("id", entryId).is("end_time", null).select("id");
  if (error) fail("Kunde inte stämpla ut", error);
  if (!data?.length) throw new Error("Du är inte instämplad.");
}

export async function submitEntries(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  if (isDemo()) {
    let n = 0;
    for (const id of ids) {
      const r = demoEntry(id);
      if (r.status !== "draft") continue;
      if (r.start_time && !r.end_time) throw new Error(`Stämpla ut innan du skickar in ${r.work_date}.`);
      demoGuardDate(r.work_date);
      Object.assign(r, { status: "submitted", submitted_at: new Date().toISOString() });
      n++;
    }
    if (n) demoLog(demoEntry(ids[0]).employee_id, "time.submitted", { entries: n });
    return n;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("time_submit", { p_entries: ids });
  if (error) fail("Kunde inte skicka in tiden", error);
  return Number(data ?? 0);
}

/** Demo mode: what time_approve() reads for the cost, from the HR demo store. */
async function demoBasis(ids: string[]): Promise<CostBasis[]> {
  const [people, versions] = await Promise.all([listEmployees(), listEmployments()]);
  return ids.map((id) => {
    const r = demoEntry(id);
    const person = people.find((e) => e.id === r.employee_id);
    const v = versionsOn(versions.filter((x) => x.employeeId === r.employee_id && (x.payForm === "monthly" || x.payForm === "hourly")), r.work_date)
      .filter((x) => inForce(x, r.work_date))
      .sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0];
    return {
      entryId: id,
      employeeName: person?.name ?? "",
      birthDate: person?.birthDate ?? null,
      workDate: r.work_date,
      hours: Number(r.hours),
      kind: r.kind,
      projectId: r.project_id,
      correctsId: r.corrects_id,
      payForm: v ? (v.payForm as "monthly" | "hourly") : null,
      monthlySalaryOre: v?.monthlySalaryOre ?? null,
      hourlyRateOre: v?.hourlyRateOre ?? null,
      weeklyHours: v?.weeklyHours ?? null,
      workingTimePercent: v?.workingTimePercent ?? null,
      correctedHourlyRateOre: r.corrects_id ? demoTimeCostRate(r.corrects_id) : null,
    };
  });
}

/**
 * Approve submitted rows. time_approve() (0038) writes the approval and
 * each project row's cost in one transaction, computing the hourly cost in
 * the database; demo mode computes the same with projectCostFor (the
 * parity is tested in contribution-parity.test.ts).
 */
export async function approveEntries(ids: string[], actorEmail: string | null): Promise<number> {
  if (!ids.length) return 0;
  if (isDemo()) {
    const costs = (await demoBasis(ids)).map((b) => projectCostFor(b)).filter((c): c is ProjectCostRow => c !== null);
    let n = 0;
    for (const id of ids) {
      const r = demoEntry(id);
      if (r.status === "approved" || r.status === "locked") continue;
      if (r.status !== "submitted") throw new Error(`Raden för ${r.work_date} är inte inskickad.`);
      demoGuardDate(r.work_date);
      Object.assign(r, { status: "approved", approved_by: "demo", approved_at: new Date().toISOString() });
      const c = costs.find((x) => x.entryId === id);
      if (c && r.project_id) demoAddTimeCost({ project_id: r.project_id, description: c.description, amount_ore: c.amountOre, cost_date: r.work_date, hours: c.hours, hourly_rate_ore: c.hourlyRateOre, created_by: actorEmail, time_entry_id: id });
      n++;
    }
    if (n) demoLog(demoEntry(ids[0]).employee_id, "time.approved", { entries: n });
    return n;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("time_approve", { p_entries: ids });
  if (error) fail("Kunde inte godkänna tiden", error);
  return Number(data ?? 0);
}

export async function returnEntries(ids: string[], note: string): Promise<number> {
  if (!ids.length) return 0;
  if (isDemo()) {
    let n = 0;
    for (const id of ids) {
      const r = demoEntry(id);
      if (r.status !== "submitted") continue;
      Object.assign(r, { status: "draft", submitted_at: null, note: note ? `${r.note} · Återskickad: ${note}`.replace(/^ · /, "").slice(0, 500) : r.note });
      n++;
    }
    if (n) demoLog(demoEntry(ids[0]).employee_id, "time.returned", { entries: n, note });
    return n;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("time_return", { p_entries: ids, p_note: note });
  if (error) fail("Kunde inte skicka tillbaka tiden", error);
  return Number(data ?? 0);
}

/** Correct an approved row: a reversal and, if given, a replacement, both submitted for approval. */
export async function correctEntry(id: string, replacement: TimeEntryInput | null, note: string): Promise<void> {
  if (isDemo()) {
    const r = demoEntry(id);
    if (r.status === "locked") throw new Error("Raden är låst av lönekörningen; rättelsen görs i nästa lön.");
    if (r.status !== "approved") throw new Error("Bara godkända rader rättas; ändra utkastet i stället.");
    if (isReversal(entryFromRow(r))) throw new Error("En vändning rättas inte; rätta ersättningsraden.");
    if (demo().entries.some((e) => e.corrects_id === id && Number(e.hours) < 0)) throw new Error("Raden är redan rättad; rätta ersättningsraden i stället.");
    demoGuardDate(r.work_date);
    const now = new Date().toISOString();
    const base = { employee_id: r.employee_id, work_date: r.work_date, shift_id: null, source: "manual" as const, status: "submitted" as const, corrects_id: id, submitted_at: now, approved_by: null, approved_at: null, created_at: now };
    demo().entries.push({ ...base, id: crypto.randomUUID(), start_time: null, end_time: null, break_minutes: 0, hours: -Number(r.hours), kind: r.kind, project_id: r.project_id, note: `Rättelse${note ? `: ${note}` : ""}` });
    if (replacement) demo().entries.push({ ...base, ...entryRow({ ...replacement, date: r.work_date }), id: crypto.randomUUID() });
    demoLog(r.employee_id, "time.corrected", { entryId: id, date: r.work_date, note });
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("time_correct", {
    p_entry: id,
    p_replacement: replacement
      ? { start: replacement.start ?? "", end: replacement.end ?? "", breakMinutes: replacement.breakMinutes, hours: replacement.hours, kind: replacement.kind, projectId: replacement.projectId ?? "", note: replacement.note }
      : null,
    p_note: note,
  });
  if (error) fail("Kunde inte rätta raden", error);
}

/* ---------- locks ---------- */

export async function listTimeLocks(): Promise<TimeLock[]> {
  if (isDemo()) return demo().locks.map(lockFromRow).sort((a, b) => b.from.localeCompare(a.from));
  const supabase = await getDb();
  let s = supabase.from("time_locks").select("id, period_start, period_end, note, locked_at");
  const org = await readOrgId();
  if (org) s = s.eq("org_id", org);
  const { data, error } = await s.order("period_start", { ascending: false }).limit(200);
  if (error) fail("Kunde inte hämta låsen", error);
  return (data as LockRow[]).map(lockFromRow);
}

export async function lockPeriod(from: IsoDate, to: IsoDate, note: string): Promise<void> {
  if (isDemo()) {
    const open = demo().entries.filter((e) => e.work_date >= from && e.work_date <= to && (e.status === "draft" || e.status === "submitted")).length;
    if (open) throw new Error(`${open} tidrader i perioden är inte godkända; godkänn, skicka tillbaka eller ta bort dem först.`);
    for (const e of demo().entries) if (e.work_date >= from && e.work_date <= to && e.status === "approved") e.status = "locked";
    demo().locks.push({ id: crypto.randomUUID(), period_start: from, period_end: to, note, locked_at: new Date().toISOString() });
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("time_lock_period", { p_org: await currentOrgId(), p_start: from, p_end: to, p_note: note });
  if (error) fail("Kunde inte låsa perioden", error);
}

/* ---------- absences ---------- */

export async function listAbsences(q: { employeeId?: string; from?: IsoDate; to?: IsoDate } = {}): Promise<Absence[]> {
  const overlaps = (a: { from_date: string; to_date: string | null }) => (!q.to || a.from_date <= q.to) && (!q.from || a.to_date === null || a.to_date >= q.from);
  if (isDemo()) return demo().absences.filter((a) => (!q.employeeId || a.employee_id === q.employeeId) && overlaps(a)).map(absenceFromRow).sort((a, b) => a.from.localeCompare(b.from));
  const supabase = await getDb();
  let s = supabase.from("absences").select("*");
  if (q.employeeId) s = s.eq("employee_id", q.employeeId);
  if (q.to) s = s.lte("from_date", q.to);
  if (q.from) s = s.or(`to_date.is.null,to_date.gte.${q.from}`);
  const org = await readOrgId();
  if (org) s = s.eq("org_id", org);
  const { data, error } = await s.order("from_date").limit(5000);
  if (error) fail("Kunde inte hämta frånvaron", error);
  return (data as AbsenceRow[]).map(absenceFromRow);
}

function demoAbsenceGuard(employeeId: string, id: string | null, i: { kind: AbsenceKind; from: IsoDate; to: IsoDate | null }) {
  for (let d = i.from; d <= (i.to ?? i.from); d = addDays(d, 1)) if (demoLocked(d)) throw new Error("Perioden är låst; frånvaro kan inte läggas in eller ändras där.");
  if (i.kind !== "sjuk") return;
  const end = i.to ?? "9999-12-31";
  if (demo().absences.some((a) => a.employee_id === employeeId && a.kind === "sjuk" && a.id !== id && a.from_date <= end && (a.to_date ?? "9999-12-31") >= i.from)) {
    throw new Error("Sjukfallet överlappar ett annat; förläng det i stället.");
  }
}

export async function addAbsence(employeeId: string, input: AbsenceInput): Promise<string> {
  const row = { kind: input.kind, from_date: input.from, to_date: input.to, extent: input.extent, note: input.note };
  if (isDemo()) {
    demoAbsenceGuard(employeeId, null, input);
    const id = crypto.randomUUID();
    demo().absences.push({ ...row, id, employee_id: employeeId, certificate_received_on: null, sick_period_id: null, approved_at: null, created_at: new Date().toISOString() });
    demoRelink(employeeId);
    demoLog(employeeId, "absence.reported", { kind: input.kind, from: input.from, to: input.to });
    return id;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("absences").insert({ ...row, org_id: await currentOrgId(), employee_id: employeeId }).select("id").single();
  if (error) fail("Kunde inte spara frånvaron", error);
  return data.id as string;
}

export async function updateAbsence(id: string, patch: Partial<AbsenceInput> & { certificateReceivedOn?: IsoDate | null; approved?: boolean }): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.kind !== undefined) row.kind = patch.kind;
  if (patch.from !== undefined) row.from_date = patch.from;
  if (patch.to !== undefined) row.to_date = patch.to;
  if (patch.extent !== undefined) row.extent = patch.extent;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.certificateReceivedOn !== undefined) row.certificate_received_on = patch.certificateReceivedOn;
  if (patch.approved !== undefined) row.approved_at = patch.approved ? new Date().toISOString() : null;
  if (isDemo()) {
    const a = demo().absences.find((x) => x.id === id);
    if (!a) throw new Error("Frånvaron finns inte.");
    demoAbsenceGuard(a.employee_id, id, { kind: (row.kind as AbsenceKind) ?? a.kind, from: (row.from_date as string) ?? a.from_date, to: "to_date" in row ? (row.to_date as string | null) : a.to_date });
    Object.assign(a, row);
    demoRelink(a.employee_id);
    if (patch.approved) demoLog(a.employee_id, "absence.approved", { kind: a.kind, from: a.from_date });
    else if (patch.certificateReceivedOn) demoLog(a.employee_id, "absence.certificate_received", { kind: a.kind, from: a.from_date });
    else demoLog(a.employee_id, "absence.updated", { kind: a.kind, from: a.from_date });
    return;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("absences").update(row).eq("id", id).select("id");
  if (error) fail("Kunde inte spara frånvaron", error);
  if (!data?.length) throw new Error("Frånvaron går inte att ändra (godkänd, eller inte din).");
}

export async function deleteAbsence(id: string): Promise<void> {
  if (isDemo()) {
    const a = demo().absences.find((x) => x.id === id);
    if (!a) throw new Error("Frånvaron finns inte.");
    demoAbsenceGuard(a.employee_id, id, { kind: "semester", from: a.from_date, to: a.to_date });
    demo().absences = demo().absences.filter((x) => x.id !== id);
    demoRelink(a.employee_id);
    demoLog(a.employee_id, "absence.removed", { kind: a.kind, from: a.from_date });
    return;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("absences").delete().eq("id", id).select("id");
  if (error) fail("Kunde inte ta bort frånvaron", error);
  if (!data?.length) throw new Error("Frånvaron går inte att ta bort (godkänd, eller inte din).");
}

/* ---------- schedules ---------- */

export async function listSchedules(employeeId?: string): Promise<Schedule[]> {
  if (isDemo()) return demo().schedules.filter((s) => !employeeId || s.employee_id === employeeId).map(scheduleFromRow);
  const supabase = await getDb();
  let s = supabase.from("schedules").select("id, employee_id, name, created_at, schedule_rules(weekday, start_time, end_time, break_minutes)");
  if (employeeId) s = s.eq("employee_id", employeeId);
  const org = await readOrgId();
  if (org) s = s.eq("org_id", org);
  const { data, error } = await s.order("created_at", { ascending: false }).limit(2000);
  if (error) fail("Kunde inte hämta scheman", error);
  return (data as unknown as ScheduleRow[]).map(scheduleFromRow);
}

/** A weekly pattern for an employment version: attached if the version has none, otherwise a new version from validFrom. */
export async function setSchedule(input: ScheduleInput): Promise<string> {
  if (isDemo()) {
    const versions = await listEmployments();
    const v = versions.find((x) => x.id === input.employmentId);
    if (!v) throw new Error("Anställningen finns inte.");
    const id = crypto.randomUUID();
    demo().schedules.push({
      id,
      employee_id: v.employeeId,
      name: input.name,
      created_at: new Date().toISOString(),
      schedule_rules: input.rules.map((r) => ({ weekday: r.weekday, start_time: r.start, end_time: r.end, break_minutes: r.breakMinutes })),
    });
    const hrRow = g.__binaafyHr?.employments.find((x) => x.id === v.id);
    if (!v.scheduleId && (!input.validFrom || input.validFrom <= v.validFrom)) {
      if (hrRow) hrRow.schedule_id = id;
    } else {
      if (v.validTo) throw new Error("Versionen är stängd; lägg schemat på den gällande versionen.");
      const newId = await addEmploymentVersion(v.employeeId, { ...inputFromVersion(v), contractId: v.contractId, validFrom: input.validFrom ?? v.validFrom, changeReason: "Nytt schema" });
      const row = g.__binaafyHr?.employments.find((x) => x.id === newId);
      if (row) row.schedule_id = id;
    }
    demoLog(v.employeeId, "schedule.created", { scheduleId: id, days: input.rules.length });
    return id;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("hr_set_schedule", {
    p_employment: input.employmentId,
    p_rules: input.rules.map((r) => ({ weekday: r.weekday, start: r.start, end: r.end, breakMinutes: r.breakMinutes })),
    p_valid_from: input.validFrom,
    p_name: input.name,
  });
  if (error) fail("Kunde inte spara schemat", error);
  return data as string;
}

/* ---------- shifts ---------- */

export async function listShifts(q: { from: IsoDate; to: IsoDate }): Promise<Shift[]> {
  if (isDemo()) {
    const s = demo();
    return s.shifts.filter((r) => r.shift_date >= q.from && r.shift_date <= q.to).map((r) => shiftFromRow(r, s.offers)).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  }
  const supabase = await getDb();
  let s = supabase.from("shifts").select("*").gte("shift_date", q.from).lte("shift_date", q.to);
  const org = await readOrgId();
  if (org) s = s.eq("org_id", org);
  const { data, error } = await s.order("shift_date").order("start_time").limit(5000);
  if (error) fail("Kunde inte hämta passen", error);
  const rows = data as ShiftRow[];
  if (!rows.length) return [];
  const offers = await supabase.from("shift_offers").select("shift_id, employee_id, status, answered_at").in("shift_id", rows.map((r) => r.id));
  if (offers.error) fail("Kunde inte hämta erbjudandena", offers.error);
  return rows.map((r) => shiftFromRow(r, (offers.data ?? []) as OfferRow[]));
}

/** Offer a shift to the pool (or to some of it); returns the shift id. */
export async function offerShift(input: ShiftOfferInput): Promise<string> {
  const expiresAt = input.expiresAt ? stockholmLocalToIso(input.expiresAt) : null;
  if (isDemo()) {
    const pool = (await shiftPool()).filter((p) => !input.employeeIds.length || input.employeeIds.includes(p.id));
    if (!pool.length) throw new Error("Ingen i poolen av behovsanställda att erbjuda passet (SÄVA med timlön).");
    const id = crypto.randomUUID();
    demo().shifts.push({ id, shift_date: input.date, start_time: input.start, end_time: input.end, break_minutes: input.breakMinutes, project_id: input.projectId, employee_id: null, offer_status: "offered", offer_expires_at: expiresAt, sava_period_id: null, note: input.note, created_at: new Date().toISOString() });
    for (const p of pool) demo().offers.push({ shift_id: id, employee_id: p.id, status: "offered", answered_at: null });
    return id;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("shift_offer", {
    p_org: await currentOrgId(),
    p_shift: { date: input.date, start: input.start, end: input.end, breakMinutes: input.breakMinutes, projectId: input.projectId ?? "", expiresAt: expiresAt ?? "", note: input.note },
    p_employees: input.employeeIds.length ? input.employeeIds : null,
  });
  if (error) fail("Kunde inte erbjuda passet", error);
  return data as string;
}

/** A planned shift for a named person (the Schema calendar), not offered to anyone. */
export async function planShift(employeeId: string, input: Omit<ShiftOfferInput, "expiresAt" | "employeeIds">): Promise<string> {
  const row = { shift_date: input.date, start_time: input.start, end_time: input.end, break_minutes: input.breakMinutes, project_id: input.projectId, employee_id: employeeId, note: input.note };
  if (isDemo()) {
    const id = crypto.randomUUID();
    demo().shifts.push({ ...row, id, offer_status: null, offer_expires_at: null, sava_period_id: null, created_at: new Date().toISOString() });
    return id;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("shifts").insert({ ...row, org_id: await currentOrgId() }).select("id").single();
  if (error) fail("Kunde inte spara passet", error);
  return data.id as string;
}

export async function deleteShift(id: string): Promise<void> {
  if (isDemo()) {
    const s = demo().shifts.find((x) => x.id === id);
    if (s?.offer_status === "accepted") throw new Error("Passet är accepterat och har blivit en anställning; det ändras inte.");
    demo().shifts = demo().shifts.filter((x) => x.id !== id);
    demo().offers = demo().offers.filter((x) => x.shift_id !== id);
    return;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("shifts").delete().eq("id", id).select("id");
  if (error) fail("Kunde inte ta bort passet", error);
  if (!data?.length) throw new Error("Passet går inte att ta bort.");
}

/**
 * The employee answers an offer. Yes: the shift becomes theirs and a SÄVA
 * for the day is registered from their latest timlön contract (the
 * database's shift_answer()), so the LAS clock counts it.
 */
export async function answerShift(shiftId: string, accept: boolean, employeeId: string): Promise<void> {
  if (isDemo()) {
    const s = demo();
    const shift = s.shifts.find((x) => x.id === shiftId);
    const offer = s.offers.find((o) => o.shift_id === shiftId && o.employee_id === employeeId);
    if (!shift || !offer) throw new Error("Passet är inte erbjudet dig.");
    if (offer.status !== "offered") throw new Error("Du har redan svarat på erbjudandet.");
    const now = new Date().toISOString();
    if (!accept) {
      Object.assign(offer, { status: "declined", answered_at: now });
      if (shift.offer_status === "offered" && !s.offers.some((o) => o.shift_id === shiftId && o.status === "offered")) shift.offer_status = "declined";
      demoLog(employeeId, "shift.declined", { shiftId, date: shift.shift_date });
      return;
    }
    if (shift.offer_status !== "offered") throw new Error("Passet är redan tillsatt eller återkallat.");
    if (shift.offer_expires_at && shift.offer_expires_at < now) throw new Error("Erbjudandet har gått ut.");
    const template = (await listEmployments(employeeId)).filter((v) => v.payForm === "hourly").sort((a, b) => b.startsOn.localeCompare(a.startsOn) || b.version - a.version)[0];
    if (!template) throw new Error("Det finns inget avtal med timlön att utgå från; kontakta arbetsgivaren.");
    const project = shift.project_id ? (await timeProjects()).find((p) => p.id === shift.project_id) : null;
    const employmentId = await addEmploymentVersion(employeeId, {
      ...inputFromVersion(template),
      contractId: null,
      form: "sava",
      payForm: "hourly",
      workplace: project?.title ?? template.workplace,
      workingTimePercent: 100,
      weeklyHours: null,
      startsOn: shift.shift_date,
      endsOn: shift.shift_date,
      validFrom: shift.shift_date,
      probationEndsOn: null,
      terms: `Pass ${shift.shift_date} kl. ${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)}.`,
      changeReason: "Inringt pass",
    });
    Object.assign(shift, { offer_status: "accepted", employee_id: employeeId, sava_period_id: employmentId });
    Object.assign(offer, { status: "accepted", answered_at: now });
    for (const o of s.offers) if (o.shift_id === shiftId && o.status === "offered") o.status = "expired";
    demoLog(employeeId, "shift.accepted", { shiftId, date: shift.shift_date, employmentId });
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("shift_answer", { p_shift: shiftId, p_accept: accept });
  if (error) fail("Kunde inte svara på passet", error);
}

export async function withdrawShift(shiftId: string): Promise<void> {
  if (isDemo()) {
    const shift = demo().shifts.find((x) => x.id === shiftId);
    if (!shift || (shift.offer_status !== "offered" && shift.offer_status !== "declined")) throw new Error("Passet är inte ett öppet erbjudande.");
    shift.offer_status = "expired";
    for (const o of demo().offers) if (o.shift_id === shiftId && o.status === "offered") o.status = "expired";
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("shift_withdraw", { p_shift: shiftId });
  if (error) fail("Kunde inte återkalla passet", error);
}

/* ---------- semester balances ---------- */

export type StoredBalance = { vacationYearStart: IsoDate; model: VacationYearModel; earnedDays: number; paidDays: number; savedDays: number; updatedAt: string };

export async function listLeaveBalances(employeeId: string): Promise<StoredBalance[]> {
  type Row = { year_start_month_day: string; earning_model: VacationYearModel["earning"]; vacation_year_start: string; earned_days: number | string; paid_days: number | string; saved_days: number | string; updated_at: string };
  const map = (r: Row): StoredBalance => ({
    vacationYearStart: r.vacation_year_start,
    model: { startMonthDay: r.year_start_month_day, earning: r.earning_model },
    earnedDays: Number(r.earned_days),
    paidDays: Number(r.paid_days),
    savedDays: Number(r.saved_days),
    updatedAt: r.updated_at,
  });
  if (isDemo()) return demo().balances.filter((b) => b.employee_id === employeeId).map(map).sort((a, b) => a.vacationYearStart.localeCompare(b.vacationYearStart));
  const supabase = await getDb();
  const { data, error } = await supabase
    .from("leave_balances")
    .select("year_start_month_day, earning_model, vacation_year_start, earned_days, paid_days, saved_days, updated_at")
    .eq("employee_id", employeeId)
    .order("vacation_year_start");
  if (error) fail("Kunde inte hämta semestersaldona", error);
  return (data as Row[]).map(map);
}

/** Store the computed balances: one row per semesterår, with the model they were computed with. */
export async function saveLeaveBalances(employeeId: string, model: VacationYearModel, rows: readonly VacationBalance[]): Promise<void> {
  const out = rows.map((r) => ({
    employee_id: employeeId,
    year_start_month_day: model.startMonthDay,
    earning_model: model.earning,
    vacation_year_start: r.yearFrom,
    earned_days: r.earnedDays,
    paid_days: r.takenDays,
    saved_days: r.savedDays,
  }));
  if (isDemo()) {
    const now = new Date().toISOString();
    demo().balances = [...demo().balances.filter((b) => b.employee_id !== employeeId), ...out.map((r) => ({ ...r, updated_at: now }))];
    return;
  }
  if (!out.length) return;
  const supabase = await getDb();
  const org = await currentOrgId();
  const { error } = await supabase.from("leave_balances").upsert(out.map((r) => ({ ...r, org_id: org })), { onConflict: "employee_id,vacation_year_start" });
  if (error) fail("Kunde inte spara semestersaldona", error);
}
