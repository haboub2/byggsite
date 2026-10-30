/**
 * The payroll rule book (docs/hr-lon.md, section 4). Same discipline as
 * the invoicing rule book next door: everything that is law, an
 * authority's figure or a collective agreement lives here as dated rule
 * sets, and the calculators ask for the rules at the pay date:
 * `payrollRulesAt("2026-10-25")`. No payroll constant anywhere else.
 *
 * Every group carries a `source`: the primary source it was checked
 * against and the date. A value that could not be confirmed against a
 * primary source is kept, flagged `unverified: true` with a note, and
 * listed by `unverifiedRules()` (and pinned in rules/payroll.test.ts)
 * until someone checks it.
 *
 * Checked against Skatteverket, the statutes (data.riksdagen.se), Fora,
 * Collectum, Arbetsgivarverket, AD and the agreement texts on 2026-10-30.
 * To change a rule: add a new set with its validFrom, never edit an old
 * one. Old payslips must keep computing the same way. The sets cover
 * income year 2026 only; `payrollRulesAt` refuses a later year until its
 * set is added (the age limits move every year).
 */

import { assertIsoDate, type IsoDate } from "./index";
import type { Ore } from "../money";
import { nextWorkday } from "../../workdays";

export type RuleSource = {
  /** The primary source (Skatteverket, the statute, the agreement text). */
  url: string;
  /** When the value was last checked against `url`. */
  checked: IsoDate;
  /** Set when the value could not be confirmed against a primary source. */
  unverified?: true;
  note?: string;
};

/** The seven parts of the employer contribution, percent (SAL 2 kap. 26 § and lag (1994:1920) om allmän löneavgift). */
export type ContributionPart =
  | "alderspension"
  | "efterlevandepension"
  | "sjukforsakring"
  | "foraldraforsakring"
  | "arbetsmarknad"
  | "arbetsskada"
  | "allmanLoneavgift";

export type ContributionParts = Record<ContributionPart, number>;

/** A lump-sum bracket: up to and including `toKr` of estimated annual pay (null = no limit). */
export type LumpSumBracket = { toKr: number | null; percent: number };

/** When in the week a band applies. "holiday" is a helgdag or one of the eves the calendar treats as one (lib/workdays.ts). */
export type DayKind = "weekday" | "saturday" | "sunday" | "holiday";

/**
 * A time band of an agreement: on these day kinds, from (inclusive) to
 * (exclusive), "24:00" is midnight; a band with from > to runs past
 * midnight. An hour in the band pays `percent` of the hourly base (OB on
 * top of the base; övertid on top of the base when `overtimeIncludesBase`),
 * or for monthly salaries månadslön / `monthlyDivisor` per hour.
 */
export type TimeBand = {
  code: string;
  label: string;
  days: readonly DayKind[];
  from: string;
  to: string;
  percent: number | null;
  monthlyDivisor: number | null;
};

export type AgreementRules = {
  name: string;
  /** The agreement period, for the pre-run check that it has not expired. */
  validFrom: IsoDate;
  validTo: IsoDate;
  /** Semesterlön/semesterersättning for hourly paid (procentregeln), percent. */
  vacationPercent: number;
  /** Monthly paid: semestertillägg per paid day, percent of månadslön. */
  vacationDailySupplementPercent: number;
  /** Monthly paid: vacation pay on variable pay, as a total percent or a percent per paid day. */
  vacationVariablePay: { mode: "total" | "perDay"; percent: number };
  /** Monthly paid: semesterersättning per untaken day and deduction per unpaid vacation day, percent of månadslön. */
  vacationDayValuePercent: number;
  ob: readonly TimeBand[];
  overtime: readonly TimeBand[];
  /** True if an övertid hour pays the hourly base plus the band's percent. */
  overtimeIncludesBase: boolean;
  /** False: OB is never paid on hours that are paid as övertid. */
  obOnOvertime: boolean;
  /** Arbetstidsförkortning per full intjänandeår, pro rata per day; hours or days by agreement. */
  atf: { hoursPerYear: number | null; daysPerYear: number | null };
  /** Löneavdrag for unpaid absence on monthly salary; null when the agreement text was not checked for it. */
  absenceDeduction: null | {
    /** Up to this many working days: arbetsdagsavdrag (månadslön / workdayDivisor per day). */
    workdayMethodMaxDays: number;
    workdayDivisor: number;
    /** A part-timer working fewer days a week: the divisor is scaled by days worked / fullWeekDays. */
    fullWeekDays: number;
    /** Part of a day: månadslön / hourDivisor per hour. */
    hourDivisor: number;
    /** Longer: kalenderdagsavdrag, månadslön × 12 / 365 per calendar day. */
    calendarDayNumerator: number;
    calendarDayDenominator: number;
  };
  pensionScheme: "saf-lo" | "itp1";
  source: RuleSource;
};

