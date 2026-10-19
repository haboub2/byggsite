"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/admin";
import type { Actor } from "@/lib/core/events";
import { ignoreTransaction, importBankFile, registerMatchedPayment } from "@/lib/core/payments/store";

const PAGE = "/admin/fakturor/bank";
const actorOf = (email: string | null): Actor => (email ? { kind: "user", id: email, name: email } : { kind: "system", name: "admin" });
const back = (q: Record<string, string>) => `${PAGE}?${new URLSearchParams(q)}`;

function refresh() {
  revalidatePath(PAGE);
  revalidatePath("/admin/fakturor", "layout");
  revalidatePath("/admin/ekonomi");
}

/** Upload the bank's camt.054 file. */
export async function importBankFileAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) redirect("/admin/login");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) redirect(back({ fel: "Välj bankens camt.054-fil (XML)." }));
  if (file.size > 10 * 1024 * 1024) redirect(back({ fel: "Filen är större än 10 MB." }));
  let result: { imported: number; skipped: number };
  try {
    result = await importBankFile(await file.text(), actorOf(check.email));
  } catch (err) {
    redirect(back({ fel: err instanceof Error ? err.message : "Filen kunde inte läsas." }));
  }
  refresh();
  redirect(back({ ok: `${result.imported} inbetalningar inlästa${result.skipped ? `, ${result.skipped} fanns redan` : ""}.` }));
}

export async function registerMatchAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  const tx = String(formData.get("tx") ?? "");
  const invoice = String(formData.get("invoice") ?? "");
  if (!tx || !invoice) redirect(back({ fel: "Välj vilken faktura betalningen gäller." }));
  try {
    await registerMatchedPayment(tx, invoice, actorOf(check.email));
  } catch (err) {
    redirect(back({ fel: err instanceof Error ? err.message : "Kunde inte registrera betalningen." }));
  }
  refresh();
  redirect(back({ ok: "Betalningen är registrerad på fakturan." }));
}

export async function ignoreTransactionAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  await ignoreTransaction(String(formData.get("tx") ?? ""));
  refresh();
  redirect(PAGE);
}
