"use server";

import { revalidatePath } from "next/cache";
import { checkAdmin } from "@/lib/admin";
import type { Actor } from "@/lib/core/events";
import { formatOre } from "@/lib/core/money";
import { sendReminder } from "@/lib/core/reminders/store";
import type { InvoiceToolState } from "./invoice-actions";

const actorOf = (email: string | null): Actor => (email ? { kind: "user", id: email, name: email } : { kind: "system", name: "admin" });

/** Send (or just record) a reminder with fee and interest per the rules. */
export async function sendReminderAction(_prev: InvoiceToolState, formData: FormData): Promise<InvoiceToolState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet." };
  const id = String(formData.get("id") ?? "");
  const mail = String(formData.get("mode") ?? "mail") === "mail";
  try {
    const { plan, sentTo } = await sendReminder(id, actorOf(check.email), { mail });
    revalidatePath("/admin/fakturor", "layout");
    revalidatePath("/admin/ekonomi");
    const extra = [plan.feeOre ? `avgift ${formatOre(plan.feeOre, { decimals: 0, currency: true })}` : "", plan.interestOre ? `ränta ${formatOre(plan.interestOre, { decimals: 0, currency: true })}` : ""].filter(Boolean).join(", ");
    return { ok: true, message: `Påminnelse ${plan.level} ${mail ? `skickad till ${sentTo}` : "registrerad"}${extra ? ` (${extra})` : ""}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte skicka påminnelsen." };
  }
}
