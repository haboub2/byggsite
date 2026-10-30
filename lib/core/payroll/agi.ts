/**
 * Arbetsgivardeklaration på individnivå (docs/hr-lon.md, sections 4, 8 and
 * 12 phase 4): the month's huvuduppgift (HU) and individuppgifter (IU)
 * from frozen payslips, the XML file in Skatteverket's schema 1.1
 * (lib/core/rules/agi-format.ts), a parser for a stored file and the diff
 * between two versions of a month. Pure; the database's agi_build() does
 * the same sums from the same rows (0040), and agi_store() refuses a file
 * whose sums are not agi_build()'s.
 *
 * A month is the closed runs with pay day in it (kontantprincipen: pay is
 * reported in the month it is paid, retro lines and kvittning included)
 * plus salary the employee paid back (återkrav) for that month, which
 * lowers 011 and the avgifter and leaves 001 (Skatteverket, "Rätta en
 * arbetsgivardeklaration"). A run paid in the month that is approved but
 * not closed is a problem: the month cannot be declared without it.
 * Nothing is recomputed from time or contracts.
 *
 * Per person: 011 cash pay (or 131 when the year's pay stays under the
 * 1 000 kr limit, so no avgifter), 012 and 013 benefits, 018 drivmedel vid
 * bilförmån (1,2 × the market value; the avgifter come from the payslips'
 * base, which holds the value without the factor), 023 the board fee
 * inside 011, 001 tax, 050 and 051 ticked when a tax-free bilersättning or
 * traktamente was paid; each amount in whole kronor with the öre dropped.
 * Avgifter: the person's avgiftsunderlag per rate, öre dropped, summed per
 * rate over the people and multiplied, öre dropped per rate
 * (`agiContributions`), which is how Skatteverket's own computation gives
 * 487 (its example file 15 is a test). Skatteverket computes the avgifter
 * itself from the IUs and the birth dates; 487 and 497 are the totals it
 * compares with.
 */

import { sumOre, truncateToKronor, type Ore } from "../money";
import { payrollRulesAt, type PayrollRuleSet } from "../rules/payroll";
import { AGI_FORMAT } from "../rules/agi-format";
import { agiContributions, agiContributionTotal, type AgiContributionRow, type ContributionCategory, type ContributionResult } from "./contributions";
import type { PayslipDocument } from "./payslip";
import { monthLabel } from "./format";

export const AGI_AMOUNT_BOXES = ["001", "011", "012", "013", "018", "023", "131"] as const;
export type AgiBox = (typeof AGI_AMOUNT_BOXES)[number];
export const AGI_TICK_BOXES = ["050", "051"] as const;
export type AgiTick = (typeof AGI_TICK_BOXES)[number];

export const AGI_BOX_LABEL: Record<AgiBox | AgiTick, string> = {
  "001": "Avdragen skatt",
  "011": "Kontant bruttolön",
  "012": "Övriga förmåner",
  "013": "Bilförmån",
  "018": "Drivmedel vid bilförmån",
  "023": "Varav styrelsearvode",
  "131": "Ersättning utan avgifter",
  "050": "Bilersättning",
  "051": "Traktamente",
};

/** One approved payslip of a closed run with pay day in the month. */
export type AgiSlip = { payslipId: string; runId: string; employeeId: string; document: PayslipDocument };

/** Salary the employee paid back (återkrav), gross, for a payslip paid in `period`. */
export type AgiRepayment = { id: string; employeeId: string; period: string; payslipId: string; amountOre: Ore; reason: string };

export type AgiPerson = {
  employeeId: string;
  name: string;
  birthYear: number;
  category: ContributionCategory;
  payslipIds: string[];
  repaymentIds: string[];
  /** Whole kronor, in öre. */
  boxes: Record<AgiBox, Ore>;
  ticks: Record<AgiTick, boolean>;
  /** Avgiftsunderlag in öre before the öre are dropped. */
  contributionBaseOre: Ore;
  /** This person's underlag per rate, öre dropped (their part of 487). */
  contributions: { category: ContributionCategory; ratePercent: number; baseOre: Ore }[];
};

export type AgiTotals = { taxOre: Ore; contributionsOre: Ore; boxes: Record<AgiBox, Ore>; contributionRows: AgiContributionRow[] };

