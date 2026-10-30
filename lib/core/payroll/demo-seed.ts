import "server-only";
import { addDays, type IsoDate } from "../rules/index";
import { isWorkday } from "../../workdays";
import { employeeInputSchema, employmentInputSchema, taxInputSchema } from "../hr/schema";
import { absenceInputSchema, scheduleInputSchema, timeEntryInputSchema } from "../hr/time-schema";
import { addEmploymentVersion, addTaxVersion, createEmployee } from "../hr/store";
import { addAbsence, addTimeEntry, approveEntries, setSchedule, updateAbsence } from "../hr/time-store";

/**
 * Demo mode only: the three people of phase 0's fixtures, set up through
 * the same store functions the forms use, with a month of approved time
 * and absence, so the Lönekörning wizard can be walked end to end. Anna
 * (tjänsteman, månadslön, a week of semester), Bo (Byggavtalet, timlön,
 * OB, övertid and a sick period), Cecilia (styrelsearvode, not the main
 * employer).
 */
export async function seedDemoPayroll(month: string, today: IsoDate): Promise<void> {
  const [y, m] = month.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const from = `${prev}-01`;
  const to = addDays(`${month}-01`, -1);
  const workdays: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkday(d)) workdays.push(d);
  const weekdays = (start: string, end: string, breakMinutes: number) =>
    [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, on: weekday <= 5, start: weekday <= 5 ? start : "", end: weekday <= 5 ? end : "", breakMinutes: weekday <= 5 ? breakMinutes : 0 }));

  const person = (input: Record<string, unknown>) => createEmployee(employeeInputSchema(today).parse(input));

  // Anna: månadslön under Tjänstemannaavtalet, five days of semester in the middle of the time month.
  const anna = await person({ name: "Anna Andersson", email: "anna@demo.se", pnr: "199005052387", bankClearing: "8327", bankAccount: "9123456789", agreement: "tjanstemannaavtalet" });
  const annaJob = await addEmploymentVersion(anna, employmentInputSchema.parse({ form: "tillsvidare", payForm: "monthly", monthlySalary: "38000", startsOn: "2024-01-01", vacationRule: "sammalon", pensionScheme: "itp1", title: "Projektledare" }));
  await setSchedule(scheduleInputSchema.parse({ employmentId: annaJob, name: "Kontor", days: weekdays("08:00", "17:00", 60) }));
  await addTaxVersion(anna, taxInputSchema.parse({ kind: "table", tableNo: "33", columnNo: "1", source: "a-skattsedel", validFrom: "2026-01-01" }));
  const vacation = workdays.slice(8, 13);
  const v = await addAbsence(anna, absenceInputSchema.parse({ kind: "semester", from: vacation[0], to: vacation[vacation.length - 1] }));
  await updateAbsence(v, { approved: true });

  // Bo: timlön under Byggavtalet, a sick period over a weekend, OB one evening, two hours of övertid.
  const bo = await person({ name: "Bo Byggare", email: "bo@demo.se", pnr: "198802022387", bankClearing: "6000", bankAccount: "123456789", agreement: "byggavtalet" });
  const boJob = await addEmploymentVersion(bo, employmentInputSchema.parse({ form: "tillsvidare", payForm: "hourly", hourlyRate: "210", startsOn: "2025-01-01", vacationRule: "procent", vacationPercent: "13", pensionScheme: "saf-lo", title: "Snickare" }));
  await setSchedule(scheduleInputSchema.parse({ employmentId: boJob, name: "Bygg", days: weekdays("07:00", "16:00", 60) }));
  await addTaxVersion(bo, taxInputSchema.parse({ kind: "table", tableNo: "33", columnNo: "1", source: "a-skattsedel", validFrom: "2026-01-01" }));
  const sick = new Set(workdays.slice(10, 14));
  const ob = workdays[workdays.length - 3];
  const overtime = workdays[workdays.length - 4];
  const ids: string[] = [];
  const add = async (date: IsoDate, start: string, end: string, kind: "work" | "overtime" = "work") => ids.push(await addTimeEntry(bo, timeEntryInputSchema.parse({ date, start, end, kind }), { status: "submitted" }));
  for (const d of workdays) {
    if (sick.has(d)) continue;
    if (d === ob) {
      await add(d, "13:00", "17:00");
      await add(d, "18:00", "22:00");
    } else {
      await add(d, "07:00", "11:00");
      await add(d, "12:00", "16:00");
    }
  }
  await add(overtime, "16:00", "18:00", "overtime");
  await approveEntries(ids, "demo@localhost");
  const sickDays = [...sick];
  const s = await addAbsence(bo, absenceInputSchema.parse({ kind: "sjuk", from: sickDays[0], to: sickDays[sickDays.length - 1] }));
  await updateAbsence(s, { approved: true });

  // Cecilia: styrelsearvode 5 000 kr a month, another main employer (30 %).
  const cecilia = await person({ name: "Cecilia Ek", email: "cecilia@demo.se", pnr: "197207072385", bankClearing: "5000", bankAccount: "12345678", isBoardMember: true });
  await addEmploymentVersion(cecilia, employmentInputSchema.parse({ form: "uppdrag", payForm: "fee", fee: "5000", feePeriod: "month", startsOn: "2026-01-01", vacationRule: "none", decisionReference: "Årsstämma 2026-05-20, § 9" }));
  await addTaxVersion(cecilia, taxInputSchema.parse({ kind: "table", tableNo: "33", columnNo: "1", mainEmployer: false, source: "manual", validFrom: "2026-01-01" }));
}
