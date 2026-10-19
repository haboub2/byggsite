/**
 * Adds the Alenjaz software cases (lib/alenjaz-cases.ts) to Supabase as drafts.
 * Cases whose address already exists are left alone, so edits made in /admin
 * are never overwritten and the script is safe to re-run.
 *
 * Needs migration 0011_case_details.sql applied first, and
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server-only, bypasses RLS).
 * Without them it prints what it would add and exits.
 *
 * Usage: npm run db:import-cases
 */
import { createClient } from "@supabase/supabase-js";
import { alenjazCases } from "../lib/alenjaz-cases";
import { caseSchema } from "../lib/case-schema";
import { toRow } from "../lib/case-rows";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  for (const c of alenjazCases) {
    const parsed = caseSchema.safeParse(c);
    if (!parsed.success) throw new Error(`${c.slug}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.log("No Supabase project configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset).");
    console.log(`Dry run: would add ${alenjazCases.length} draft cases: ${alenjazCases.map((c) => c.slug).join(", ")}`);
    return;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: existing, error: readError } = await supabase.from("cases").select("slug");
  if (readError) throw readError;
  const taken = new Set((existing ?? []).map((r: { slug: string }) => r.slug));

  const rows = alenjazCases.filter((c) => !taken.has(c.slug)).map(toRow);
  for (const c of alenjazCases) if (taken.has(c.slug)) console.log(`  skip ${c.slug}: already in the table`);
  if (!rows.length) {
    console.log("Nothing to add.");
    return;
  }
  const { error } = await supabase.from("cases").insert(rows);
  if (error) throw error;
  console.log(`Added ${rows.length} draft cases: ${rows.map((r) => r.slug).join(", ")}`);
  console.log("Open /admin/innehall/case to add cover photos and publish them.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
