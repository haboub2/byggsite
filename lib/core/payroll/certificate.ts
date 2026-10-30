/**
 * Arbetsgivarintyg (docs/hr-lon.md, section 8): what the employer
 * certifies for the a-kassa and Arbetsförmedlingen, from the register and
 * nothing typed twice. Pure; authorities-store.ts loads the data, the PDF
 * is lib/pdf/EmployerCertificatePdf.tsx, frozen in bucket `hr` with its
 * SHA-256 (employer_certificates, 0040).
 *
 * - The employment: each contract with its form, start and end, title,
 *   pay form and the latest pay and working time.
 * - Per calendar month for the last `months` (AUTHORITY_RULES.certificate)
 *   up to the last day the certificate covers, as form SO 11 (Sveriges
 *   a-kassor, 2021-06-01) asks: hours worked without övertid (approved
 *   time; for månadslön without reported time, the contract's hours on the
 *   workdays employed, where paid leave such as semester counts as worked),
 *   frånvaro in hours (absence with a pay deduction: sjuk, VAB,
 *   föräldraledighet, tjänstledighet; sjuk even when sjuklön is paid),
 *   övertid, absence days per kind, and the pay earned in the month from
 *   the approved payslips (månadslön in its month, everything else in the
 *   month the work was done, as the earning year of section 5 counts it)
 *   for the form's Komplettering.
 * - Why the employment ended, which the owner chooses.
 */

import { sumOre, type Ore } from "../money";
import { eachDay, addDays, type IsoDate } from "../rules/index";
import { AUTHORITY_RULES } from "../rules/authorities";
import { isWorkday } from "../../workdays";
import type { Absence, AbsenceKind } from "../hr/absence";
import { isApproved, type TimeEntry } from "../hr/time";
import { FORM_LABEL, PAY_FORM_LABEL, type EmploymentVersion } from "../hr/schema";
import type { PayslipDocument } from "./payslip";
import { addMonths } from "./employment-clocks";
import { monthEnd } from "./settings";

export const LEAVING_REASONS = ["pagar", "egen-uppsagning", "arbetsbrist", "visstid-slut", "provanstallning-slut", "avsked", "overenskommelse", "annat"] as const;
export type LeavingReason = (typeof LEAVING_REASONS)[number];
export const LEAVING_REASON_LABEL: Record<LeavingReason, string> = {
  pagar: "Anställningen pågår",
  "egen-uppsagning": "Uppsagd på egen begäran",
  arbetsbrist: "Uppsagd på grund av arbetsbrist",
  "visstid-slut": "Den tidsbegränsade anställningen löpte ut",
  "provanstallning-slut": "Provanställningen avbröts",
  avsked: "Avskedad",
  overenskommelse: "Avslutad efter överenskommelse",
  annat: "Annan orsak (se nedan)",
};

export type CertificateEmployment = {
  contractId: string;
  form: string;
  title: string;
  startsOn: IsoDate;
  endsOn: IsoDate | null;
  payForm: string;
  /** The latest version's pay: "35 000 kr/mån", "180 kr/tim". */
  payOre: Ore | null;
  payUnit: "mån" | "tim" | null;
  workingTimePercent: number;
  weeklyHours: number | null;
};

export type CertificateMonth = {
  month: string;
  /** Days employed in the month. */
  employedDays: number;
  /** Worked hours without övertid; paid leave counts as worked. */
  workedHours: number;
  /** Hours of absence with a pay deduction (SO 11 "frånvaro"). */
  absenceHours: number;
  overtimeHours: number;
  /** Hours from the contract instead of reported time (månadslön without time reporting). */
  hoursFromSchedule: boolean;
  absenceDays: Partial<Record<AbsenceKind, number>>;
  payOre: Ore;
};

export type CertificateContent = {
  employee: { id: string; name: string; pnr: string };
  employer: { name: string; orgNr: string; address: string; signer: string };
  from: IsoDate;
  to: IsoDate;
  employments: CertificateEmployment[];
  months: CertificateMonth[];
  totals: { workedHours: number; absenceHours: number; overtimeHours: number; payOre: Ore };
  reason: LeavingReason;
  reasonText: string;
  madeOn: IsoDate;
};

