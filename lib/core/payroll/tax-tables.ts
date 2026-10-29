/**
 * Skatteverket's monthly tax tables (SKVFS for the year, published as open
 * data: "Skattetabell månadslön <år>", CSV with semicolons, ISO-8859-1) and
 * the lookups payroll uses. docs/hr-lon.md, sections 4 and 9 rule 2: the
 * tables are imported from Skatteverket's file, hashed, and the import is
 * refused unless a set of golden vectors taken from the published
 * regulation match.
 *
 * File layout (checked on the 2026 file, 2026-10-30):
 *
 *   År;Antal dgr;Tabellnr;Inkomst fr.o.m.;Inkomst t.o.m.;Kolumn 1;…;Kolumn 7
 *   2026;30B;33;24801;25000;4622;4517;2006;4622;7288;7288;
 *   2026;30%;33;93401;95600;36;36;33;32;41;41;
 *   2026;30%;33;1269001;;52;52;52;44;52;52;
 *
 * "30B" rows give the deduction in kronor for the band, "30%" rows (from
 * 80 001 kr a month) give it in percent of the pay. The last band has no
 * upper limit. Kolumn 7 is empty in 2026 (six columns, SKV 433 avsnitt 3).
 */

import { createHash } from "node:crypto";
import { ORE_PER_KRONA, rateOf, truncateToKronor, type Ore } from "../money";
import type { PayrollRuleSet } from "../rules/payroll";

export type TaxTableRow = {
  year: number;
  tableNo: number;
  /** 1–6 (SKV 433 avsnitt 3: 1 = lön under 66, 3 = lön 66+, ...). */
  column: number;
  /** First öre of the band, inclusive. The file's 24 801 kr is 2 480 100 öre. */
  incomeFromOre: Ore;
  /** Last öre of the band, inclusive (25 000 kr → 2 500 099), null for the open top band. */
  incomeToOre: Ore | null;
  /** Deduction in öre for a "30B" row, null for a percent row. */
  taxOre: Ore | null;
  /** Deduction in percent of the pay for a "30%" row, null for an amount row. */
  percent: number | null;
};

export type TaxTableFile = {
  year: number;
  rows: TaxTableRow[];
  /** Data lines in the file (one line holds all columns of a band). */
  fileRowCount: number;
  /** Hex SHA-256 of the file's bytes exactly as downloaded. */
  sha256: string;
};

export type GoldenVector = {
  table: number;
  column: number;
  monthlyPayKr: number;
  taxKr: number;
};

export type GoldenFile = {
  year: number;
  source: string;
  checked: string;
  vectors: GoldenVector[];
};

const HEADER = ["År", "Antal dgr", "Tabellnr", "Inkomst fr.o.m.", "Inkomst t.o.m."];

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Skatteverket's files are ISO-8859-1; accept UTF-8 (with or without BOM) as well, by the header. */
function decode(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^﻿/, "");
  if (utf8.startsWith("År;")) return utf8;
  return new TextDecoder("latin1").decode(bytes);
}

function wholeNumber(value: string, what: string, line: number): number {
  if (!/^\d+$/.test(value)) throw new Error(`Rad ${line}: ${what} ska vara ett heltal, fick "${value}".`);
  return Number(value);
}

/**
 * Parse the monthly table file into one row per (table, band, column).
 * Throws on anything unexpected: an unknown header, a row type other than
 * 30B/30%, a non-numeric field, more than one year, or a gap or overlap
 * between bands of the same table.
 */
