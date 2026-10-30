/**
 * Loads the verified tax tables that `npm run tax-tables:import -- ÅÅÅÅ
 * --out fil.json` wrote into the database (0039), with the service role, in
 * three steps: tax_tables_import_begin (the record), _rows (the ~48 000
 * rows in parts of 2 000) and _finish. The golden vectors are checked again
 * against the rows before sending, and the database checks them a third
 * time against the rows it stored in _finish; one vector off and the
 * import is removed and never used (docs/hr-lon.md, section 9 rule 2). A
 * load that stops halfway leaves an unfinished import nobody reads; run
 * the script again and it starts over.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run tax-tables:load -- /tmp/tax-tables-2026.json
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { checkGoldenVectors, indexTaxTable, type GoldenResult, type TaxTableRow } from "../lib/core/payroll/tax-tables";

/** Rows per call: a few hundred kB of JSON, well inside PostgREST's limits. */
const CHUNK = 2000;

type Export = { year: number; sha256: string; fileRowCount: number; golden: GoldenResult[]; importedAt: string; rows: TaxTableRow[] };

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Ange filen: npm run tax-tables:load -- tabeller.json");
  const data = JSON.parse(readFileSync(file, "utf8")) as Export;
  if (!data.golden?.length || data.golden.length < 10) throw new Error("Filen har färre än tio kontrollvektorer; kör importskriptet igen.");
  const again = checkGoldenVectors(indexTaxTable(data.rows), { year: data.year, source: "", checked: "", vectors: data.golden.map((g) => g.vector) });
  const failed = again.filter((r) => !r.ok);
  if (failed.length) throw new Error(`${failed.length} kontrollvektorer stämmer inte mot raderna i filen; inget laddas.`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY behövs.");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const record = { year: data.year, sha256: data.sha256, fileRowCount: data.fileRowCount, golden: again };
  console.log(`Laddar ${data.rows.length} rader för ${data.year} (SHA-256 ${data.sha256.slice(0, 12)}…).`);
  const begin = await supabase.rpc("tax_tables_import_begin", { p_record: record });
  if (begin.error) throw new Error(begin.error.message);
  const id = begin.data as string;
  for (let from = 0; from < data.rows.length; from += CHUNK) {
    const part = data.rows.slice(from, from + CHUNK);
    const { error } = await supabase.rpc("tax_tables_import_rows", { p_import: id, p_rows: part });
    if (error) throw new Error(`Delen från rad ${from + 1}: ${error.message}. Kör skriptet igen; importen börjar om.`);
    process.stdout.write(`\r${Math.min(from + CHUNK, data.rows.length)} av ${data.rows.length} rader`);
  }
  process.stdout.write("\n");
  const finish = await supabase.rpc("tax_tables_import_finish", { p_import: id });
  if (finish.error) throw new Error(finish.error.message);
  const res = finish.data as { ok: boolean; rows?: number; problems?: string[] };
  if (!res.ok) throw new Error(`Importen stoppad och borttagen: ${(res.problems ?? []).join("; ")}.`);
  console.log(`Klart: import ${id}, ${res.rows} rader. Kontrollvektorerna stämde mot raderna i databasen.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
