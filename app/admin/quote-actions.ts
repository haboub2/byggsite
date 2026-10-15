"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/admin";
import { getContent } from "@/lib/content/store";
import { getLead } from "@/lib/leads";
import { services } from "@/lib/placeholder";
import { QUOTE_STATUSES, quoteSchema, newItemId, todayIso, type QuoteData, type QuoteStatus } from "@/lib/quotes/schema";
import { builtInTemplates, quoteFromTemplate } from "@/lib/quotes/templates";
import {
  createQuote,
  getQuote,
  getSavedTemplate,
  removeQuote,
  removeTemplate,
  saveTemplate,
  setQuoteStatus,
  updateQuote,
} from "@/lib/quotes/store";
import { sendQuoteMail } from "@/lib/quotes/send";
import type { ContentActionState } from "./content-actions";

const LIST = "/admin/offerter";

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path.join(".");
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}

/** New quote from a template (built-in key or "saved:<id>"), optionally for a lead. */
export async function createQuoteFromTemplate(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) redirect("/admin/login");

  const key = String(formData.get("template") ?? "");
  const leadId = String(formData.get("lead") ?? "") || null;
  const { quote: settings } = await getContent();
  const today = todayIso();

  let data: QuoteData | null = null;
  if (key.startsWith("saved:")) {
    const saved = await getSavedTemplate(key.slice(6));
    if (saved) {
      data = { ...saved.data, items: saved.data.items.map((i) => ({ ...i, id: newItemId() })), date: today, leadId: null };
    }
  } else {
    const t = builtInTemplates.find((x) => x.key === key);
    if (t) data = quoteFromTemplate(t, settings, today);
  }
  if (!data) redirect(`${LIST}/ny?fel=mall`);

  if (leadId) {
    const lead = await getLead(leadId);
    if (lead) {
      const isBusiness = lead.division === "01" || Boolean(lead.details?.Företag);
      data = {
        ...data,
        leadId: lead.id,
        customer: {
          ...data.customer,
          type: isBusiness ? "foretag" : "privat",
          name: lead.name ?? "",
          company: lead.details?.Företag ?? "",
          email: lead.email ?? "",
          phone: lead.phone ?? "",
        },
        title: data.title || services.find((s) => s.title === lead.service)?.title || lead.service || "",
      };
    }
  }

  const id = await createQuote(data, check.email);
  revalidatePath(LIST);
  redirect(`${LIST}/${id}`);
}

/** Save the whole quote (the editor posts it as JSON). */
export async function saveQuote(_prev: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet. Logga in igen." };
  const id = String(formData.get("id") ?? "");

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Formuläret kunde inte läsas. Ladda om sidan och försök igen." };
  }
  const parsed = quoteSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Några fält behöver rättas innan det går att spara.", fieldErrors: fieldErrors(parsed.error.issues) };
  }
  try {
    await updateQuote(id, parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte spara." };
  }
  revalidatePath(LIST, "layout");
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function changeQuoteStatus(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !QUOTE_STATUSES.includes(status as QuoteStatus)) return;
  await setQuoteStatus(id, status as QuoteStatus);
  revalidatePath(LIST, "layout");
}

/** A copy as a new draft, dated today. */
export async function duplicateQuote(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  const source = await getQuote(String(formData.get("id") ?? ""));
  if (!source) return;
  const id = await createQuote(
    { ...source.data, date: todayIso(), items: source.data.items.map((i) => ({ ...i, id: newItemId() })) },
    check.email
  );
  revalidatePath(LIST);
  redirect(`${LIST}/${id}?kopia=1`);
}

export async function deleteQuote(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  const id = String(formData.get("id") ?? "");
  if (id) await removeQuote(id);
  revalidatePath(LIST, "layout");
  redirect(LIST);
}

export type QuoteToolState = { ok?: boolean; error?: string; message?: string };

/** Keep the current quote as a reusable template (rows, texts and terms; not the customer). */
export async function saveQuoteAsTemplate(_prev: QuoteToolState, formData: FormData): Promise<QuoteToolState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet." };
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!name) return { error: "Ge mallen ett namn." };
  const q = await getQuote(String(formData.get("id") ?? ""));
  if (!q) return { error: "Offerten finns inte." };
  try {
    await saveTemplate(name, {
      ...q.data,
      customer: { type: q.data.customer.type, name: "", company: "", orgNr: "", email: "", phone: "", street: "", postalCode: "", city: "", reference: "" },
      rotPersons: [],
      leadId: null,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte spara mallen." };
  }
  revalidatePath(`${LIST}/ny`);
  return { ok: true, message: `Mallen ”${name}” är sparad. Den finns under Ny offert.` };
}

export async function deleteSavedTemplate(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  const id = String(formData.get("id") ?? "");
  if (id) await removeTemplate(id);
  revalidatePath(`${LIST}/ny`);
}

/** E-mail the PDF to the customer and mark the quote as sent. */
export async function sendQuote(_prev: QuoteToolState, formData: FormData): Promise<QuoteToolState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet." };
  const q = await getQuote(String(formData.get("id") ?? ""));
  if (!q) return { error: "Offerten finns inte." };
  try {
    await sendQuoteMail(q, String(formData.get("message") ?? "").slice(0, 4000));
    await setQuoteStatus(q.id, "sent");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte skicka." };
  }
  revalidatePath(LIST, "layout");
  return { ok: true, message: `Skickad till ${q.data.customer.email}.` };
}
