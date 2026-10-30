/**
 * The arbetsgivardeklaration file (AGI) as Skatteverket's technical
 * description defines it, and Fora's monthly pay report, as data with
 * their sources (docs/hr-lon.md, section 8; phase 4). The writer is
 * lib/core/payroll/agi.ts; the schema files it is validated against in
 * the tests are in lib/core/payroll/fixtures/agi/ (downloaded 2026-10-30,
 * SHA-256 in AGI_FORMAT.schemaFiles).
 *
 * What was read, 2026-10-30: Teknisk beskrivning 1.1.18.2 with its
 * appendices (Fältlista, Struktur, Kontroller, Summering och
 * beräkningsregler, all 1.1.18.1), the XSDs arbetsgivardeklaration_1.1
 * and _component_1.1 (version 1.1, created 2025-06-26) and the 19 example
 * files; Skatteverket's pages on deadlines and on correcting a
 * declaration; Fora's pages on reporting arbetare's pay.
 */

import type { RuleSource } from "./payroll";

const CHECKED = "2026-10-30";
const SKV_DL = "https://www.skatteverket.se/download";

export type AgiField = { code: string; element: string };

export const AGI_FORMAT = {
  schemaVersion: "1.1",
  technicalDescription: "1.1.18.2",
  instanceNamespace: "http://xmls.skatteverket.se/se/skatteverket/da/instans/schema/1.1",
  componentNamespace: "http://xmls.skatteverket.se/se/skatteverket/da/komponent/schema/1.1",
  schemaLocation:
    "http://xmls.skatteverket.se/se/skatteverket/da/instans/schema/1.1 http://xmls.skatteverket.se/se/skatteverket/da/arbetsgivardeklaration/arbetsgivardeklaration_1.1.xsd",
  omrade: "Arbetsgivardeklaration",
  schemaFiles: {
    "arbetsgivardeklaration_1.1.xsd": "f705b1be185fcc33d0e9f846c7f6e90874b9b2f0e86b45baf5cd019197f755f6",
    "arbetsgivardeklaration_component_1.1.xsd": "f9b40f1c7185128bb1086e121b1c21e517a4db858b3297c1320177df2d408766",
  },
  /** Field codes (faltkod, three digits, no "FK") and their elements. HU and IU are xs:all: order is free. */
  fields: {
    employer: { code: "201", element: "AgRegistreradId" },
    period: { code: "006", element: "RedovisningsPeriod" },
    totalContributions: { code: "487", element: "SummaArbAvgSlf" },
    totalTax: { code: "497", element: "SummaSkatteavdr" },
    payee: { code: "215", element: "BetalningsmottagarId" },
    specNo: { code: "570", element: "Specifikationsnummer" },
    removal: { code: "205", element: "Borttag" },
    tax: { code: "001", element: "AvdrPrelSkatt" },
    cashPay: { code: "011", element: "KontantErsattningUlagAG" },
    benefits: { code: "012", element: "SkatteplOvrigaFormanerUlagAG" },
    carBenefit: { code: "013", element: "SkatteplBilformanUlagAG" },
    /** Drivmedel vid bilförmån, 1,2 × marknadsvärdet (phase 6; element DrivmVidBilformanUlagAG in the component XSD). */
    fuelBenefit: { code: "018", element: "DrivmVidBilformanUlagAG" },
    boardFee: { code: "023", element: "AndelStyrelsearvode" },
    mileage: { code: "050", element: "Bilersattning" },
    perDiem: { code: "051", element: "Traktamente" },
    notContributionBase: { code: "131", element: "KontantErsattningEjUlagSA" },
  } satisfies Record<string, AgiField>,
  /** Amounts are whole kronor, xs:long with minInclusive 0: never negative, never öre. */
  amounts: "whole-kronor-non-negative" as const,
  /** 050 and 051 are tick boxes: "1" when a tax-free bilersättning or traktamente was paid; no amount. */
  tickValue: "1",
  /** 570: 1–10 digits, unique per payee, period and employer; the same number replaces an earlier IU. */
  specNoMax: 9_999_999_999,
  /**
   * S_183: every IU (not a removal) has at least one tax field, so 001 is
   * written as 0 when no tax was withheld. A removal has only 201, 215,
   * 006, 570 and 205 (S_003).
   */
  taxFieldAlways: true,
  /** Sjuklönekostnad (499) was reported for periods 2018-07 to 2024-06 only (ba_057). */
  sickPayCostLastPeriod: "202406",
  /** Växa-stöd's tick boxes 062/063 were valid through 202512; from 2026 växa-stöd is applied for separately. */
  vaxaStodLastPeriod: "202512",
  /** Corrections may be sent up to this many years back. */
  correctionYears: 6,
  maxFileBytes: { testService: 100_000_000, upload: 300_000_000 },
  testService: "https://sso.test.skatteverket.se/agd_tt/da_testtjanst_web/login.do?method=test",
  source: {
    url: "https://www.skatteverket.se/foretag/arbetsgivare/lamnaarbetsgivardeklaration/tekniskbeskrivningochtesttjanst/tekniskbeskrivning1116.4.7eada0316ed67d7282a791.html",
    checked: CHECKED,
    note:
      `XSD ${SKV_DL}/18.6491ed82199c4722dae6cc/1760546683779/arbetsgivardeklaration_1.1.xsd and ${SKV_DL}/18.6491ed82199c4722dae6cd/1760546712759/arbetsgivardeklaration_component_1.1.xsd; ` +
      `examples ${SKV_DL}/18.1522bf3f19aea8075ba810/1765448451193/Exempelfiler_XML.zip (example 15, "olika åldrar" 2026-04, is a golden test in agi.test.ts).`,
  } satisfies RuleSource,
  /**
   * Skatteverket computes the avgifter per IU from the payee's birth date
   * (011 + 012 + 013, the young people's 25 000 kr per person and month,
   * the older rate) and compares 487 and 497 with its own sums, accepting
   * a small difference. There is no field per rate or age group.
   */
  contributions: {
    source: {
      url: `${SKV_DL}/18.1522bf3f19aea8075ba503c/1768990791934/Bilaga%20Summering%20och%20Ber%C3%A4kningsregler..xlsx`,
      checked: CHECKED,
    } satisfies RuleSource,
  },
  /** A new HU for the same employer and period replaces the earlier: implied by section 9, not stated. */
  huReplacement: {
    source: {
      url: "https://www.skatteverket.se/foretag/arbetsgivare/lamnaarbetsgivardeklaration/tekniskbeskrivningochtesttjanst/tekniskbeskrivning1116.4.7eada0316ed67d7282a791.html",
      checked: CHECKED,
      unverified: true,
      note: "No text says outright that a resubmitted HU replaces the earlier one; a refile here sends the HU and every IU again.",
    } satisfies RuleSource,
  },
  /**
   * Which month a correction belongs in (Skatteverket, "Rätta en
   * arbetsgivardeklaration"): pay is reported in the month it is paid, so
   * retro lines and a deduction of overpaid salary from a later salary
   * (kvittning) belong in the later month and the earlier month is not
   * corrected. Only salary the employee pays back (återkrav) corrects the
   * month it was paid: 011 lowered, the avgifter follow, 001 unchanged
   * ("du kan normalt inte rätta avdragen skatt till ett lägre belopp").
   */
  corrections: {
    source: {
      url: "https://www.skatteverket.se/foretag/arbetsgivare/lamnaarbetsgivardeklaration/rattaenarbetsgivardeklaration.4.2cf1b5cd163796a5c8b6698.html",
      checked: CHECKED,
    } satisfies RuleSource,
  },
} as const;

