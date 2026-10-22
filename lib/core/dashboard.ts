import { addDays, daysBetween } from "./rules";
import type { Ore } from "./money";

/**
 * The Ekonomi dashboard's figures (docs/fakturering.md, dashboarden), as
 * pure functions over the invoices so they can be tested and so the page
 * never has to think. Everything derives from issued invoices, payments and
 * the payment plans; nothing is typed in.
 */

export type DashInvoice = {
  id: string;
  number: string | null;
  kind: "invoice" | "credit" | "correction";
  status: string;
  buyerName: string;
  customerId: string | null;
  reverseCharge: boolean;
  issuedOn: string | null;
  dueOn: string | null;
  paidAt: string | null;
  totalOre: Ore;
  vatOre: Ore;
  rotOre: Ore;
  payableOre: Ore;
  paidOre: Ore;
  reminders: number;
};

export type PlannedInflow = { expectedOn: string; amountOre: Ore; label: string };

const open = (i: DashInvoice) => i.kind === "invoice" && ["issued", "sent", "partially_paid"].includes(i.status);
// A change invoice repeats its original's amounts; only the original counts.
const issued = (i: DashInvoice) => i.status !== "draft" && i.status !== "void" && i.kind !== "correction";
const remaining = (i: DashInvoice) => i.payableOre - i.paidOre;

/** Monday of the week that holds `date`. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  return addDays(date, -day);
}

/** ISO week number, for labels. */
export function isoWeek(date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

export type Dashboard = {
  kpis: {
    openOre: Ore;
    openCount: number;
    overdueOre: Ore;
    overdueCount: number;
    oldestOverdueDays: number;
    dueThisWeekOre: Ore;
    dueThisWeekCount: number;
    invoicedThisMonthOre: Ore;
    invoicedLastMonthOre: Ore;
  };
  forecast: { weekStart: string; week: number; issuedOre: Ore; overdueOre: Ore; plannedOre: Ore }[];
  aging: { notDue: Ore; d1to30: Ore; d31to60: Ore; over60: Ore };
  byMonth: { month: string; netOre: Ore; current: boolean }[];
  vat: { month: string; taxableOre: Ore; vatOre: Ore; reverseChargeOre: Ore; rotOre: Ore };
  topCustomers: { name: string; remainingOre: Ore; count: number; overdue: boolean }[];
  avgDaysToPay: number | null;
  paidOnTimePercent: number | null;
  todo: { kind: "reminder" | "draft"; count: number; amountOre: Ore }[];
};

export function computeDashboard(invoices: DashInvoice[], planned: PlannedInflow[], today: string): Dashboard {
  const month = today.slice(0, 7);
  const lastMonth = addDays(`${month}-01`, -1).slice(0, 7);
  const openInv = invoices.filter(open);
  const overdue = openInv.filter((i) => i.dueOn && i.dueOn < today);
  const thisWeek = weekStart(today);
  const nextWeek = addDays(thisWeek, 7);
  const dueThisWeek = openInv.filter((i) => i.dueOn && i.dueOn >= today && i.dueOn < nextWeek);
  const sum = (list: DashInvoice[], f: (i: DashInvoice) => Ore) => list.reduce((s, i) => s + f(i), 0);

  const kpis = {
    openOre: sum(openInv, remaining),
    openCount: openInv.length,
    overdueOre: sum(overdue, remaining),
    overdueCount: overdue.length,
    oldestOverdueDays: overdue.reduce((m, i) => Math.max(m, daysBetween(i.dueOn!, today)), 0),
    dueThisWeekOre: sum(dueThisWeek, remaining),
    dueThisWeekCount: dueThisWeek.length,
    invoicedThisMonthOre: sum(invoices.filter((i) => issued(i) && i.issuedOn?.startsWith(month)), (i) => i.totalOre),
    invoicedLastMonthOre: sum(invoices.filter((i) => issued(i) && i.issuedOn?.startsWith(lastMonth)), (i) => i.totalOre),
  };

  const forecast = Array.from({ length: 8 }, (_, k) => {
    const start = addDays(thisWeek, k * 7);
    const end = addDays(start, 7);
    const issuedOre = sum(openInv.filter((i) => i.dueOn && i.dueOn >= today && i.dueOn >= start && i.dueOn < end), remaining);
    const overdueOre = k === 0 ? kpis.overdueOre : 0;
    const plannedOre = planned.filter((p) => p.expectedOn >= start && p.expectedOn < end).reduce((s, p) => s + p.amountOre, 0);
    return { weekStart: start, week: isoWeek(start), issuedOre, overdueOre, plannedOre };
  });

  const aging = { notDue: 0, d1to30: 0, d31to60: 0, over60: 0 };
  for (const i of openInv) {
    const days = i.dueOn && i.dueOn < today ? daysBetween(i.dueOn, today) : 0;
    const r = remaining(i);
    if (days === 0) aging.notDue += r;
    else if (days <= 30) aging.d1to30 += r;
    else if (days <= 60) aging.d31to60 += r;
    else aging.over60 += r;
  }

  // The last six calendar months, oldest first.
  const months: string[] = [];
  for (let k = 5; k >= 0; k--) {
    const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 - k, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  const byMonthRows = months.map((m) => ({
    month: m,
    netOre: sum(invoices.filter((i) => issued(i) && i.issuedOn?.startsWith(m)), (i) => i.totalOre - i.vatOre),
    current: m === month,
  }));

  const thisMonthIssued = invoices.filter((i) => issued(i) && i.issuedOn?.startsWith(month));
  const vat = {
    month,
    taxableOre: sum(thisMonthIssued.filter((i) => !i.reverseCharge), (i) => i.totalOre - i.vatOre),
    vatOre: sum(thisMonthIssued, (i) => i.vatOre),
    reverseChargeOre: sum(thisMonthIssued.filter((i) => i.reverseCharge), (i) => i.totalOre),
    rotOre: sum(thisMonthIssued, (i) => i.rotOre),
  };

  const byCustomer = new Map<string, { name: string; remainingOre: Ore; count: number; overdue: boolean }>();
  for (const i of openInv) {
    const key = i.customerId ?? i.buyerName;
    const row = byCustomer.get(key) ?? { name: i.buyerName, remainingOre: 0, count: 0, overdue: false };
    row.remainingOre += remaining(i);
    row.count++;
    row.overdue ||= Boolean(i.dueOn && i.dueOn < today);
    byCustomer.set(key, row);
  }
  const topCustomers = [...byCustomer.values()].sort((a, b) => b.remainingOre - a.remainingOre).slice(0, 6);

  const paid = invoices.filter((i) => i.kind === "invoice" && i.status === "paid" && i.issuedOn && i.paidAt);
  const avgDaysToPay = paid.length ? Math.round(paid.reduce((s, i) => s + daysBetween(i.issuedOn!, i.paidAt!.slice(0, 10)), 0) / paid.length) : null;
  const paidOnTimePercent = paid.length ? Math.round((100 * paid.filter((i) => !i.dueOn || i.paidAt!.slice(0, 10) <= i.dueOn).length) / paid.length) : null;

  const drafts = invoices.filter((i) => i.status === "draft");
  const todo: Dashboard["todo"] = [];
  if (overdue.length) todo.push({ kind: "reminder", count: overdue.length, amountOre: kpis.overdueOre });
  if (drafts.length) todo.push({ kind: "draft", count: drafts.length, amountOre: sum(drafts, (i) => i.payableOre) });

  return { kpis, forecast, aging, byMonth: byMonthRows, vat, topCustomers, avgDaysToPay, paidOnTimePercent, todo };
}