export function parseTaxTableCsv(bytes: Uint8Array): TaxTableFile {
  const text = decode(bytes);
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) throw new Error("Filen är tom.");
  const header = lines[0].split(";");
  for (let i = 0; i < HEADER.length; i++) {
    if (header[i] !== HEADER[i]) throw new Error(`Okänd rubrikrad: väntade "${HEADER[i]}" i kolumn ${i + 1}, fick "${header[i]}".`);
  }
  const columnCount = header.slice(5).filter((h) => /^Kolumn \d+$/.test(h)).length;
  if (columnCount < 6) throw new Error(`Filen har ${columnCount} skattekolumner, väntade minst 6.`);

  const rows: TaxTableRow[] = [];
  let year: number | null = null;
  const lastTo = new Map<number, number | null>();
  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const f = lines[i].split(";");
    const y = wholeNumber(f[0], "År", lineNo);
    if (year === null) year = y;
    else if (y !== year) throw new Error(`Rad ${lineNo}: filen blandar år ${year} och ${y}.`);
    const kind = f[1];
    if (kind !== "30B" && kind !== "30%") throw new Error(`Rad ${lineNo}: okänd radtyp "${kind}", väntade 30B eller 30%.`);
    const tableNo = wholeNumber(f[2], "Tabellnr", lineNo);
    const from = wholeNumber(f[3], "Inkomst fr.o.m.", lineNo);
    const to = f[4] === "" ? null : wholeNumber(f[4], "Inkomst t.o.m.", lineNo);
    if (to !== null && to < from) throw new Error(`Rad ${lineNo}: inkomst t.o.m. ${to} är lägre än fr.o.m. ${from}.`);

    const prev = lastTo.get(tableNo);
    if (prev === undefined ? from !== 1 : prev === null || from !== prev + 1) {
      throw new Error(`Rad ${lineNo}: tabell ${tableNo} har ett glapp eller överlapp vid ${from} kr.`);
    }
    lastTo.set(tableNo, to);

    for (let c = 1; c <= columnCount; c++) {
      const raw = f[4 + c] ?? "";
      if (raw === "") continue;
      const value = wholeNumber(raw, `Kolumn ${c}`, lineNo);
      rows.push({
        year: y,
        tableNo,
        column: c,
        incomeFromOre: from * ORE_PER_KRONA,
        incomeToOre: to === null ? null : to * ORE_PER_KRONA + (ORE_PER_KRONA - 1),
        taxOre: kind === "30B" ? value * ORE_PER_KRONA : null,
        percent: kind === "30%" ? value : null,
      });
    }
  }
  if (year === null) throw new Error("Filen har inga rader.");
  return { year, rows, fileRowCount: lines.length - 1, sha256: sha256Hex(bytes) };
}

/**
 * Index for lookups: rows of one table and column, ordered by income.
 * Built once per import; `tableTax` accepts the plain row list too.
 */
export type TaxTableIndex = Map<string, TaxTableRow[]>;

export function indexTaxTable(rows: readonly TaxTableRow[]): TaxTableIndex {
  const index: TaxTableIndex = new Map();
  for (const r of rows) {
    const key = `${r.tableNo}:${r.column}`;
    const list = index.get(key);
    if (list) list.push(r);
    else index.set(key, [r]);
  }
  for (const list of index.values()) list.sort((a, b) => a.incomeFromOre - b.incomeFromOre);
  return index;
}

/**
 * Preliminary tax on a month's taxable cash pay by table and column, in öre
 * that are always whole kronor. Amount bands give the table's figure; in
 * percent bands the percentage is applied to the pay and öretal bortfaller.
 * Pay is looked up by whole kronor (24 800,99 kr is in the band ending at
 * 24 800). Zero or negative pay gives zero tax.
 */
export function tableTax(
  rows: readonly TaxTableRow[] | TaxTableIndex,
  tableNo: number,
  column: number,
  monthlyGrossOre: Ore,
): Ore {
  if (monthlyGrossOre <= 0) return 0;
  const list = rows instanceof Map ? rows.get(`${tableNo}:${column}`) : rows.filter((r) => r.tableNo === tableNo && r.column === column);
  if (!list || !list.length) throw new Error(`Skattetabell ${tableNo} kolumn ${column} finns inte i den importerade filen.`);
  const sorted = rows instanceof Map ? list : [...list].sort((a, b) => a.incomeFromOre - b.incomeFromOre);
  // Binary search for the band that holds the pay.
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (sorted[mid].incomeFromOre <= monthlyGrossOre) lo = mid;
    else hi = mid - 1;
  }
  const band = sorted[lo];
  if (band.incomeFromOre > monthlyGrossOre) return 0;
  if (band.incomeToOre !== null && band.incomeToOre < monthlyGrossOre) {
    throw new Error(`Skattetabell ${tableNo} kolumn ${column} täcker inte ${monthlyGrossOre / ORE_PER_KRONA} kr.`);
  }
  if (band.taxOre !== null) return band.taxOre;
  return truncateToKronor(rateOf(truncateToKronor(monthlyGrossOre), band.percent ?? 0, "down"));
}

