import { inForce, versionsOn, type EmploymentVersion } from "./schema";
import { scheduleFromRules, type ScheduleRule } from "./absence";
import { weeklyHours } from "../payroll/sick-pay";
import type { IsoDate } from "../rules/index";
import type { PersonWorkingTime } from "./time";

/**
 * A person's ordinary working time for the arbetstidslagen checks (ATL 5,
 * 7, 10 §§): the employment version in force on the date gives the weekly
 * hours (its own figure, else its schedule's, else 40 × the working-time
 * percent) and the schedule. Fee-only people (styrelse) have none. Pure;
 * the pages load employments and schedules and call this.
 */
export type ScheduleLike = { id: string; employeeId: string; rules: ScheduleRule[] };

export function personWorkingTime(versions: readonly EmploymentVersion[], schedules: readonly ScheduleLike[], date: IsoDate, fullTimeWeeklyHours = 40): PersonWorkingTime | null {
  const paid = versions.filter((v) => v.payForm !== "fee");
  if (!paid.length) return null;
  const now = versionsOn(paid, date).filter((v) => inForce(v, date));
  const v = now[0] ?? [...paid].sort((a, b) => b.validFrom.localeCompare(a.validFrom) || b.version - a.version)[0];
  const row = v.scheduleId ? schedules.find((s) => s.id === v.scheduleId) : undefined;
  const schedule = row ? scheduleFromRules(row.rules) : null;
  const hours = v.weeklyHours ?? (schedule ? weeklyHours(schedule) : Math.round(((fullTimeWeeklyHours * v.workingTimePercent) / 100) * 100) / 100);
  return { weeklyHours: hours, schedule };
}

/** The map `atlWarnings` and `overtimeJournal` take, for every employee with a paid employment. */
export function personWorkingTimes(versions: readonly EmploymentVersion[], schedules: readonly ScheduleLike[], date: IsoDate): Map<string, PersonWorkingTime> {
  const byPerson = new Map<string, EmploymentVersion[]>();
  for (const v of versions) byPerson.set(v.employeeId, [...(byPerson.get(v.employeeId) ?? []), v]);
  const out = new Map<string, PersonWorkingTime>();
  for (const [id, mine] of byPerson) {
    const p = personWorkingTime(mine, schedules, date);
    if (p) out.set(id, p);
  }
  return out;
}
