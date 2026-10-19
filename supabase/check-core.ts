/**
 * Reads the invoicing core's state in the configured Supabase project and
 * prints what is missing: tables, functions, the first organisation, number
 * series, accounts and memberships. Service role, read-only.
 *
 *   npm run db:check
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    /* no .env.local: rely on the environment */
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Sätt NEXT_PUBLIC_SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY i .env.local först.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const TABLES = [
  "organizations", "memberships", "org_settings", "number_series", "number_counters", "events", "customers", "invoices", "invoice_lines",
  "payment_plans", "payment_plan_steps", "recurring_invoices", "reminders", "bank_transactions", "payments", "payment_allocations",
  "accounts", "journal_entries", "journal_lines", "period_locks", "rot_buyers", "rot_claims", "rot_claim_items", "api_keys",
  "idempotency_keys", "webhook_endpoints", "webhook_deliveries",
];
const FUNCTIONS = ["issue_invoice", "register_payment", "mark_invoice_sent", "mark_invoice_credited", "register_rot_payout", "reject_rot_claim", "register_reminder", "mark_bank_transaction", "can_write_org_or_system", "next_document_number", "ocr_for", "default_org"];

let problems = 0;
const bad = (msg: string) => {
  problems++;
  console.log(`  ✖ ${msg}`);
};
const ok = (msg: string) => console.log(`  ✔ ${msg}`);

async function main() {
  console.log(`Projekt: ${url}`);

  console.log("Tabeller (0014–0017):");
  for (const t of TABLES) {
    const { error } = await db.from(t).select("*", { head: true, count: "exact" }).limit(0);
    if (error) bad(`${t}: ${error.message}`);
  }
  if (problems === 0) ok(`alla ${TABLES.length} tabeller finns`);

  console.log("Funktioner:");
  const { data: fns, error: fnErr } = await db.rpc("ocr_for", { p_reference: "10022" });
  if (fnErr) bad(`ocr_for: ${fnErr.message}`);
  else ok(`ocr_for('10022') = ${fns}`);
  // Each function is called with its real signature and an id that does not
  // exist, so it answers "finns inte" (proof it exists) without side effects.
  const nil = "00000000-0000-4000-8000-000000000000";
  const j = {};
  const calls: Record<string, Record<string, unknown>> = {
    issue_invoice: { p_invoice: nil, p_document: j, p_totals: j, p_posting: j, p_actor: j },
    register_payment: { p_invoice: nil, p_amount: 1, p_method: "manual", p_paid_on: "2026-01-01", p_reference: "", p_note: "", p_posting: j, p_actor: j },
    mark_invoice_sent: { p_invoice: nil, p_to: "", p_actor: j },
    mark_invoice_credited: { p_invoice: nil, p_credit: nil, p_actor: j },
    register_rot_payout: { p_claim: nil, p_amount: 1, p_paid_on: "2026-01-01", p_posting: j, p_note: "", p_actor: j },
    reject_rot_claim: { p_claim: nil, p_note: "", p_actor: j },
    register_reminder: { p_invoice: nil, p_fee: 0, p_interest: 0, p_sent_to: "", p_posting: j, p_actor: j },
    mark_bank_transaction: { p_tx: nil, p_status: "ignored", p_payment: null },
    next_document_number: { p_org: nil, p_series: "ZZ", p_year: 0 },
  };
  for (const f of FUNCTIONS.filter((x) => x !== "ocr_for" && x !== "default_org" && x !== "can_write_org_or_system")) {
    const { error } = await db.rpc(f, calls[f]);
    if (!error) bad(`${f}: svarade utan fel på ett påhittat id, oväntat`);
    else if (/Could not find the function|does not exist/i.test(error.message)) bad(`${f} saknas: kör migrationen som skapar den (${error.message.slice(0, 80)})`);
    else ok(`${f}: "${error.message.slice(0, 60)}"`);
  }
  const { data: sys, error: sysErr } = await db.rpc("can_write_org_or_system", { org: nil });
  if (sysErr) bad(`can_write_org_or_system saknas (0017): ${sysErr.message}`);
  else if (sys !== true) bad("can_write_org_or_system ger inte true för service role; cron kan inte skriva");
  else ok("can_write_org_or_system: service role får skriva (0017)");

  console.log("Organisation:");
  const { data: org } = await db.from("organizations").select("id, slug, name, created_at").order("created_at").limit(1).maybeSingle();
  if (!org) bad("ingen organisation; 0014 har inte körts klart");
  else ok(`${org.name} (${org.slug}) ${org.id}`);

  const { data: series } = await db.from("number_series").select("series, per_year, start");
  if (!series?.length) bad("number_series är tom (0014 lägger in F och V)");
  else ok(`nummerserier: ${series.map((s) => `${s.series} från ${s.start}${s.per_year ? " per år" : ""}`).join(", ")}`);

  const { count: accounts } = await db.from("accounts").select("*", { head: true, count: "exact" });
  if (!accounts) bad("kontoplanen är tom (seed_org_accounts i 0014)");
  else ok(`${accounts} konton i kontoplanen`);

  const { data: members } = await db.from("memberships").select("role, user_id");
  if (!members?.length) bad("inga medlemskap: lägg till dig själv som owner (se docs/fakturering.md)");
  else ok(`medlemskap: ${members.map((m) => m.role).join(", ")}`);

  const { data: defaults, error: dErr } = await db.rpc("default_org");
  if (dErr) bad(`default_org(): ${dErr.message}`);
  else ok(`default_org() = ${defaults}`);

  console.log(problems ? `\n${problems} problem.` : "\nDatabasen är redo för fakturering.");
  process.exit(problems ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
