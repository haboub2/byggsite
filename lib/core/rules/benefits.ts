/**
 * The rule book for förmåner, traktamente details, särskild löneskatt and
 * the avtalsförsäkringar (docs/hr-lon.md, section 4; phase 5). Same
 * discipline as rules/payroll.ts next door, which keeps the amounts the
 * earlier phases already use (traktamente and milersättning per day and
 * mil, the basbelopp, the pension rates): dated sets, `benefitRulesAt(date)`,
 * never edit an old set, every group with its source and check date, and
 * what could not be confirmed against a primary source flagged
 * `unverified` with a note (`unverifiedBenefitRules`, pinned in the test).
 *
 * Checked against Skatteverket, regeringen.se (the law texts as proposed),
 * Collectum and the parties' 2026 premium tables on 2026-10-30. The
 * research notes with quotes are summarised in the comments.
 */

import { assertIsoDate, type IsoDate } from "./index";
import type { Ore } from "../money";
import type { RuleSource } from "./payroll";

/** One bilförmån regime, chosen by the day the car first became taxable (vägtrafikskattelagen). */
export type CarRegime = {
  key: "fore-2018-07" | "2018-07" | "2021-07";
  label: string;
  /** First day (inclusive) a car's first taxable day may fall on for this regime; null: no lower bound. */
  firstTaxableFrom: IsoDate | null;
  /** The prisbasbelopp part, in prisbasbelopp. */
  pbbFactor: number;
  /** The ränterelaterade part: nybilspris × (interestShareOfSlr × statslåneräntan + interestAddPercent). */
  interestShareOfSlr: number;
  interestAddPercent: number;
  /** The prisrelaterade part: `percent` up to `upToPbb` prisbasbelopp, `abovePercent` above; `upToPbb` null: one rate. */
  priceRelated: { percent: number; upToPbb: number | null; abovePercent: number | null };
  /** The car's actual fordonsskatt is added (from 2018-07-01; before, it is inside 0,317 PBB). */
  addsVehicleTax: boolean;
};

export type BenefitRuleSet = {
  validFrom: IsoDate;
  incomeYear: number;

  car: {
    regimes: readonly CarRegime[];
    /** Statslåneräntan at the end of November the year before, percent. */
    statslaneranta: number;
    /** The ränterelaterade part uses at least this rate. */
    statslanerantaFloor: number;
    /** Nedsättning of nybilspriset for cars first taxable from this day (61 kap. 8 a §), at most `maxPercent` of it. */
    environmental: { fromFirstTaxable: IsoDate; el: Ore; vatgas: Ore; laddhybrid: Ore; gas: Ore; maxPercent: number };
    /** A car this many years old or older: nybilspriset is at least `oldCarMinPbb` prisbasbelopp (61 kap. 7 §). */
    oldCarYears: number;
    oldCarMinPbb: number;
    /** At least this many mil in tjänsten in the calendar year: the value is reduced to `highMileagePercent` (61 kap. 9 §). */
    highMileageMil: number;
    highMileagePercent: number;
    /** Each part in whole kronor with the öre dropped (Skatteverket's 2026 example: 2,785 % × 322 000 = 8 967). */
    partRounding: "down-whole-kronor";
    /** The monthly value: a twelfth of the year's, whole kronor with the öre dropped. */
    monthRounding: "down-whole-kronor";
    /** Drivmedelsförmån: market value × this factor (61 kap. 10 §), AGI ruta 018; avgifter on the value without it. */
    fuelFactor: number;
    source: RuleSource;
  };

  /** Kostförmån per day (frukost, lunch eller middag, helt fri kost minst tre måltider), less what the employee pays. */
  meals: { breakfastOre: Ore; lunchOrDinnerOre: Ore; fullDayOre: Ore; source: RuleSource };

  /** Bostadsförmån: the employer's schablon per m² bostadsyta and month by area (SKVFS 2025:11). */
  housing: { perSquareMetreMonthOre: Readonly<Record<HousingRegion, Ore>>; source: RuleSource };

  /** Traktamente details next to the amounts in payroll.ts (expenses.perDiem). */
  perDiem: {
    /** Day of departure from this time, day of return by this time: half day. */
    halfDayIfDepartureFrom: string;
    halfDayIfReturnBy: string;
    minDistanceKm: number;
    after3MonthsPercent: number;
    after2YearsPercent: number;
    /** Måltidsreduktion, percent of the day's normalbelopp, rounded to whole kronor. */
    mealReductionPercent: { fullBoard: number; lunchOrDinner: number; breakfast: number };
    source: RuleSource;
  };

  pension: {
    /** Särskild löneskatt på pensionskostnader (lag 1991:687), percent; reported in the company's inkomstdeklaration, not the AGI. */
    specialPayrollTaxPercent: number;
    source: RuleSource;
  };

  /** The avtalsförsäkringar on top of the pension premium, percent of pay, for the run's accrual (7570 against 2940). */
  insurance: {
    /** Arbetare (SAF-LO area): TFA, TGL, omställning (TSL); AGS, PBF, FPT and AGB are 0 in 2026. */
    collective: { percent: number; parts: Readonly<Record<string, number>>; source: RuleSource };
    /** Tjänstemän (ITP1): ITP sjukpension and premiebefrielse (Collectum), TFA, TGL, TRR. Percent up to and above the cap. */
    salaried: { percentBelowCap: number; percentAboveCap: number; parts: Readonly<Record<string, number>>; source: RuleSource };
  };
};