export type AgiBuild = { period: string; runIds: string[]; people: AgiPerson[]; totals: AgiTotals; problems: string[] };

const zeroBoxes = (): Record<AgiBox, Ore> => ({ "001": 0, "011": 0, "012": 0, "013": 0, "018": 0, "023": 0, "131": 0 });

export const isAgiPeriod = (p: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);

/** The contribution split for a person's month, from the stored category and the (possibly repaid) underlag. */
function contributionResult(rules: PayrollRuleSet, category: ContributionCategory, baseOre: Ore): ContributionResult | null {
  const c = rules.employerContributions;
  const parts = {} as ContributionResult["parts"];
  if (category === "exempt" || category === "below-annual-threshold") return null;
  if (category === "older") return { category, baseOre, ratePercent: c.olderReduced.percent, amountOre: 0, parts, reducedBaseOre: baseOre, fullBaseOre: 0 };
  if (category === "young" && c.young) {
    const reducedBaseOre = Math.min(baseOre, c.young.capPerMonthOre);
    return { category, baseOre, ratePercent: c.young.percent, amountOre: 0, parts, reducedBaseOre, fullBaseOre: baseOre - reducedBaseOre };
  }
  return { category: "full", baseOre, ratePercent: c.fullPercent, amountOre: 0, parts, reducedBaseOre: 0, fullBaseOre: baseOre };
}

/** A run paid in the month that is approved, paid or booked but not closed. */
export type AgiOpenRun = { periodStart: string; payDate: string };

/**
 * The month's AGI from frozen payslips and repayments. Pass only approved
 * payslips of closed runs whose pay day is in `period`, the repayments
 * recorded for `period`, and the runs paid in it that are not closed yet.
 */
export function agiBuild(period: string, slips: readonly AgiSlip[], repayments: readonly AgiRepayment[] = [], openRuns: readonly AgiOpenRun[] = []): AgiBuild {
  if (!isAgiPeriod(period)) throw new RangeError(`Perioden skrivs ÅÅÅÅ-MM, fick "${period}".`);
  const rules = payrollRulesAt(`${period}-01`);
  const byPerson = new Map<string, AgiSlip[]>();
  for (const s of slips) {
    if (s.document.payDate.slice(0, 7) !== period) throw new Error(`Lönebeskedet för ${s.document.employeeName} betalades ${s.document.payDate}, inte i ${period}.`);
    byPerson.set(s.employeeId, [...(byPerson.get(s.employeeId) ?? []), s]);
  }
  const problems: string[] = [];
  const people: AgiPerson[] = [];
  const results: ContributionResult[] = [];
  for (const r of [...openRuns].sort((a, b) => a.payDate.localeCompare(b.payDate)))
    if (r.payDate.slice(0, 7) === period) problems.push(`Körningen för ${monthLabel(r.periodStart)} (lönedag ${r.payDate}) är inte stängd; stäng den innan arbetsgivardeklarationen skapas.`);
  for (const r of repayments) if (!byPerson.has(r.employeeId)) problems.push(`Återbetalningen "${r.reason}" gäller ett lönebesked som inte är med i ${period}.`);

  for (const [employeeId, list] of byPerson) {
    const docs = list.map((s) => s.document).sort((a, b) => a.payDate.localeCompare(b.payDate));
    const last = docs[docs.length - 1];
    const category = last.contributions.category;
    const raw = zeroBoxes();
    const ticks: Record<AgiTick, boolean> = { "050": false, "051": false };
    for (const d of docs) {
      raw["001"] += d.totals.taxOre;
      for (const l of d.lines) {
        const box = l.item.flags.agiBox;
        if (box === "011" || box === "012" || box === "013" || box === "018" || box === "131") raw[box] += l.amountOre;
        if ((box === "050" || box === "051") && l.amountOre > 0) ticks[box] = true;
        if (l.item.kind === "fee") raw["023"] += l.amountOre;
      }
    }
    const mine = repayments.filter((r) => r.employeeId === employeeId);
    const repaid = sumOre(mine.map((r) => r.amountOre));
    raw["011"] -= repaid;
    // Under the 1 000 kr a year: the cash pay is not underlag for avgifter (ruta 131).
    if (category === "below-annual-threshold") {
      raw["131"] += raw["011"];
      raw["011"] = 0;
    }
    const boxes = zeroBoxes();
    for (const b of AGI_AMOUNT_BOXES) boxes[b] = truncateToKronor(raw[b]);
    for (const b of AGI_AMOUNT_BOXES) if (boxes[b] < 0) problems.push(`${last.employeeName}: ruta ${b} blir ${boxes[b] / 100} kr, och AGI tar inga negativa belopp. Kvitta mot en senare lön i stället, eller registrera en återbetalning för den månad lönen betalades.`);

    const contributionBaseOre = sumOre(docs.map((d) => d.contributions.baseOre)) - repaid;
    const result = contributionResult(rules, category, contributionBaseOre);
    if (result) results.push(result);
    people.push({
      employeeId,
      name: last.employeeName,
      birthYear: last.birthYear,
      category,
      payslipIds: list.map((s) => s.payslipId),
      repaymentIds: mine.map((r) => r.id),
      boxes,
      ticks,
      contributionBaseOre,
      contributions: result ? agiContributions(rules, [result]).map(({ category: c, ratePercent, baseOre }) => ({ category: c, ratePercent, baseOre })) : [],
    });
  }
  people.sort((a, b) => a.name.localeCompare(b.name, "sv") || a.employeeId.localeCompare(b.employeeId));
  const contributionRows = agiContributions(rules, results).sort((a, b) => b.ratePercent - a.ratePercent);
  const totalBoxes = zeroBoxes();
  for (const p of people) for (const b of AGI_AMOUNT_BOXES) totalBoxes[b] += p.boxes[b];
  return {
    period,
    runIds: [...new Set(slips.map((s) => s.runId))].sort(),
    people,
    totals: { taxOre: totalBoxes["001"], contributionsOre: agiContributionTotal(contributionRows), boxes: totalBoxes, contributionRows },
    problems,
  };
}

