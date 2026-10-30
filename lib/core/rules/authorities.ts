/**
 * Rules for the reports to the authorities and the pension companies
 * (docs/hr-lon.md, sections 8 and 12 phase 4) that are not amounts: when
 * Försäkringskassan must hear of a sick period, Fora's file and deadline,
 * what an arbetsgivarintyg covers. The AGI file's own format is in
 * `agi-format.ts`. Same discipline as `payroll.ts`: every group carries
 * its `RuleSource`, and what could not be confirmed against a primary
 * source is flagged `unverified` with a note (`unverifiedAuthorityRules()`).
 */

import type { RuleSource } from "./payroll";

export type AuthorityRules = {
  forsakringskassan: {
    /** The employer reports a sick period that goes on past the sjuklöneperiod within this many calendar days (sjuklönelagen 12 §). */
    sickReportWithinDays: number;
    /** Idag stops showing the reminder this many days after the deadline. */
    sickReportShowAfterDays: number;
    /** VAB and föräldraledighet reminders are shown for periods started this many days back. */
    leaveReminderDays: number;
    source: RuleSource;
  };
  fora: {
    /** Monthly pay is reported by the last day of the month after the pay month. */
    reportByMonthsAfter: number;
    source: RuleSource;
  };
  certificate: {
    /** Months of hours and pay the arbetsgivarintyg lists, counted back from the last day worked. */
    months: number;
    source: RuleSource;
  };
};

const CHECKED = "2026-10-30";

export const AUTHORITY_RULES: AuthorityRules = {
  forsakringskassan: {
    sickReportWithinDays: 7,
    sickReportShowAfterDays: 30,
    leaveReminderDays: 14,
    // 7 § (day 1 and the following thirteen calendar days), 12 § (report within seven calendar days), 19 § (fine).
    source: { url: "https://data.riksdagen.se/dokument/sfs-1991-1047.text", checked: CHECKED },
  },
  fora: {
    reportByMonthsAfter: 1,
    source: {
      url: "https://www.fora.se/foretag/rapportera-loner-och-premier/sa-funkar-rapporteringen-till-fora/",
      checked: CHECKED,
      unverified: true,
      note: "Phase 0 saw the deadline only in a search excerpt; see the Fora file rules in agi-format.ts for what phase 4 found.",
    },
  },
  certificate: {
    months: 12,
    source: {
      url: "https://www.arbetsgivarintyg.nu/",
      checked: CHECKED,
      unverified: true,
      note: "The form's own fields were not read from a primary source; the PDF lists employment, hours and pay per month and the reason for leaving.",
    },
  },
};

export function unverifiedAuthorityRules(rules: AuthorityRules = AUTHORITY_RULES): { path: string; note: string }[] {
  return Object.entries(rules)
    .filter(([, group]) => group.source.unverified)
    .map(([path, group]) => ({ path, note: group.source.note ?? "" }));
}