export type CertificateInput = {
  employee: { id: string; name: string; pnr: string };
  employer: CertificateContent["employer"];
  versions: readonly EmploymentVersion[];
  timeEntries: readonly TimeEntry[];
  absences: readonly Absence[];
  payslips: readonly PayslipDocument[];
  /** The last day the certificate covers: the last day employed, or today for an ongoing employment. */
  to: IsoDate;
  reason: LeavingReason;
  reasonText: string;
  today: IsoDate;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Absence that SO 11 counts as frånvaro; semester, permission and kompledighet are paid and count as worked. */
const DEDUCTED: readonly AbsenceKind[] = ["sjuk", "vab", "foraldraledig", "tjanstledig"];
const max = (a: IsoDate, b: IsoDate) => (a > b ? a : b);
const min = (a: IsoDate, b: IsoDate) => (a < b ? a : b);

/** Each payslip line's month: dated lines by their date, månadslön in the salary month, the rest in the time period's month. */
function lineMonth(doc: PayslipDocument, line: PayslipDocument["lines"][number]): string {
  if (line.from) return line.from.slice(0, 7);
  if (line.item.kind === "salary" || line.item.kind === "fee") return doc.periodStart.slice(0, 7);
  return (doc.context?.timeFrom ?? doc.periodStart).slice(0, 7);
}

export function certificateContent(input: CertificateInput): CertificateContent {
  const versions = input.versions.filter((v) => v.payForm !== "fee" && !(v.validTo !== null && v.validTo < v.validFrom));
  if (!versions.length) throw new Error("Personen har ingen anställning att intyga (styrelseuppdrag ger inget arbetsgivarintyg).");
  const months = AUTHORITY_RULES.certificate.months;
  const firstStart = versions.reduce((m, v) => min(m, v.startsOn), versions[0].startsOn);
  const from = max(firstStart, addDays(addMonths(input.to, -months), 1));

  // The contracts, each with its latest version.
  const byContract = new Map<string, EmploymentVersion[]>();
  for (const v of versions) byContract.set(v.contractId, [...(byContract.get(v.contractId) ?? []), v]);
  const employments: CertificateEmployment[] = [...byContract.values()]
    .map((list) => {
      const latest = [...list].sort((a, b) => b.validFrom.localeCompare(a.validFrom) || b.version - a.version)[0];
      const startsOn = list.reduce((m, v) => min(m, v.startsOn), list[0].startsOn);
      return {
        contractId: latest.contractId,
        form: FORM_LABEL[latest.form],
        title: latest.title,
        startsOn,
        endsOn: latest.endsOn,
        payForm: PAY_FORM_LABEL[latest.payForm],
        payOre: latest.payForm === "monthly" ? latest.monthlySalaryOre : latest.hourlyRateOre,
        payUnit: latest.payForm === "monthly" ? ("mån" as const) : ("tim" as const),
        workingTimePercent: latest.workingTimePercent,
        weeklyHours: latest.weeklyHours,
      };
    })
    .filter((e) => e.startsOn <= input.to && (e.endsOn === null || e.endsOn >= from))
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));

  const employedOn = (d: IsoDate) => versions.find((v) => v.startsOn <= d && (v.endsOn === null || v.endsOn >= d) && v.validFrom <= d && (v.validTo === null || v.validTo >= d)) ?? null;
  const approved = input.timeEntries.filter((e) => isApproved(e) && e.kind !== "on_call");

  const out: CertificateMonth[] = [];
  for (let m = from.slice(0, 7); `${m}-01` <= input.to; m = addMonths(`${m}-01`, 1).slice(0, 7)) {
    const a = max(`${m}-01`, from);
    const b = min(monthEnd(m), input.to);
    let employedDays = 0;
    let scheduleHours = 0;
    let absenceHours = 0;
    const absenceDays: Partial<Record<AbsenceKind, number>> = {};
    for (const d of eachDay(a, b)) {
      const v = employedOn(d);
      if (!v) continue;
      employedDays++;
      const absent = input.absences.filter((x) => x.from <= d && (x.to ?? input.to) >= d);
      for (const x of absent) absenceDays[x.kind] = round2((absenceDays[x.kind] ?? 0) + x.extent);
      if (!isWorkday(d)) continue;
      const daily = (v.weeklyHours ?? (v.payForm === "monthly" ? (40 * v.workingTimePercent) / 100 : 0)) / 5;
      const away = Math.min(1, absent.filter((x) => DEDUCTED.includes(x.kind)).reduce((s, x) => s + x.extent, 0));
      absenceHours += daily * away;
      if (v.payForm === "monthly") scheduleHours += daily * (1 - away);
    }
    const rows = approved.filter((e) => e.workDate >= a && e.workDate <= b);
    const reported = rows.length > 0;
    const workedHours = round2(reported ? rows.filter((e) => e.kind !== "overtime").reduce((s, e) => s + e.hours, 0) : scheduleHours);
    const overtimeHours = round2(rows.filter((e) => e.kind === "overtime").reduce((s, e) => s + e.hours, 0));
    const payOre = sumOre(input.payslips.flatMap((doc) => doc.lines.filter((l) => l.item.flags.taxable && l.item.kind !== "benefit" && lineMonth(doc, l) === m).map((l) => l.amountOre)));
    if (!employedDays && !payOre) continue;
    out.push({ month: m, employedDays, workedHours, absenceHours: round2(absenceHours), overtimeHours, hoursFromSchedule: !reported && scheduleHours > 0, absenceDays, payOre });
  }

  return {
    employee: input.employee,
    employer: input.employer,
    from,
    to: input.to,
    employments,
    months: out,
    totals: {
      workedHours: round2(out.reduce((s, x) => s + x.workedHours, 0)),
      absenceHours: round2(out.reduce((s, x) => s + x.absenceHours, 0)),
      overtimeHours: round2(out.reduce((s, x) => s + x.overtimeHours, 0)),
      payOre: sumOre(out.map((x) => x.payOre)),
    },
    reason: input.reason,
    reasonText: input.reasonText.trim(),
    madeOn: input.today,
  };
}