/**
 * Fora, Avtalspension SAF-LO for arbetare. Pay is reported monthly by the
 * last day of the month after the payment month, in the month it was paid;
 * kontant bruttolön including sjuklön, semesterlön, OB and övertid, without
 * förmåner, bilersättning or traktamente. Uploads from a payroll system are
 * a JSON file built to a specification Fora gives payroll vendors only, so
 * the app makes a semicolon-separated file with what the manual entry on
 * Mina sidor asks for (personnummer, name, FOK-ID, month, bruttolön); its
 * layout is ours and unverified.
 */
export const FORA_FORMAT = {
  columns: ["personnummer", "fornamn", "efternamn", "fokId", "manad", "bruttolon"] as const,
  separator: ";",
  /** FOK-ID: FOK and six digits, the agreement category each arbetare is marked with on Mina sidor. */
  fokIdPattern: /^FOK\d{6}$/,
  source: {
    url: "https://www.fora.se/foretag/rapportera-loner-och-premier/sa-rapporterar-du-loner-for-arbetare/",
    checked: CHECKED,
    note: "Deadline, what pay counts and the month it belongs in are confirmed on fora.se (Lönetyper, Rapportering med fil från lönesystem, Manuell inmatning).",
  } satisfies RuleSource,
  file: {
    source: {
      url: "https://www.fora.se/foretag/rapportera-loner-och-premier/sa-rapporterar-du-loner-for-arbetare/rapportering-med-fil-fran-lonesystem/",
      checked: CHECKED,
      unverified: true,
      note: "Fora's JSON specification is given to payroll vendors only; this file mirrors the manual entry and is typed in (or sent to Fora) by hand. Ask Fora for the vendor specification before relying on an upload.",
    } satisfies RuleSource,
  },
} as const;

