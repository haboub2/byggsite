import "server-only";
import { addDays, type IsoDate } from "../rules/index";
import { isWorkday } from "../../workdays";
import { isDemo } from "../../leads";
import { employeeInputSchema, employmentInputSchema, taxInputSchema } from "../hr/schema";
import { absenceInputSchema, scheduleInputSchema, timeEntryInputSchema } from "../hr/time-schema";
import { addEmploymentVersion, addTaxVersion, createEmployee, listEmployees } from "../hr/store";
import { addAbsence, addTimeEntry, approveEntries, setSchedule, updateAbsence } from "../hr/time-store";
import { getOrgSettings, saveOrgSettings } from "../org/settings-store";
import { approveClaim, createClaim, saveBenefit, submitClaim } from "./benefits-store";
import { storeAgi } from "./authorities-store";
import { applyPayItemPreset, approveRun, bookRun, calculateRun, closeRun, createBankFile, createRun, getPayrollSettings, savePayrollDecision } from "./run-store";
import { monthEnd, payDateFor } from "./settings";
import { monthLabel } from "./format";

/**
 * Demo mode only: a small organisation set up through the same store
 * functions the forms use, so every HR screen has content on first load
 * (phase 6). The people are phase 0's fixtures plus one more:
 *
 *   Anna Andersson   tjänsteman, månadslön 38 000 kr, ITP1, a week of
 *                    semester, Skatteverket's 2026 car with the company
 *                    paying the fuel (drivmedelsförmån, ruta 018)
 *   Bo Byggare       Byggavtalet, timlön 210 kr, SAF-LO, OB one evening,
 *                    two hours of övertid, a sick period over a weekend;
 *                    one approved milersättning (paid by the run) and one
 *                    traktamente waiting for approval
 *   Cecilia Ek       styrelsearvode 5 000 kr a month, not the main employer
 *   David Dahl       SÄVA on timlön 180 kr for two months, semesterersättning
 *                    12 % paid monthly, no pension
 *
 * `seedDemoPeople` adds them with a month of approved time and absence
 * (the month before `month`); `seedDemoPayroll` also confirms the decisions
 * a run needs, runs the month to closed, and stores the month's
 * arbetsgivardeklaration. `ensureDemoHr` does the latter once per process
 * when the register is empty (called from the admin layout).
 */

const DEMO_ACTOR = { kind: "user" as const, id: "demo", name: "demo@localhost" };

const previousMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

