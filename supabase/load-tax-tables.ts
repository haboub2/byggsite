/**
 * Loads the verified tax tables that `npm run tax-tables:import -- ÅÅÅÅ
 * --out fil.json` wrote into the database (tax_tables_import(), 0039),
 * with the service role. The golden vectors are checked again against the
 * rows before sending, and the database checks them a third time against
 * the rows it stored; one vector off and nothing is stored (docs/hr-lon.md,
 * section 9 rule 2).
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run tax-tables:load -- /tmp/tax-tables-2026.json
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { checkGoldenVectors, indexTaxTable, type GoldenResult, type TaxTableRow } from "../lib/core/payroll/tax-tables";

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
  const { data: id, error } = await supabase.rpc("tax_tables_import", { p_record: record, p_rows: data.rows });
  if (error) throw new Error(error.message);
  console.log(`Klart: import ${id}. Kontrollvektorerna stämde mot raderna i databasen.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
