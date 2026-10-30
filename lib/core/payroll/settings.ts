import { z } from "zod";
import { addDays, type IsoDate } from "../rules/index";
import { isWorkday, previousWorkday, shiftWorkdays } from "../../workdays";
import type { VacationYearModel } from "./vacation";

/**
 * The organisation's payroll decisions (payroll_settings, 0039), the list
 * "Before the first real payroll" in docs/hr-lon.md section 12. Every
 * field has the law's or the common default, so a run works before anyone
 * has decided; `confirmed` holds when each decision was last saved, and a
 * decision without a date is "inte bekräftad" on the settings page and on
 * the run's checklist. The database reads `variablePeriod`, `approvers` and
 * `accounts` (tax, net, contributions) itself.
 */

const account = z.string().trim().regex(/^\d{4}$/, "Konto: fyra siffror.");

export const payrollAccountsSchema = z.object({
  tax: account.default("2710"),
  net: account.default("2820"),
  contributionCost: account.default("7510"),
  contributionLiability: account.default("2731"),
  vacationCostCollective: account.default("7090"),
  vacationCostSalaried: account.default("7290"),
  vacationLiability: account.default("2920"),
  vacationContributionCost: account.default("7519"),
  vacationContributionLiability: account.default("2941"),
  pensionCost: account.default("7410"),
  pensionLiability: account.default("2950"),
});
export type PayrollAccounts = z.infer<typeof payrollAccountsSchema>;

export const payrollBankSchema = z.object({
  /** The account salaries are paid from (pain.001 debtor). */
  iban: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, "").toUpperCase())
    .refine((v) => v === "" || /^SE\d{22}$/.test(v), "Ett svenskt IBAN är SE och 22 siffror, t.ex. SE45 5000 0000 0583 9825 7466.")
    .default(""),
  bic: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => v === "" || /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v), "BIC är 8 eller 11 tecken, t.ex. ESSESESS.")
    .default(""),
  /** The bank's customer number for the initiating party, if the bank asks for one. */
  customerId: z.string().trim().max(35).default(""),
});

export const payrollSettingsSchema = z.object({
  /** "previous": månadslön for the month, time and absence from the month before (the common model). "same": all in the month. */
  variablePeriod: z.enum(["previous", "same"]).default("previous"),
  /** Day of the month; a day that is not a workday moves to the workday before. */
  payDay: z.coerce.number().int().min(1).max(28).default(25),
  /** "law": 1 April–31 March, earned the year before. "calendar": the calendar year, earned the year before. */
  vacationYear: z.enum(["law", "calendar"]).default("law"),
  agreement: z.enum(["none", "byggavtalet", "tjanstemannaavtalet", "both"]).default("none"),
  /** Who may approve (user ids); empty: any owner or admin other than the one who computed. */
  approvers: z.array(z.string().uuid()).default([]),
  bank: payrollBankSchema.default({}),
  accounts: payrollAccountsSchema.default({}),
  pension: z
    .object({
      foraCustomerNo: z.string().trim().max(20).default(""),
      collectumCustomerNo: z.string().trim().max(20).default(""),
    })
    .default({}),
});
export type PayrollSettings = z.infer<typeof payrollSettingsSchema>;

export const PAYROLL_DECISIONS = ["period", "payDay", "vacationYear", "agreement", "approvers", "bank", "accounts", "pension"] as const;
export type PayrollDecision = (typeof PAYROLL_DECISIONS)[number];
export type PayrollConfirmed = Partial<Record<PayrollDecision, string>>;

export const DECISION_LABEL: Record<PayrollDecision, string> = {
  period: "Löneperiod",
  payDay: "Lönedag",
  vacationYear: "Semesterår",
  agreement: "Kollektivavtal",
  approvers: "Vem som godkänner",
  bank: "Bankkonto för lönefilen",
  accounts: "Kontering",
  pension: "Fora och Collectum",
};

/** What the default is and why, shown until the decision is saved. */
export const DECISION_DEFAULT: Record<PayrollDecision, string> = {
  period: "Månadslön för innevarande månad, timlön, tillägg och frånvaro för månaden före (det vanliga).",
  payDay: "Den 25:e, närmast föregående bankdag om den 25:e är helg (det vanliga).",
  vacationYear: "1 april–31 mars, intjänat året före (semesterlagens huvudregel).",
  agreement: "Inget kollektivavtal (semesterlagen, inga OB- eller övertidstabeller utöver personens avtal).",
  approvers: "Ägare och administratörer, men aldrig den som räknade lönen.",
  bank: "Inget konto: bankfilen kan inte skapas förrän kontot är ifyllt.",
  accounts: "BAS 2026 enligt docs/hr-lon.md avsnitt 7 (redovisningskonsulten bör granska).",
  pension: "Inga kundnummer: premierna periodiseras men ingen rapport görs.",
};

export function parsePayrollSettings(data: unknown): PayrollSettings {
  const r = payrollSettingsSchema.safeParse(data ?? {});
  return r.success ? r.data : payrollSettingsSchema.parse({});
}

export const unconfirmedDecisions = (confirmed: PayrollConfirmed): PayrollDecision[] => PAYROLL_DECISIONS.filter((d) => !confirmed[d]);

/** The semesterår model the settings choose (balances.ts, vacation.ts). */
export function vacationModelFor(settings: Pick<PayrollSettings, "vacationYear">): VacationYearModel {
  return settings.vacationYear === "calendar" ? { startMonthDay: "01-01", earning: "previous-year" } : { startMonthDay: "04-01", earning: "previous-year" };
}

const pad = (n: number) => String(n).padStart(2, "0");
/** The last day of a month ("2026-02" → "2026-02-28"). */
export function monthEnd(month: string): IsoDate {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  return addDays(next, -1);
}

/** The pay day for a month ("2026-04"): the day from the settings, moved back to a workday (lib/workdays.ts). */
export function payDateFor(month: string, settings: Pick<PayrollSettings, "payDay">): IsoDate {
  const day = `${month}-${pad(Math.min(settings.payDay, Number(monthEnd(month).slice(8))))}`;
  return isWorkday(day) ? day : previousWorkday(day);
}

/** The run's periods for a month: the salary month and the month time and absence are read from. */
export function runPeriods(month: string, settings: Pick<PayrollSettings, "variablePeriod">): { periodStart: IsoDate; periodEnd: IsoDate; timeFrom: IsoDate; timeTo: IsoDate } {
  const periodStart = `${month}-01`;
  const periodEnd = monthEnd(month);
  if (settings.variablePeriod === "same") return { periodStart, periodEnd, timeFrom: periodStart, timeTo: periodEnd };
  const prev = addDays(periodStart, -1).slice(0, 7);
  return { periodStart, periodEnd, timeFrom: `${prev}-01`, timeTo: monthEnd(prev) };
}

/** Idag: a run is due from this day (five workdays before pay day). */
export const runDueFrom = (payDate: IsoDate): IsoDate => shiftWorkdays(payDate, -5);
