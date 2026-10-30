/**
 * Växa-stöd, the monthly basis for the refund application (docs/hr-lon.md,
 * sections 4 and 8; the rule book's `vaxaStod`). From 2026 the payroll
 * pays the full avgift and the employer applies afterwards, month by month,
 * in Skatteverket's e-service; a month not applied for within
 * `applyWithinMonths` is lost. This module only gives the numbers to type
 * in and says why a person does not qualify; it reduces nothing.
 *
 * Who qualifies is the owner's decision (Inställningar › Lön, at most
 * `maxEmployees` people: the first employees, not the owners or their
 * relatives); the rules checked here are the ones the data can show:
 * not an owner, the full avgift category (a person already on the older or
 * the young people's rate gets no växa-stöd on top), at least
 * `minHoursPerWeek` in the contract, a contract meant to last at least
 * `minEmploymentMonths`, and the month within `months` from the start.
 *
 * Basis per month: the avgiftsunderlag up to the cap (35 000 kr for
 * employment that started after 2024-04-30, 25 000 kr before); the refund
 * is the avgift above ålderspensionsavgiften on that part, in whole kronor
 * with the öre dropped (Skatteverket decides the amount; this is the
 * expected figure).
 */

import { rateOf, truncateToKronor, type Ore } from "../money";
import { addDays, type IsoDate } from "../rules/index";
import { payrollRulesAt } from "../rules/payroll";
import type { EmploymentVersion } from "../hr/schema";
import { addMonths } from "./employment-clocks";
import type { ContributionCategory } from "./contributions";
import { monthEnd } from "./settings";

export type VaxaStodPerson = {
  employeeId: string;
  name: string;
  isOwner: boolean;
  /** Chosen as one of the first employees in Inställningar › Lön. */
  chosen: boolean;
  versions: readonly EmploymentVersion[];
  /** The month's approved payslips (closed runs with pay day in the month): avgiftsunderlag and category. */
  payslips: readonly { contributionBaseOre: Ore; category: ContributionCategory }[];
};

export type VaxaStodRow = {
  employeeId: string;
  name: string;
  eligible: boolean;
  reasons: string[];
  /** The first day of the employment the 24 months count from. */
  startedOn: IsoDate | null;
  /** 1 for the start month; null when not employed in the month. */
  monthNo: number | null;
  capOre: Ore;
  baseOre: Ore;
  cappedBaseOre: Ore;
  refundOre: Ore;
};

export type VaxaStodBasis = { period: string; applyBy: IsoDate; rows: VaxaStodRow[]; totalRefundOre: Ore };

const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;

/** The start of the employment that is ongoing in the month: the earliest start in a run of touching contracts. */
function employmentStart(versions: readonly EmploymentVersion[], to: IsoDate): IsoDate | null {
  const spans = versions
    .filter((v) => v.payForm !== "fee" && v.startsOn <= to)
    .map((v) => ({ from: v.startsOn, to: v.endsOn }))
    .sort((a, b) => a.from.localeCompare(b.from));
  let start: IsoDate | null = null;
  let end: IsoDate | null = null;
  let open = false;
  for (const s of spans) {
    if (start === null || (!open && end !== null && s.from > addDays(end, 1))) {
      start = s.from;
      end = s.to;
    } else if (s.to === null || (end !== null && s.to > end)) end = s.to;
    open = end === null;
  }
  return start;
}

export function vaxaStodBasis(period: string, people: readonly VaxaStodPerson[]): VaxaStodBasis {
  const first: IsoDate = `${period}-01`;
  const last = monthEnd(period);
  const rules = payrollRulesAt(first);
  const v = rules.vaxaStod;
  const keep = rules.employerContributions.fullPercent - v.percentWithinCap;
  const rows: VaxaStodRow[] = [];
  for (const p of people) {
    if (!p.chosen && !p.payslips.length) continue;
    const reasons: string[] = [];
    const startedOn = employmentStart(p.versions, last);
    const current = p.versions.filter((x) => x.payForm !== "fee" && x.startsOn <= last && (x.endsOn === null || x.endsOn >= first) && x.validFrom <= last && (x.validTo === null || x.validTo >= first));
    const latest = [...current].sort((a, b) => b.validFrom.localeCompare(a.validFrom) || b.version - a.version)[0];
    const capOre = startedOn && startedOn > "2024-04-30" ? v.capPerMonthOre : v.capPerMonthEarlierOre;
    const baseOre = p.payslips.reduce((s, x) => s + x.contributionBaseOre, 0);
    const monthNo = startedOn ? monthIndex(first) - monthIndex(startedOn) + 1 : null;

    if (!p.chosen) reasons.push("inte vald som en av de första anställda i Inställningar › Lön");
    if (p.isOwner) reasons.push("ägare ger inte växa-stöd");
    if (!latest) reasons.push("ingen anställning i månaden");
    if (latest) {
      const weekly = latest.weeklyHours ?? (40 * latest.workingTimePercent) / 100;
      if (weekly < v.minHoursPerWeek) reasons.push(`${String(weekly).replace(".", ",")} timmar i veckan, minst ${v.minHoursPerWeek} krävs`);
      if (latest.endsOn && startedOn && latest.endsOn < addDays(addMonths(startedOn, v.minEmploymentMonths), -1)) reasons.push(`anställningen är kortare än ${v.minEmploymentMonths} månader`);
    }
    if (monthNo !== null && monthNo > v.months) reasons.push(`månad ${monthNo} av anställningen; stödet gäller ${v.months} månader`);
    const categories = new Set(p.payslips.map((x) => x.category));
    for (const c of categories) {
      if (c === "older" || c === "young") reasons.push(c === "older" ? "betalar redan bara ålderspensionsavgift" : "har redan ungdomsnedsättningen");
      if (c === "exempt" || c === "below-annual-threshold") reasons.push("ingen arbetsgivaravgift betalas");
    }
    if (!p.payslips.length) reasons.push("ingen lön utbetald i månaden");

    const eligible = reasons.length === 0;
    const cappedBaseOre = eligible ? Math.min(truncateToKronor(baseOre), capOre) : 0;
    rows.push({
      employeeId: p.employeeId,
      name: p.name,
      eligible,
      reasons,
      startedOn,
      monthNo,
      capOre,
      baseOre,
      cappedBaseOre,
      refundOre: eligible ? truncateToKronor(rateOf(cappedBaseOre, Number(keep.toFixed(2)), "down")) : 0,
    });
  }
  rows.sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.name.localeCompare(b.name, "sv"));
  // The application for a month is due within `applyWithinMonths` after it.
  const applyBy = monthEnd(addMonths(first, v.applyWithinMonths).slice(0, 7));
  return { period, applyBy, rows, totalRefundOre: rows.reduce((s, r) => s + r.refundOre, 0) };
}