export type PayrollRuleSet = {
  /** First pay date (inclusive) these rules apply. */
  validFrom: IsoDate;
  /** The income year the set's birth-year limits are written for. */
  incomeYear: number;

  employerContributions: {
    parts: ContributionParts;
    /** The sum of the parts, percent; tested to match. */
    fullPercent: number;
    /** People born in these years (inclusive) pay only ålderspensionsavgiften this income year (had turned 67, SAL 2:27). */
    olderReduced: { bornFrom: number; bornTo: number; percent: number };
    /** Born in or before this year: no employer contributions at all. */
    exemptBornUpTo: number;
    /** Temporary reduction for young people (null when not in force). */
    young: null | {
      bornFrom: number;
      bornTo: number;
      /** The reduced parts (the whole ålderspensionsavgift, half of the others with the third decimal dropped). */
      parts: ContributionParts;
      percent: number;
      /** The reduced rate applies to pay up to this amount per calendar month and person; above it the full rate. */
      capPerMonthOre: Ore;
      source: RuleSource;
    };
    /** No contributions (and no skatteavdrag) when a person's pay from us in the year stays below this. */
    minAnnualPayOre: Ore;
    /** In the AGI every amount is whole kronor; öre are dropped per rate separately, then summed (ruta 487). */
    rounding: "down-whole-kronor-per-rate";
    source: RuleSource;
  };

  /** Växa-stöd: data for the monthly refund application; no payroll effect from 2026. */
  vaxaStod: {
    model: "refund";
    maxEmployees: number;
    months: number;
    /** Pay cap per month for employment that started after 2024-04-30. */
    capPerMonthOre: Ore;
    /** Pay cap per month for employment that started earlier. */
    capPerMonthEarlierOre: Ore;
    /** Only ålderspensionsavgift on pay up to the cap; the refund is the rest. */
    percentWithinCap: number;
    minHoursPerWeek: number;
    minEmploymentMonths: number;
    /** Apply at the latest this many months after the calendar month applied for. */
    applyWithinMonths: number;
    source: RuleSource;
  };

  preliminaryTax: {
    /** Table deductions are whole kronor; percent deductions drop the öre. */
    rounding: "down-whole-kronor";
    /** Sidoinkomst and arvode when we are not the main employer, percent. */
    sideIncomePercent: number;
    lumpSum: {
      /** Brackets per column (1–6), ascending. */
      columns: Readonly<Record<number, readonly LumpSumBracket[]>>;
      /** When the person has no tidsbestämd lön from us. */
      noRegularSalaryPercent: number;
      source: RuleSource;
    };
    /** Jämkning: a percent or an amount decided by Skatteverket, valid until a date. */
    adjustmentModes: readonly ("percent" | "amount")[];
    /** No skatteavdrag on a single payment below this (SFL 10 kap. 4 § 1). */
    minSinglePaymentOre: Ore;
    source: RuleSource;
  };

  sickPay: {
    /** Of lost pay and benefits, percent (6 § 1 st). */
    percent: number;
    /** Karensavdrag: this percent of an average week's sjuklön (6 § 2 st). */
    waitingDeductionPercentOfWeek: number;
    /** Calendar days of a sick period the employer pays (7 § 1 st). */
    employerDays: number;
    /** A new period starting within this many days of the last one continues it, no new karensavdrag (7 § 3 st). */
    relapseDays: number;
    /** Läkarintyg is required from this day of the period (8 § 2 st: the seventh day after the sjukanmälan). */
    certificateFromDay: number;
    /** After this many karensavdrag in the window, none for further periods (6 § 3 st). */
    maxWaitingDeductions: number;
    waitingDeductionWindowMonths: number;
    /** AGI box for sjuklönekostnad; null: not reported since period 2024-07. */
    agiBox: string | null;
    source: RuleSource;
  };

  vacation: {
    daysPerYear: number;
    /** Procentregeln, percent of semesterlönegrundande pay (16 b §). */
    percentRule: number;
    /** Sammalöneregeln: per paid day, percent of månadslön (16 a §). */
    sameSalaryDailyPercent: number;
    /** Sammalöneregeln: percent of the variable pay, in total (16 a § 3 st). */
    sameSalaryVariablePercent: number;
    /** Only days above this may be saved (18 §). */
    minDaysTakenPerYear: number;
    maxSavedYears: number;
    /** Default semesterår start, MM-DD (3 §). */
    yearStartMonthDay: string;
    /**
     * Which intjänandeår pays for a semesterår. The law (3 §): the year
     * before ("previous-year"). An agreement may let the days be earned and
     * taken in the same year ("same-year").
     */
    earningModel: "previous-year" | "same-year";
    /** Sick days that count as semesterlönegrundande per intjänandeår (17 §). */
    sickCountedDays: number;
    /** Föräldraledighet days that count, and for a single parent (17 a §). */
    parentalCountedDays: number;
    parentalCountedDaysSingle: number;
    source: RuleSource;
  };

  agreements: {
    byggavtalet: AgreementRules;
    tjanstemannaavtalet: AgreementRules;
  };

  /** Arbetstidslagen (1982:673). */
  workingTime: {
    overtimePerYearHours: number;
    overtimePer4WeeksHours: number;
    overtimePerMonthHours: number;
    dailyRestHours: number;
    weeklyRestHours: number;
    source: RuleSource;
  };

  /** LAS (1982:80): the conversion clocks. */
  las: {
    /** SÄVA: more than twelve months, a month being 30 days; converts when the count exceeds this. */
    savaLimitDays: number;
    /** Days in a month for SÄVA counting. */
    savaDaysPerMonth: number;
    /** Vikariat: more than two years; converts when the days exceed this (AD 2019 nr 56: at least 731). */
    vikariatLimitDays: number;
    windowYears: number;
    /** Three or more SÄVA in one calendar month: the gaps between them count (3 § 2 st). */
    savaSameMonthThreshold: number;
    probationMaxMonths: number;
    /** The employer must give notice this many days before probation ends (31 §). */
    probationNoticeDays: number;
    source: RuleSource;
  };

  pension: {
    safLo: {
      /** The agreed premium below the cap (what the employee is credited). */
      percentBelowCap: number;
      /** What Fora invoices below the cap in this year. */
      chargedPercentBelowCap: number;
      percentAboveCap: number;
      /** Cap in inkomstbasbelopp per year (7.5 → 7.5 × IBB / 12 per month). */
      capIbbPerYear: number;
      /** Report each month's pay by the last day of the following month. */
      reporting: "monthly";
      source: RuleSource;
    };
    itp1: {
      percentBelowCap: number;
      percentAboveCap: number;
      capIbbPerYear: number;
      /** No ålderspension premium above this many IBB per year. */
      ceilingIbbPerYear: number;
      reporting: "monthly";
      source: RuleSource;
    };
  };

  baseAmounts: {
    prisbasbeloppOre: Ore;
    forhojtPrisbasbeloppOre: Ore;
    inkomstbasbeloppOre: Ore;
    /** The previous year's IBB, which the 3:12 grundbelopp uses. */
    inkomstbasbeloppPreviousYearOre: Ore;
    source: RuleSource;
  };

  expenses: {
    perDiem: {
      fullDayOre: Ore;
      halfDayOre: Ore;
      nightOre: Ore;
      after3MonthsOre: Ore;
      after2YearsOre: Ore;
      source: RuleSource;
    };
    mileage: {
      ownCarPerMilOre: Ore;
      companyCarPerMilOre: Ore;
      companyElectricCarPerMilOre: Ore;
      source: RuleSource;
    };
  };

  agi: {
    /** Day of the month after the pay month the AGI and payment are due. */
    dueDay: number;
    /** Months (of the due date) with a later day for employers up to the turnover limit. */
    laterDueMonths: readonly number[];
    laterDueDay: number;
    /** Above this turnover (beskattningsunderlag för moms) the AGI is due on `largeDeclareDay`, payment still on the dueDay. */
    largeTurnoverOre: Ore;
    largeDeclareDay: number;
    /** Months with the later payment day for large employers. */
    largeLaterPaymentMonths: readonly number[];
    source: RuleSource;
  };

  /** 3:12 (fåmansföretag, IL 57 kap. as amended by SFS 2025:1361), planner input only. */
  closeCompany: {
    /** Grundbelopp in IBB of the year before the income year. */
    grundbeloppIbb: number;
    wageBasedPercent: number;
    wageSumDeductionIbb: number;
    capMultipleOfOwnSalary: number;
    salaryRequirement: boolean;
    ownershipThresholdPercent: number | null;
    savedSpaceUprated: boolean;
    source: RuleSource;
  };

  retention: { years: number; source: RuleSource };
};

