import type { Ore } from "../money";
import { DEFAULT_CHART, type AccountNumber, type ChartOfAccounts } from "./posting";
import { fiscalYearLabel } from "../org/settings";

/**
 * Periods of the ledger: what a month contains, the VAT return's figures
 * for it, and whether it is locked. Pure functions over journal entries as
 * the store reads them; the SIE export and the page Bokföring use them.
 *
 * A locked period (period_locks) has been handed to the bookkeeping. The
 * database refuses new entries dated inside it (trigger
 * journal_entries_check_lock in 0014); anything that belongs there is
 * corrected with an entry in an open period.
 */

export type LedgerLine = { account: AccountNumber; debit: Ore; credit: Ore; text?: string | null };

export type LedgerEntry = {
  id: string;
  series: string;
  fiscalYear: number;
  /** Number within the series and fiscal year. */
  number: number;
  date: string;
  text: string;
  sourceType: string;
  lines: LedgerLine[];
};

export type PeriodLock = { periodStart: string; periodEnd: string; lockedBy: string | null; lockedAt: string };

/** "2026-10" */
export type Period = string;

const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isPeriod(value: unknown): value is Period {
  return typeof value === "string" && PERIOD.test(value);
}

function parts(period: Period): { year: number; month: number } {
  const m = PERIOD.exec(period);
  if (!m) throw new RangeError(`Perioden skrivs ÅÅÅÅ-MM, fick "${period}".`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** First and last day of the month, inclusive. */
export function monthRange(period: Period): { from: string; to: string } {
  const { year, month } = parts(period);
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(daysInMonth(year, month))}` };
}

export function periodOf(date: string): Period {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError(`Datum skrivs ÅÅÅÅ-MM-DD, fick "${date}".`);
  return date.slice(0, 7);
}

export function previousMonth(period: Period): Period {
  const { year, month } = parts(period);
  return month === 1 ? `${year - 1}-12` : `${year}-${pad(month - 1)}`;
}

/** The `count` months ending with `last`, newest first. */
export function recentPeriods(last: Period, count: number): Period[] {
  const out: Period[] = [last];
  while (out.length < count) out.push(previousMonth(out[out.length - 1]));
  return out;
}

/** First day of the earliest month and last day of the latest: one date range covering all of them. */
export function periodsSpan(periods: Period[]): { from: string; to: string } {
  if (periods.length === 0) throw new RangeError("Inga perioder.");
  const sorted = [...periods].sort();
  return { from: monthRange(sorted[0]).from, to: monthRange(sorted[sorted.length - 1]).to };
}

/** A count for each of `periods`, in their order: 0 for a month `rows` leaves out (journal_entry_counts returns only months with entries). */
export function countsPerPeriod(periods: Period[], rows: { period: string; count: number | string }[]): { period: Period; count: number }[] {
  const byPeriod = new Map(rows.map((r) => [r.period, Number(r.count)]));
  return periods.map((period) => ({ period, count: byPeriod.get(period) ?? 0 }));
}

/** The months from `from` to `to` inclusive (dates or periods), oldest first: a fiscal year's months for the lock overview. */
export function periodsBetween(from: string, to: string): Period[] {
  const out: Period[] = [];
  const last = to.slice(0, 7);
  let p = from.slice(0, 7);
  while (p <= last) {
    out.push(p);
    const { year, month } = parts(p);
    p = month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;
  }
  return out;
}

/** True when a lock covers the date. */
export function isLocked(locks: Pick<PeriodLock, "periodStart" | "periodEnd">[], date: string): boolean {
  return locks.some((l) => l.periodStart <= date && date <= l.periodEnd);
}

/** True when the whole month is covered by one lock. */
export function isPeriodLocked(locks: Pick<PeriodLock, "periodStart" | "periodEnd">[], period: Period): boolean {
  const { from, to } = monthRange(period);
  return locks.some((l) => l.periodStart <= from && to <= l.periodEnd);
}

/** Why a month cannot be locked yet, or null when it can: only months that have ended. */
export function lockProblem(locks: Pick<PeriodLock, "periodStart" | "periodEnd">[], period: Period, today: string): string | null {
  if (isPeriodLocked(locks, period)) return "Perioden är redan låst.";
  if (monthRange(period).to >= today) return "Perioden är inte slut än. En låst månad tar inte emot fler verifikationer, så den låses först när den är över.";
  return null;
}

/** Day of the month after which last month should be locked: the VAT return for a month is due on the 12th of the month after. */
export const LOCK_REMINDER_AFTER_DAY = 10;

export type PeriodTodo =
  /** An ended month with entries that has neither been downloaded as SIE nor locked. `lockDue`: it is last month and past the 10th. */
  | { kind: "export"; period: Period; entries: number; lockDue: boolean }
  /** Last month has been exported but is still open after the 10th. */
  | { kind: "lock"; period: Period; entries: number };

/**
 * What the dashboard says about the bookkeeping: one row per ended month
 * that has entries but no SIE export and no lock (oldest first), and a soft
 * reminder when last month is still open after the 10th. A month without
 * entries needs neither. `exported` holds the months an export.sie event
 * names; a lock counts as exported, since locking also logs export.sie.
 */
export function periodTodos(input: { entries: { period: Period; count: number }[]; exported: Iterable<Period>; locks: Pick<PeriodLock, "periodStart" | "periodEnd">[]; today: string }): PeriodTodo[] {
  const current = periodOf(input.today);
  const last = previousMonth(current);
  const exported = new Set(input.exported);
  const pastReminderDay = Number(input.today.slice(8, 10)) > LOCK_REMINDER_AFTER_DAY;
  const out: PeriodTodo[] = [];
  for (const { period, count } of [...input.entries].sort((a, b) => a.period.localeCompare(b.period))) {
    if (count <= 0 || period >= current || isPeriodLocked(input.locks, period)) continue;
    const lockDue = period === last && pastReminderDay;
    if (!exported.has(period)) out.push({ kind: "export", period, entries: count, lockDue });
    else if (lockDue) out.push({ kind: "lock", period, entries: count });
  }
  return out;
}

/**
 * Why the fiscal year cannot be moved to start on `newStart` now, or null.
 * Entries keep the fiscal year and number they got (0030 numbers V per
 * fiscal year when the entry is made). An entry in an open month that the
 * new setting would put in another fiscal year would share its number with
 * one in the new year's series, in the same SIE year, so the change waits
 * until those months are locked (handed to the bookkeeping) or is made at a
 * fiscal year end before anything is posted in the new year.
 */
export function fiscalYearChangeProblem(
  entries: Pick<LedgerEntry, "series" | "fiscalYear" | "number" | "date">[],
  locks: Pick<PeriodLock, "periodStart" | "periodEnd">[],
  newStart: string
): string | null {
  const moved = entries
    .filter((e) => e.series === "V" && !isLocked(locks, e.date) && fiscalYearLabel(e.date, newStart) !== e.fiscalYear)
    .sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number);
  if (!moved.length) return null;
  const first = moved[0];
  return `Räkenskapsåret kan inte läggas om nu: ${moved.length} ${moved.length === 1 ? "verifikation" : "verifikationer"} i olåsta månader (först V${first.number} den ${first.date}) hör till ett annat räkenskapsår med den nya inställningen. Lås de månaderna när de är inlästa i bokföringen, eller lägg om räkenskapsåret vid ett årsskifte innan något bokförts i det nya året.`;
}

export function entriesIn(entries: LedgerEntry[], from: string, to: string): LedgerEntry[] {
  return entries.filter((e) => from <= e.date && e.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number);
}

export type AccountTotal = { account: AccountNumber; debit: Ore; credit: Ore; /** debit − credit */ net: Ore };

/** Debit, credit and net per account over the entries, sorted by account number. */
export function accountTotals(entries: LedgerEntry[]): AccountTotal[] {
  const by = new Map<AccountNumber, AccountTotal>();
  for (const e of entries)
    for (const l of e.lines) {
      const t = by.get(l.account) ?? { account: l.account, debit: 0, credit: 0, net: 0 };
      t.debit += l.debit;
      t.credit += l.credit;
      t.net = t.debit - t.credit;
      by.set(l.account, t);
    }
  return [...by.values()].sort((a, b) => a.account.localeCompare(b.account));
}

export type VatSummary = {
  /** Sales excl. VAT per rate (credit − debit on 3001–3004). */
  sales: Record<25 | 12 | 6 | 0, Ore>;
  /** Output VAT per rate (credit − debit on 2611/2621/2631). */
  outputVat: Record<25 | 12 | 6, Ore>;
  outputVatTotal: Ore;
  /** Construction services sold with reverse charge (3231). */
  reverseCharge: Ore;
  /** Debit − credit on the receivables and the bank over the period. */
  movement: { receivables: Ore; rotReceivable: Ore; bank: Ore };
  /** The boxes of Skatteverket's VAT return the ledger fills in. */
  boxes: VatBoxes;
};

/**
 * Momsdeklarationens rutor that invoicing produces. 06 (uttag), 07
 * (vinstmarginal) and 08 (hyra) never come from an invoice here, so they
 * stay zero; purchases (48, input VAT) belong to the bookkeeping.
 */
export type VatBoxes = {
  /** 05 Momspliktig försäljning som inte ingår i 06, 07 eller 08 */
  "05": Ore;
  /** 06 Momspliktiga uttag */
  "06": Ore;
  /** 07 Beskattningsunderlag vid vinstmarginalbeskattning */
  "07": Ore;
  /** 10 Utgående moms 25 % */
  "10": Ore;
  /** 11 Utgående moms 12 % */
  "11": Ore;
  /** 12 Utgående moms 6 % */
  "12": Ore;
  /** 41 Försäljning när köparen är skattskyldig i Sverige (byggtjänster, omvänd) */
  "41": Ore;
  /** 42 Övrig försäljning m.m. (momsfri) */
  "42": Ore;
};

export const VAT_BOX_LABEL: Record<keyof VatBoxes, string> = {
  "05": "Momspliktig försäljning som inte ingår i ruta 06, 07 eller 08",
  "06": "Momspliktiga uttag",
  "07": "Beskattningsunderlag vid vinstmarginalbeskattning",
  "10": "Utgående moms 25 %",
  "11": "Utgående moms 12 %",
  "12": "Utgående moms 6 %",
  "41": "Försäljning när köparen är skattskyldig i Sverige (omvänd betalningsskyldighet, byggtjänster)",
  "42": "Övrig försäljning m.m.",
};

export function vatSummary(entries: LedgerEntry[], chart: ChartOfAccounts = DEFAULT_CHART): VatSummary {
  const net = new Map(accountTotals(entries).map((t) => [t.account, t.net]));
  // Sales and VAT are credits, so their figures are the negated net (0 − x, so an empty account is 0, not −0).
  const credit = (account: AccountNumber) => 0 - (net.get(account) ?? 0);
  const debit = (account: AccountNumber) => net.get(account) ?? 0;
  const sales = { 25: credit(chart.sales[25]), 12: credit(chart.sales[12]), 6: credit(chart.sales[6]), 0: credit(chart.sales[0]) };
  const outputVat = { 25: credit(chart.vat[25]), 12: credit(chart.vat[12]), 6: credit(chart.vat[6]) };
  const reverseCharge = credit(chart.salesReverseCharge);
  return {
    sales,
    outputVat,
    outputVatTotal: outputVat[25] + outputVat[12] + outputVat[6],
    reverseCharge,
    movement: { receivables: debit(chart.receivables), rotReceivable: debit(chart.rotReceivable), bank: debit(chart.bank) },
    boxes: {
      "05": sales[25] + sales[12] + sales[6],
      "06": 0,
      "07": 0,
      "10": outputVat[25],
      "11": outputVat[12],
      "12": outputVat[6],
      "41": reverseCharge,
      "42": sales[0],
    },
  };
}

/** File name for a period's SIE file: "binaafy-ab-2026-10.se". */
export function sieFileName(companyName: string, period: Period): string {
  const slug =
    companyName
      .toLowerCase()
      .replace(/[åä]/g, "a")
      .replace(/ö/g, "o")
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "bokforing";
  return `${slug}-${period}.se`;
}
