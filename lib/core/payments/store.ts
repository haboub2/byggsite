import "server-only";
import { getDb } from "../db";
import { isDemo } from "../../leads";
import { todayIso } from "../../quotes/schema";
import type { Actor } from "../events";
import { isOpen, listInvoices, registerPayment } from "../invoices/store";
import { parseCamt054, type BankTransactionInput } from "./camt054";
import { matchAll, type OpenInvoice, type TransactionMatch } from "./matching";

/**
 * Bank transactions (bank_transactions in 0014): imported from the bank's
 * camt.054 file, matched to open invoices, and turned into payments with a
 * click. Nothing is booked without a person confirming the match.
 */

export type BankTransaction = BankTransactionInput & {
  id: string;
  source: "camt054" | "openbanking" | "manual";
  status: "unmatched" | "matched" | "ignored";
  importedAt: string;
};

type Row = {
  id: string;
  source: BankTransaction["source"];
  external_id: string;
  booked_on: string;
  amount_ore: number | string;
  currency: string;
  reference: string;
  counterpart: string;
  raw: { message?: string; credit?: boolean };
  status: BankTransaction["status"];
  imported_at: string;
};

const fromRow = (r: Row): BankTransaction => ({
  id: r.id,
  source: r.source,
  externalId: r.external_id,
  bookedOn: r.booked_on,
  amountOre: Number(r.amount_ore),
  currency: r.currency,
  credit: r.raw?.credit ?? Number(r.amount_ore) > 0,
  reference: r.reference,
  message: r.raw?.message ?? "",
  counterpart: r.counterpart,
  status: r.status,
  importedAt: r.imported_at,
});

const g = globalThis as unknown as { __binaafyBank?: Row[] };
const demo = () => (g.__binaafyBank ??= []);

export async function listBankTransactions(status?: BankTransaction["status"]): Promise<BankTransaction[]> {
  if (isDemo()) return demo().filter((r) => !status || r.status === status).map(fromRow).sort((a, b) => b.bookedOn.localeCompare(a.bookedOn));
  const supabase = await getDb();
  let q = supabase.from("bank_transactions").select("*").order("booked_on", { ascending: false }).limit(1000);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(`Kunde inte hämta banktransaktioner: ${error.message}`);
  return (data as Row[]).map(fromRow);
}

/** Read a camt.054 file into bank_transactions. Already imported ids are skipped. */
export async function importBankFile(xml: string, actor: Actor): Promise<{ imported: number; skipped: number; account: string | null }> {
  void actor;
  const file = parseCamt054(xml);
  const credits = file.transactions.filter((t) => t.credit);
  if (isDemo()) {
    let imported = 0;
    for (const t of credits) {
      if (demo().some((r) => r.external_id === t.externalId)) continue;
      demo().push({ id: crypto.randomUUID(), source: "camt054", external_id: t.externalId, booked_on: t.bookedOn, amount_ore: t.amountOre, currency: t.currency, reference: t.reference, counterpart: t.counterpart, raw: { message: t.message, credit: t.credit }, status: "unmatched", imported_at: new Date().toISOString() });
      imported++;
    }
    return { imported, skipped: credits.length - imported, account: file.account };
  }
  const supabase = await getDb();
  const rows = credits.map((t) => ({ source: "camt054", external_id: t.externalId, booked_on: t.bookedOn, amount_ore: t.amountOre, currency: t.currency, reference: t.reference, counterpart: t.counterpart, raw: { message: t.message, credit: t.credit } }));
  const { data, error } = await supabase.from("bank_transactions").upsert(rows, { onConflict: "org_id,source,external_id", ignoreDuplicates: true }).select("id");
  if (error) throw new Error(`Kunde inte läsa in filen: ${error.message}`);
  return { imported: data?.length ?? 0, skipped: credits.length - (data?.length ?? 0), account: file.account };
}

export type Suggestion = { tx: BankTransaction; match: TransactionMatch | null; invoice?: OpenInvoice };

/** Unmatched transactions with the match the rules propose. */
export async function suggestMatches(): Promise<Suggestion[]> {
  const [txs, invoices] = await Promise.all([listBankTransactions("unmatched"), listInvoices({ tab: "open" })]);
  const open: OpenInvoice[] = invoices.filter(isOpen).map((inv) => ({ id: inv.id, number: inv.number ?? "", ocr: inv.ocr, remainingOre: inv.payableOre - inv.paidOre, buyerName: inv.document.buyer.name, dueOn: inv.dueOn }));
  return matchAll(txs, open).map(({ tx, match }) => ({ tx: tx as BankTransaction, match, invoice: match ? open.find((o) => o.id === match.invoiceId) : undefined }));
}

/** Confirm a match: register the payment on the invoice and mark the transaction. */
export async function registerMatchedPayment(txId: string, invoiceId: string, actor: Actor): Promise<void> {
  const tx = (await listBankTransactions()).find((t) => t.id === txId);
  if (!tx) throw new Error("Transaktionen finns inte.");
  if (tx.status !== "unmatched") throw new Error("Transaktionen är redan hanterad.");
  await registerPayment(invoiceId, { amountOre: tx.amountOre, method: "bankgiro", paidOn: tx.bookedOn || todayIso(), reference: tx.reference || tx.externalId, note: tx.counterpart }, actor);
  if (isDemo()) {
    const r = demo().find((x) => x.id === txId);
    if (r) r.status = "matched";
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("mark_bank_transaction", { p_tx: txId, p_status: "matched", p_payment: null });
  if (error) throw new Error(`Betalningen är registrerad men transaktionen kunde inte markeras: ${error.message}`);
}

export async function ignoreTransaction(txId: string): Promise<void> {
  if (isDemo()) {
    const r = demo().find((x) => x.id === txId);
    if (r) r.status = "ignored";
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("mark_bank_transaction", { p_tx: txId, p_status: "ignored", p_payment: null });
  if (error) throw new Error(`Kunde inte markera transaktionen: ${error.message}`);
}