export type HousingRegion = "storstockholm" | "storgoteborg" | "stormalmo" | "over75000" | "tatort" | "ovrigt";
export const HOUSING_REGION_LABEL: Record<HousingRegion, string> = {
  storstockholm: "Storstockholm",
  storgoteborg: "Storgöteborg",
  stormalmo: "Stormalmö",
  over75000: "Kommun med mer än 75 000 invånare",
  tatort: "Tätort i annan kommun",
  ovrigt: "Övriga orter",
};

/* ---------- 2026 ---------- */

const CHECKED: IsoDate = "2026-10-30";
const SKV = "https://www.skatteverket.se";
const SKV_BELOPP_2026 = `${SKV}/privat/skatter/beloppochprocent/2026.4.1522bf3f19aea8075ba21.html`;
const PROP_2020_21_156 = "https://www.regeringen.se/contentassets/2a356165046f4ad99647e650b0740f62/justerad-berakning-av-bilforman-prop.-202021156.pdf";

const SET_2026: BenefitRuleSet = {
  validFrom: "2026-01-01",
  incomeYear: 2026,

  car: {
    // IL 61 kap. 5 § (prop. 2020/21:156): cars first taxable from 2021-07-01; earlier regimes as "gällande rätt" there.
    regimes: [
      {
        key: "fore-2018-07",
        label: "Skattepliktig före 1 juli 2018",
        firstTaxableFrom: null,
        pbbFactor: 0.317,
        interestShareOfSlr: 0.75,
        interestAddPercent: 0,
        priceRelated: { percent: 9, upToPbb: 7.5, abovePercent: 20 },
        addsVehicleTax: false,
      },
      {
        key: "2018-07",
        label: "Skattepliktig 1 juli 2018 – 30 juni 2021",
        firstTaxableFrom: "2018-07-01",
        pbbFactor: 0.29,
        interestShareOfSlr: 0.75,
        interestAddPercent: 0,
        priceRelated: { percent: 9, upToPbb: 7.5, abovePercent: 20 },
        addsVehicleTax: true,
      },
      {
        key: "2021-07",
        label: "Skattepliktig från 1 juli 2021",
        firstTaxableFrom: "2021-07-01",
        pbbFactor: 0.29,
        interestShareOfSlr: 0.7,
        interestAddPercent: 1,
        priceRelated: { percent: 13, upToPbb: null, abovePercent: null },
        addsVehicleTax: true,
      },
    ],
    statslaneranta: 2.55,
    statslanerantaFloor: 0.5,
    // 61 kap. 8 a § as from 2022-07-01 (Fi2021/03348); Skatteverket "Miljöbilar". No end date found.
    environmental: { fromFirstTaxable: "2022-07-01", el: 35_000_000, vatgas: 35_000_000, laddhybrid: 14_000_000, gas: 10_000_000, maxPercent: 50 },
    oldCarYears: 6,
    oldCarMinPbb: 4,
    highMileageMil: 3_000,
    highMileagePercent: 75,
    partRounding: "down-whole-kronor",
    monthRounding: "down-whole-kronor",
    fuelFactor: 1.2,
    source: {
      url: `${SKV}/foretag/arbetsgivare/lonochersattning/formaner/bilforman/bilformansberakning.4.3016b5d91791bf5467919bd.html`,
      checked: CHECKED,
      unverified: true,
      note:
        `Formula, regimes, statslåneräntan 2,55 % and the 2026 example (322 000 kr, fordonsskatt 4 050 kr → 72 045 kr) verified on Skatteverket (${SKV_BELOPP_2026}) and in the law text as proposed (${PROP_2020_21_156}); the statute on riksdagen.se could not be read. ` +
        "Not confirmed: whether SKV A 2017:23's \"round the year's value down to whole hundreds\" still applies (Skatteverket's own 2026 example does not, so we do not); how Skatteverket rounds the monthly value (we drop the öre); that the 3 000 mil reduction takes the fordonsskatt too (the text says \"bilförmånsvärdet\"); the miljöbil reduction's end date (none found); whether extra equipment is added before or after it (we add before).",
    },
  },

  meals: {
    breakfastOre: 6_200,
    lunchOrDinnerOre: 12_400,
    fullDayOre: 31_000,
    source: { url: `${SKV}/foretag/arbetsgivare/lonochersattning/formaner/kostforman.4.3016b5d91791bf546791816.html`, checked: CHECKED },
  },

  housing: {
    perSquareMetreMonthOre: { storstockholm: 14_500, storgoteborg: 13_100, stormalmo: 14_000, over75000: 12_700, tatort: 11_000, ovrigt: 9_900 },
    source: {
      url: `${SKV}/foretag/arbetsgivare/lonochersattning/formaner/bostadsforman.4.5b35a6251761e691420a5d0.html`,
      checked: CHECKED,
      unverified: true,
      note: "The per-month schablon (Skatteverket, belopp och procent 2026) is verified; which kommun belongs to which area is in SKVFS 2025:11, not read: the area is chosen by hand.",
    },
  },

  perDiem: {
    halfDayIfDepartureFrom: "12:00",
    halfDayIfReturnBy: "19:00",
    minDistanceKm: 50,
    after3MonthsPercent: 70,
    after2YearsPercent: 50,
    // Skatteverket's 2026 table: 270/210/105/60 kr at 300, 189/147/74/42 at 210, 135/105/53/30 at 150.
    mealReductionPercent: { fullBoard: 90, lunchOrDinner: 35, breakfast: 20 },
    source: {
      url: `${SKV}/foretag/arbetsgivare/lonochersattning/traktamenteochbilersattning.4.361dc8c15312eff6fd1703e.html`,
      checked: CHECKED,
      unverified: true,
      note: "Day rules, distance, 70 % / 50 % and the reductions at 300, 210 and 150 kr verified. The reduction on a half day (150 kr) is our reading: Skatteverket's 150 kr column is the two-year level; the half day uses the same percentages of 150 kr.",
    },
  },

  pension: {
    specialPayrollTaxPercent: 24.26,
    source: { url: `${SKV}/foretag/arbetsgivare/arbetsgivaravgifterochskatteavdrag/arbetsgivaravgifter.4.233f91f71260075abe8800020817.html`, checked: CHECKED },
  },

  insurance: {
    collective: {
      percent: 0.45,
      parts: { TFA: 0.01, TGL: 0.1, TSL: 0.34 },
      source: {
        url: "https://www.avtalat.se/media/10ql04hg/2026-premier_asl_22-12-2025.pdf",
        checked: CHECKED,
        unverified: true,
        note: "From the parties' 2026 table (Avtalat) and Livsmedelsföretagen's February 2026 circular; Fora's own price list could not be read. TSL is 0,74 % for hängavtal.",
      },
    },
    salaried: {
      // ITP sjukpension 0,030 / 0,108 and premiebefrielse 0,125 / 1,415 (Collectum, verified) + TFA 0,02, TGL ≈ 0,09, TRR 0,40.
      percentBelowCap: 0.665,
      percentAboveCap: 2.033,
      parts: { "ITP sjukpension": 0.03, Premiebefrielse: 0.125, TFA: 0.02, TGL: 0.09, TRR: 0.4 },
      source: {
        url: "https://collectum.se/avtal-och-faktura/faktura-och-premier/aktuella-premier-och-basbelopp",
        checked: CHECKED,
        unverified: true,
        note:
          "ITP sjukpension and premiebefrielse verified on Collectum (sjukpension's own break is 10 PBB/12 = 49 333 kr, we use 7,5 IBB/12 for both). TFA, TGL (about 0,09 %, a fixed amount per month at Alecta) and TRR (0,40 %, 0,80 % hängavtal) from Livsmedelsföretagen's 2026 circular, not Fora. Above the cap: sjukpension 0,108 + premiebefrielse 1,415 + TFA + TGL + TRR.",
      },
    },
  },
};

