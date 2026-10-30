/**
 * Downloads Skatteverket's monthly tax tables for a year, verifies them
 * against the golden vectors in lib/core/payroll/tax-tables.golden.json and
 * prints the import record (SHA-256, row counts, vectors). docs/hr-lon.md,
 * section 9 rule 2: a file that fails a single vector is refused.
 *
 * `--out` writes the verified rows as JSON; `npm run tax-tables:load --
 * fil.json` puts them in the database (tax_tables_import(), 0039).
 *
 * Usage:
 *   npm run tax-tables:import -- 2026
 *   npm run tax-tables:import -- 2026 --file ~/Downloads/skattetabell.csv
 *   npm run tax-tables:import -- 2026 --out /tmp/tax-tables-2026.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import goldenJson from "../lib/core/payroll/tax-tables.golden.json";
import { verifyTaxTables, type GoldenFile } from "../lib/core/payroll/tax-tables";

type KnownFile = { name: string; url: string; sha256: string; fileRowCount: number };
const golden = goldenJson as GoldenFile & { knownFiles: KnownFile[] };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const year = Number(process.argv[2]);
  if (!Number.isInteger(year) || year < 2000) throw new Error("Ange året: npm run tax-tables:import -- 2026");
  if (year !== golden.year) {
    throw new Error(`Kontrollvektorerna gäller ${golden.year}. Lägg in minst tio vektorer för ${year} från Skatteverkets SKVFS-bilaga i tax-tables.golden.json först.`);
  }

  const file = arg("--file");
  const known = golden.knownFiles[0];
  let bytes: Uint8Array;
  if (file) {
    bytes = readFileSync(file);
    console.log(`Läser ${file}`);
  } else {
    const url = arg("--url") ?? known.url;
    console.log(`Hämtar ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Skatteverket svarade ${res.status} ${res.statusText}.`);
    bytes = new Uint8Array(await res.arrayBuffer());
  }

  // Every table between the lowest and highest number must have all six columns.
  const probe = verifyTaxTables(bytes, golden);
  const tables = [...new Set(probe.rows.map((r) => r.tableNo))].sort((a, b) => a - b);
  const expected = Array.from({ length: tables[tables.length - 1] - tables[0] + 1 }, (_, i) => tables[0] + i);
  const imported = verifyTaxTables(bytes, golden, { requireTables: expected });

  console.log(`År ${imported.year}: tabell ${tables[0]}–${tables[tables.length - 1]}, ${imported.fileRowCount} rader i filen, ${imported.rows.length} rader efter uppdelning per kolumn.`);
  console.log(`SHA-256 ${imported.sha256}${imported.sha256 === known.sha256 ? " (samma fil som när vektorerna kontrollerades)" : " (ny version av filen; vektorerna stämmer ändå)"}`);
  console.log(`Kontrollvektorer: ${imported.golden.length} av ${imported.golden.length} stämmer.`);

  const out = arg("--out");
  if (out) {
    const { rows, ...record } = imported;
    writeFileSync(out, JSON.stringify({ ...record, importedAt: new Date().toISOString(), rows }));
    console.log(`Skrev ${out}`);
  } else {
    console.log("Ange --out <fil> för att spara raderna, och ladda dem med npm run tax-tables:load -- <fil>.");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