/**
 * Collectum, ITP1 for tjänstemän. Each month the employer reports every
 * person's utbetalda bruttolön (before tax, after bruttolöneavdrag) in
 * Collectum's internetkontor, even when it has not changed; what counts is
 * Collectum's table of pensionsmedförande lön (lön och tillägg yes,
 * kostnadsersättningar, förmåner, styrelsearvode and sjuklön beyond the
 * statutory no), which the pay items' `pensionReportable` flag follows.
 * There is no fixed day: a report must be in before the avstämning at
 * 22.00 on the month's cutoff day to be on the next invoice, which is paid
 * by the 15th of the month after. A file upload needs Collectum's
 * "ITP-modul" in the payroll system, whose format is not published; the
 * file here is a semicolon list of what the manual entry asks for, its
 * layout ours and unverified, with the pay in the sixth column as Fora's.
 */
export const COLLECTUM_FORMAT = {
  columns: ["personnummer", "fornamn", "efternamn", "kundnummer", "manad", "bruttolon"] as const,
  separator: ";",
  customerNoPattern: /^\d{3,20}$/,
  /** Collectum's 2026 cutoff days (avstämning kl. 22.00) by the month they fall in. */
  cutoffs: {
    "2026-01": "2026-01-14",
    "2026-02": "2026-02-16",
    "2026-03": "2026-03-16",
    "2026-04": "2026-04-15",
    "2026-05": "2026-05-17",
    "2026-06": "2026-06-15",
    "2026-07": "2026-07-15",
    "2026-08": "2026-08-13",
    "2026-09": "2026-09-16",
    "2026-10": "2026-10-14",
    "2026-11": "2026-11-16",
    "2026-12": "2026-12-14",
  } as Readonly<Record<string, string>>,
  /** A month without a published cutoff: this day of the month. */
  fallbackCutoffDay: 14,
  source: {
    url: "https://collectum.se/administration/sa-rapporterar-du-ratt/lonerapportering",
    checked: CHECKED,
    note: "What to report, every month, is confirmed on collectum.se (Lönerapportering, Pensionsmedförande lön, Fakturakörningar).",
  } satisfies RuleSource,
  deadline: {
    source: {
      url: "https://collectum.se/avtal-och-faktura/faktura-och-premier/fakturakorningar",
      checked: CHECKED,
      unverified: true,
      note: "The 2026 cutoff days are Collectum's; that a month's pay belongs before the cutoff in the month after it was paid is our reading (pay day on the 25th falls after that month's cutoff). 2027's days are not published yet: the 14th is used.",
    } satisfies RuleSource,
  },
  file: {
    source: {
      url: "https://collectum.se/tjanstepensionen-itp/nyheter-och-tips/vanliga-fragor-och-svar",
      checked: CHECKED,
      unverified: true,
      note: "Collectum's file format (the payroll system's ITP-modul) is not published; this file mirrors the manual entry in the internetkontor and is typed in by hand.",
    } satisfies RuleSource,
  },
} as const;

export function unverifiedFormatRules(): { path: string; note: string }[] {
  const out: { path: string; note: string }[] = [];
  const all: [string, RuleSource][] = [
    ["agi", AGI_FORMAT.source],
    ["agi.contributions", AGI_FORMAT.contributions.source],
    ["agi.huReplacement", AGI_FORMAT.huReplacement.source],
    ["agi.corrections", AGI_FORMAT.corrections.source],
    ["fora", FORA_FORMAT.source],
    ["fora.file", FORA_FORMAT.file.source],
    ["collectum", COLLECTUM_FORMAT.source],
    ["collectum.deadline", COLLECTUM_FORMAT.deadline.source],
    ["collectum.file", COLLECTUM_FORMAT.file.source],
  ];
  for (const [path, s] of all) if (s.unverified) out.push({ path, note: s.note ?? "" });
  return out;
}
