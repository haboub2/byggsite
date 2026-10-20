import "server-only";
import { getDb } from "../db";
import { isDemo } from "../../leads";
import { makeEvent, type Actor, type CoreEvent } from "../events";
import { demoJournalEntries } from "../invoices/store";
import { DEFAULT_ACCOUNT_NAMES } from "./posting";
import { entriesIn, isPeriodLocked, monthRange, type LedgerEntry, type Period, type PeriodLock } from "./period";

/**
 * The ledger as it is stored (journal_entries, journal_lines, accounts,
 * period_locks in 0014). Read with the caller's session so RLS decides;
 * entries are written only by the database functions that own the events
 * (issue_invoice, register_payment …). Demo mode reads the in-memory ledger
 * the invoice store keeps.
 */

type LineRow = { account: string; debit_ore: number; credit_ore: number; text: string | null };
type EntryRow = {
  id: string;
  series: string;
  fiscal_year: number;
  number: number;
  entry_date: string;
  text: string;
  source_type: string;
  journal_lines: LineRow[] | null;
};

const g = globalThis as unknown as { __binaafyPeriodLocks?: PeriodLock[]; __binaafyInvoices?: { events: (CoreEvent & { id: string })[] } };
const demoLocks = () => (g.__binaafyPeriodLocks ??= []);

/** Entries dated from–to inclusive, oldest first, with their lines. */
export async function listJournalEntries(range: { from: string; to: string }): Promise<LedgerEntry[]> {
  if (isDemo()) {
    const all = demoJournalEntries().map<LedgerEntry>((p) => {
      const [year, n] = p.number.split("-").map(Number);
      return {
        id: p.id,
        series: "V",
        fiscalYear: year,
        number: n,
        date: p.date,
        text: p.text,
        sourceType: p.source.type,
        lines: p.lines.map((l) => ({ account: l.account, debit: l.debit, credit: l.credit, text: l.text ?? null })),
      };
    });
    return entriesIn(all, range.from, range.to);
  }
  const supabase = await getDb();
  const { data, error } = await supabase
    .from("journal_entries")
    .select("id, series, fiscal_year, number, entry_date, text, source_type, journal_lines(account, debit_ore, credit_ore, text)")
    .gte("entry_date", range.from)
    .lte("entry_date", range.to)
    .order("entry_date")
    .order("number")
    .limit(10000);
  if (error) throw new Error(`Kunde inte hämta verifikationer: ${error.message}`);
  return ((data ?? []) as EntryRow[]).map((r) => ({
    id: r.id,
    series: r.series,
    fiscalYear: r.fiscal_year,
    number: r.number,
    date: r.entry_date,
    text: r.text,
    sourceType: r.source_type,
    lines: (r.journal_lines ?? []).map((l) => ({ account: l.account, debit: Number(l.debit_ore), credit: Number(l.credit_ore), text: l.text })),
  }));
}

/** The chart of accounts, number → name. Falls back to the BAS names the core posts to. */
export async function listAccounts(): Promise<{ number: string; name: string }[]> {
  const fallback = Object.entries(DEFAULT_ACCOUNT_NAMES).map(([number, name]) => ({ number, name }));
  if (isDemo()) return fallback;
  const supabase = await getDb();
  const { data, error } = await supabase.from("accounts").select("number, name").order("number");
  if (error) throw new Error(`Kunde inte hämta kontoplanen: ${error.message}`);
  const rows = (data ?? []) as { number: string; name: string }[];
  return [...rows, ...fallback.filter((f) => !rows.some((r) => r.number === f.number))].sort((a, b) => a.number.localeCompare(b.number));
}

export async function listPeriodLocks(): Promise<PeriodLock[]> {
  if (isDemo()) return [...demoLocks()].sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  const supabase = await getDb();
  const { data, error } = await supabase.from("period_locks").select("period_start, period_end, locked_by, locked_at").order("period_start", { ascending: false });
  if (error) throw new Error(`Kunde inte hämta låsta perioder: ${error.message}`);
  return ((data ?? []) as { period_start: string; period_end: string; locked_by: string | null; locked_at: string }[]).map((r) => ({
    periodStart: r.period_start,
    periodEnd: r.period_end,
    lockedBy: r.locked_by,
    lockedAt: r.locked_at,
  }));
}

export class PeriodAlreadyLockedError extends Error {
  constructor(period: Period) {
    super(`Perioden ${period} är redan låst.`);
    this.name = "PeriodAlreadyLockedError";
  }
}

/**
 * Lock a month: the bookkeeping has it, so the database refuses new entries
 * dated inside it. Logged as export.sie. Only owner/admin may (RLS
 * period_locks_admin_write).
 */
export async function lockPeriod(period: Period, actor: Actor): Promise<void> {
  const { from, to } = monthRange(period);
  const lockedBy = actor.name;
  const entries = (await listJournalEntries({ from, to })).length;
  if (isDemo()) {
    if (isPeriodLocked(demoLocks(), period)) throw new PeriodAlreadyLockedError(period);
    demoLocks().push({ periodStart: from, periodEnd: to, lockedBy, lockedAt: new Date().toISOString() });
    g.__binaafyInvoices?.events.push({
      id: crypto.randomUUID(),
      ...makeEvent({ orgId: "demo", aggregateType: "export", aggregateId: crypto.randomUUID(), type: "export.sie", data: { period, from, to, entries, locked: true }, actor }),
    });
    return;
  }
  const supabase = await getDb();
  const { data: orgId, error: orgError } = await supabase.rpc("default_org");
  if (orgError || !orgId) throw new Error(`Kunde inte avgöra organisationen: ${orgError?.message ?? "saknas"}`);
  const { error } = await supabase.from("period_locks").insert({ org_id: orgId, period_start: from, period_end: to, locked_by: lockedBy });
  if (error) {
    if (error.code === "23505") throw new PeriodAlreadyLockedError(period);
    throw new Error(`Kunde inte låsa perioden: ${error.message}`);
  }
  const { error: eventError } = await supabase.from("events").insert({
    org_id: orgId,
    aggregate_type: "export",
    aggregate_id: crypto.randomUUID(),
    type: "export.sie",
    data: { period, from, to, entries, locked: true },
    actor,
  });
  if (eventError) console.error("[ledger] lock event failed:", eventError.message);
}
