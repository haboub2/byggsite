"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/admin";
import { invoiceDocumentSchema, newInvoiceDocument, type InvoiceKind } from "@/lib/core/documents/invoice";
import { customerToBuyer } from "@/lib/core/customers/schema";
import { createCustomer, findSimilarCustomer, getCustomer } from "@/lib/core/customers/store";
import { customerFromBuyerLike } from "@/lib/core/customers/schema";
import { invoiceDocumentFromQuote } from "@/lib/core/invoices/from-quote";
import { applySellerDefaults, getSellerDefaults } from "@/lib/core/invoices/seller";
import {
  createCreditNote,
  createInvoice,
  deleteDraft,
  getInvoice,
  issueInvoice,
  IssueError,
  markSent,
  registerPayment,
  updateInvoiceDraft,
} from "@/lib/core/invoices/store";
import { sendInvoiceMail } from "@/lib/core/invoices/send";
import { parseKronor } from "@/lib/core/money";
import type { Actor } from "@/lib/core/events";
import type { PaymentMethod } from "@/lib/core/ledger/posting";
import { getQuote } from "@/lib/quotes/store";
import { todayIso } from "@/lib/quotes/schema";
import type { ContentActionState } from "./content-actions";

const LIST = "/admin/fakturor";

export type InvoiceToolState = { ok?: boolean; error?: string; message?: string; problems?: string[] };

function actorOf(email: string | null): Actor {
  return email ? { kind: "user", id: email, name: email } : { kind: "system", name: "admin" };
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path.join(".");
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}

/**
 * New draft: for a customer in the register, or from an accepted quote (the
 * quote's customer is matched to or created in the register).
 */
export async function createInvoiceAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) redirect("/admin/login");
  const quoteId = String(formData.get("offert") ?? "") || null;
  const customerId = String(formData.get("kund") ?? "") || null;
  const kind = (String(formData.get("kind") ?? "invoice") === "credit" ? "credit" : "invoice") as InvoiceKind;
  const { seller, paymentMeans, lateInterestText } = await getSellerDefaults();
  const today = todayIso();

  let id: string;
  if (quoteId) {
    const quote = await getQuote(quoteId);
    if (!quote) redirect(`${LIST}/ny?fel=offert`);
    const c = quote.data.customer;
    const input = customerFromBuyerLike({ ...c, type: c.type === "foretag" ? "foretag" : "privat" });
    const existing = customerId ? await getCustomer(customerId) : await findSimilarCustomer(input);
    const cid = existing?.id ?? (await createCustomer(input, check.email));
    const document = invoiceDocumentFromQuote({ quote, seller, paymentMeans, issueDate: today, customerId: cid, lateInterestText });
    id = await createInvoice({ document, quoteId: quote.id }, check.email);
  } else {
    if (!customerId) redirect(`${LIST}/ny?fel=kund`);
    const customer = await getCustomer(customerId);
    if (!customer) redirect(`${LIST}/ny?fel=kund`);
    const document = newInvoiceDocument({
      issueDate: today,
      seller,
      buyer: customerToBuyer(customer),
      paymentMeans: { ...paymentMeans, termsDays: customer.defaultTermsDays },
    });
    document.kind = kind;
    document.se.lateInterestText = lateInterestText;
    id = await createInvoice({ document }, check.email);
  }
  revalidatePath(LIST);
  redirect(`${LIST}/${id}`);
}

/** Save a draft (the editor posts the whole document as JSON). */
export async function saveInvoice(_prev: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet. Logga in igen." };
  const id = String(formData.get("id") ?? "");
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Formuläret kunde inte läsas. Ladda om sidan och försök igen." };
  }
  const parsed = invoiceDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Några fält behöver rättas innan det går att spara.", fieldErrors: fieldErrors(parsed.error.issues) };
  }
  try {
    await updateInvoiceDraft(id, parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte spara." };
  }
  revalidatePath(LIST, "layout");
  return { ok: true, savedAt: new Date().toISOString() };
}

/** Utfärda: number, frozen document, ledger entry. */
export async function issueInvoiceAction(_prev: InvoiceToolState, formData: FormData): Promise<InvoiceToolState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet." };
  const id = String(formData.get("id") ?? "");
  try {
    const defaults = await getSellerDefaults();
    const { number } = await issueInvoice(id, actorOf(check.email), (doc) => applySellerDefaults(doc, defaults));
    revalidatePath(LIST, "layout");
    return { ok: true, message: `Utfärdad som nummer ${number}. Fakturan är nu låst.` };
  } catch (err) {
    if (err instanceof IssueError) return { error: "Fakturan kan inte utfärdas än.", problems: err.problems };
    return { error: err instanceof Error ? err.message : "Kunde inte utfärda." };
  }
}

export async function sendInvoice(_prev: InvoiceToolState, formData: FormData): Promise<InvoiceToolState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet." };
  const inv = await getInvoice(String(formData.get("id") ?? ""));
  if (!inv) return { error: "Fakturan finns inte." };
  try {
    const to = await sendInvoiceMail(inv, String(formData.get("message") ?? "").slice(0, 4000));
    await markSent(inv.id, to, actorOf(check.email));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte skicka." };
  }
  revalidatePath(LIST, "layout");
  return { ok: true, message: `Skickad till ${inv.document.buyer.email}.` };
}

/** Mark as sent without mailing (handed over some other way). */
export async function markInvoiceSent(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  const id = String(formData.get("id") ?? "");
  await markSent(id, String(formData.get("to") ?? "manuellt"), actorOf(check.email));
  revalidatePath(LIST, "layout");
}

const METHODS: PaymentMethod[] = ["bankgiro", "swish", "card", "manual"];

export async function registerPaymentAction(_prev: InvoiceToolState, formData: FormData): Promise<InvoiceToolState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet." };
  const id = String(formData.get("id") ?? "");
  const method = String(formData.get("method") ?? "bankgiro") as PaymentMethod;
  if (!METHODS.includes(method)) return { error: "Okänt betalsätt." };
  const paidOn = String(formData.get("paidOn") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { error: "Ange betaldatum som ÅÅÅÅ-MM-DD." };
  let amountOre: number;
  try {
    amountOre = parseKronor(String(formData.get("amount") ?? ""));
  } catch {
    return { error: "Ange beloppet i kronor, t.ex. 68 000 eller 1 250,50." };
  }
  try {
    const result = await registerPayment(id, { amountOre, method, paidOn, reference: String(formData.get("reference") ?? "").slice(0, 80) }, actorOf(check.email));
    revalidatePath(LIST, "layout");
    return { ok: true, message: result.status === "paid" ? "Betalningen är registrerad. Fakturan är fullt betald." : "Betalningen är registrerad." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte registrera betalningen." };
  }
}

/** A credit note draft for an issued invoice; opens in the editor. */
export async function creditInvoiceAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  const id = String(formData.get("id") ?? "");
  const creditId = await createCreditNote(id, check.email);
  revalidatePath(LIST, "layout");
  redirect(`${LIST}/${creditId}?kredit=1`);
}

export async function deleteInvoiceDraft(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  const id = String(formData.get("id") ?? "");
  if (id) await deleteDraft(id);
  revalidatePath(LIST, "layout");
  redirect(LIST);
}
