/**
 * Pay item presets per collective agreement (docs/hr-lon.md, section 12,
 * phase 6). A preset is the whole löneartsregister as it should look for
 * an organisation under that agreement, built from DEFAULT_PAY_ITEMS: the
 * same codes, with the flags that depend on the agreement set the way the
 * agreement needs them, and a few items only one agreement uses.
 *
 * What the agreement decides on an item (and only this; OB and övertid
 * tables, the semester percent and the deduction rules live in the rule
 * book, keyed on each person's agreement, lib/core/rules/payroll.ts):
 *
 *   - whether pay on the kollektiv accounts (70xx) is reported to Fora
 *     (`foraCategory`), which only Byggavtalet's SAF-LO needs;
 *   - whether pay on the tjänstemanna accounts (72xx) is reported to
 *     Collectum (`pensionReportable`), which only Tjänstemannaavtalet's
 *     ITP1 needs; SAF-LO pay keeps `pensionReportable` for Fora;
 *   - Byggavtalet's own items: helglön for timavlönade (§ 3) and the
 *     arbetstidsförkortning paid out in money (§ 2, 37 h a year).
 *
 * Applying a preset never edits a row: for every code whose latest version
 * differs from the preset (or does not exist) a new version is inserted
 * with a valid_from (payroll_apply_preset in 0043), and the payslips keep
 * the version they were computed with. `presetChanges()` is that diff,
 * pure, so the settings page can show what will change before it does.
 */

import type { IsoDate } from "../rules/index";
import { DEFAULT_PAY_ITEMS } from "./pay-items.default";
import type { PayItem, PayItemFlags } from "./payslip";

export const PAY_ITEM_PRESETS = ["none", "byggavtalet", "tjanstemannaavtalet", "both"] as const;
export type PayItemPreset = (typeof PAY_ITEM_PRESETS)[number];

export const PRESET_LABEL: Record<PayItemPreset, string> = {
  none: "Inget kollektivavtal (bara lagen)",
  byggavtalet: "Byggavtalet (Byggnads, SAF-LO via Fora)",
  tjanstemannaavtalet: "Tjänstemannaavtalet (Byggföretagen, ITP 1 via Collectum)",
  both: "Byggavtalet och Tjänstemannaavtalet",
};

export const PRESET_DESCRIPTION: Record<PayItemPreset, string> = {
  none: "Standardregistret utan rapportering till Fora eller Collectum: ingen löneart märks för pensionsrapportering. Semester 12 % enligt semesterlagen, inga OB-tabeller.",
  byggavtalet: "Kollektivlönearterna (7010, 7081, 7082 …) rapporteras till Fora (SAF-LO); tjänstemannalönearterna rapporteras inte till Collectum. Helglön och arbetstidsförkortning i pengar läggs till. Semester 13 % och OB/övertid enligt Byggavtalet kommer från regelboken per person.",
  tjanstemannaavtalet: "Tjänstemannalönearterna (7210, 7281, 7282 …) rapporteras till Collectum (ITP 1); ingen rapportering till Fora. Övertid enligt Tjänstemannaavtalet kommer från regelboken per person.",
  both: "Standardregistret: kollektivlönearterna till Fora, tjänstemannalönearterna till Collectum, plus Byggavtalets helglön och arbetstidsförkortning.",
};

const collective = (i: PayItem) => i.flags.account.startsWith("70");
const salaried = (i: PayItem) => i.flags.account.startsWith("72") && i.kind !== "fee";

const withFlags = (i: PayItem, flags: Partial<PayItemFlags>): PayItem => ({ ...i, flags: { ...i.flags, ...flags } });