/* ---------- 2026 ---------- */

const CHECKED: IsoDate = "2026-10-30";
const SKV = "https://www.skatteverket.se";
const SKV_AVGIFTER = `${SKV}/foretag/arbetsgivare/arbetsgivaravgifterochskatteavdrag/arbetsgivaravgifter.4.233f91f71260075abe8800020817.html`;
const SKV_BELOPP_2026 = `${SKV}/privat/skatter/beloppochprocent/2026.4.1522bf3f19aea8075ba21.html`;
const SKV_433_2026 = `${SKV}/download/18.1522bf3f19aea8075ba55c/1766385913260/teknisk-beskrivning-skv-433-2026-utgava-36.pdf`;
const BYGGAVTALET_2025 = "http://www.dib.nu/wp-content/uploads/2025/11/Byggavtalet-2025-Digital-utgava-1-1.pdf";
const TJM_0031 = "https://www.av.se/globalassets/filer/arbetsmiljoarbete-och-inspektioner/avtal-utstationering/byggforetagen-kollektivavtal-2025-2027.pdf";

const FULL_PARTS: ContributionParts = {
  alderspension: 10.21,
  efterlevandepension: 0.3,
  sjukforsakring: 3.55,
  foraldraforsakring: 2.0,
  arbetsmarknad: 2.64,
  arbetsskada: 0.1,
  allmanLoneavgift: 12.62,
};