export async function seedDemoPeople(month: string, today: IsoDate): Promise<void> {
  const prev = previousMonth(month);
  const from = `${prev}-01`;
  const to = addDays(`${month}-01`, -1);
  const workdays: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkday(d)) workdays.push(d);
  const weekdays = (start: string, end: string, breakMinutes: number) =>
    [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, on: weekday <= 5, start: weekday <= 5 ? start : "", end: weekday <= 5 ? end : "", breakMinutes: weekday <= 5 ? breakMinutes : 0 }));

  const person = (input: Record<string, unknown>) => createEmployee(employeeInputSchema(today).parse(input));

  // Anna: månadslön under Tjänstemannaavtalet, five days of semester in the middle of the time month, the car.
  const anna = await person({ name: "Anna Andersson", email: "anna@demo.se", pnr: "199005052387", bankClearing: "8327", bankAccount: "9123456789", agreement: "tjanstemannaavtalet", isOwner: true });
  const annaJob = await addEmploymentVersion(anna, employmentInputSchema.parse({ form: "tillsvidare", payForm: "monthly", monthlySalary: "38000", startsOn: "2024-01-01", vacationRule: "sammalon", pensionScheme: "itp1", title: "Projektledare" }));
  await setSchedule(scheduleInputSchema.parse({ employmentId: annaJob, name: "Kontor", days: weekdays("08:00", "17:00", 60) }));
  await addTaxVersion(anna, taxInputSchema.parse({ kind: "table", tableNo: "33", columnNo: "1", source: "a-skattsedel", validFrom: "2026-01-01" }));
  const vacation = workdays.slice(8, 13);
  const v = await addAbsence(anna, absenceInputSchema.parse({ kind: "semester", from: vacation[0], to: vacation[vacation.length - 1] }));
  await updateAbsence(v, { approved: true });
  // Skatteverket's 2026 example car (72 045 kr a year), with 1 200 kr of private fuel a month paid by the company.
  await saveBenefit(
    {
      id: "",
      employeeId: anna,
      kind: "bil",
      description: "",
      validFrom: `${prev}-01`,
      validTo: null,
      car: { registrationNumber: "ABC123", model: "Volvo V60", firstRegisteredOn: "2024-03-01", modelYear: 2024, fuel: "diesel", newCarPriceOre: 30_000_000, extraEquipmentOre: 2_200_000, vehicleTaxOre: 405_000, businessMilPerYear: 0, fuelPaidByEmployer: true, privateFuelOre: 120_000, fuelEmployeePaymentOre: 0 },
      meals: {},
      housing: null,
      marketValueOre: 0,
      employeePaymentOre: 0,
    },
    today
  );

  // Bo: timlön under Byggavtalet, a sick period over a weekend, OB one evening, two hours of övertid, two claims.
  const bo = await person({ name: "Bo Byggare", email: "bo@demo.se", pnr: "198802022387", bankClearing: "6000", bankAccount: "123456789", agreement: "byggavtalet" });
  const boJob = await addEmploymentVersion(bo, employmentInputSchema.parse({ form: "tillsvidare", payForm: "hourly", hourlyRate: "210", startsOn: "2025-01-01", vacationRule: "procent", vacationPercent: "13", pensionScheme: "saf-lo", title: "Snickare" }));
  await setSchedule(scheduleInputSchema.parse({ employmentId: boJob, name: "Bygg", days: weekdays("07:00", "16:00", 60) }));
  await addTaxVersion(bo, taxInputSchema.parse({ kind: "table", tableNo: "33", columnNo: "1", source: "a-skattsedel", validFrom: "2026-01-01" }));
  const sick = new Set(workdays.slice(10, 14));
  const ob = workdays[workdays.length - 3];
  const overtime = workdays[workdays.length - 4];
  const ids: string[] = [];
  const add = async (who: string, date: IsoDate, start: string, end: string, kind: "work" | "overtime" = "work") => ids.push(await addTimeEntry(who, timeEntryInputSchema.parse({ date, start, end, kind }), { status: "submitted" }));
  for (const d of workdays) {
    if (sick.has(d)) continue;
    if (d === ob) {
      await add(bo, d, "13:00", "17:00");
      await add(bo, d, "18:00", "22:00");
    } else {
      await add(bo, d, "07:00", "11:00");
      await add(bo, d, "12:00", "16:00");
    }
  }
  await add(bo, overtime, "16:00", "18:00", "overtime");
  const sickDays = [...sick];
  const s = await addAbsence(bo, absenceInputSchema.parse({ kind: "sjuk", from: sickDays[0], to: sickDays[sickDays.length - 1] }));
  await updateAbsence(s, { approved: true });
  const claimBase = { description: "", amountOre: null, vatOre: 0, distanceKm: null, carType: null, destination: "", departureTime: null, returnTime: null, nights: 0, nightsWithoutLodging: 0, meals: {}, longStay: "none" as const, farFromHome: true, note: "" };
  const mileage = await createClaim(bo, { ...claimBase, kind: "milersattning", dateFrom: workdays[5], dateTo: workdays[5], description: "Borås, materialhämtning", distanceKm: 600, carType: "egen" });
  await submitClaim(mileage.id);
  await approveClaim(mileage.id);
  const trip = await createClaim(bo, { ...claimBase, kind: "traktamente", dateFrom: workdays[15], dateTo: workdays[16], destination: "Jönköping", departureTime: "07:00", returnTime: "20:00", nights: 1, meals: { [workdays[16]]: { breakfast: true } } });
  await submitClaim(trip.id);

  // Cecilia: styrelsearvode 5 000 kr a month, another main employer (30 %).
  const cecilia = await person({ name: "Cecilia Ek", email: "cecilia@demo.se", pnr: "197207072385", bankClearing: "5000", bankAccount: "12345678", isBoardMember: true });
  await addEmploymentVersion(cecilia, employmentInputSchema.parse({ form: "uppdrag", payForm: "fee", fee: "5000", feePeriod: "month", startsOn: "2026-01-01", vacationRule: "none", decisionReference: "Årsstämma 2026-05-20, § 9" }));
  await addTaxVersion(cecilia, taxInputSchema.parse({ kind: "table", tableNo: "33", columnNo: "1", mainEmployer: false, source: "manual", validFrom: "2026-01-01" }));

  // David: SÄVA on timlön for two months, four-hour days three times a week, semesterersättning paid monthly.
  const david = await person({ name: "David Dahl", email: "david@demo.se", pnr: "200103032397", bankClearing: "3300", bankAccount: "0103032397", agreement: "none" });
  await addEmploymentVersion(david, employmentInputSchema.parse({ form: "sava", payForm: "hourly", hourlyRate: "180", startsOn: from, endsOn: monthEnd(month), vacationRule: "procent", vacationPercent: "12", pensionScheme: "none", weeklyHours: "12", title: "Hantlangare" }));
  await addTaxVersion(david, taxInputSchema.parse({ kind: "table", tableNo: "33", columnNo: "1", source: "a-skattsedel", validFrom: "2026-01-01" }));
  for (const d of workdays.filter((_, i) => i % 5 === 0 || i % 5 === 2 || i % 5 === 4)) await add(david, d, "08:00", "12:00");

  await approveEntries(ids, "demo@localhost");
}

