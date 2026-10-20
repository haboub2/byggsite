import "server-only";
import { getContent } from "../../content/store";
import { renderSie4 } from "../../render/sie/sie4";
import { todayIso } from "../../quotes/schema";
import { fiscalYearOf, monthRange, sieFileName, type Period } from "./period";
import { listAccounts, listJournalEntries } from "./store";

/** One month of the ledger as a SIE 4 file: the company from Företaget, the chart, the month's entries. */
export async function sieForPeriod(period: Period): Promise<{ text: string; fileName: string; entries: number }> {
  const { from, to } = monthRange(period);
  const [{ company }, accounts, entries] = await Promise.all([getContent(), listAccounts(), listJournalEntries({ from, to })]);
  const year = fiscalYearOf(from);
  const text = renderSie4({
    company: { name: company.legalName, orgNr: company.orgNr, fiscalYearStart: year.start, fiscalYearEnd: year.end },
    accounts,
    generatedOn: todayIso(),
    entries: entries.map((e) => ({
      series: e.series,
      number: e.number,
      date: e.date,
      text: e.text,
      transactions: e.lines.map((l) => ({ account: l.account, amount: l.debit - l.credit, ...(l.text ? { text: l.text } : {}) })),
    })),
  });
  return { text, fileName: sieFileName(company.legalName, period), entries: entries.length };
}
