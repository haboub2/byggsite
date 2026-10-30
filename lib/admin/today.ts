import "server-only";
import { listLeads } from "../leads";
import { listQuotes } from "../quotes/store";
import { quoteTotals } from "../quotes/math";
import { listOverduePhases, listProjects, getProjectBundle } from "../portal/store";
import { changeOrdersToSchedule } from "../portal/timeline";
import { progressPercent } from "../portal/schema";
import { listInvoices } from "../core/invoices/store";
import { listRecentEvents } from "../core/events-store";
import { eventLabel } from "../core/events";
import { formatOre } from "../core/money";
import { todayIso } from "../quotes/schema";
import type { Access } from "../core/org/roles";
import { listEmployees, listEmployments, loadClocks } from "../core/hr/store";
import { hrTodos, type HrTodo } from "../core/hr/today";
import { countWaitingEntries, listAbsences, listShifts, listWaitingEntries, openOffer, timePeople } from "../core/hr/time-store";
import { certificatesDue } from "../core/hr/absence";
import { timeTodos, type TimeTodo } from "../core/hr/time-today";
import { getPayrollSettings, listRuns } from "../core/payroll/run-store";
import { payrollTodos, type PayrollTodo } from "../core/payroll/today";
import { addDays } from "../core/rules/index";

/**
 * Everything the "Idag" start page and the top bar's counters need, from the
 * stores that already exist. Each source is read on its own: one that fails
 * (a missing migration, a role without access) leaves its part empty rather
 * than taking the page down.
 */

export type TodoKind = "lead" | "quote" | "phase" | "photo" | "change" | "invoice" | "hr" | "time" | "payroll";

export type Todo = {
  id: string;
  kind: TodoKind;
  tag: string;
  title: string;
  meta: string;
  action: string;
  href: string;
  /** Sorts the list: lower first. */
  weight: number;
};

export type TodayProject = {
  id: string;
  name: string;
  phase: string;
  status: string;
  late: boolean;
  percent: number;
};

export type TodayData = {
  newLeads: number;
  quotesOut: { count: number; amount: number };
  activeProjects: number;
  lateProjects: number;
  overdue: { count: number; ore: number };
  todos: Todo[];
  projects: TodayProject[];
  recent: { text: string; at: string }[];
};

const QUOTE_NUDGE_DAYS = 7;
const MAX_PROJECTS = 12;

async function safe<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (err) {
    console.warn(`[idag] ${label} left out:`, err instanceof Error ? err.message : err);
    return fallback;
  }
}