/** Byggavtalet's own items: helglön for timavlönade and arbetstidsförkortning paid in money, both pay on 7010 reported to Fora. */
const BYGGAVTALET_ITEMS: readonly PayItem[] = [
  {
    code: "1120",
    name: "Helglön",
    kind: "hourly",
    version: 1,
    flags: { taxable: true, taxMode: "table", subjectToEmployerContribution: true, vacationPayBasis: true, pensionReportable: true, agiBox: "011", account: "7010", counterAccount: "2820", foraCategory: "lon" },
  },
  {
    code: "1250",
    name: "Arbetstidsförkortning i pengar",
    kind: "gross_adjustment",
    version: 1,
    flags: { taxable: true, taxMode: "table", subjectToEmployerContribution: true, vacationPayBasis: true, pensionReportable: true, agiBox: "011", account: "7010", counterAccount: "2820", foraCategory: "lon" },
  },
];

/** The register a preset gives, in code order. */
export function presetPayItems(preset: PayItemPreset): PayItem[] {
  const base = DEFAULT_PAY_ITEMS.map((i) => ({ ...i, flags: { ...i.flags } }));
  let items: PayItem[];
  switch (preset) {
    case "none":
      items = base.map((i) => withFlags(i, { foraCategory: null, pensionReportable: false }));
      break;
    case "byggavtalet":
      items = [...base.map((i) => (salaried(i) ? withFlags(i, { pensionReportable: false }) : i)), ...BYGGAVTALET_ITEMS];
      break;
    case "tjanstemannaavtalet":
      items = base.map((i) => (collective(i) ? withFlags(i, { foraCategory: null, pensionReportable: false }) : withFlags(i, { foraCategory: null })));
      break;
    case "both":
      items = [...base, ...BYGGAVTALET_ITEMS];
      break;
  }
  return items.sort((a, b) => a.code.localeCompare(b.code));
}

const FLAG_KEYS: readonly (keyof PayItemFlags)[] = ["taxable", "taxMode", "subjectToEmployerContribution", "vacationPayBasis", "pensionReportable", "agiBox", "account", "counterAccount", "foraCategory"];

/** True when two items would be the same row apart from the version. */
export function sameItem(a: Pick<PayItem, "name" | "kind" | "flags">, b: Pick<PayItem, "name" | "kind" | "flags">): boolean {
  return a.name === b.name && a.kind === b.kind && FLAG_KEYS.every((k) => a.flags[k] === b.flags[k]);
}

export type PresetChange = { code: string; name: string; change: "new" | "version"; from: PayItem | null; to: PayItem };

/**
 * What applying `preset` on `date` would insert: a first version for a code
 * the organisation lacks, a new version for a code whose version on `date`
 * differs. Items the organisation has that the preset does not know are
 * left as they are (a preset never removes an item).
 */
export function presetChanges(current: readonly (PayItem & { validFrom: IsoDate })[], preset: PayItemPreset, date: IsoDate): PresetChange[] {
  const latest = new Map<string, PayItem & { validFrom: IsoDate }>();
  for (const r of current) {
    if (r.validFrom > date) continue;
    const b = latest.get(r.code);
    if (!b || r.validFrom > b.validFrom || (r.validFrom === b.validFrom && r.version > b.version)) latest.set(r.code, r);
  }
  const out: PresetChange[] = [];
  for (const to of presetPayItems(preset)) {
    const from = latest.get(to.code) ?? null;
    if (!from) out.push({ code: to.code, name: to.name, change: "new", from: null, to });
    else if (!sameItem(from, to)) out.push({ code: to.code, name: to.name, change: "version", from, to });
  }
  return out;
}

/** The rows payroll_apply_preset() takes: one object per item, flags flattened as the table's columns. */
export function presetRows(preset: PayItemPreset) {
  return presetPayItems(preset).map((i) => ({
    code: i.code,
    name: i.name,
    kind: i.kind,
    taxable: i.flags.taxable,
    taxMode: i.flags.taxMode,
    subjectToEmployerContribution: i.flags.subjectToEmployerContribution,
    vacationPayBasis: i.flags.vacationPayBasis,
    pensionReportable: i.flags.pensionReportable,
    agiBox: i.flags.agiBox,
    account: i.flags.account,
    counterAccount: i.flags.counterAccount,
    foraCategory: i.flags.foraCategory,
  }));
}
