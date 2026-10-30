/**
 * People, employments and tax data (docs/hr-lon.md, sections 2, 3 and 11;
 * tables in supabase/migrations/0035_hr.sql). Pure: types, labels, the zod
 * schemas the admin forms post through, and personnummer handling. Money is
 * öre; the forms type kronor and the schemas convert.
 *
 * Form, pay form and schedule are three separate things: "timanställd" is
 * timlön on one of the forms, "vid behov" is a chain of short SÄVA, a
 * styrelseledamot has the form `uppdrag` with an arvode.
 */

import { z } from "zod";
import { parseKronor, type Ore } from "../money";
import { addDays, type IsoDate } from "../rules/index";
import { addMonths, type EmploymentForm } from "../payroll/employment-clocks";

export type { EmploymentForm };

export const EMPLOYMENT_FORMS = ["tillsvidare", "provanstallning", "vikariat", "sava", "sasong", "vd", "uppdrag"] as const satisfies readonly EmploymentForm[];

export const FORM_LABEL: Record<EmploymentForm, string> = {
  tillsvidare: "Tillsvidareanställning",
  provanstallning: "Provanställning",
  vikariat: "Vikariat",
  sava: "Särskild visstidsanställning (SÄVA)",
  sasong: "Säsongsanställning",
  vd: "VD-avtal",
  uppdrag: "Styrelseuppdrag",
};

export const FORM_SHORT: Record<EmploymentForm, string> = {
  tillsvidare: "Tillsvidare",
  provanstallning: "Provanställd",
  vikariat: "Vikariat",
  sava: "SÄVA",
  sasong: "Säsong",
  vd: "VD",
  uppdrag: "Styrelse",
};

export const FORM_HINT: Record<EmploymentForm, string> = {
  tillsvidare: "Fast anställning. Uppsägningstid efter anställningstid (LAS 11 §) eller kollektivavtal.",
  provanstallning: "Högst sex månader, blir tillsvidare dagen efter om den inte avbryts. Besked senast två veckor före slutet.",
  vikariat: "Ersätter en frånvarande person eller håller en vakant tjänst. Mer än två år på fem år blir tillsvidare.",
  sava: "Tidsbegränsad utan skäl. Mer än tolv månader på fem år blir tillsvidare; tre eller fler i samma månad räknar dagarna emellan. Vid behov: varje pass är en egen SÄVA.",
  sasong: "Säsongsarbete med start- och slutdatum.",
  vd: "LAS gäller inte för VD (1 §). Uppsägning och avgångsvederlag enligt avtalet, ingen provanställning.",
  uppdrag: "Inte anställd. Arvode beslutat av bolagsstämman; ingen semester, sjuklön eller LAS om inget annat avtalats.",
};

export const PAY_FORMS = ["monthly", "hourly", "fee"] as const;
export type PayForm = (typeof PAY_FORMS)[number];
export const PAY_FORM_LABEL: Record<PayForm, string> = { monthly: "Månadslön", hourly: "Timlön", fee: "Arvode" };

export const AGREEMENTS = ["byggavtalet", "tjanstemannaavtalet", "none"] as const;
export type Agreement = (typeof AGREEMENTS)[number];
export const AGREEMENT_LABEL: Record<Agreement, string> = {
  byggavtalet: "Byggavtalet",
  tjanstemannaavtalet: "Tjänstemannaavtalet",
  none: "Inget kollektivavtal",
};

export const PENSION_SCHEMES = ["saf-lo", "itp1", "none"] as const;
export type PensionScheme = (typeof PENSION_SCHEMES)[number];
export const PENSION_LABEL: Record<PensionScheme, string> = { "saf-lo": "Avtalspension SAF-LO (Fora)", itp1: "ITP 1 (Collectum)", none: "Ingen tjänstepension" };

export const VACATION_RULES = ["procent", "sammalon", "none"] as const;
export type VacationRule = (typeof VACATION_RULES)[number];
export const VACATION_RULE_LABEL: Record<VacationRule, string> = {
  procent: "Procentregeln",
  sammalon: "Sammalöneregeln",
  none: "Ingen semester",
};

export const FEE_PERIODS = ["month", "quarter", "year"] as const;
export type FeePeriod = (typeof FEE_PERIODS)[number];
export const FEE_PERIOD_LABEL: Record<FeePeriod, string> = { month: "per månad", quarter: "per kvartal", year: "per år" };