/** Oldest first. */
export const BENEFIT_RULE_SETS: readonly BenefitRuleSet[] = [SET_2026];

/** The benefit rules for a date; a year after the last set is refused, as payrollRulesAt does. */
export function benefitRulesAt(date: string): BenefitRuleSet {
  assertIsoDate(date);
  const last = BENEFIT_RULE_SETS[BENEFIT_RULE_SETS.length - 1];
  const year = Number(date.slice(0, 4));
  if (year > last.incomeYear) throw new Error(`Förmånsreglerna för ${year} är inte inlagda (lib/core/rules/benefits.ts).`);
  let chosen = BENEFIT_RULE_SETS[0];
  for (const set of BENEFIT_RULE_SETS) if (set.validFrom <= date) chosen = set;
  return chosen;
}

/** The bilförmån regime for the day the car first became taxable. */
export function carRegimeFor(rules: BenefitRuleSet, firstTaxable: IsoDate): CarRegime {
  let chosen = rules.car.regimes[0];
  for (const r of rules.car.regimes) if (r.firstTaxableFrom === null || r.firstTaxableFrom <= firstTaxable) chosen = r;
  return chosen;
}

/** The rules in a set that are not confirmed against a primary source, with the note why. */
export function unverifiedBenefitRules(set: BenefitRuleSet): { path: string; note: string }[] {
  const out: { path: string; note: string }[] = [];
  const walk = (value: unknown, path: string) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === "source" && child && typeof child === "object" && "url" in child) {
        const s = child as RuleSource;
        if (s.unverified) out.push({ path: path || "(root)", note: s.note ?? "" });
      } else walk(child, path ? `${path}.${key}` : key);
    }
  };
  walk(set, "");
  return out;
}