/**
 * Engångsbelopp: the percentage for a lump sum, chosen by the employee's
 * estimated annual pay from us including the lump sum (SKV 433 avsnitt 10).
 */
export function lumpSumPercent(rules: PayrollRuleSet, column: number, estimatedAnnualOre: Ore): number {
  const brackets = rules.preliminaryTax.lumpSum.columns[column];
  if (!brackets) throw new Error(`Engångsskatt saknas för kolumn ${column}.`);
  const kronor = Math.trunc(estimatedAnnualOre / ORE_PER_KRONA);
  for (const b of brackets) if (b.toKr === null || kronor <= b.toKr) return b.percent;
  throw new Error(`Engångsskatt för kolumn ${column} täcker inte ${kronor} kr.`);
}

/** Tax on a lump sum at `lumpSumPercent`, öretal bortfaller. */
export function lumpSumTax(rules: PayrollRuleSet, column: number, estimatedAnnualOre: Ore, lumpSumOre: Ore): Ore {
  if (lumpSumOre <= 0) return 0;
  return truncateToKronor(rateOf(lumpSumOre, lumpSumPercent(rules, column, estimatedAnnualOre), "down"));
}

export type GoldenResult = { vector: GoldenVector; actualKr: number | null; ok: boolean; error?: string };

export function checkGoldenVectors(rows: readonly TaxTableRow[] | TaxTableIndex, golden: GoldenFile): GoldenResult[] {
  return golden.vectors.map((vector) => {
    try {
      const actual = tableTax(rows, vector.table, vector.column, vector.monthlyPayKr * ORE_PER_KRONA) / ORE_PER_KRONA;
      return { vector, actualKr: actual, ok: actual === vector.taxKr };
    } catch (e) {
      return { vector, actualKr: null, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
}

export type TaxTableImport = TaxTableFile & { golden: GoldenResult[] };

/**
 * Parse and verify a downloaded file. Refuses (throws) when the year is not
 * the golden file's year, when fewer than ten vectors exist, or when any
 * vector fails, so a wrong or truncated file never reaches the database.
 * `requireAllTables` is for the full file (tables 29–42 in 2026); the unit
 * tests load a sample of three tables and leave it off.
 */
export function verifyTaxTables(bytes: Uint8Array, golden: GoldenFile, options: { requireTables?: readonly number[] } = {}): TaxTableImport {
  const file = parseTaxTableCsv(bytes);
  if (file.year !== golden.year) throw new Error(`Filen gäller ${file.year}, kontrollvektorerna ${golden.year}.`);
  if (golden.vectors.length < 10) throw new Error(`Minst tio kontrollvektorer krävs, filen med vektorer har ${golden.vectors.length}.`);
  const index = indexTaxTable(file.rows);
  for (const t of options.requireTables ?? []) {
    for (let c = 1; c <= 6; c++) if (!index.has(`${t}:${c}`)) throw new Error(`Tabell ${t} kolumn ${c} saknas i filen.`);
  }
  const results = checkGoldenVectors(index, golden);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    const list = failed
      .map((r) => `tabell ${r.vector.table} kolumn ${r.vector.column} ${r.vector.monthlyPayKr} kr: väntade ${r.vector.taxKr}, fick ${r.actualKr ?? r.error}`)
      .join("; ");
    throw new Error(`Importen stoppad, ${failed.length} av ${results.length} kontrollvektorer stämmer inte: ${list}.`);
  }
  return { ...file, golden: results };
}