export const TAX_SOURCES = ["a-skattsedel", "skatteverket-api", "manual"] as const;
export type TaxSource = (typeof TAX_SOURCES)[number];
export const TAX_SOURCE_LABEL: Record<TaxSource, string> = {
  "a-skattsedel": "A-skattsedel",
  "skatteverket-api": "Skatteverket (Fråga om skatteavdrag)",
  manual: "Manuellt inlagd",
};

/* ---------- records, as the store hands them out ---------- */

export type Employee = {
  id: string;
  orgId: string;
  name: string;
  email: string;
  phone: string;
  street: string;
  postalCode: string;
  city: string;
  /** ÅÅÅÅMMDD-XXXX, or "" when no personnummer is recorded. */
  pnrMasked: string;
  birthDate: IsoDate | null;
  bankClearing: string;
  /** ••••1234, or "". */
  bankAccountMasked: string;
  userId: string | null;
  isOwner: boolean;
  isBoardMember: boolean;
  agreement: Agreement;
  emergencyContact: string;
  notes: string;
  endedAt: IsoDate | null;
  createdAt: string;
  updatedAt: string;
};

export type EmploymentVersion = {
  id: string;
  employeeId: string;
  contractId: string;
  version: number;
  form: EmploymentForm;
  payForm: PayForm;
  monthlySalaryOre: Ore | null;
  hourlyRateOre: Ore | null;
  feeOre: Ore | null;
  feePeriod: FeePeriod | null;
  decisionReference: string;
  title: string;
  workplace: string;
  workingTimePercent: number;
  weeklyHours: number | null;
  substituteFor: string;
  probationEndsOn: IsoDate | null;
  startsOn: IsoDate;
  endsOn: IsoDate | null;
  noticeDays: number | null;
  payDay: number | null;
  vacationRule: VacationRule;
  vacationDays: number;
  vacationPercent: number | null;
  atfHoursPerYear: number;
  pensionScheme: PensionScheme;
  terms: string;
  changeReason: string;
  validFrom: IsoDate;
  /** Last day this version applies; null while it is the current one. */
  validTo: IsoDate | null;
  documentId: string | null;
  createdAt: string;
};

export type TaxVersion = {
  id: string;
  employeeId: string;
  kind: "table" | "none";
  tableNo: number | null;
  columnNo: number | null;
  adjustmentPercent: number | null;
  adjustmentMonthlyChangeOre: Ore | null;
  adjustmentValidTo: IsoDate | null;
  mainEmployer: boolean;
  source: TaxSource;
  validFrom: IsoDate;
  note: string;
  createdAt: string;
};

export type EmploymentDocument = {
  id: string;
  employeeId: string;
  employmentId: string;
  kind: "contract" | "amendment" | "termination" | "certificate";
  title: string;
  template: string;
  templateVersion: string;
  storagePath: string;
  sha256: string;
  sizeBytes: number;
  signedAt: IsoDate | null;
  createdAt: string;
};

/* ---------- personnummer ---------- */

