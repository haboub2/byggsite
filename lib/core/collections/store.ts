import "server-only";
import { Resend } from "resend";
import { getDb } from "../db";
import { isDemo } from "../../leads";
import { site } from "../../placeholder";
import { createZip } from "../../zip";
import { todayIso } from "../../quotes/schema";
import { getQuoteProfile } from "../../quotes/profile-store";
import { getOrgSettings } from "../org/settings-store";
import { chartFromSettings, reminderSettingsFrom } from "../org/settings";
import { readOrgId } from "../org/current";
import { formatOre } from "../money";
import { daysBetween, lateInterestPercentAt, referenceRateAt } from "../rules";
import { paymentReference } from "../documents/invoice";
import { postReminder } from "../ledger/posting";
import { makeEvent, type Actor } from "../events";
import { demoJournalEntries, getInvoice, invoiceLabel, listInvoiceEvents, listInvoicePayments, listInvoices, type InvoiceRecord } from "../invoices/store";
import { documentRecipients, recipientsText, type Recipients } from "../invoices/recipients";
import { openInvoiceBuyerPersonalNumber, PersonalNumberAccessError } from "../rot/store";
import { formatPersonalNumber, maskPersonalNumber } from "../rot/pnr";
import { invoiceFileName } from "../../pdf/invoice-file-name";
import type { AmountLine, Creditor, Debtor, InvoiceFacts, LetterProps } from "../../pdf/CollectionPdf";
import {
  collectionBlocker,
  collectionClaim,
  collectionCsv,
  collectionFileStem,
  demandPlan,
  isOpenCase,
  type CollectionStatus,
  type DemandPlan,
  type ReminderRecord,
} from "./collections";
import { demoCollectionCases, type CollectionCaseRow } from "./demo";

// The PDF renderer loads on first use, not with every page that imports this module.
const renderInvoicePdf: typeof import("../../pdf/render-invoice").renderInvoicePdf = async (...args) => (await import("../../pdf/render-invoice")).renderInvoicePdf(...args);
const renderCollectionLetterPdf: typeof import("../../pdf/render-collection").renderCollectionLetterPdf = async (...args) =>
  (await import("../../pdf/render-collection")).renderCollectionLetterPdf(...args);
const renderCollectionSummaryPdf: typeof import("../../pdf/render-collection").renderCollectionSummaryPdf = async (...args) =>
  (await import("../../pdf/render-collection")).renderCollectionSummaryPdf(...args);

/**
 * Inkasso (0031): the inkassokrav the creditor sends itself, and the cases
 * an invoice is handed to an agency in. State changes go through the
 * database functions (register_collection_demand, open_collection_case,
 * update_collection_case) so each is one transaction; demo mode replays the
 * same rules in memory. The package for the agency (invoice, reminders,
 * demand, summary and CSV in a zip) is built on request with the interest
 * up to the day of download.
 */

export type CollectionCase = {
  id: string;
  invoiceId: string;
  reference: string;
  status: CollectionStatus;
  agency: string;
  externalRef: string;
  capitalOre: number;
  interestOre: number;
  feesOre: number;
  interestTo: string;
  note: string;
  sentAt: string | null;
  closedAt: string | null;
  createdBy: string | null;
  createdAt: string;
};

