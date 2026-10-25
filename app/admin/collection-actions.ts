"use server";

import { revalidatePath } from "next/cache";
import { checkAdmin } from "@/lib/admin";
import type { Actor } from "@/lib/core/events";
import { formatOre } from "@/lib/core/money";
import { openCase, sendDemand, updateCase } from "@/lib/core/collections/store";
import type { InvoiceToolState } from "./invoice-actions";

const actorOf = (email: string | null): Actor => (email ? { kind: "user", id: email, name: email } : { kind: "system", name: "admin" });
const kr = (ore: number) => formatOre(ore, { decimals: 0, currency: true });

function refresh() {
  revalidatePath("/admin/fakturor", "layout");
  revalidatePath("/admin/ekonomi");
}

/** Inkassokrav: mail it with the PDF, or record one sent some other way. 180 kr and interest are booked. */
export async function sendDemandAction(_prev: InvoiceToolState, formData: FormData): Promise<InvoiceToolState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet." };
  const id = String(formData.get("id") ?? "");
  const payBy = String(formData.get("payBy") ?? "");
  const mail = String(formData.get("mode") ?? "mail") === "mail";
  try {
    const { plan, sentTo } = await sendDemand(id, actorOf(check.email), { mail, payBy });
    refresh();
    return { ok: true, message: `Inkassokravet är ${mail ? `skickat till ${sentTo}` : "registrerat"}: ${kr(plan.totalOre)} att betala senast ${plan.payBy}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte skicka inkassokravet." };
  }
}

/** Lämna till inkasso: opens the case; the package is downloaded from the invoice page or the Inkasso tab. */
export async function openCaseAction(_prev: InvoiceToolState, formData: FormData): Promise<InvoiceToolState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet." };
  const id = String(formData.get("id") ?? "");
  try {
    const { reference } = await openCase(id, actorOf(check.email), { agency: String(formData.get("agency") ?? ""), note: String(formData.get("note") ?? "") });
    refresh();
    return { ok: true, message: `Ärende ${reference} är skapat. Ladda ner underlaget och lämna det till inkassobolaget.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte lämna fakturan till inkasso." };
  }
}

/** Skickat till inkassobolaget, or avsluta ärendet with a reason. */
export async function updateCaseAction(_prev: InvoiceToolState, formData: FormData): Promise<InvoiceToolState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet." };
  const caseId = String(formData.get("case") ?? "");
  const action = String(formData.get("action") ?? "") === "closed" ? "closed" : "sent";
  try {
    await updateCase(caseId, action, { agency: String(formData.get("agency") ?? ""), externalRef: String(formData.get("externalRef") ?? ""), note: String(formData.get("note") ?? "") }, actorOf(check.email));
    refresh();
    return { ok: true, message: action === "sent" ? "Ärendet är markerat som skickat till inkassobolaget." : "Ärendet är avslutat och fakturan är inte längre hos inkasso." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte ändra ärendet." };
  }
}