/** Luhn over the last ten digits (YYMMDDNNNC). */
export function luhnOk(tenDigits: string): boolean {
  if (!/^\d{10}$/.test(tenDigits)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let n = Number(tenDigits[i]) * (i % 2 === 0 ? 2 : 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

/** The birth date in a twelve-digit number; a samordningsnummer has the day + 60. Null when the date does not exist. */
export function pnrBirthDate(pnr12: string): IsoDate | null {
  if (!/^\d{12}$/.test(pnr12)) return null;
  const y = Number(pnr12.slice(0, 4));
  const m = Number(pnr12.slice(4, 6));
  let d = Number(pnr12.slice(6, 8));
  if (d > 60) d -= 60;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * "850412-1234", "198504121234", "19850412-1234" → "198504121234". Ten
 * digits get the century that makes the person under 100 and born by
 * `today`; "+" (the law's sign for 100 or older) takes the one before.
 * Null when it is not a valid personnummer or samordningsnummer.
 */
export function normalizePnr(input: string, today: IsoDate): string | null {
  const raw = input.trim();
  const plus = raw.includes("+");
  const digits = raw.replace(/\D/g, "");
  let pnr12: string;
  if (digits.length === 12) {
    pnr12 = digits;
  } else if (digits.length === 10) {
    const year = Number(today.slice(0, 4));
    let century = Math.floor(year / 100) * 100;
    if (`${century + Number(digits.slice(0, 2))}${digits.slice(2, 6)}` > today.replace(/-/g, "").slice(0, 8)) century -= 100;
    if (plus) century -= 100;
    pnr12 = `${century + Number(digits.slice(0, 2))}${digits.slice(2)}`;
  } else {
    return null;
  }
  if (!luhnOk(pnr12.slice(2)) || !pnrBirthDate(pnr12)) return null;
  return pnr12;
}

/** ÅÅÅÅMMDD-XXXX, the way 0023 and 0035 store it masked. */
export const maskPnr = (pnr12: string) => `${pnr12.slice(0, 8)}-XXXX`;

/** ÅÅÅÅMMDD-NNNN for display after a reveal. */
export const formatPnr = (pnr12: string) => `${pnr12.slice(0, 8)}-${pnr12.slice(8)}`;

/* ---------- zod ---------- */

const text = (max: number, label: string) => z.string().trim().max(max, `${label}: högst ${max} tecken.`);
const isoDate = (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label}: välj ett datum.`);
const optionalDate = (label: string) => z.union([z.literal(""), isoDate(label)]).transform((v) => (v === "" ? null : v));

/** Kronor as typed ("32 500", "185,50") to öre; "" is null. */
const kronor = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v, ctx) => {
      const s = String(v).trim();
      if (s === "") return null;
      try {
        const ore = parseKronor(s);
        if (ore < 0) throw new RangeError();
        return ore;
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}: skriv ett belopp i kronor, t.ex. 32 500 eller 185,50.` });
        return z.NEVER;
      }
    });

