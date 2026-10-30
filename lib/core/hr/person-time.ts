import "server-only";
import { addDays, type IsoDate } from "../rules/index";
import { addMonths } from "../payroll/employment-clocks";
import { averageWeeklyHoursFromHistory, monthlyToHourlyOre, weeklyHours, type WorkSchedule } from "../payroll/sick-pay";
import { lawVacationYearModel, type VacationYearModel } from "../payroll/vacation";
import { inForce, versionsOn, type EmploymentVersion } from "./schema";
import { scheduleFromRules, sickBreakdown, sickRules, type Absence, type SickBreakdown } from "./absence";
import { vacationBalances, type VacationBalance } from "./balances";
import { netHours, type TimeEntry } from "./time";
import { listEmployments } from "./store";
import { listAbsences, listLeaveBalances, listSchedules, listShifts, listTimeEntries, type Schedule, type StoredBalance } from "./time-store";

/**
 * What the person page's Frånvaro tab and the balance action need, read
 * once: the version and schedule that apply, the sick-pay breakdown from
 * sickPay(), and the semester balances with the stored model.
 */

/** The version with pay that applies on `date`: the latest started contract of those in force. */
export function payVersionOn(versions: readonly EmploymentVersion[], date: IsoDate): EmploymentVersion | null {
  return (
    versionsOn(
      versions.filter((v) => v.payForm === "monthly" || v.payForm === "hourly"),
      date
    )
      .filter((v) => inForce(v, date))
      .sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0] ?? null
  );
}

export type ScheduleSource = "schedule" | "shifts" | "standard";

/**
 * The person's working hours for sick pay and semester: the version's
 * weekly schedule; without one, booked shifts for timlön (a behovsanställd
 * loses only the shifts they had); and for månadslön without a schedule,
 * the contract's weekly hours spread over Monday–Friday.
 */
export async function workScheduleFor(employeeId: string, version: EmploymentVersion | null, schedules: readonly Schedule[], range: { from: IsoDate; to: IsoDate }): Promise<{ schedule: WorkSchedule; source: ScheduleSource; weekly: number }> {
  const s = version?.scheduleId ? schedules.find((x) => x.id === version.scheduleId) : null;
  if (s) {
    const schedule = scheduleFromRules(s.rules);
    return { schedule, source: "schedule", weekly: weeklyHours(schedule) };
  }
  if (!version || version.payForm === "hourly") {
    const shifts = (await listShifts(range)).filter((x) => x.employeeId === employeeId && (x.offerStatus === null || x.offerStatus === "accepted"));
    const hours: Record<IsoDate, number> = {};
    for (const x of shifts) {
      const [sh, sm] = x.start.split(":").map(Number);
      const [eh, em] = x.end.split(":").map(Number);
      let mins = eh * 60 + em - (sh * 60 + sm);
      if (mins <= 0) mins += 24 * 60;
      hours[x.date] = (hours[x.date] ?? 0) + Math.round(((mins - x.breakMinutes) / 60) * 100) / 100;
    }
    return { schedule: { kind: "shifts", hours }, source: "shifts", weekly: 0 };
  }
  const weekly = version.weeklyHours ?? (40 * version.workingTimePercent) / 100;
  const day = Math.round((weekly / 5) * 100) / 100;
  return { schedule: { kind: "weekly", hours: [day, day, day, day, day, 0, 0], holidaysOff: true }, source: "standard", weekly };
}

export type PersonAbsence = {
  versions: EmploymentVersion[];
  absences: Absence[];
  schedules: Schedule[];
  version: EmploymentVersion | null;
  scheduleSource: ScheduleSource;
  sick: SickBreakdown | null;
  /** Why no sick-pay breakdown could be made, if none. */
  sickNote: string | null;
  model: VacationYearModel;
  balances: VacationBalance[];
  stored: StoredBalance[];
};

export async function loadPersonAbsence(employeeId: string, today: IsoDate): Promise<PersonAbsence> {
  const [versions, absences, schedules, stored] = await Promise.all([listEmployments(employeeId), listAbsences({ employeeId }), listSchedules(employeeId), listLeaveBalances(employeeId)]);
  const sickOnes = absences.filter((a) => a.kind === "sjuk");
  // Sick pay is counted with the version and schedule of the latest spell's first day.
  const asOfVersion = payVersionOn(versions, sickOnes.length ? sickOnes[sickOnes.length - 1].from : today) ?? payVersionOn(versions, today);
  const from = sickOnes.length ? sickOnes[0].from : addDays(today, -90);
  const { schedule, source, weekly } = await workScheduleFor(employeeId, asOfVersion, schedules, { from: addMonths(from, -3), to: today });
  let sick: SickBreakdown | null = null;
  let sickNote: string | null = null;
  if (sickOnes.length) {
    if (!asOfVersion) sickNote = "Ingen anställning med lön gäller för sjukdagarna; sjuklönen kan inte räknas.";
    else {
      let averageWeekly = weekly;
      if (source === "shifts") {
        // A behovsanställd's average week: approved hours in the three months before the period (sjuklönelagen 6 §, the plan's rule).
        const start = sickOnes[0].from;
        const histFrom = addMonths(start, -3);
        const entries: TimeEntry[] = await listTimeEntries({ from: histFrom, to: addDays(start, -1), employeeId });
        averageWeekly = averageWeeklyHoursFromHistory(Math.max(0, netHours(entries)), histFrom, addDays(start, -1));
      }
      const hourly = asOfVersion.payForm === "hourly" ? (asOfVersion.hourlyRateOre ?? 0) : monthlyToHourlyOre(asOfVersion.monthlySalaryOre ?? 0, asOfVersion.weeklyHours ?? (weekly || 40));
      sick = sickBreakdown({ absences: sickOnes, schedule, hourlyPayOre: hourly, averageWeeklyHours: averageWeekly, monthlySalary: asOfVersion.payForm === "monthly", asOf: today });
    }
  }
  const model = stored.length ? stored[stored.length - 1].model : lawVacationYearModel(sickRules(today));
  const { schedule: todaySchedule } = await workScheduleFor(employeeId, payVersionOn(versions, today), schedules, { from: addMonths(today, -12), to: addMonths(today, 6) });
  const balances = vacationBalances({ model, versions, absences, schedule: todaySchedule, asOf: today });
  return { versions, absences, schedules, version: asOfVersion, scheduleSource: source, sick, sickNote, model, balances, stored };
}