/* ---------- records: what is stored per version and diffed ---------- */

/** A person as stored with a version: the build's person plus the specifikationsnummer, or a removal. */
export type AgiRecord = Pick<AgiPerson, "employeeId" | "name" | "category" | "boxes" | "ticks" | "contributions"> & { specNo: number; pnrMasked: string; removed?: true };

/**
 * Specifikationsnummer: a person keeps the number they had in the
 * month's earlier version (so the new IU replaces the old one); new
 * people get the next free number. People in the earlier version who are
 * gone get a removal (Borttag) with their old number.
 */
export function agiRecords(build: AgiBuild, previous: readonly AgiRecord[], pnrMasked: (employeeId: string) => string): AgiRecord[] {
  const prev = new Map(previous.filter((r) => !r.removed).map((r) => [r.employeeId, r]));
  let next = Math.max(0, ...previous.map((r) => r.specNo)) + 1;
  const out: AgiRecord[] = build.people.map((p) => ({
    employeeId: p.employeeId,
    name: p.name,
    category: p.category,
    boxes: p.boxes,
    ticks: p.ticks,
    contributions: p.contributions,
    specNo: prev.get(p.employeeId)?.specNo ?? next++,
    pnrMasked: pnrMasked(p.employeeId),
  }));
  const present = new Set(build.people.map((p) => p.employeeId));
  for (const r of prev.values()) if (!present.has(r.employeeId)) out.push({ ...r, boxes: zeroBoxes(), ticks: { "050": false, "051": false }, contributions: [], removed: true });
  return out;
}

export type AgiDiffRow = {
  employeeId: string;
  name: string;
  specNo: number;
  change: "added" | "removed" | "changed";
  fields: { code: AgiBox | AgiTick; before: number | boolean | null; after: number | boolean | null }[];
};