const fromRow = (r: CollectionCaseRow): CollectionCase => ({
  id: r.id,
  invoiceId: r.invoice_id,
  reference: r.reference,
  status: r.status,
  agency: r.agency,
  externalRef: r.external_ref,
  capitalOre: Number(r.capital_ore),
  interestOre: Number(r.interest_ore),
  feesOre: Number(r.fees_ore),
  interestTo: r.interest_to,
  note: r.note,
  sentAt: r.sent_at,
  closedAt: r.closed_at,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

/* ---------- demo ---------- */

type DemoInvoiceRow = {
  id: string;
  number: string | null;
  reminders: number;
  reminded_at: string | null;
  collection_case_id?: string | null;
  collection_demanded_on?: string | null;
  collection_demand_pay_by?: string | null;
  updated_at: string;
};
const demoInvoices = () => (globalThis as unknown as { __binaafyInvoices?: { invoices: DemoInvoiceRow[]; events: unknown[] } }).__binaafyInvoices;
function demoEvent(invoiceId: string, data: Record<string, string | number | null>, actor: Actor) {
  demoInvoices()?.events.push({ id: crypto.randomUUID(), ...makeEvent({ orgId: "demo", aggregateType: "invoice", aggregateId: invoiceId, type: "invoice.collection", data, actor }) });
}

/* ---------- reads ---------- */

export async function listCases(filter: { open?: boolean; invoiceId?: string } = {}): Promise<CollectionCase[]> {
  let rows: CollectionCaseRow[];
  if (isDemo()) rows = [...demoCollectionCases()];
  else {
    const supabase = await getDb();
    const org = await readOrgId();
    let q = supabase.from("collection_cases").select("*");
    if (org) q = q.eq("org_id", org);
    if (filter.invoiceId) q = q.eq("invoice_id", filter.invoiceId);
    if (filter.open) q = q.in("status", ["prepared", "sent"]);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(`Kunde inte hämta inkassoärenden: ${error.message}`);
    rows = (data ?? []) as CollectionCaseRow[];
  }
  return rows
    .filter((r) => !filter.invoiceId || r.invoice_id === filter.invoiceId)
    .filter((r) => !filter.open || isOpenCase(r.status))
    .map(fromRow)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getCase(id: string): Promise<CollectionCase | null> {
  if (isDemo()) {
    const r = demoCollectionCases().find((x) => x.id === id);
    return r ? fromRow(r) : null;
  }
  const supabase = await getDb();
  const org = await readOrgId();
  let q = supabase.from("collection_cases").select("*").eq("id", id);
  if (org) q = q.eq("org_id", org);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`Kunde inte hämta ärendet: ${error.message}`);
  return data ? fromRow(data as CollectionCaseRow) : null;
}

/** The invoice's reminders and its inkassokrav, oldest first, from the reminders register. */
export async function listInvoiceReminders(inv: InvoiceRecord): Promise<ReminderRecord[]> {
  if (isDemo()) {
    // The demo keeps no reminder rows; its events carry the same facts.
    const events = await listInvoiceEvents(inv.id);
    return events
      .filter((e) => e.type === "invoice.reminded" || (e.type === "invoice.collection" && e.data.action === "demand"))
      .map((e) => ({
        kind: e.type === "invoice.reminded" ? ("reminder" as const) : ("demand" as const),
        level: typeof e.data.level === "number" ? e.data.level : 0,
        feeOre: typeof e.data.fee === "number" ? e.data.fee : 0,
        interestOre: typeof e.data.interest === "number" ? e.data.interest : 0,
        sentAt: e.at,
        sentTo: typeof e.data.to === "string" ? e.data.to : "",
        payBy: typeof e.data.payBy === "string" ? e.data.payBy : null,
      }))
      .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("reminders").select("level, kind, fee_ore, interest_ore, sent_to, sent_at, pay_by").eq("invoice_id", inv.id).order("sent_at");
  if (error) throw new Error(`Kunde inte hämta påminnelserna: ${error.message}`);
  type R = { level: number; kind: "reminder" | "demand"; fee_ore: number; interest_ore: number; sent_to: string; sent_at: string; pay_by: string | null };
  return ((data ?? []) as R[]).map((r) => ({ kind: r.kind, level: r.level, feeOre: Number(r.fee_ore), interestOre: Number(r.interest_ore), sentAt: r.sent_at, sentTo: r.sent_to, payBy: r.pay_by }));
}

/** Earlier reminders' fees and interest, still owed on top of the capital. */
function earlierCharges(reminders: ReminderRecord[]): { feesOre: number; interestOre: number } {
  return { feesOre: reminders.reduce((s, r) => s + r.feeOre, 0), interestOre: reminders.reduce((s, r) => s + r.interestOre, 0) };
}

/* ---------- the parties on the letters ---------- */

async function creditorOf(inv: InvoiceRecord): Promise<Creditor> {
  const [settings, profile] = await Promise.all([getOrgSettings(inv.orgId || undefined).catch(() => null), getQuoteProfile(inv.orgId || undefined).catch(() => null)]);
  const s = inv.document.seller;
  return {
    name: s.name || settings?.company.legalName || site.brand,
    orgNr: s.orgNr,
    vatNr: s.vatNr,
    street: s.street,
    postalCode: s.postalCode,
    city: s.city,
    email: settings?.company.email || s.email,
    phone: settings?.company.phone || s.phone,
    signer: settings?.company.signer || "",
    logo: profile?.logo ?? null,
  };
}

/**
 * The debtor as the letters and the CSV name them. A business by its org
 * nr; a private person by the ROT buyer's personal number when the invoice
 * has one, masked unless `fullPersonalNumber` (owner/admin, for the CSV).
 */
async function debtorOf(inv: InvoiceRecord, today: string, fullPersonalNumber = false): Promise<Debtor> {
  const b = inv.document.buyer;
  let id = b.type === "privat" ? "" : b.orgNr;
  const rotBuyers = inv.document.se.rot?.buyers ?? [];
  if (b.type === "privat" && rotBuyers.length) {
    const index = Math.max(0, rotBuyers.findIndex((x) => x.name.trim().toLowerCase() === b.name.trim().toLowerCase()));
    id = maskPersonalNumber(rotBuyers[index].personalNumber, today);
    if (fullPersonalNumber) {
      try {
        const pnr = await openInvoiceBuyerPersonalNumber(inv.id, index);
        if (pnr) id = formatPersonalNumber(pnr);
      } catch (err) {
        if (!(err instanceof PersonalNumberAccessError)) throw err;
      }
    }
  }
  return { name: b.name, type: b.type, id, street: b.street, postalCode: b.postalCode, city: b.city, email: b.email, phone: b.phone, reference: b.reference };
}

function claimDescription(inv: InvoiceRecord): string {
  const d = inv.document;
  if (d.title.trim()) return d.title.trim();
  const lines = d.lines.map((l) => l.description.trim()).filter(Boolean);
  return lines.slice(0, 3).join(", ") + (lines.length > 3 ? " m.m." : "") || `faktura ${inv.number}`;
}

function invoiceFacts(inv: InvoiceRecord): InvoiceFacts {
  const d = inv.document;
  const ref = paymentReference(d);
  return {
    number: inv.number ?? "",
    issueDate: inv.issuedOn ?? d.issueDate,
    dueDate: inv.dueOn ?? d.dueDate ?? "",
    description: claimDescription(inv),
    payableOre: inv.payableOre,
    bankgiro: d.paymentMeans.bankgiro,
    plusgiro: d.paymentMeans.plusgiro,
    referenceLabel: ref.label,
    referenceValue: ref.value,
    currency: d.currency,
  };
}

const kr = (ore: number) => formatOre(ore, { decimals: 0, currency: true });
const krExact = (ore: number) => formatOre(ore, { currency: true });

function demandLines(inv: InvoiceRecord, plan: DemandPlan, today: string): AmountLine[] {
  return [
    { label: "Kapital", detail: `Obetalt på faktura ${inv.number}`, ore: plan.remainingOre },
    ...(plan.earlierFeesOre ? [{ label: "Påminnelseavgifter", detail: "Enligt tidigare påminnelser", ore: plan.earlierFeesOre }] : []),
    ...(plan.earlierInterestOre ? [{ label: "Dröjsmålsränta enligt tidigare påminnelser", ore: plan.earlierInterestOre }] : []),
    ...(plan.interestOre
      ? [{ label: `Dröjsmålsränta ${plan.interestFrom} – ${today}`, detail: `${String(plan.interestPercent).replace(".", ",")} % på ${krExact(plan.remainingOre)} i ${daysBetween(plan.interestFrom, today)} dagar`, ore: plan.interestOre }]
      : []),
    { label: "Inkassoavgift", detail: "Lag (1981:739) om ersättning för inkassokostnader m.m.", ore: plan.feeOre },
  ];
}

/* ---------- inkassokrav ---------- */

/** What an inkassokrav sent today would say, for the dialog and the preview. */
export async function planDemand(inv: InvoiceRecord, payBy: string, today = todayIso()): Promise<DemandPlan> {
  const settings = reminderSettingsFrom(await getOrgSettings());
  return demandPlan(inv, today, { payBy, settings, earlier: earlierCharges(await listInvoiceReminders(inv)) });
}

async function demandLetterProps(inv: InvoiceRecord, plan: DemandPlan, sentOn: string, sentTo?: string): Promise<LetterProps> {
  const ref = referenceRateAt(sentOn);
  return {
    kind: "demand",
    creditor: await creditorOf(inv),
    debtor: await debtorOf(inv, sentOn),
    invoice: invoiceFacts(inv),
    sentOn,
    level: inv.reminders + 1,
    lines: demandLines(inv, plan, sentOn),
    totalOre: plan.totalOre,
    payBy: plan.payBy,
    daysOverdue: plan.daysOverdue,
    interest: { percent: plan.interestPercent, referencePercent: ref.percent },
    sentTo,
  };
}

/**
 * The inkassokrav as PDF: the one that was sent (rebuilt from the register
 * with the amounts it booked), or, before one is sent, a preview of one sent
 * today with `payBy`.
 */
export async function renderDemandPdf(inv: InvoiceRecord, options: { payBy?: string; today?: string } = {}): Promise<Buffer> {
  const reminders = await listInvoiceReminders(inv);
  const sent = reminders.find((r) => r.kind === "demand");
  if (sent) return renderCollectionLetterPdf(await sentLetterProps(inv, reminders, sent));
  const today = options.today ?? todayIso();
  const plan = await planDemand(inv, options.payBy ?? "", today);
  return renderCollectionLetterPdf(await demandLetterProps(inv, plan, today));
}

/** A sent reminder or demand, rebuilt from the register: what was unpaid that day, its fee and interest. */
async function sentLetterProps(inv: InvoiceRecord, all: ReminderRecord[], r: ReminderRecord): Promise<LetterProps> {
  const sentOn = r.sentAt.slice(0, 10);
  const payments = await listInvoicePayments(inv.id);
  const remaining = inv.payableOre - payments.filter((p) => p.paidOn <= sentOn).reduce((s, p) => s + p.amountOre, 0);
  const earlier = all.filter((x) => x.sentAt < r.sentAt);
  const creditor = await creditorOf(inv);
  const copy = `Kopia ur påminnelseregistret, utskriven ${todayIso()}`;
  if (r.kind === "demand") {
    const e = earlierCharges(earlier);
    const plan: DemandPlan = {
      remainingOre: remaining,
      feeOre: r.feeOre,
      interestOre: r.interestOre,
      interestFrom: earlier.length ? earlier[earlier.length - 1].sentAt.slice(0, 10) : (inv.dueOn ?? sentOn),
      interestPercent: lateInterestPercentAt(sentOn),
      earlierFeesOre: e.feesOre,
      earlierInterestOre: e.interestOre,
      totalOre: remaining + e.feesOre + e.interestOre + r.feeOre + r.interestOre,
      payBy: r.payBy ?? "",
      daysOverdue: inv.dueOn ? Math.max(0, daysBetween(inv.dueOn, sentOn)) : 0,
    };
    return { ...(await demandLetterProps(inv, plan, sentOn, r.sentTo === "manuellt" ? undefined : r.sentTo)), copy };
  }
  const lines: AmountLine[] = [
    { label: "Kvar på fakturan", ore: remaining },
    ...(r.feeOre ? [{ label: "Påminnelseavgift", ore: r.feeOre }] : []),
    ...(r.interestOre ? [{ label: "Dröjsmålsränta", ore: r.interestOre }] : []),
  ];
  return {
    kind: "reminder",
    creditor,
    debtor: await debtorOf(inv, sentOn),
    invoice: invoiceFacts(inv),
    sentOn,
    level: r.level,
    lines,
    totalOre: lines.reduce((s, l) => s + l.ore, 0),
    payBy: null,
    daysOverdue: inv.dueOn ? Math.max(0, daysBetween(inv.dueOn, sentOn)) : 0,
    interest: null,
    copy,
    sentTo: r.sentTo === "manuellt" ? undefined : r.sentTo,
  };
}

async function mailDemand(inv: InvoiceRecord, plan: DemandPlan, letter: Buffer): Promise<Recipients> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) throw new Error("Mejl är inte påslaget (RESEND_API_KEY och MAIL_FROM). Registrera inkassokravet och skicka PDF:en själv.");
  const recipients = documentRecipients(inv.document);
  if (!recipients.to.length) throw new Error("Kunden saknar e-postadress.");
  const settings = await getOrgSettings();
  const d = inv.document;
  const ref = paymentReference(d);
  const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const body = `Faktura ${inv.number} förföll ${inv.dueOn} och är fortfarande obetald${inv.reminders ? " trots påminnelse" : ""}. Bifogat finns vårt inkassokrav. Betala ${kr(plan.totalOre)} senast ${plan.payBy}, eller kontakta oss senast samma dag om du anser att kravet är felaktigt. Betalar du inte och har du inte invänt inom tiden lämnar vi fordran till ett inkassobolag eller ansöker om betalningsföreläggande hos Kronofogdemyndigheten.`;
  const { error } = await new Resend(key).emails.send({
    from,
    to: recipients.to,
    ...(recipients.cc.length ? { cc: recipients.cc } : {}),
    replyTo: settings.company.email || undefined,
    subject: `Inkassokrav: faktura ${inv.number} från ${d.seller.name || site.brand}`,
    html: `
      <div style="font-family:sans-serif;font-size:14px;color:#14161a;line-height:1.6">
        <p><strong>Inkassokrav</strong></p>
        <p>${esc(body)}</p>
        <table style="margin:16px 0;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:3px 16px 3px 0;color:#6b7280">Att betala</td><td><strong>${esc(kr(plan.totalOre))}</strong></td></tr>
          <tr><td style="padding:3px 16px 3px 0;color:#6b7280">Senast</td><td>${esc(plan.payBy)}</td></tr>
          ${d.paymentMeans.bankgiro ? `<tr><td style="padding:3px 16px 3px 0;color:#6b7280">Bankgiro</td><td>${esc(d.paymentMeans.bankgiro)}</td></tr>` : ""}
          <tr><td style="padding:3px 16px 3px 0;color:#6b7280">${esc(ref.label)}</td><td>${esc(ref.value)}</td></tr>
        </table>
        <p>Vänliga hälsningar,<br>${esc(settings.company.signer || settings.company.legalName)}<br>${esc(d.seller.name || site.brand)}${settings.company.phone ? ` · ${esc(settings.company.phone)}` : ""}</p>
      </div>
    `,
    attachments: [
      { filename: `Inkassokrav-${inv.number}.pdf`, content: letter },
      { filename: invoiceFileName(inv), content: await renderInvoicePdf(inv, { swishQr: false }) },
    ],
  });
  if (error) throw new Error(`Inkassokravet kunde inte mejlas: ${error.message}`);
  return recipients;
}

/** Send (when `mail`) and record the inkassokrav: 180 kr and interest booked like a reminder (3591/8313). */
export async function sendDemand(invoiceId: string, actor: Actor, options: { mail: boolean; payBy: string; today?: string }): Promise<{ plan: DemandPlan; sentTo: string }> {
  const today = options.today ?? todayIso();
  const inv = await getInvoice(invoiceId);
  if (!inv) throw new Error("Fakturan finns inte.");
  const plan = await planDemand(inv, options.payBy, today);
  const letter = await renderCollectionLetterPdf(await demandLetterProps(inv, plan, today));
  const recipients = options.mail ? await mailDemand(inv, plan, letter) : null;
  const sentTo = recipients ? recipientsText(recipients) : "manuellt";
  const posting = postReminder(
    { reminderId: crypto.randomUUID(), fee: plan.feeOre, interest: plan.interestOre, date: today, text: `Inkassokrav ${invoiceLabel(inv).toLowerCase()} ${inv.document.buyer.name}`, dimensions: { projectId: inv.projectId, customerId: inv.customerId } },
    chartFromSettings(await getOrgSettings())
  );

  if (isDemo()) {
    const row = demoInvoices()?.invoices.find((x) => x.id === invoiceId);
    if (row) {
      const now = new Date().toISOString();
      Object.assign(row, { reminders: row.reminders + 1, reminded_at: now, collection_demanded_on: today, collection_demand_pay_by: plan.payBy, updated_at: now });
    }
    demoJournalEntries().push({ id: crypto.randomUUID(), number: `${today.slice(0, 4)}-i`, ...posting });
    demoEvent(invoiceId, { action: "demand", number: inv.number, level: inv.reminders + 1, fee: plan.feeOre, interest: plan.interestOre, payBy: plan.payBy, to: sentTo }, actor);
    return { plan, sentTo };
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("register_collection_demand", {
    p_invoice: invoiceId,
    p_fee: plan.feeOre,
    p_interest: plan.interestOre,
    p_pay_by: plan.payBy,
    p_sent_to: sentTo,
    p_posting: posting,
    p_actor: actor,
    ...(recipients ? { p_recipients: recipients } : {}),
  });
  if (error) throw new Error(`${options.mail ? "Inkassokravet gick iväg men kunde inte registreras" : "Kunde inte registrera inkassokravet"}: ${error.message}`);
  return { plan, sentTo };
}

/* ---------- cases ---------- */

/** The claim as of `asOf`: capital, interest period by period, fees. */
export async function claimFor(inv: InvoiceRecord, asOf = todayIso()) {
  const [payments, reminders] = await Promise.all([listInvoicePayments(inv.id), listInvoiceReminders(inv)]);
  const claim = collectionClaim({
    payableOre: inv.payableOre,
    paidOre: inv.paidOre,
    dueOn: inv.dueOn ?? asOf,
    payments: payments.map((p) => ({ paidOn: p.paidOn, amountOre: p.amountOre })),
    reminders,
    asOf,
  });
  return { claim, payments, reminders };
}

/** Lämna till inkasso: a case with the claim as of today. */
export async function openCase(invoiceId: string, actor: Actor, input: { agency?: string; note?: string } = {}): Promise<{ id: string; reference: string }> {
  const today = todayIso();
  const inv = await getInvoice(invoiceId);
  if (!inv) throw new Error("Fakturan finns inte.");
  const blocked = collectionBlocker(inv, today, reminderSettingsFrom(await getOrgSettings()));
  if (blocked) throw new Error(blocked);
  const agency = (input.agency ?? "").trim().slice(0, 120);
  const note = (input.note ?? "").trim().slice(0, 1000);
  const { claim } = await claimFor(inv, today);
  const fees = claim.reminderFeesOre + claim.demandFeeOre;

  if (isDemo()) {
    const row = demoInvoices()?.invoices.find((x) => x.id === invoiceId);
    const cases = demoCollectionCases();
    const reference = `${inv.number}-${cases.filter((c) => c.invoice_id === invoiceId).length + 1}`;
    const now = new Date().toISOString();
    const c: CollectionCaseRow = {
      id: crypto.randomUUID(),
      org_id: "demo",
      invoice_id: invoiceId,
      reference,
      status: "prepared",
      agency,
      external_ref: "",
      capital_ore: claim.capitalOre,
      interest_ore: claim.interest.totalOre,
      fees_ore: fees,
      interest_to: today,
      note,
      sent_at: null,
      closed_at: null,
      created_by: actor.name,
      created_at: now,
      updated_at: now,
    };
    cases.push(c);
    if (row) Object.assign(row, { collection_case_id: c.id, updated_at: now });
    demoEvent(invoiceId, { action: "prepared", number: inv.number, case: c.id, reference, capital: claim.capitalOre, interest: claim.interest.totalOre, fees, agency }, actor);
    return { id: c.id, reference };
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("open_collection_case", { p_invoice: invoiceId, p_capital: claim.capitalOre, p_interest: claim.interest.totalOre, p_fees: fees, p_agency: agency, p_note: note, p_actor: actor });
  if (error) throw new Error(`Kunde inte lämna fakturan till inkasso: ${error.message}`);
  return data as { id: string; reference: string };
}

/** Skickat till inkassobolaget (or change the agency and its case number on a sent case), or avslutat with a reason. */
export async function updateCase(caseId: string, action: "sent" | "closed", input: { agency?: string; externalRef?: string; note?: string }, actor: Actor): Promise<void> {
  const agency = (input.agency ?? "").trim();
  const externalRef = (input.externalRef ?? "").trim();
  const note = (input.note ?? "").trim();
  if (action === "sent" && !agency) throw new Error("Ange vilket inkassobolag ärendet lämnades till.");
  if (action === "closed" && !note) throw new Error("Ange varför ärendet avslutas.");
  if (isDemo()) {
    const c = demoCollectionCases().find((x) => x.id === caseId);
    if (!c) throw new Error("Ärendet finns inte.");
    if (!isOpenCase(c.status)) throw new Error(`Ärende ${c.reference} är avslutat.`);
    const now = new Date().toISOString();
    if (action === "sent") Object.assign(c, { status: "sent", agency, external_ref: externalRef, sent_at: c.sent_at ?? now, updated_at: now });
    else {
      Object.assign(c, { status: "closed", closed_at: now, note: [c.note, note].filter(Boolean).join("\n"), updated_at: now });
      const row = demoInvoices()?.invoices.find((x) => x.id === c.invoice_id);
      if (row && row.collection_case_id === c.id) Object.assign(row, { collection_case_id: null, updated_at: now });
    }
    const inv = demoInvoices()?.invoices.find((x) => x.id === c.invoice_id);
    demoEvent(c.invoice_id, { action, number: inv?.number ?? null, case: c.id, reference: c.reference, agency: action === "sent" ? agency : c.agency, externalRef: action === "sent" ? externalRef : c.external_ref, reason: action === "closed" ? note : "" }, actor);
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("update_collection_case", { p_case: caseId, p_action: action, p_agency: agency, p_external_ref: externalRef, p_note: note, p_actor: actor });
  if (error) throw new Error(`Kunde inte ändra ärendet: ${error.message}`);
}

/**
 * The package for the agency: the invoice, a copy of each reminder and the
 * inkassokrav, the summary with interest to `asOf`, and the CSV row. The
 * personal number is masked in the PDFs and in full in the CSV only when
 * `fullPersonalNumber` (owner/admin).
 */
export async function collectionPackage(caseId: string, options: { fullPersonalNumber: boolean; asOf?: string }): Promise<{ fileName: string; zip: Buffer }> {
  const asOf = options.asOf ?? todayIso();
  const c = await getCase(caseId);
  if (!c) throw new Error("Ärendet finns inte.");
  const inv = await getInvoice(c.invoiceId);
  if (!inv) throw new Error("Fakturan finns inte.");
  const { claim, payments, reminders } = await claimFor(inv, asOf);
  const [creditor, debtor, csvDebtor] = await Promise.all([creditorOf(inv), debtorOf(inv, asOf), debtorOf(inv, asOf, options.fullPersonalNumber)]);
  const facts = invoiceFacts(inv);
  const stem = collectionFileStem(c.reference, inv.document.buyer.name);
  const date = new Date();

  const files: { name: string; data: Uint8Array }[] = [{ name: invoiceFileName(inv), data: await renderInvoicePdf(inv, { swishQr: false }) }];
  for (const r of reminders) {
    files.push({ name: r.kind === "demand" ? `Inkassokrav-${inv.number}.pdf` : `Paminnelse-${r.level}-${inv.number}.pdf`, data: await renderCollectionLetterPdf(await sentLetterProps(inv, reminders, r)) });
  }
  const csvName = `${stem}.csv`;
  const summaryName = `${stem}-sammanstallning.pdf`;
  const summary = await renderCollectionSummaryPdf({
    reference: c.reference,
    asOf,
    creditor,
    debtor,
    invoice: facts,
    capitalOre: claim.capitalOre,
    periods: claim.interest.periods,
    interestOre: claim.interest.totalOre,
    invoicedInterestOre: claim.invoicedInterestOre,
    reminderFeesOre: claim.reminderFeesOre,
    demandFeeOre: claim.demandFeeOre,
    totalOre: claim.totalOre,
    percentToday: claim.interest.percentToday,
    payments: payments.map((p) => ({ paidOn: p.paidOn, amountOre: p.amountOre, method: p.method })),
    reminders: reminders.map((r) => ({ label: r.kind === "demand" ? "Inkassokrav" : `Påminnelse ${r.level}`, sentOn: r.sentAt.slice(0, 10), sentTo: r.sentTo, feeOre: r.feeOre, interestOre: r.interestOre, payBy: r.payBy })),
    files: [...files.map((f) => f.name), csvName],
    agency: c.agency,
    note: c.note,
  });
  files.push({ name: summaryName, data: summary });
  const csv = collectionCsv([
    {
      reference: c.reference,
      debtor: { ...csvDebtor, countryCode: inv.document.buyer.countryCode },
      invoice: { number: facts.number, issueDate: facts.issueDate, dueDate: facts.dueDate, ocr: facts.referenceValue, bankgiro: facts.bankgiro, currency: facts.currency, description: facts.description },
      claim,
    },
  ]);
  files.push({ name: csvName, data: new TextEncoder().encode(csv) });
  return { fileName: `${stem}.zip`, zip: createZip(files.map((f) => ({ ...f, date }))) };
}

/** Days since the case was handed over (sent, or prepared), for the list. */
export function caseAgeDays(c: Pick<CollectionCase, "sentAt" | "createdAt">, today = todayIso()): number {
  return Math.max(0, daysBetween((c.sentAt ?? c.createdAt).slice(0, 10), today));
}

/** Every case with its invoice, newest first, for the Inkasso tab. */
export async function listCasesWithInvoices(): Promise<{ case: CollectionCase; invoice: InvoiceRecord }[]> {
  const [cases, invoices] = await Promise.all([listCases(), listInvoices()]);
  const byId = new Map(invoices.map((i) => [i.id, i]));
  return cases.flatMap((c) => {
    const invoice = byId.get(c.invoiceId);
    return invoice ? [{ case: c, invoice }] : [];
  });
}