// Lag (2026:100) 2 §: the whole ålderspensionsavgift and half of the
// others, "två decimaler så att övriga decimaler faller bort".
const YOUNG_PARTS: ContributionParts = {
  alderspension: 10.21,
  efterlevandepension: 0.15,
  sjukforsakring: 1.77,
  foraldraforsakring: 1.0,
  arbetsmarknad: 1.32,
  arbetsskada: 0.05,
  allmanLoneavgift: 6.31,
};

const LUMP_SUM_2026: Record<number, readonly LumpSumBracket[]> = {
  1: [
    { toKr: 25_041, percent: 0 },
    { toKr: 82_800, percent: 10 },
    { toKr: 192_000, percent: 21 },
    { toKr: 477_600, percent: 26 },
    { toKr: 660_000, percent: 34 },
    { toKr: null, percent: 54 },
  ],
  2: [
    { toKr: 65_800, percent: 0 },
    { toKr: 477_600, percent: 26 },
    { toKr: 660_000, percent: 34 },
    { toKr: null, percent: 55 },
  ],
  3: [
    { toKr: 25_041, percent: 0 },
    { toKr: 331_200, percent: 10 },
    { toKr: 477_600, percent: 26 },
    { toKr: 660_000, percent: 34 },
    { toKr: null, percent: 55 },
  ],
  4: [
    { toKr: 25_041, percent: 0 },
    { toKr: 54_000, percent: 3 },
    { toKr: 192_000, percent: 22 },
    { toKr: 660_000, percent: 26 },
    { toKr: null, percent: 46 },
  ],
  5: [
    { toKr: 25_041, percent: 0 },
    { toKr: 32_400, percent: 10 },
    { toKr: 160_800, percent: 29 },
    { toKr: 184_800, percent: 34 },
    { toKr: 660_000, percent: 38 },
    { toKr: null, percent: 54 },
  ],
  6: [
    { toKr: 25_041, percent: 0 },
    { toKr: 160_800, percent: 29 },
    { toKr: 184_800, percent: 34 },
    { toKr: 660_000, percent: 38 },
    { toKr: null, percent: 54 },
  ],
};