/** What a new version changes against the previous one, per person; unchanged people are left out. */
export function diffAgi(previous: readonly AgiRecord[], next: readonly AgiRecord[]): AgiDiffRow[] {
  const before = new Map(previous.filter((r) => !r.removed).map((r) => [r.employeeId, r]));
  const out: AgiDiffRow[] = [];
  for (const r of next) {
    const b = before.get(r.employeeId);
    if (r.removed) {
      if (b) out.push({ employeeId: r.employeeId, name: r.name, specNo: r.specNo, change: "removed", fields: [] });
      continue;
    }
    const fields: AgiDiffRow["fields"] = [];
    for (const code of AGI_AMOUNT_BOXES) if (!b || b.boxes[code] !== r.boxes[code]) if (b || r.boxes[code]) fields.push({ code, before: b ? b.boxes[code] : null, after: r.boxes[code] });
    for (const code of AGI_TICK_BOXES) if ((b?.ticks[code] ?? false) !== r.ticks[code]) fields.push({ code, before: b ? b.ticks[code] : null, after: r.ticks[code] });
    if (!b) out.push({ employeeId: r.employeeId, name: r.name, specNo: r.specNo, change: "added", fields });
    else if (fields.length) out.push({ employeeId: r.employeeId, name: r.name, specNo: r.specNo, change: "changed", fields });
  }
  return out;
}

/* ---------- the file ---------- */

export type AgiContact = { name: string; phone: string; email: string };
export type AgiFileInput = {
  period: string;
  /** Organisationsnummer (10 digits, written 16 + number) or a sole trader's personnummer (12 digits). */
  employerId: string;
  contact: AgiContact;
  programName: string;
  /** Local time, ÅÅÅÅ-MM-DDTtt:mm:ss. */
  createdAt: string;
  records: readonly AgiRecord[];
  /** The payee's personnummer or samordningsnummer, 12 digits, per employee. */
  payeeId: (employeeId: string) => string;
  totals: Pick<AgiTotals, "taxOre" | "contributionsOre">;
};

/** "559000-0000" → "165590000000"; a 12-digit personnummer as it is. */
export function agiIdentity(id: string): string {
  const d = id.replace(/\D/g, "");
  if (d.length === 10) return `16${d}`;
  if (d.length === 12) return d;
  throw new Error(`Arbetsgivarens identitet ska vara ett organisationsnummer (10 siffror) eller ett personnummer (12), fick "${id}".`);
}

