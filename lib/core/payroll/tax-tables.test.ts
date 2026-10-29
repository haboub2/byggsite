import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { payrollRulesAt } from "../rules/payroll";
import golden from "./tax-tables.golden.json";
import {
  checkGoldenVectors,
  indexTaxTable,
  lumpSumPercent,
  lumpSumTax,
  parseTaxTableCsv,
  tableTax,
  verifyTaxTables,
  type GoldenFile,
} from "./tax-tables";

// A sample of Skatteverket's real 2026 file: tables 32–34 complete, bytes
// as downloaded (ISO-8859-1, CRLF). The full file is not committed.
const sample = readFileSync(join(__dirname, "fixtures", "skattetabell-manad-2026.sample.csv"));
const parsed = parseTaxTableCsv(sample);
const index = indexTaxTable(parsed.rows);
const g = golden as GoldenFile;

test("the 2026 sample parses: three tables, six columns, Latin-1 header", () => {
  assert.equal(parsed.year, 2026);
  assert.equal(parsed.fileRowCount, 1_707);
  assert.equal(parsed.rows.length, 1_707 * 6);
  assert.deepEqual([...new Set(parsed.rows.map((r) => r.tableNo))], [32, 33, 34]);
  assert.match(parsed.sha256, /^[0-9a-f]{64}$/);
  const first = parsed.rows.find((r) => r.tableNo === 33 && r.column === 1 && r.incomeFromOre === 2_480_100);
  assert.deepEqual(first, { year: 2026, tableNo: 33, column: 1, incomeFromOre: 2_480_100, incomeToOre: 2_500_099, taxOre: 462_200, percent: null });
  const top = parsed.rows.filter((r) => r.tableNo === 33 && r.column === 1).at(-1);
  assert.equal(top?.incomeToOre, null);
  assert.equal(top?.percent, 52);
});

test("golden vectors from SKVFS 2025:20 pass on the sample, and there are at least ten", () => {
  assert.ok(g.vectors.length >= 10);
  const results = checkGoldenVectors(index, g);
  for (const r of results) assert.ok(r.ok, `tabell ${r.vector.table} kol ${r.vector.column} ${r.vector.monthlyPayKr} kr: ${r.actualKr} ≠ ${r.vector.taxKr}`);
  const imported = verifyTaxTables(sample, g, { requireTables: [32, 33, 34] });
  assert.equal(imported.golden.length, g.vectors.length);
});

test("the import is refused when a vector fails, too few vectors exist, or the year differs", () => {
  const wrong: GoldenFile = { ...g, vectors: g.vectors.map((v, i) => (i === 0 ? { ...v, taxKr: v.taxKr + 1 } : v)) };
  assert.throws(() => verifyTaxTables(sample, wrong), /Importen stoppad, 1 av 17/);
  assert.throws(() => verifyTaxTables(sample, { ...g, vectors: g.vectors.slice(0, 9) }), /Minst tio/);
  assert.throws(() => verifyTaxTables(sample, { ...g, year: 2027 }), /gäller 2026/);
  assert.throws(() => verifyTaxTables(sample, g, { requireTables: [29] }), /Tabell 29 kolumn 1 saknas/);
});

test("broken files are rejected: header, row type, gaps", () => {
  const text = sample.toString("latin1");
  const bytes = (s: string) => Buffer.from(s, "latin1");
  assert.throws(() => parseTaxTableCsv(bytes(text.replace("Tabellnr", "Tabell"))), /Okänd rubrikrad/);
  assert.throws(() => parseTaxTableCsv(bytes(text.replace("2026;30B;33;2001;2100", "2026;31X;33;2001;2100"))), /okänd radtyp/);
  assert.throws(() => parseTaxTableCsv(bytes(text.replace("2026;30B;33;2101;2200", "2026;30B;33;2102;2200"))), /glapp eller överlapp/);
  assert.throws(() => parseTaxTableCsv(bytes(text.replace("2026;30B;33;2101;2200", "2025;30B;33;2101;2200"))), /blandar år/);
});

test("table lookup: bands by whole kronor, percent bands drop the öre", () => {
  assert.equal(tableTax(index, 33, 1, 2_500_000), 462_200);
  // 25 000,99 kr is still in the band ending at 25 000.
  assert.equal(tableTax(index, 33, 1, 2_500_099), 462_200);
  assert.notEqual(tableTax(index, 33, 1, 2_500_100), 462_200);
  // 36 % of 95 123 kr = 34 244,28 kr → 34 244 kr.
  assert.equal(tableTax(index, 33, 1, 9_512_345), 3_424_400);
  // The flat list works too.
  assert.equal(tableTax(parsed.rows, 34, 1, 3_500_000), 734_700);
  assert.equal(tableTax(index, 33, 1, 0), 0);
  assert.equal(tableTax(index, 33, 1, 150_000), 0);
  assert.throws(() => tableTax(index, 30, 1, 2_500_000), /finns inte/);
});

test("engångsbelopp brackets in the rule book equal Skatteverket's 2026 file, all six columns", () => {
  const csv = readFileSync(join(__dirname, "fixtures", "engangsbelopp-2026.csv")).toString("latin1");
  const fromFile: Record<number, { toKr: number | null; percent: number }[]> = {};
  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const [year, column, , to, percent] = line.split(";");
    assert.equal(year, "2026");
    (fromFile[Number(column)] ??= []).push({ toKr: to === "" ? null : Number(to), percent: Number(percent) });
  }
  assert.deepEqual(payrollRulesAt("2026-06-25").preliminaryTax.lumpSum.columns, fromFile);
});

test("engångsskatt by estimated annual pay including the lump sum", () => {
  const r = payrollRulesAt("2026-06-25");
  assert.equal(lumpSumPercent(r, 1, 2_504_100), 0);
  assert.equal(lumpSumPercent(r, 1, 2_504_200), 10);
  assert.equal(lumpSumPercent(r, 1, 30_000_000), 26);
  assert.equal(lumpSumPercent(r, 1, 66_000_100), 54);
  assert.equal(lumpSumPercent(r, 3, 30_000_000), 10);
  // 26 % of a 10 000,50 kr bonus = 2 600,13 kr → 2 600 kr.
  assert.equal(lumpSumTax(r, 1, 30_000_000, 1_000_050), 260_000);
  assert.equal(lumpSumTax(r, 1, 30_000_000, 0), 0);
  assert.throws(() => lumpSumPercent(r, 7, 1), /kolumn 7/);
});