const WEEKEND: readonly DayKind[] = ["saturday", "sunday", "holiday"];
const band = (code: string, label: string, days: readonly DayKind[], from: string, to: string, percent: number | null, monthlyDivisor: number | null = null): TimeBand => ({
  code,
  label,
  days,
  from,
  to,
  percent,
  monthlyDivisor,
});

/** Byggavtalet 2025–2027 (Byggföretagen–Byggnads). */
const BYGGAVTALET: AgreementRules = {
  name: "Byggavtalet 2025–2027",
  validFrom: "2025-05-01",
  validTo: "2027-04-30",
  // Bilaga I 1.1: "13,0 procent av semesterlöneunderlaget" (timavlönade).
  vacationPercent: 13,
  // Bilaga I 1.2 (månadsavlönade): 0,8 % per day, 13 % on övertid and
  // other tillägg, 4,6 % per untaken or unpaid day.
  vacationDailySupplementPercent: 0.8,
  vacationVariablePay: { mode: "total", percent: 13 },
  vacationDayValuePercent: 4.6,
  // § 2 p. 5: percent of utgående lön.
  ob: [
    band("OB1", "05–06", ["weekday"], "05:00", "06:00", 20),
    band("OB2", "18–22", ["weekday"], "18:00", "22:00", 40),
    band("OB3", "natt", ["weekday"], "22:00", "05:00", 70),
    band("OB3", "helg", WEEKEND, "00:00", "24:00", 70),
  ],
  // § 2 p. 6.1: "timersättning för arbetade timmar samt övertidsersättning".
  overtime: [
    band("B", "05–06", ["weekday"], "05:00", "06:00", 50),
    band("A", "06–17", ["weekday"], "06:00", "17:00", 30),
    band("B", "17–19", ["weekday"], "17:00", "19:00", 50),
    band("C", "19–22", ["weekday"], "19:00", "22:00", 70),
    band("D", "natt", ["weekday"], "22:00", "05:00", 100),
    band("D", "helg", WEEKEND, "00:00", "24:00", 100),
  ],
  overtimeIncludesBase: true,
  obOnOvertime: false,
  // § 4 p. 7.1: 40 h per full intjänandeår, 1/365 per day.
  atf: { hoursPerYear: 40, daysPerYear: null },
  absenceDeduction: null,
  pensionScheme: "saf-lo",
  source: {
    url: BYGGAVTALET_2025,
    checked: CHECKED,
    note: "Löneavdrag vid tjänstledighet för månadsavlönade inte kontrollerat: månadslön under Byggavtalet stöds inte i fas 0.",
  },
};

/** Tjänstemannaavtalet 0031 Byggföretagen (Unionen, Sveriges Ingenjörer, Ledarna) 2025–2027. */
const TJANSTEMANNAAVTALET: AgreementRules = {
  name: "Tjänstemannaavtalet Byggföretagen 2025–2027",
  validFrom: "2025-04-01",
  validTo: "2027-03-31",
  vacationPercent: 12,
  // § 4 mom 4: 0,8 % per day, 0,5 % of variable pay per day, 4,6 % per untaken day.
  vacationDailySupplementPercent: 0.8,
  vacationVariablePay: { mode: "perDay", percent: 0.5 },
  vacationDayValuePercent: 4.6,
  ob: [],
  // § 7 mom 3:2: weekdays 06–20 månadslön/94, other times /72 (free
  // weekdays and midsommar-, jul- and nyårsafton count as other times).
  overtime: [
    band("a", "vardag 06–20", ["weekday"], "06:00", "20:00", null, 94),
    band("b", "vardag 20–06", ["weekday"], "20:00", "06:00", null, 72),
    band("b", "helg", WEEKEND, "00:00", "24:00", null, 72),
  ],
  overtimeIncludesBase: false,
  obOnOvertime: false,
  // Arbetstidsförkortning: 5 days for 2025-04-01–2026-03-31, 6 from 2026-04-01.
  atf: { hoursPerYear: null, daysPerYear: 5 },
  // § 10 mom 2:2 (1/21 per day, månadslön / (days a week × 21 / 5) for
  // part-timers on fewer days, × 12/365 beyond five days) and mom 3:2 (1/175 per hour).
  absenceDeduction: { workdayMethodMaxDays: 5, workdayDivisor: 21, fullWeekDays: 5, hourDivisor: 175, calendarDayNumerator: 12, calendarDayDenominator: 365 },
  pensionScheme: "itp1",
  source: { url: TJM_0031, checked: CHECKED },
};

