import "server-only";
import { getOrgSettings } from "../org/settings-store";
import { fiscalYearFor } from "../org/settings";
import { renderSie4 } from "../../render/sie/sie4";
import { todayIso } from "../../quotes/schema";
import { monthRange, sieFileName, type Period } from "./period";
import { listAccounts, listJournalEntries } from "./store";

/** One month of the ledger as a SIE 4 file: the company and fiscal year from the organisation's settings, the chart, the month's entries. */
export async function sieForPeriod(period: Period): Promise<{ text: string; fileName: string; entries: number }> {
  const { from, to } = monthRange(period);
  const [settings, accounts, entries] = await Promise.all([getOrgSettings(), listAccounts(), listJournalEntries({ from, to })]);
  const company = settings.company;
  const year = fiscalYearFor(from, settings.fiscalYearStart);
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
