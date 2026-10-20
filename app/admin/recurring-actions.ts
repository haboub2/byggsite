"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/admin";
import type { Actor } from "@/lib/core/events";
import { createRecurringFromInvoice, deleteRecurring, runDueRecurring, setRecurringActive } from "@/lib/core/invoices/recurring";
import { RECURRING_INTERVALS, type RecurringInterval } from "@/lib/core/invoices/recurring-schedule";
import { todayIso } from "@/lib/quotes/schema";

const PAGE = "/admin/fakturor/aterkommande";
const back = (q: Record<string, string>) => `${PAGE}?${new URLSearchParams(q)}`;
const actorOf = (email: string | null): Actor => (email ? { kind: "user", id: email, name: email } : { kind: "system", name: "admin" });

function refresh() {
  revalidatePath(PAGE);
  revalidatePath("/admin/fakturor", "layout");
  revalidatePath("/admin/ekonomi");
}

export async function createRecurringAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) redirect("/admin/login");
  const invoiceId = String(formData.get("invoice") ?? "");
  const interval = String(formData.get("interval") ?? "monthly") as RecurringInterval;
  const nextOn = String(formData.get("nextOn") ?? "");
  if (!RECURRING_INTERVALS.includes(interval)) redirect(back({ fel: "Okänt intervall." }));
  try {
    await createRecurringFromInvoice(invoiceId, {
      name: String(formData.get("name") ?? ""),
      interval,
      nextOn,
      autoIssue: formData.get("autoIssue") === "on",
    });
  } catch (err) {
    redirect(back({ fran: invoiceId, fel: err instanceof Error ? err.message : "Kunde inte spara." }));
  }
  refresh();
  redirect(back({ ok: "skapad" }));
}

export async function toggleRecurringAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  const active = formData.get("active") === "1";
  try {
    await setRecurringActive(String(formData.get("id") ?? ""), active);
  } catch (err) {
    redirect(back({ fel: err instanceof Error ? err.message : "Kunde inte spara." }));
  }
  refresh();
  redirect(back({ ok: active ? "aterupptagen" : "pausad" }));
}

export async function deleteRecurringAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  try {
    await deleteRecurring(String(formData.get("id") ?? ""));
  } catch (err) {
    redirect(back({ fel: err instanceof Error ? err.message : "Kunde inte ta bort." }));
  }
  refresh();
  redirect(back({ ok: "borttagen" }));
}

/** What the daily run does, now, as the signed-in admin. */
export async function runRecurringNowAction(): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) redirect("/admin/login");
  let result: Awaited<ReturnType<typeof runDueRecurring>>;
  try {
    result = await runDueRecurring(todayIso(), actorOf(check.email));
  } catch (err) {
    redirect(back({ fel: err instanceof Error ? err.message : "Körningen misslyckades." }));
  }
  refresh();
  if (result.failed.length) redirect(back({ fel: result.failed.map((f) => `${f.name}: ${f.error}`).join(" ") }));
  redirect(back({ ok: "korning", antal: String(result.created.length) }));
}