/** Text for the file: & ' " escaped; < and > are not allowed in values and are dropped. */
const text = (s: string) => s.replace(/[<>]/g, "").replace(/&/g, "&amp;").replace(/'/g, "&apos;").replace(/"/g, "&quot;").trim();
const kronor = (ore: Ore) => {
  if (ore < 0 || ore % 100 !== 0) throw new Error(`Beloppet ${ore / 100} kr kan inte skrivas i AGI (hela kronor, aldrig negativt).`);
  return String(ore / 100);
};
const yyyymm = (period: string) => period.replace("-", "");
const spec = (n: number) => {
  if (!Number.isInteger(n) || n < 1 || n > AGI_FORMAT.specNoMax) throw new Error(`Specifikationsnummer ${n} är utanför 1–${AGI_FORMAT.specNoMax}.`);
  return String(n).padStart(3, "0");
};

function field(key: keyof typeof AGI_FORMAT.fields, value: string, indent: string): string {
  const f = AGI_FORMAT.fields[key];
  return `${indent}<agd:${f.element} faltkod="${f.code}">${value}</agd:${f.element}>`;
}

function blankett(employer: string, period: string, body: string): string {
  return [
    "  <agd:Blankett>",
    "    <agd:Arendeinformation>",
    `      <agd:Arendeagare>${employer}</agd:Arendeagare>`,
    `      <agd:Period>${yyyymm(period)}</agd:Period>`,
    "    </agd:Arendeinformation>",
    "    <agd:Blankettinnehall>",
    body,
    "    </agd:Blankettinnehall>",
    "  </agd:Blankett>",
  ].join("\n");
}

const BOX_FIELD: Record<Exclude<AgiBox, "001">, keyof typeof AGI_FORMAT.fields> = { "011": "cashPay", "012": "benefits", "013": "carBenefit", "018": "fuelBenefit", "023": "boardFee", "131": "notContributionBase" };

/**
 * The file for one month: the HU with 487 and 497, then one IU per
 * person (001 always, S_183; 011 unless the pay is all in 131; the other
 * amounts when not zero; 050/051 ticked), and a removal IU for each person
 * of an earlier version who is no longer in the month.
 */
export function agiXml(input: AgiFileInput): string {
  if (!isAgiPeriod(input.period)) throw new RangeError(`Perioden skrivs ÅÅÅÅ-MM, fick "${input.period}".`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(input.createdAt)) throw new RangeError("Skapad skrivs ÅÅÅÅ-MM-DDTtt:mm:ss.");
  const ag = agiIdentity(input.employerId);
  const p = yyyymm(input.period);
  const c = input.contact;
  if (!c.name.trim() || !c.phone.trim() || !c.email.trim()) throw new Error("AGI-filen behöver en kontaktperson med namn, telefon och e-post (Inställningar › Lön).");
  const contact = (tag: string) =>
    [`    <agd:${tag}>`, `      <agd:Namn>${text(c.name)}</agd:Namn>`, `      <agd:Telefon>${text(c.phone)}</agd:Telefon>`, `      <agd:Epostadress>${text(c.email)}</agd:Epostadress>`, `    </agd:${tag}>`].join("\n");
  const seen = new Set<number>();
  const ius = input.records.map((r) => {
    if (seen.has(r.specNo)) throw new Error(`Specifikationsnummer ${r.specNo} används två gånger.`);
    seen.add(r.specNo);
    const id = input.payeeId(r.employeeId).replace(/\D/g, "");
    if (id.length !== 12) throw new Error(`${r.name}: personnummer saknas eller är fel; AGI behöver tolv siffror.`);
    const i = "        ";
    const lines = [
      "      <agd:IU>",
      "        <agd:ArbetsgivareIUGROUP>",
      field("employer", ag, "          "),
      "        </agd:ArbetsgivareIUGROUP>",
      "        <agd:BetalningsmottagareIUGROUP>",
      "          <agd:BetalningsmottagareIDChoice>",
      field("payee", id, "            "),
      "          </agd:BetalningsmottagareIDChoice>",
      "        </agd:BetalningsmottagareIUGROUP>",
      field("period", p, i),
      field("specNo", spec(r.specNo), i),
    ];
    if (r.removed) lines.push(field("removal", AGI_FORMAT.tickValue, i));
    else {
      if (r.boxes["011"] > 0 || r.boxes["131"] === 0) lines.push(field("cashPay", kronor(r.boxes["011"]), i));
      for (const b of ["012", "013", "018", "023", "131"] as const) if (r.boxes[b] !== 0) lines.push(field(BOX_FIELD[b], kronor(r.boxes[b]), i));
      if (r.ticks["050"]) lines.push(field("mileage", AGI_FORMAT.tickValue, i));
      if (r.ticks["051"]) lines.push(field("perDiem", AGI_FORMAT.tickValue, i));
      lines.push(field("tax", kronor(r.boxes["001"]), i));
    }
    lines.push("      </agd:IU>");
    return blankett(ag, input.period, lines.join("\n"));
  });
  const hu = blankett(
    ag,
    input.period,
    [
      "      <agd:HU>",
      "        <agd:ArbetsgivareHUGROUP>",
      field("employer", ag, "          "),
      "        </agd:ArbetsgivareHUGROUP>",
      field("period", p, "        "),
      field("totalContributions", kronor(input.totals.contributionsOre), "        "),
      field("totalTax", kronor(input.totals.taxOre), "        "),
      "      </agd:HU>",
    ].join("\n"),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    `<Skatteverket omrade="${AGI_FORMAT.omrade}" xmlns="${AGI_FORMAT.instanceNamespace}" xmlns:agd="${AGI_FORMAT.componentNamespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${AGI_FORMAT.schemaLocation}">`,
    "  <agd:Avsandare>",
    `    <agd:Programnamn>${text(input.programName)}</agd:Programnamn>`,
    `    <agd:Organisationsnummer>${ag}</agd:Organisationsnummer>`,
    contact("TekniskKontaktperson"),
    `    <agd:Skapad>${input.createdAt}</agd:Skapad>`,
    "  </agd:Avsandare>",
    "  <agd:Blankettgemensamt>",
    "    <agd:Arbetsgivare>",
    `      <agd:AgRegistreradId>${ag}</agd:AgRegistreradId>`,
    contact("Kontaktperson").replace(/^ {4}/gm, "      "),
    "    </agd:Arbetsgivare>",
    "  </agd:Blankettgemensamt>",
    hu,
    ...ius,
    "</Skatteverket>",
    "",
  ].join("\n");
}

/* ---------- reading a file back ---------- */

export type ParsedIu = { payeeId: string; period: string; specNo: number; removed: boolean; fields: Record<string, string> };
export type ParsedAgi = { employerId: string; period: string; hu: Record<string, string> | null; ius: ParsedIu[] };

/** Every element with a faltkod inside a block, keyed by the code. */
function faltkoder(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/<(?:[\w-]+:)?\w+\s+faltkod="(\d{3})"\s*>([^<]*)</g)) out[m[1]] = m[2].trim();
  return out;
}

