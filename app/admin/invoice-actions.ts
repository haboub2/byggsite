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
  deleteBlocker,
  deleteDraft,
  getInvoice,
  issueCorrection,
  issueInvoice,
  IssueError,
  markSent,
  refundDue,
  registerPayment,
  updateInvoiceDraft,
  voidInvoice,
} from "@/lib/core/invoices/store";
import { creditAndRedraft } from "@/lib/core/invoices/amend";
import { correctionEditsSchema } from "@/lib/core/invoices/correction";
import { sendInvoiceMail } from "@/lib/core/invoices/send";
import { invalidEmails, MAX_RECIPIENTS, parseEmailList, recipientsText } from "@/lib/core/invoices/recipients";
import { formatOre, parseKronor } from "@/lib/core/money";
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
  // "Fler mottagare för just den här fakturan": this send only, never saved on the customer.
  const extra = parseEmailList(String(formData.get("extra") ?? "").slice(0, 2000));
  const bad = invalidEmails(extra);
  if (bad.length) return { error: `${bad.join(", ")} är inte ${bad.length === 1 ? "en giltig e-postadress" : "giltiga e-postadresser"}.` };
  if (extra.length > MAX_RECIPIENTS) return { error: `Högst ${MAX_RECIPIENTS} extra mottagare.` };
  let sentTo: string;
  try {
    const recipients = await sendInvoiceMail(inv, String(formData.get("message") ?? "").slice(0, 4000), extra);
    await markSent(inv.id, recipients, actorOf(check.email));
    sentTo = recipientsText(recipients);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte skicka." };
  }
  revalidatePath(LIST, "layout");
  return { ok: true, message: `Skickad till ${sentTo}.` };
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

/**
 * Registrera återbetalning: pay back what the customer paid over the
 * invoice (after Rätta belopp moved a payment to a lower invoice). The
 * amount is the excess, worked out here; booked as a negative payment,
 * 1510 against the bank.
 */
export async function registerRefundAction(_prev: InvoiceToolState, formData: FormData): Promise<InvoiceToolState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet." };
  const id = String(formData.get("id") ?? "");
  const method = String(formData.get("method") ?? "bankgiro") as PaymentMethod;
  if (!METHODS.includes(method)) return { error: "Okänt betalsätt." };
  const paidOn = String(formData.get("paidOn") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { error: "Ange datum som ÅÅÅÅ-MM-DD." };
  const inv = await getInvoice(id);
  if (!inv) return { error: "Fakturan finns inte." };
  const excess = refundDue(inv);
  if (excess === 0) return { error: "Det finns inget att återbetala på fakturan." };
  try {
    await registerPayment(id, { amountOre: -excess, method, paidOn, reference: String(formData.get("reference") ?? "").slice(0, 80), note: "Återbetalning" }, actorOf(check.email));
    revalidatePath(LIST, "layout");
    return { ok: true, message: `Återbetalningen på ${formatOre(excess, { decimals: 0, currency: true })} är registrerad.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte registrera återbetalningen." };
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

/** Makulera: an issued, unsent invoice without payments. Reason required. */
export async function voidInvoiceAction(_prev: InvoiceToolState, formData: FormData): Promise<InvoiceToolState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet." };
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Skriv varför fakturan makuleras." };
  try {
    const { number, entryNumber } = await voidInvoice(id, reason.slice(0, 500), actorOf(check.email));
    revalidatePath(LIST, "layout");
    return { ok: true, message: `Faktura ${number} är makulerad. Bokföringen är vänd med verifikation ${entryNumber}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte makulera." };
  }
}

export type CorrectionState = InvoiceToolState & { fieldErrors?: Record<string, string> };

/** Rätta uppgifter: issue a change invoice with the edited details, then open it. */
export async function correctInvoiceAction(_prev: CorrectionState, formData: FormData): Promise<CorrectionState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet. Logga in igen." };
  const id = String(formData.get("id") ?? "");
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Formuläret kunde inte läsas. Ladda om sidan och försök igen." };
  }
  const parsed = correctionEditsSchema.safeParse(raw);
  if (!parsed.success) return { error: "Några fält behöver rättas.", fieldErrors: fieldErrors(parsed.error.issues) };
  let created: { id: string; number: string };
  try {
    created = await issueCorrection(id, parsed.data, actorOf(check.email));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte utfärda ändringsfakturan." };
  }
  revalidatePath(LIST, "layout");
  redirect(`${LIST}/${created.id}?rattad=1`);
}

/** Rätta belopp: credit in full (issued at once) and open a new draft with the same content. */
export async function correctAmountsAction(_prev: InvoiceToolState, formData: FormData): Promise<InvoiceToolState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet." };
  const id = String(formData.get("id") ?? "");
  let draftId: string;
  try {
    const defaults = await getSellerDefaults();
    ({ draftId } = await creditAndRedraft(id, actorOf(check.email), check.email, (doc) => applySellerDefaults(doc, defaults)));
  } catch (err) {
    if (err instanceof IssueError) return { error: "Kreditfakturan kunde inte utfärdas.", problems: err.problems };
    return { error: err instanceof Error ? err.message : "Kunde inte rätta beloppen." };
  }
  revalidatePath(LIST, "layout");
  redirect(`${LIST}/${draftId}?ersatter=1`);
}

export async function deleteInvoiceDraft(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  const id = String(formData.get("id") ?? "");
  // A draft that carries a moved payment is not deleted (deleteBlocker); the page explains why instead of offering it.
  if (id && (await deleteBlocker(id))) redirect(`${LIST}/${id}`);
  if (id) await deleteDraft(id);
  revalidatePath(LIST, "layout");
  redirect(LIST);
}