const SET_2026: PayrollRuleSet = {
  validFrom: "2026-01-01",
  incomeYear: 2026,

  employerContributions: {
    parts: FULL_PARTS,
    fullPercent: 31.42,
    // SAL 2 kap. 27 §: "vid årets ingång har fyllt 67 år". Skatteverket:
    // "Födda 1938–1958 10,21 %". Moves to 1959 in 2027.
    olderReduced: { bornFrom: 1938, bornTo: 1958, percent: 10.21 },
    exemptBornUpTo: 1937,
    young: null,
    // SAL 2 kap. 14 § and 24 §: avgiftsfri under 1 000 kr in the year, then from the first krona.
    minAnnualPayOre: 100_000,
    // Skatteverket, teknisk beskrivning AGI 1.1.18.2: "Öretal bortfaller på varje procentsats separat".
    rounding: "down-whole-kronor-per-rate",
    source: { url: SKV_AVGIFTER, checked: CHECKED },
  },

  vaxaStod: {
    model: "refund",
    maxEmployees: 2,
    months: 24,
    capPerMonthOre: 3_500_000,
    capPerMonthEarlierOre: 2_500_000,
    percentWithinCap: 10.21,
    minHoursPerWeek: 20,
    minEmploymentMonths: 3,
    applyWithinMonths: 12,
    source: {
      url: `${SKV}/foretag/arbetsgivare/arbetsgivaravgifterochskatteavdrag/vaxastod/reglerforvaxastod.4.361dc8c15312eff6fd37447.html`,
      checked: CHECKED,
    },
  },

  preliminaryTax: {
    rounding: "down-whole-kronor",
    sideIncomePercent: 30,
    lumpSum: {
      columns: LUMP_SUM_2026,
      noRegularSalaryPercent: 30,
      // SKV 433 2026 avsnitt 10, Skatteverket's engångsbelopp page and the
      // open-data file (fixtures/engangsbelopp-2026.csv, compared in tax-tables.test.ts).
      source: { url: SKV_433_2026, checked: CHECKED },
    },
    adjustmentModes: ["percent", "amount"],
    minSinglePaymentOre: 10_000,
    source: {
      url: `${SKV}/foretag/arbetsgivare/arbetsgivaravgifterochskatteavdrag/skatteavdrag.4.233f91f71260075abe8800021121.html`,
      checked: CHECKED,
      unverified: true,
      note: "30 % for sidoinkomst, jämkning and the 1 000 kr rule (SFL 10 kap. 4 §) are verified. No primary text found on rounding a percent-based skatteavdrag; we drop the öre (rounds in the employee's favour).",
    },
  },

  sickPay: {
    percent: 80,
    waitingDeductionPercentOfWeek: 20,
    employerDays: 14,
    relapseDays: 5,
    certificateFromDay: 8,
    maxWaitingDeductions: 10,
    waitingDeductionWindowMonths: 12,
    // Skatteverket, teknisk beskrivning AGI: sjuklönekostnad (499) was
    // reported for periods 2018-07 to 2024-06 only.
    agiBox: null,
    source: { url: "https://data.riksdagen.se/dokument/sfs-1991-1047.text", checked: CHECKED },
  },

  vacation: {
    daysPerYear: 25,
    percentRule: 12,
    sameSalaryDailyPercent: 0.43,
    sameSalaryVariablePercent: 12,
    minDaysTakenPerYear: 20,
    maxSavedYears: 5,
    yearStartMonthDay: "04-01",
    earningModel: "previous-year",
    sickCountedDays: 180,
    parentalCountedDays: 120,
    parentalCountedDaysSingle: 180,
    source: { url: "https://data.riksdagen.se/dokument/sfs-1977-480.text", checked: CHECKED },
  },

  agreements: { byggavtalet: BYGGAVTALET, tjanstemannaavtalet: TJANSTEMANNAAVTALET },

  workingTime: {
    // 8 §, 13 §, 14 §.
    overtimePerYearHours: 200,
    overtimePer4WeeksHours: 48,
    overtimePerMonthHours: 50,
    dailyRestHours: 11,
    weeklyRestHours: 36,
    source: { url: "https://data.riksdagen.se/dokument/sfs-1982-673.text", checked: CHECKED },
  },

  las: {
    savaLimitDays: 360,
    savaDaysPerMonth: 30,
    vikariatLimitDays: 730,
    windowYears: 5,
    savaSameMonthThreshold: 3,
    probationMaxMonths: 6,
    probationNoticeDays: 14,
    source: {
      url: "https://lagen.nu/1982:80",
      checked: CHECKED,
      unverified: true,
      note:
        "LAS 3 § 2 st, 5 a §, 6 § and 31 § verified. Counting: Arbetsgivarverket counts a month as 30 days (12 months = 360 days) and continuous employment in calendar months; " +
        "that the 361st day converts is our reading of \"mer än tolv månader\", not stated verbatim. Vikariat: AD 2019 nr 56, at least 731 days.",
    },
  },

  pension: {
    safLo: {
      percentBelowCap: 4.5,
      chargedPercentBelowCap: 4.4,
      percentAboveCap: 30,
      capIbbPerYear: 7.5,
      reporting: "monthly",
      source: {
        url: "https://www.fora.se/foretag/kostnad-och-faktura/prislistor/prislista-2026---foretag-med-kollektivavtal/",
        checked: CHECKED,
        unverified: true,
        note: "Rates verified on Fora's price list. The reporting deadline (last day of the month after payout) was seen only in a search excerpt of fora.se.",
      },
    },
    itp1: {
      percentBelowCap: 4.5,
      percentAboveCap: 30,
      capIbbPerYear: 7.5,
      ceilingIbbPerYear: 30,
      reporting: "monthly",
      source: { url: "https://collectum.se/avtal-och-faktura/faktura-och-premier/aktuella-premier-och-basbelopp", checked: CHECKED },
    },
  },

  baseAmounts: {
    // SFS 2025:872 and SFS 2025:1002; Skatteverket "Belopp och procent 2026".
    prisbasbeloppOre: 5_920_000,
    forhojtPrisbasbeloppOre: 6_050_000,
    inkomstbasbeloppOre: 8_340_000,
    inkomstbasbeloppPreviousYearOre: 8_060_000,
    source: { url: SKV_BELOPP_2026, checked: CHECKED },
  },

  expenses: {
    perDiem: {
      fullDayOre: 30_000,
      halfDayOre: 15_000,
      nightOre: 15_000,
      after3MonthsOre: 21_000,
      after2YearsOre: 15_000,
      source: { url: SKV_BELOPP_2026, checked: CHECKED },
    },
    mileage: {
      ownCarPerMilOre: 2_500,
      companyCarPerMilOre: 1_200,
      companyElectricCarPerMilOre: 950,
      source: { url: SKV_BELOPP_2026, checked: CHECKED },
    },
  },

  agi: {
    dueDay: 12,
    laterDueMonths: [1, 8],
    laterDueDay: 17,
    largeTurnoverOre: 4_000_000_000,
    largeDeclareDay: 26,
    largeLaterPaymentMonths: [1],
    source: {
      url: `${SKV}/foretag/arbetsgivare/lamnaarbetsgivardeklaration/narskajaglamnaarbetsgivardeklaration.4.361dc8c15312eff6fd13c11.html`,
      checked: CHECKED,
      note: "Skatteverket's 2026 dates follow the next-working-day rule; the rule itself is stated in SKV 408 (seen in a search excerpt), and the dates are tested.",
    },
  },

  closeCompany: {
    grundbeloppIbb: 4,
    wageBasedPercent: 50,
    wageSumDeductionIbb: 8,
    capMultipleOfOwnSalary: 50,
    salaryRequirement: false,
    ownershipThresholdPercent: null,
    savedSpaceUprated: false,
    source: {
      url: `${SKV}/foretag/drivaforetag/foretagsformer/famansforetag/andradereglerinforinkomstdeklarationen2027.4.4a54dc8b19aa6175a152359.html`,
      checked: CHECKED,
    },
  },

  retention: {
    // Bokföringslagen 7 kap. 2 §, the same rule as invoicing (rules/index.ts, checked 2026-10-19).
    years: 7,
    source: { url: "https://data.riksdagen.se/dokument/sfs-1999-1078.text", checked: "2026-10-19" },
  },
};