/**
 * A file this module wrote, or one like Skatteverket's examples, read back
 * into its HU and IUs (one employer and period). Used to check a stored
 * file against the month's sums before it is frozen.
 */
export function parseAgiXml(xml: string): ParsedAgi {
  const blocks = [...xml.matchAll(/<(?:[\w-]+:)?(HU|IU)>([\s\S]*?)<\/(?:[\w-]+:)?\1>/g)];
  let hu: Record<string, string> | null = null;
  const ius: ParsedIu[] = [];
  for (const [, kind, body] of blocks) {
    const f = faltkoder(body);
    if (kind === "HU") hu = f;
    else ius.push({ payeeId: f["215"] ?? f["222"] ?? f["224"] ?? "", period: f["006"] ?? "", specNo: Number(f["570"]), removed: f["205"] === "1" || f["205"] === "true", fields: f });
  }
  const first = hu ?? ius[0]?.fields ?? {};
  const period = first["006"] ?? "";
  return { employerId: first["201"] ?? "", period: period ? `${period.slice(0, 4)}-${period.slice(4)}` : "", hu, ius };
}

/** Differences between a written file and the records and totals it should carry (empty when it matches). */
export function checkAgiXml(xml: string, records: readonly AgiRecord[], totals: Pick<AgiTotals, "taxOre" | "contributionsOre">, period: string): string[] {
  const parsed = parseAgiXml(xml);
  const problems: string[] = [];
  const kr = (v: string | undefined) => (v === undefined ? 0 : Number(v) * 100);
  if (parsed.period !== period) problems.push(`Filen gäller ${parsed.period}, inte ${period}.`);
  if (!parsed.hu) problems.push("Filen saknar huvuduppgift.");
  else {
    if (kr(parsed.hu["487"]) !== totals.contributionsOre) problems.push(`Ruta 487 är ${parsed.hu["487"]} kr, månaden ger ${totals.contributionsOre / 100} kr.`);
    if (kr(parsed.hu["497"]) !== totals.taxOre) problems.push(`Ruta 497 är ${parsed.hu["497"]} kr, månaden ger ${totals.taxOre / 100} kr.`);
  }
  const bySpec = new Map(parsed.ius.map((i) => [i.specNo, i]));
  if (parsed.ius.length !== records.length) problems.push(`Filen har ${parsed.ius.length} individuppgifter, månaden ${records.length}.`);
  for (const r of records) {
    const iu = bySpec.get(r.specNo);
    if (!iu) {
      problems.push(`${r.name} (specifikation ${r.specNo}) saknas i filen.`);
      continue;
    }
    if (iu.removed !== !!r.removed) problems.push(`${r.name}: borttag stämmer inte.`);
    if (r.removed) continue;
    for (const b of AGI_AMOUNT_BOXES) if (kr(iu.fields[b]) !== r.boxes[b]) problems.push(`${r.name}: ruta ${b} är ${iu.fields[b] ?? "tom"} i filen, ${r.boxes[b] / 100} kr i månaden.`);
    for (const t of AGI_TICK_BOXES) if ((iu.fields[t] === "1") !== r.ticks[t]) problems.push(`${r.name}: ruta ${t} stämmer inte.`);
  }
  const iuTax = sumOre(parsed.ius.map((i) => kr(i.fields["001"])));
  if (iuTax !== totals.taxOre) problems.push(`Individuppgifternas skatt ${iuTax / 100} kr är inte ruta 497.`);
  return problems;
}

/** Skatteverket's file name is free; this one says what it is: AGI-202611-v2.xml. */
export const agiFileName = (period: string, version: number) => `AGI-${yyyymm(period)}-v${version}.xml`;
