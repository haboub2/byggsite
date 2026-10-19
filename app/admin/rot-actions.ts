"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/admin";
import type { Actor } from "@/lib/core/events";
import { parseKronor } from "@/lib/core/money";
import { ROT_CATEGORIES, type RotCategory } from "@/lib/core/rot/claim-xml";
import { createClaim, markClaimSent, registerClaimPayout, rejectClaim } from "@/lib/core/rot/store";

const LIST = "/admin/rot";
const actorOf = (email: string | null): Actor => (email ? { kind: "user", id: email, name: email } : { kind: "system", name: "admin" });
const back = (q: Record<string, string>) => `${LIST}?${new URLSearchParams(q)}`;

export async function createClaimAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) redirect("/admin/login");
  const ids = formData.getAll("invoice").map(String).filter(Boolean);
  const name = String(formData.get("name") ?? "").trim().slice(0, 16) || `ROT ${new Date().toISOString().slice(0, 10)}`;
  const category = String(formData.get("category") ?? "Bygg") as RotCategory;
  if (!ROT_CATEGORIES.includes(category)) redirect(back({ fel: "Okänd kategori." }));
  let id: string;
  try {
    id = await createClaim(name, ids, category, actorOf(check.email));
  } catch (err) {
    redirect(back({ fel: err instanceof Error ? err.message : "Kunde inte skapa begäran." }));
  }
  revalidatePath(LIST, "layout");
  revalidatePath("/admin/fakturor", "layout");
  redirect(back({ skapad: id }));
}

export async function markClaimSentAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  try {
    await markClaimSent(String(formData.get("claim") ?? ""), actorOf(check.email));
  } catch (err) {
    redirect(back({ fel: err instanceof Error ? err.message : "Kunde inte markera som skickad." }));
  }
  revalidatePath(LIST, "layout");
  revalidatePath("/admin/fakturor", "layout");
  redirect(back({ ok: "skickad" }));
}

export async function registerPayoutAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  const paidOn = String(formData.get("paidOn") ?? "");
  let amount: number;
  try {
    amount = parseKronor(String(formData.get("amount") ?? ""));
  } catch {
    redirect(back({ fel: "Ange utbetalt belopp i kronor." }));
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) redirect(back({ fel: "Ange utbetalningsdatum." }));
  try {
    await registerClaimPayout(String(formData.get("claim") ?? ""), amount, paidOn, actorOf(check.email));
  } catch (err) {
    redirect(back({ fel: err instanceof Error ? err.message : "Kunde inte registrera utbetalningen." }));
  }
  revalidatePath(LIST, "layout");
  revalidatePath("/admin/fakturor", "layout");
  redirect(back({ ok: "utbetald" }));
}

export async function rejectClaimAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  try {
    await rejectClaim(String(formData.get("claim") ?? ""), String(formData.get("note") ?? "").slice(0, 500), actorOf(check.email));
  } catch (err) {
    redirect(back({ fel: err instanceof Error ? err.message : "Kunde inte markera som avvisad." }));
  }
  revalidatePath(LIST, "layout");
  revalidatePath("/admin/fakturor", "layout");
  redirect(back({ ok: "avvisad" }));
}