/** From 2026-04-01: lag (2026:100), reduced avgifter for those who had turned 18 but not 23 at the start of the year. Tjänstemannaavtalet's ATF goes to six days. */
const SET_2026_04: PayrollRuleSet = {
  ...SET_2026,
  validFrom: "2026-04-01",
  employerContributions: {
    ...SET_2026.employerContributions,
    young: {
      bornFrom: 2003,
      bornTo: 2007,
      parts: YOUNG_PARTS,
      percent: 20.81,
      capPerMonthOre: 2_500_000,
      source: { url: "https://data.riksdagen.se/dokument/sfs-2026-100.html", checked: CHECKED },
    },
  },
  agreements: {
    ...SET_2026.agreements,
    tjanstemannaavtalet: { ...TJANSTEMANNAAVTALET, atf: { hoursPerYear: null, daysPerYear: 6 } },
  },
};

/** Oldest first. `payrollRulesAt` picks the last set whose validFrom <= date. */
export const PAYROLL_RULE_SETS: readonly PayrollRuleSet[] = [SET_2026, SET_2026_04];

/**
 * The payroll rules in force on a pay date. Dates before the first set use
 * the first set; a year after the last set's income year is refused, so a
 * new year never runs on last year's age limits.
 */
export function payrollRulesAt(date: string): PayrollRuleSet {
  assertIsoDate(date);
  const last = PAYROLL_RULE_SETS[PAYROLL_RULE_SETS.length - 1];
  const year = Number(date.slice(0, 4));
  if (year > last.incomeYear) throw new Error(`Lönereglerna för ${year} är inte inlagda (lib/core/rules/payroll.ts).`);
  let chosen = PAYROLL_RULE_SETS[0];
  for (const set of PAYROLL_RULE_SETS) if (set.validFrom <= date) chosen = set;
  return chosen;
}