const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso.slice(0, 10)}T12:00:00Z`)) / 86_400_000);

const kr = (n: number) => `${Math.round(n).toLocaleString("sv-SE").replace(/ /g, " ")} kr`;

/** Personal rows (lib/core/hr/today.ts), for those who read payroll. */
async function loadHrTodos(today: string): Promise<HrTodo[]> {
  const [employees, versions] = await Promise.all([listEmployees(), listEmployments()]);
  // The clocks only when someone has a form that runs one; the rest need just the end dates.
  const clocked = new Set(versions.filter((v) => v.form === "sava" || v.form === "vikariat" || v.form === "provanstallning").map((v) => v.employeeId));
  const clocks = clocked.size === 0 ? new Map() : clocked.size === 1 ? await loadClocks(today, [...clocked][0]) : await loadClocks(today);
  return hrTodos({ employees, versions, clocks, today });
}

/**
 * Time rows (lib/core/hr/time-today.ts): time waiting for approval and
 * unanswered call-ins for those who approve (RLS limits a project leader to
 * their projects), missing läkarintyg for payroll readers only.
 */
async function loadTimeTodos(access: Access[], today: string): Promise<TimeTodo[]> {
  const payroll = access.includes("payroll");
  const [people, waiting, shifts, absences] = await Promise.all([
    timePeople(),
    listWaitingEntries(),
    listShifts({ from: today, to: addDays(today, 60) }),
    payroll ? listAbsences({ from: addDays(today, -60), to: today }) : [],
  ]);
  return timeTodos({
    names: new Map(people.map((p) => [p.id, p.name])),
    certificates: certificatesDue(absences.filter((a) => a.kind === "sjuk"), today),
    openShifts: shifts.filter((s) => openOffer(s) && !s.offers.some((o) => o.status === "accepted")),
    waiting,
    today,
  });
}

/** Payroll rows (lib/core/payroll/today.ts): a run due, a run to approve, the skattekonto payment. */
async function loadPayrollTodos(access: Access[], today: string): Promise<PayrollTodo[]> {
  const [runs, { settings }, employees] = await Promise.all([listRuns(), getPayrollSettings(), listEmployees()]);
  return payrollTodos({ runs, settings, today, canApprove: access.includes("admin"), hasPeople: employees.some((e) => !e.endedAt) });
}

export async function loadToday(access: Access[], today = todayIso()): Promise<TodayData> {
  const canWrite = access.includes("write");
  const [leads, sentQuotes, overduePhases, projects, overdueInvoices, events, hr, time, payroll] = await Promise.all([
    canWrite ? safe("leads", () => listLeads({ status: "new" }, { limit: 20 }), { leads: [], total: 0 }) : { leads: [], total: 0 },
    canWrite ? safe("quotes", () => listQuotes({ status: "sent" }), []) : [],
    safe("phases", () => listOverduePhases(today), []),
    safe("projects", () => listProjects(), []),
    safe("invoices", () => listInvoices({ tab: "overdue" }), []),
    safe("events", () => listRecentEvents(6), []),
    access.includes("payroll") ? safe("personal", () => loadHrTodos(today), []) : [],
    access.includes("time") && (access.includes("payroll") || access.includes("write")) ? safe("tid", () => loadTimeTodos(access, today), []) : [],
    access.includes("payroll") ? safe("lön", () => loadPayrollTodos(access, today), []) : [],
  ]);

  const active = projects.filter((p) => p.status === "active").slice(0, MAX_PROJECTS);
  const bundles = (await Promise.all(active.map((p) => safe(`project ${p.id}`, () => getProjectBundle(p.id), null)))).filter(
    (b): b is NonNullable<typeof b> => b !== null
  );
  const projectName = new Map(projects.map((p) => [p.id, p.title]));
  const lateIds = new Set(overduePhases.map((ph) => ph.project_id));

  const todos: Todo[] = [];

  for (const l of leads.leads) {
    const age = daysBetween(l.created_at, today);
    todos.push({
      id: `lead-${l.id}`,
      kind: "lead",
      tag: "Ny förfrågan",
      title: [l.name, l.service].filter(Boolean).join(", ") || "Ny förfrågan",
      meta: [age <= 0 ? "kom in i dag" : age === 1 ? "kom in i går" : `kom in för ${age} dagar sedan`, l.phone, l.email].filter(Boolean).join(" · "),
      action: "Skriv offert",
      href: `/admin/offerter/ny?lead=${l.id}`,
      weight: 20 - Math.min(age, 10),
    });
  }

  for (const q of sentQuotes) {
    if (!q.sent_at) continue;
    const age = daysBetween(q.sent_at, today);
    if (age < QUOTE_NUDGE_DAYS) continue;
    todos.push({
      id: `quote-${q.id}`,
      kind: "quote",
      tag: "Svar?",
      title: `Offert ${q.number}, ${q.data.title || "utan rubrik"}`,
      meta: `${q.data.customer.company || q.data.customer.name} · ${kr(quoteTotals(q.data).pay)} · skickad för ${age} dagar sedan`,
      action: "Följ upp",
      href: `/admin/offerter/${q.id}`,
      weight: 40 - Math.min(age, 20),
    });
  }

  for (const ph of overduePhases) {
    const late = daysBetween(ph.ends_on ?? today, today);
    todos.push({
      id: `phase-${ph.id}`,
      kind: "phase",
      tag: "Fas slut",
      title: `${ph.name}, ${projectName.get(ph.project_id) ?? "projekt"}`,
      meta: `Skulle vara klar för ${late === 1 ? "1 dag" : `${late} dagar`} sedan. Bocka av, eller lägg in en försening.`,
      action: "Öppna tidplanen",
      href: `/admin/projekt/${ph.project_id}#tidplan`,
      weight: 10,
    });
  }

  for (const b of bundles) {
    for (const o of changeOrdersToSchedule(b.changeOrders, b.phases)) {
      todos.push({
        id: `change-${o.id}`,
        kind: "change",
        tag: "ÄTA",
        title: `ÄTA ${o.number} godkänd, ${b.project.title}`,
        meta: `${o.title} · ska in i tidplanen`,
        action: "Lägg in",
        href: `/admin/projekt/${b.project.id}`,
        weight: 15,
      });
    }
    const photosToday = b.photos.filter((p) => p.day === today).length;
    const started = b.project.starts_on && b.project.starts_on <= today;
    if (started && photosToday === 0 && !b.project.archived_at) {
      todos.push({
        id: `photo-${b.project.id}`,
        kind: "photo",
        tag: "Foto",
        title: `${b.project.title} har inga foton i dag`,
        meta: b.project.address || "Dagens uppdatering: foton och en rad",
        action: "Dagens uppdatering",
        href: `/admin/projekt/${b.project.id}#ny-uppdatering`,
        weight: 50,
      });
    }
  }

  for (const inv of overdueInvoices) {
    const late = inv.dueOn ? daysBetween(inv.dueOn, today) : 0;
    todos.push({
      id: `invoice-${inv.id}`,
      kind: "invoice",
      tag: "Förfallen",
      title: `Faktura ${inv.number ?? "utkast"}, ${formatOre(inv.payableOre - inv.paidOre, { decimals: 0, currency: true })}`,
      meta: `${inv.document.buyer.name} · förföll för ${late === 1 ? "1 dag" : `${late} dagar`} sedan${inv.reminders ? ` · ${inv.reminders} påminnelse${inv.reminders > 1 ? "r" : ""}` : ""}`,
      action: "Skicka påminnelse",
      href: `/admin/fakturor/${inv.id}`,
      weight: 5,
    });
  }

  for (const h of hr) {
    todos.push({
      id: `hr-${h.id}`,
      kind: "hr",
      tag: h.tag,
      title: h.title,
      meta: h.meta,
      action: "Öppna personen",
      href: `/admin/personal/${h.employeeId}`,
      // Closest first; a notice due within days sits with the overdue invoices.
      weight: h.days <= 7 ? 6 : 12 + Math.min(h.days, 30),
    });
  }

  for (const t of time) {
    todos.push({
      id: `time-${t.id}`,
      kind: "time",
      tag: t.tag,
      title: t.title,
      meta: t.meta,
      action: t.kind === "certificate" ? "Öppna frånvaron" : t.kind === "call-in" ? "Öppna Tid" : "Godkänn",
      href: t.href,
      weight: t.weight + 2,
    });
  }

  for (const p of payroll) {
    todos.push({ id: `payroll-${p.id}`, kind: "payroll", tag: p.tag, title: p.title, meta: p.meta, action: p.kind === "tax-account" ? "Öppna rapporten" : "Öppna lönekörningen", href: p.href, weight: p.weight + 2 });
  }

  todos.sort((a, b) => a.weight - b.weight);

  const projectCards: TodayProject[] = bundles.map((b) => {
    const current = b.phases.find((ph) => !ph.done_at);
    const late = lateIds.has(b.project.id);
    return {
      id: b.project.id,
      name: b.project.title,
      phase: current ? current.name : "Alla faser klara",
      status: late ? "Försenat" : current ? "Enligt plan" : "Klart",
      late,
      percent: progressPercent(b.phases),
    };
  });

  return {
    newLeads: leads.total,
    quotesOut: { count: sentQuotes.length, amount: sentQuotes.reduce((sum, q) => sum + quoteTotals(q.data).pay, 0) },
    activeProjects: active.length,
    lateProjects: lateIds.size,
    overdue: { count: overdueInvoices.length, ore: overdueInvoices.reduce((sum, i) => sum + (i.payableOre - i.paidOre), 0) },
    todos,
    projects: projectCards,
    recent: events.map((e) => ({ text: eventLabel(e.type).text, at: e.at })),
  };
}

/** The three numbers in the top bar. Cheap enough for every admin page. */
export async function loadNavCounts(access: Access[], today = todayIso()): Promise<{ inbox: number; projects: number; invoices: number; time: number }> {
  const canWrite = access.includes("write");
  const approves = access.includes("time") && (canWrite || access.includes("admin"));
  const [leads, phases, overdue, waiting] = await Promise.all([
    canWrite ? safe("leads", () => listLeads({ status: "new" }, { limit: 1 }), { leads: [], total: 0 }) : { leads: [], total: 0 },
    safe("phases", () => listOverduePhases(today), []),
    safe("invoices", () => listInvoices({ tab: "overdue" }), []),
    approves ? safe("tid", () => countWaitingEntries(), 0) : 0,
  ]);
  return { inbox: leads.total, projects: new Set(phases.map((p) => p.project_id)).size, invoices: overdue.length, time: waiting };
}
