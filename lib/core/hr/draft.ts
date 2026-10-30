/**
 * What the employment form edits before it is parsed: every field as the
 * user types it (kronor and numbers as text). A new contract starts from
 * the presets of its form and the person's collective agreement; a new
 * version starts from the latest one. Pure, shared by the page and the
 * client form; employmentInputSchema turns it into an EmploymentInput.
 */

import { formatOre } from "../money";
import type { IsoDate } from "../rules/index";
import { maxProbationEnd, type Agreement, type EmploymentForm, type EmploymentVersion, type FeePeriod, type PayForm, type PensionScheme, type VacationRule } from "./schema";

export type EmploymentDraft = {
  contractId: string | null;
  form: EmploymentForm;
  payForm: PayForm;
  monthlySalary: string;
  hourlyRate: string;
  fee: string;
  feePeriod: FeePeriod | "";
  decisionReference: string;
  title: string;
  workplace: string;
  workingTimePercent: string;
  weeklyHours: string;
  substituteFor: string;
  probationEndsOn: string;
  startsOn: string;
  endsOn: string;
  noticeDays: string;
  payDay: string;
  vacationRule: VacationRule;
  vacationDays: string;
  vacationPercent: string;
  atfHoursPerYear: string;
  pensionScheme: PensionScheme;
  terms: string;
  changeReason: string;
  validFrom: string;
};

const kronorText = (ore: number | null) => (ore === null ? "" : formatOre(ore, { decimals: ore % 100 === 0 ? 0 : 2 }));
const numText = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

/** Pension and semester percent that follow the agreement. */
export function agreementDefaults(agreement: Agreement): { pensionScheme: PensionScheme; vacationPercent: string } {
  if (agreement === "byggavtalet") return { pensionScheme: "saf-lo", vacationPercent: "13" };
  if (agreement === "tjanstemannaavtalet") return { pensionScheme: "itp1", vacationPercent: "12" };
  return { pensionScheme: "none", vacationPercent: "12" };
}

/** Switch the form and set what usually goes with it; fields the user filled stay. */
export function applyFormPreset(d: EmploymentDraft, form: EmploymentForm, agreement: Agreement): EmploymentDraft {
  const next: EmploymentDraft = { ...d, form };
  const { pensionScheme, vacationPercent } = agreementDefaults(agreement);
  if (form === "uppdrag") {
    return { ...next, payForm: "fee", feePeriod: d.feePeriod || "year", vacationRule: "none", vacationDays: "0", pensionScheme: "none", weeklyHours: "", title: d.title || "Ledamot i styrelsen" };
  }
  if (d.form === "uppdrag") Object.assign(next, { payForm: "monthly", vacationRule: "sammalon", vacationDays: "25", pensionScheme, weeklyHours: "40", title: "" });
  if (form === "sava" || form === "vikariat" || form === "sasong") {
    Object.assign(next, { payForm: "hourly", vacationRule: "procent", vacationPercent: d.vacationPercent || vacationPercent });
  }
  if (form === "tillsvidare" || form === "provanstallning" || form === "vd") {
    if (d.form === "sava" || d.form === "vikariat" || d.form === "sasong") Object.assign(next, { payForm: "monthly", vacationRule: "sammalon" });
  }
  if (form === "provanstallning" && !d.probationEndsOn && /^\d{4}-\d{2}-\d{2}$/.test(d.startsOn)) next.probationEndsOn = maxProbationEnd(d.startsOn);
  if (form === "vd") Object.assign(next, { noticeDays: d.noticeDays || "180" });
  return next;
}

export function newEmploymentDraft(agreement: Agreement, today: IsoDate): EmploymentDraft {
  const { pensionScheme, vacationPercent } = agreementDefaults(agreement);
  return {
    contractId: null,
    form: "tillsvidare",
    payForm: "monthly",
    monthlySalary: "",
    hourlyRate: "",
    fee: "",
    feePeriod: "",
    decisionReference: "",
    title: "",
    workplace: "",
    workingTimePercent: "100",
    weeklyHours: "40",
    substituteFor: "",
    probationEndsOn: "",
    startsOn: today,
    endsOn: "",
    noticeDays: "",
    payDay: "25",
    vacationRule: "sammalon",
    vacationDays: "25",
    vacationPercent,
    atfHoursPerYear: agreement === "byggavtalet" ? "38" : "0",
    pensionScheme,
    terms: "",
    changeReason: "",
    validFrom: "",
  };
}

/** A new version of `v`'s contract, from `validFrom`, with everything else as it is now. */
export function versionDraft(v: EmploymentVersion, validFrom: IsoDate): EmploymentDraft {
  return {
    contractId: v.contractId,
    form: v.form,
    payForm: v.payForm,
    monthlySalary: kronorText(v.monthlySalaryOre),
    hourlyRate: kronorText(v.hourlyRateOre),
    fee: kronorText(v.feeOre),
    feePeriod: v.feePeriod ?? "",
    decisionReference: v.decisionReference,
    title: v.title,
    workplace: v.workplace,
    workingTimePercent: numText(v.workingTimePercent),
    weeklyHours: numText(v.weeklyHours),
    substituteFor: v.substituteFor,
    probationEndsOn: v.probationEndsOn ?? "",
    startsOn: v.startsOn,
    endsOn: v.endsOn ?? "",
    noticeDays: numText(v.noticeDays),
    payDay: numText(v.payDay),
    vacationRule: v.vacationRule,
    vacationDays: String(v.vacationDays),
    vacationPercent: numText(v.vacationPercent),
    atfHoursPerYear: numText(v.atfHoursPerYear),
    pensionScheme: v.pensionScheme,
    terms: v.terms,
    changeReason: "",
    validFrom: validFrom > v.validFrom ? validFrom : v.validFrom,
  };
}
