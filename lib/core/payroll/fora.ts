/**
 * Fora's monthly pay report for arbetare (Avtalspension SAF-LO; docs/hr-lon.md
 * section 8). Pure; the database's pension_basis() sums the same rows and
 * pension_report_store() refuses a file whose sums differ.
 *
 * Who: the people whose payslip says SAF-LO (the pension scheme frozen on
 * the payslip, PayslipContext.pension). What: kontant bruttolön paid in the
 * month, which is the lines whose pay item has a Fora category (pay,
 * sjuklön, semesterlön, OB, övertid; not förmåner, bilersättning,
 * traktamente or utlägg), in whole kronor with the öre dropped. When: the
 * month it was paid, whatever month it was earned, by the last day of the
 * month after (Fora, "Så rapporterar du löner för arbetare").
 *
 * The file: Fora's own upload is a JSON file to a specification given to
 * payroll vendors only, so this is a semicolon-separated list of what the
 * manual entry asks for, one row per arbetare (FORA_FORMAT; its layout is
 * ours). Lön hänförlig till annan månad (bonus, ackord, saved semester at
 * the end) is not split out.
 */

import { sumOre, truncateToKronor, type Ore } from "../money";
import { daysBetween, type IsoDate } from "../rules/index";
import { FORA_FORMAT } from "../rules/agi-format";
import { AUTHORITY_RULES } from "../rules/authorities";
import { addMonths } from "./employment-clocks";
import type { PayslipDocument } from "./payslip";
import { monthEnd } from "./settings";

export type ForaSlip = { payslipId: string; employeeId: string; document: PayslipDocument };

export type ForaLine = { employeeId: string; name: string; payslipIds: string[]; payOre: Ore };

/** The month's Fora pay per arbetare, from approved payslips of closed runs with pay day in `period`. */
export function foraBasis(period: string, slips: readonly ForaSlip[]): ForaLine[] {
  const by = new Map<string, ForaLine>();
  for (const s of slips) {
    if (s.document.payDate.slice(0, 7) !== period) throw new Error(`Lönebeskedet för ${s.document.employeeName} betalades ${s.document.payDate}, inte i ${period}.`);
    if (s.document.context?.pension.scheme !== "saf-lo") continue;
    const pay = sumOre(s.document.lines.filter((l) => l.item.flags.foraCategory !== null).map((l) => l.amountOre));
    const line = by.get(s.employeeId) ?? { employeeId: s.employeeId, name: s.document.employeeName, payslipIds: [], payOre: 0 };
    line.payslipIds.push(s.payslipId);
    line.payOre += pay;
    by.set(s.employeeId, line);
  }
  return [...by.values()].map((l) => ({ ...l, payOre: truncateToKronor(l.payOre) })).sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

/** The last day to report a pay month to Fora. */
export const foraDueDate = (period: string): IsoDate => monthEnd(addMonths(`${period}-01`, AUTHORITY_RULES.fora.reportByMonthsAfter).slice(0, 7));

/** "Anna Maria Andersson" → förnamn "Anna Maria", efternamn "Andersson". */
export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  return parts.length < 2 ? { firstName: parts[0] ?? "", lastName: "" } : { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

const cell = (s: string) => s.replace(/[;\r\n"]/g, " ").trim();

export function foraFile(input: { period: string; fokId: string; lines: readonly ForaLine[]; pnr: (employeeId: string) => string }): string {
  if (!FORA_FORMAT.fokIdPattern.test(input.fokId)) throw new Error(`FOK-ID skrivs FOK och sex siffror (Fora, Mina sidor); fick "${input.fokId}". Fyll i det i Inställningar › Lön.`);
  const rows = input.lines.map((l) => {
    const pnr = input.pnr(l.employeeId).replace(/\D/g, "");
    if (pnr.length !== 12) throw new Error(`${l.name}: personnummer saknas; Fora tar bara personnummer eller samordningsnummer.`);
    if (l.payOre < 0 || l.payOre % 100 !== 0) throw new Error(`${l.name}: lönen ${l.payOre / 100} kr kan inte rapporteras.`);
    const { firstName, lastName } = splitName(l.name);
    return [pnr, cell(firstName), cell(lastName), input.fokId, input.period, String(l.payOre / 100)].join(FORA_FORMAT.separator);
  });
  return [FORA_FORMAT.columns.join(FORA_FORMAT.separator), ...rows, ""].join("\r\n");
}

/** The file read back: rows and the total in öre (to check before it is frozen). */
export function parseForaFile(file: string): { rows: { pnr: string; period: string; payOre: Ore }[]; totalOre: Ore } {
  const rows = file
    .split(/\r?\n/)
    .slice(1)
    .filter((r) => r.trim())
    .map((r) => {
      const c = r.split(FORA_FORMAT.separator);
      return { pnr: c[0], period: c[4], payOre: Number(c[5]) * 100 };
    });
  return { rows, totalOre: sumOre(rows.map((r) => r.payOre)) };
}

/** Days left to the Fora deadline, for Idag (negative when passed). */
export const foraDaysLeft = (period: string, today: IsoDate) => daysBetween(today, foraDueDate(period));