const wholeNumber = (label: string, min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((v, ctx) => {
      const s = String(v).trim().replace(",", ".");
      if (s === "") return null;
      const n = Number(s);
      if (!Number.isFinite(n) || n < min || n > max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}: ett tal mellan ${min} och ${max}.` });
        return z.NEVER;
      }
      return n;
    });

export function employeeInputSchema(today: IsoDate) {
  return z
    .object({
      name: text(120, "Namn").min(1, "Namnet behövs."),
      email: z.union([z.literal(""), z.string().trim().email("Ange en giltig e-postadress.")]).default(""),
      phone: text(30, "Telefon").default(""),
      street: text(120, "Gatuadress").default(""),
      postalCode: text(10, "Postnummer").default(""),
      city: text(60, "Ort").default(""),
      pnr: z.string().default(""),
      bankClearing: text(6, "Clearingnummer").default(""),
      bankAccount: text(20, "Kontonummer").default(""),
      isOwner: z.boolean().default(false),
      isBoardMember: z.boolean().default(false),
      agreement: z.enum(AGREEMENTS).default("none"),
      emergencyContact: text(200, "Närmast anhörig").default(""),
      notes: text(2000, "Anteckningar").default(""),
    })
    .superRefine((v, ctx) => {
      if (v.pnr.trim() !== "" && !normalizePnr(v.pnr, today)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pnr"], message: "Personnumret stämmer inte (datum eller kontrollsiffra). Skriv ÅÅMMDD-XXXX eller ÅÅÅÅMMDD-XXXX." });
      }
      const account = v.bankAccount.replace(/\D/g, "");
      if (account !== "" && !/^\d{4,5}$/.test(v.bankClearing.replace(/\D/g, ""))) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bankClearing"], message: "Clearingnumret har fyra eller fem siffror." });
      }
      if (account !== "" && (account.length < 5 || account.length > 15)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bankAccount"], message: "Kontonumret har 5 till 15 siffror (utan clearingnummer)." });
      }
    })
    .transform((v) => ({ ...v, pnr: v.pnr.trim() === "" ? null : normalizePnr(v.pnr, today) }));
}
export type EmployeeInput = z.infer<ReturnType<typeof employeeInputSchema>>;

/** The contact part of a person, editable later (personnummer and bank account have their own actions). */
export const employeeContactSchema = z.object({
  name: text(120, "Namn").min(1, "Namnet behövs."),
  email: z.union([z.literal(""), z.string().trim().email("Ange en giltig e-postadress.")]).default(""),
  phone: text(30, "Telefon").default(""),
  street: text(120, "Gatuadress").default(""),
  postalCode: text(10, "Postnummer").default(""),
  city: text(60, "Ort").default(""),
  isOwner: z.boolean().default(false),
  isBoardMember: z.boolean().default(false),
  agreement: z.enum(AGREEMENTS).default("none"),
  emergencyContact: text(200, "Närmast anhörig").default(""),
  notes: text(2000, "Anteckningar").default(""),
});
export type EmployeeContact = z.infer<typeof employeeContactSchema>;

/** Last day of a provanställning that starts on `startsOn`: six months less a day (the law's maximum). */
export const maxProbationEnd = (startsOn: IsoDate, months = 6): IsoDate => {
  const same = addMonths(startsOn, months);
  return same.slice(8) < startsOn.slice(8) ? same : addDays(same, -1);
};

export const employmentInputSchema = z
  .object({
    /** Set when this is a new version of an existing contract. */
    contractId: z.string().uuid().nullable().default(null),
    form: z.enum(EMPLOYMENT_FORMS),
    payForm: z.enum(PAY_FORMS),
    monthlySalary: kronor("Månadslön").default(""),
    hourlyRate: kronor("Timlön").default(""),
    fee: kronor("Arvode").default(""),
    feePeriod: z.union([z.literal(""), z.enum(FEE_PERIODS)]).default("").transform((v) => (v === "" ? null : v)),
    decisionReference: text(200, "Stämmobeslut").default(""),
    title: text(120, "Befattning").default(""),
    workplace: text(200, "Arbetsplats").default(""),
    workingTimePercent: wholeNumber("Arbetstid i procent", 1, 100).default("100"),
    weeklyHours: wholeNumber("Timmar per vecka", 1, 60).default("40"),
    substituteFor: text(200, "Vikarierar för").default(""),
    probationEndsOn: optionalDate("Provanställningen slutar").default(""),
    startsOn: isoDate("Startdatum"),
    endsOn: optionalDate("Slutdatum").default(""),
    noticeDays: wholeNumber("Uppsägningstid i dagar", 0, 730).default(""),
    payDay: wholeNumber("Lönedag", 1, 31).default("25"),
    vacationRule: z.enum(VACATION_RULES),
    vacationDays: wholeNumber("Semesterdagar", 0, 60).default("25"),
    vacationPercent: wholeNumber("Semesterlön i procent", 0, 30).default(""),
    atfHoursPerYear: wholeNumber("Arbetstidsförkortning", 0, 400).default("0"),
    pensionScheme: z.enum(PENSION_SCHEMES).default("none"),
    terms: text(4000, "Övriga villkor").default(""),
    changeReason: text(200, "Skäl till ändringen").default(""),
    /** The day this version takes effect; a new contract's first version uses its start date. */
    validFrom: optionalDate("Gäller från").default(""),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (v.payForm === "monthly" && v.monthlySalary === null) issue("monthlySalary", "Ange månadslönen.");
    if (v.payForm === "hourly" && v.hourlyRate === null) issue("hourlyRate", "Ange timlönen.");
    if (v.payForm === "fee" && v.fee === null) issue("fee", "Ange arvodet som stämman beslutat.");
    if (v.payForm === "fee" && !v.feePeriod) issue("feePeriod", "Välj hur ofta arvodet betalas.");
    if ((v.form === "uppdrag") !== (v.payForm === "fee")) issue("payForm", v.form === "uppdrag" ? "Ett styrelseuppdrag har arvode." : "Arvode hör till styrelseuppdrag.");
    if (v.form === "uppdrag" && v.vacationRule !== "none") issue("vacationRule", "Styrelseuppdrag ger ingen semester om inget annat avtalats.");
    if (v.form !== "uppdrag" && v.vacationRule === "none") issue("vacationRule", "En anställd har rätt till semester (semesterlagen).");
    if (v.vacationRule === "procent" && v.vacationPercent === null) issue("vacationPercent", "Ange procentsatsen (12 % enligt lagen, 13 % i Byggavtalet).");
    if (v.form === "vikariat" && v.substituteFor === "") issue("substituteFor", "Skriv vem som ersätts eller vilken tjänst som hålls.");
    if ((v.form === "sava" || v.form === "sasong") && v.endsOn === null) issue("endsOn", "En tidsbegränsad anställning har ett slutdatum.");
    if (v.endsOn && v.endsOn < v.startsOn) issue("endsOn", "Slutdatumet är före startdatumet.");
    if (v.form === "provanstallning") {
      const max = maxProbationEnd(v.startsOn);
      if (!v.probationEndsOn) issue("probationEndsOn", `Ange när provanställningen slutar (senast ${max}).`);
      else if (v.probationEndsOn < v.startsOn || v.probationEndsOn > max) issue("probationEndsOn", `Provanställningen får vara högst sex månader: senast ${max}.`);
    }
    if (v.validFrom && v.validFrom < v.startsOn) issue("validFrom", "En version gäller tidigast från startdatumet.");
    if (v.contractId && !v.validFrom) issue("validFrom", "Ange från vilket datum ändringen gäller.");
  });
export type EmploymentInput = z.infer<typeof employmentInputSchema>;

export const taxInputSchema = z
  .object({
    kind: z.enum(["table", "none"]),
    tableNo: wholeNumber("Tabell", 20, 50).default(""),
    columnNo: wholeNumber("Kolumn", 1, 6).default("1"),
    mainEmployer: z.boolean().default(true),
    adjustment: z.enum(["none", "percent", "amount"]).default("none"),
    adjustmentPercent: wholeNumber("Jämkning i procent", 0, 100).default(""),
    adjustmentMonthlyChange: z
      .union([z.string(), z.number()])
      .default("")
      .transform((v, ctx) => {
        const s = String(v).trim();
        if (s === "") return null;
        try {
          return parseKronor(s);
        } catch {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Jämkningsbeloppet: kronor per månad, minus för en sänkning." });
          return z.NEVER;
        }
      }),
    adjustmentValidTo: optionalDate("Jämkningen gäller till").default(""),
    source: z.enum(TAX_SOURCES),
    validFrom: isoDate("Gäller från"),
    note: text(500, "Anteckning").default(""),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (v.kind === "table" && v.mainEmployer && (v.tableNo === null || v.columnNo === null)) {
      issue("tableNo", "Som huvudarbetsgivare behövs tabell och kolumn från A-skattsedeln; utan dem räknas ingen lön.");
    }
    if (v.kind === "table" && v.adjustment !== "none") {
      if (!v.adjustmentValidTo) issue("adjustmentValidTo", "Jämkningsbeslutet gäller till ett datum.");
      if (v.adjustment === "percent" && v.adjustmentPercent === null) issue("adjustmentPercent", "Ange procentsatsen i beslutet.");
      if (v.adjustment === "amount" && v.adjustmentMonthlyChange === null) issue("adjustmentMonthlyChange", "Ange beloppet per månad i beslutet.");
    }
  })
  .transform((v) => ({
    kind: v.kind,
    tableNo: v.kind === "table" ? v.tableNo : null,
    columnNo: v.kind === "table" && v.tableNo !== null ? v.columnNo : null,
    mainEmployer: v.mainEmployer,
    adjustmentPercent: v.kind === "table" && v.adjustment === "percent" ? v.adjustmentPercent : null,
    adjustmentMonthlyChangeOre: v.kind === "table" && v.adjustment === "amount" ? v.adjustmentMonthlyChange : null,
    adjustmentValidTo: v.kind === "table" && v.adjustment !== "none" ? v.adjustmentValidTo : null,
    source: v.source,
    validFrom: v.validFrom,
    note: v.note,
  }));
export type TaxInput = z.infer<typeof taxInputSchema>;

export const signInputSchema = z.object({
  documentId: z.string().uuid(),
  signedOn: isoDate("Signerat"),
});

/* ---------- reading versions ---------- */

/** The version of each contract that applies on `date` (versions of one contract never overlap). */
export function versionsOn(versions: readonly EmploymentVersion[], date: IsoDate): EmploymentVersion[] {
  return versions.filter((v) => v.validFrom <= date && (v.validTo === null || v.validTo >= date));
}

/** The latest version of every contract (what the contract says now, future changes included). */
export function latestVersions(versions: readonly EmploymentVersion[]): EmploymentVersion[] {
  const byContract = new Map<string, EmploymentVersion>();
  for (const v of versions) {
    const prev = byContract.get(v.contractId);
    if (!prev || v.version > prev.version) byContract.set(v.contractId, v);
  }
  return [...byContract.values()].sort((a, b) => b.startsOn.localeCompare(a.startsOn));
}

/** Whether a contract is in force on `date`: started and not ended. */
export const inForce = (v: EmploymentVersion, date: IsoDate) => v.startsOn <= date && (v.endsOn === null || v.endsOn >= date);

/** The tax row valid on `date`: the latest one that has started. */
export function taxOn(rows: readonly TaxVersion[], date: IsoDate): TaxVersion | null {
  let best: TaxVersion | null = null;
  for (const r of rows) if (r.validFrom <= date && (!best || r.validFrom > best.validFrom)) best = r;
  return best;
}