export type AgiDue = {
  /** Last day for the declaration. */
  declareBy: IsoDate;
  /** Last day the tax and avgifter must be on the skattekonto. */
  payBy: IsoDate;
};

/**
 * When the AGI for a pay month is due, and the payment: the rule set's
 * day in the month after, moved to the next working day when it falls on
 * a weekend, a helgdag or midsommar-, jul- or nyårsafton. `turnoverOre` is
 * the employer's beskattningsunderlag för moms; above the limit the
 * declaration is due later but the payment is not.
 */
export function agiDueDate(payMonth: string, options: { turnoverOre?: Ore } = {}): AgiDue {
  if (!/^\d{4}-\d{2}$/.test(payMonth)) throw new RangeError(`Månaden skrivs ÅÅÅÅ-MM, fick "${payMonth}".`);
  const rules = payrollRulesAt(`${payMonth}-01`).agi;
  const [y, m] = payMonth.split("-").map(Number);
  const dueYear = m === 12 ? y + 1 : y;
  const dueMonth = m === 12 ? 1 : m + 1;
  const on = (day: number) => nextWorkday(`${dueYear}-${String(dueMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  if ((options.turnoverOre ?? 0) > rules.largeTurnoverOre) {
    return { declareBy: on(rules.largeDeclareDay), payBy: on(rules.largeLaterPaymentMonths.includes(dueMonth) ? rules.laterDueDay : rules.dueDay) };
  }
  const day = on(rules.laterDueMonths.includes(dueMonth) ? rules.laterDueDay : rules.dueDay);
  return { declareBy: day, payBy: day };
}

/** Every source in a set, by its path ("employerContributions", "agreements.byggavtalet", ...). */
export function ruleSources(set: PayrollRuleSet): { path: string; source: RuleSource }[] {
  const out: { path: string; source: RuleSource }[] = [];
  const walk = (value: unknown, path: string) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      if (key === "source" && child && typeof child === "object" && "url" in child) out.push({ path: path || "(root)", source: child as RuleSource });
      else walk(child, path ? `${path}.${key}` : key);
    }
  };
  walk(set, "");
  return out;
}

/** The rules in a set that are not confirmed against a primary source, with the note why. */
export function unverifiedRules(set: PayrollRuleSet): { path: string; note: string }[] {
  return ruleSources(set)
    .filter((s) => s.source.unverified)
    .map((s) => ({ path: s.path, note: s.source.note ?? "" }));
}
