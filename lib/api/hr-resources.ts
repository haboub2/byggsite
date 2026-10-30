import type { z } from "zod";
import type { Absence } from "../core/hr/absence";
import type { Employee, EmploymentVersion } from "../core/hr/schema";
import { inForce, versionsOn } from "../core/hr/schema";
import type { TimeEntry } from "../core/hr/time";
import type { IsoDate } from "../core/rules/index";
import type { PayRun, StoredPayslip } from "../core/payroll/run-store";
import type { absenceResourceSchema, employeeResourceSchema, payRunResourceSchema, payslipResourceSchema, timeEntryResourceSchema } from "./schemas";

/**
 * Rows of the HR module as the API returns them (phase 6): the resource
 * schemas in lib/api/schemas.ts, camelCase, öre. Pure, so the tests check
 * them without a database. What never leaves: personnummer (only the mask
 * the store already holds), bank accounts (not even masked), addresses,
 * notes, the employee's user id, and the payslip's frozen document in full
 * (the lines and sums are enough for an integration; the PDF is the
 * document).
 */

type EmployeeResource = z.infer<typeof employeeResourceSchema>;
type TimeEntryResource = z.infer<typeof timeEntryResourceSchema>;
type AbsenceResource = z.infer<typeof absenceResourceSchema>;
type PayRunResource = z.infer<typeof payRunResourceSchema>;
type PayslipResource = z.infer<typeof payslipResourceSchema>;

/** ÅÅÅÅMMDD-XXXX from whatever the store holds (already masked in the database; "" without a number). */
export function maskedPersonalNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (/^\d{8}-XXXX$/.test(value)) return value;
  if (digits.length === 12) return `${digits.slice(0, 8)}-XXXX`;
  if (digits.length === 10) return `${digits.slice(0, 2) <= "25" ? "20" : "19"}${digits.slice(0, 6)}-XXXX`;
  return "";
}

/** The person with the employment version in force on `today` (or the latest, for a contract that has not started). */
export function employeeResource(e: Employee, versions: readonly EmploymentVersion[], today: IsoDate): EmployeeResource {
  const mine = versions.filter((v) => v.employeeId === e.id);
  const current = versionsOn(mine, today).filter((v) => inForce(v, today))[0] ?? null;
  const started = mine.length ? mine.map((v) => v.startsOn).sort()[0] : null;
  return {
    id: e.id,
    name: e.name,
    email: e.email,
    phone: e.phone,
    personalNumber: maskedPersonalNumber(e.pnrMasked),
    birthDate: e.birthDate,
    agreement: e.agreement,
    isOwner: e.isOwner,
    isBoardMember: e.isBoardMember,
    startedOn: started,
    endedOn: e.endedAt,
    employment: current
      ? {
          form: current.form,
          payForm: current.payForm,
          title: current.title,
          monthlySalaryOre: current.monthlySalaryOre,
          hourlyRateOre: current.hourlyRateOre,
          feeOre: current.feeOre,
          workingTimePercent: current.workingTimePercent,
          startsOn: current.startsOn,
          endsOn: current.endsOn,
          vacationRule: current.vacationRule,
          vacationDays: current.vacationDays,
          pensionScheme: current.pensionScheme,
          validFrom: current.validFrom,
        }
      : null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export function timeEntryResource(t: TimeEntry): TimeEntryResource {
  return {
    id: t.id,
    employeeId: t.employeeId,
    date: t.workDate,
    start: t.start,
    end: t.end,
    breakMinutes: t.breakMinutes,
    hours: t.hours,
    kind: t.kind,
    projectId: t.projectId,
    note: t.note,
    status: t.status,
    correctsId: t.correctsId,
    submittedAt: t.submittedAt,
    approvedAt: t.approvedAt,
    createdAt: t.createdAt,
  };
}

export function absenceResource(a: Absence): AbsenceResource {
  return {
    id: a.id,
    employeeId: a.employeeId,
    kind: a.kind,
    from: a.from,
    to: a.to,
    extent: a.extent,
    certificateReceivedOn: a.certificateReceivedOn,
    sickPeriodId: a.sickPeriodId,
    approvedAt: a.approvedAt,
    createdAt: a.createdAt,
  };
}

export function payRunResource(r: PayRun): PayRunResource {
  const n = (v: number | undefined) => (v === undefined ? null : v);
  return {
    id: r.id,
    period: r.periodStart.slice(0, 7),
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    timeFrom: r.timeFrom,
    timeTo: r.timeTo,
    payDate: r.payDate,
    agiPeriod: r.agiPeriod,
    status: r.status,
    payslipCount: n(r.totals.payslips),
    grossOre: n(r.totals.grossOre),
    taxOre: n(r.totals.taxOre),
    netOre: n(r.totals.netOre),
    employerContributionOre: n(r.totals.employerContributionOre),
    computedAt: r.computedAt,
    approvedAt: r.approvedAt,
    bookedAt: r.bookedAt,
    closedAt: r.closedAt,
    createdAt: r.createdAt,
  };
}

export function payslipResource(s: StoredPayslip): PayslipResource {
  const d = s.document;
  return {
    id: s.id,
    runId: s.runId,
    employeeId: s.employeeId,
    employeeName: d.employeeName,
    number: s.number,
    period: d.periodStart.slice(0, 7),
    payDate: d.payDate,
    status: s.approvedAt ? "approved" : "calculated",
    cashGrossOre: d.totals.cashGrossOre,
    benefitOre: d.totals.benefitOre,
    taxFreeReimbursementOre: d.totals.taxFreeReimbursementOre,
    taxOre: d.totals.taxOre,
    netAdjustmentOre: d.totals.netAdjustmentOre,
    netOre: d.totals.netOre,
    employerContributionOre: d.totals.employerContributionOre,
    contributionRatePercent: d.contributions.ratePercent,
    contributionBaseOre: d.contributions.baseOre,
    pensionScheme: d.context?.pension.scheme ?? null,
    pensionPremiumOre: s.pensionPremiumOre,
    vacationLiabilityOre: s.vacationLiabilityOre,
    lines: d.lines.map((l) => ({
      code: l.code,
      name: l.item.name,
      kind: l.item.kind,
      text: l.text,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceOre: l.unitPriceOre,
      amountOre: l.amountOre,
      taxable: l.item.flags.taxable,
      agiBox: l.item.flags.agiBox,
      account: l.item.flags.account,
      from: l.from ?? null,
      to: l.to ?? null,
    })),
    hasPdf: Boolean(s.pdfPath),
    approvedAt: s.approvedAt,
    createdAt: s.createdAt,
  };
}