/**
 * The decisions a run needs that the defaults do not give (the bank
 * account for the salary file, the AGI contact, the agreement "both" with
 * its register preset), the company's identity for the AGI file, then the
 * month run to closed and its arbetsgivardeklaration stored.
 */
export async function seedDemoPayroll(month: string, today: IsoDate): Promise<string> {
  await seedDemoPeople(month, today);
  const org = await getOrgSettings();
  if (!org.company.orgNr || !org.company.signer) {
    await saveOrgSettings(
      { ...org, company: { ...org.company, legalName: org.company.legalName || "Demo Bygg AB", orgNr: org.company.orgNr || "559123-4567", signer: org.company.signer || "Anna Andersson", phone: org.company.phone || "031-123 45 67", email: org.company.email || "lon@demo.se" } },
      DEMO_ACTOR
    );
  }
  await savePayrollDecision("bank", { bank: { iban: "SE4550000000058398257466", bic: "ESSESESS", customerId: "" } });
  await savePayrollDecision("agi", { agi: { largeEmployer: false, contactName: "Anna Andersson", contactPhone: "031-123 45 67", contactEmail: "lon@demo.se" } });
  await savePayrollDecision("agreement", { agreement: "both" });
  await applyPayItemPreset("both", today);
  for (const d of ["period", "payDay", "vacationYear", "accounts"] as const) await savePayrollDecision(d, {});

  const { settings } = await getPayrollSettings();
  const payDate = payDateFor(month, settings);
  const runId = await createRun(month, payDate);
  const result = await calculateRun(runId, today, { store: true });
  const blocks = result.checks.filter((c) => c.level === "block");
  if (blocks.length) throw new Error(`Demokörningen stoppades: ${blocks.map((b) => b.text).join(" ")}`);
  const { renderPayslipPdf, payslipEmployer } = await import("../../pdf/render-payslip");
  const employer = await payslipEmployer();
  await approveRun(runId, "demo", (slip) => renderPayslipPdf(slip, employer));
  await createBankFile(runId, `${today}T09:00:00`);
  await bookRun(runId);
  await closeRun(runId);
  await storeAgi(payDate.slice(0, 7));
  return `${monthLabel(`${month}-01`)} är körd och stängd (lönedag ${payDate}) och arbetsgivardeklarationen för ${payDate.slice(0, 7)} är skapad.`;
}

const g = globalThis as unknown as { __binaafyDemoHrSeed?: Promise<void> };

/**
 * Demo mode: seed once per process when the register is empty, so the
 * first admin page shows people, time, a closed run and an AGI. A failure
 * is logged and leaves the register as it was (the Lön page's button runs
 * the seed again with the message shown).
 */
export async function ensureDemoHr(today: IsoDate): Promise<void> {
  if (!isDemo() || process.env.BINAAFY_DEMO_HR_SEED === "off") return;
  if (!g.__binaafyDemoHrSeed) {
    g.__binaafyDemoHrSeed = (async () => {
      if ((await listEmployees()).length) return;
      try {
        await seedDemoPayroll(today.slice(0, 7), today);
      } catch (err) {
        console.error("[demo] HR seed:", err instanceof Error ? err.message : err);
      }
    })();
  }
  await g.__binaafyDemoHrSeed;
}
