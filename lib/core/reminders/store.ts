import "server-only";
import { Resend } from "resend";
import { getDb } from "../db";
import { isDemo } from "../../leads";
import { site } from "../../placeholder";
import { getOrgSettings } from "../org/settings-store";
import { chartFromSettings, reminderSettingsFrom } from "../org/settings";
import { renderInvoicePdf, invoiceFileName } from "../../pdf/render-invoice";
import { formatOre } from "../money";
import { postReminder } from "../ledger/posting";
import { makeEvent, type Actor } from "../events";
import { demoJournalEntries, getInvoice, invoiceLabel, listInvoices, type InvoiceRecord } from "../invoices/store";
import { todayIso } from "../../quotes/schema";
import { reminderDue, reminderText, type ReminderPlan, type ReminderSettings } from "./reminders";

/**
 * Sending and recording reminders. `listDueReminders` is what the cron and
 * the dashboard read; `sendReminder` mails (when mail is configured) and
 * records the reminder with its fee and interest as one transaction
 * (register_reminder in 0017). The settings (grace days, interval, fee to
 * private persons, automatic sending) come from the organisation's
 * org_settings; for the first organisation, until those are saved, from the
 * environment as before (REMINDERS_AUTO, REMINDERS_GRACE_DAYS …).
 */

export async function reminderSettings(): Promise<ReminderSettings & { auto: boolean }> {
  return reminderSettingsFrom(await getOrgSettings());
}

export type DueReminder = { invoice: InvoiceRecord; plan: ReminderPlan };

export async function listDueReminders(today = todayIso()): Promise<DueReminder[]> {
  const settings = await reminderSettings();
  const out: DueReminder[] = [];
  for (const invoice of await listInvoices({ tab: "overdue" })) {
    const plan = reminderDue(
      { payableOre: invoice.payableOre, paidOre: invoice.paidOre, dueOn: invoice.dueOn, issueDate: invoice.document.issueDate, reminders: invoice.reminders, remindedAt: invoice.remindedAt, customerType: invoice.document.buyer.type, status: invoice.status, kind: invoice.kind },
      today,
      settings
    );
    if (plan) out.push({ invoice, plan });
  }
  return out.sort((a, b) => b.plan.daysOverdue - a.plan.daysOverdue);
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function mailReminder(inv: InvoiceRecord, plan: ReminderPlan): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) throw new Error("Mejl är inte påslaget (RESEND_API_KEY och MAIL_FROM). Registrera påminnelsen ändå och skicka den själv.");
  const to = inv.document.buyer.email;
  if (!to) throw new Error("Kunden saknar e-postadress.");
  const settings = await getOrgSettings();
  const d = inv.document;
  const pdf = await renderInvoicePdf(inv);
  const total = plan.remainingOre + plan.feeOre + plan.interestOre;
  const kr = (ore: number) => formatOre(ore, { decimals: 0, currency: true });
  const firstName = d.buyer.type === "privat" ? d.buyer.name.split(" ")[0] : d.buyer.reference || d.buyer.name;
  const body = `Hej ${firstName},\n\nVi saknar betalning för faktura ${inv.number}${d.title ? ` (${d.title})` : ""} som förföll ${inv.dueOn}. ${reminderText(plan, inv.number ?? "", inv.dueOn ?? "")}\n\nHar du redan betalat de senaste dagarna kan du bortse från den här påminnelsen.`;
  await new Resend(key).emails.send({
    from,
    to,
    replyTo: settings.company.email || undefined,
    subject: `Påminnelse ${plan.level}: faktura ${inv.number} från ${d.seller.name || site.brand}`,
    html: `
      <div style="font-family:sans-serif;font-size:14px;color:#14161a;line-height:1.6">
        <p style="white-space:pre-wrap">${esc(body)}</p>
        <table style="margin:16px 0;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:3px 16px 3px 0;color:#6b7280">Kvar på fakturan</td><td>${esc(kr(plan.remainingOre))}</td></tr>
          ${plan.feeOre ? `<tr><td style="padding:3px 16px 3px 0;color:#6b7280">Påminnelseavgift</td><td>${esc(kr(plan.feeOre))}</td></tr>` : ""}
          ${plan.interestOre ? `<tr><td style="padding:3px 16px 3px 0;color:#6b7280">Dröjsmålsränta</td><td>${esc(kr(plan.interestOre))}</td></tr>` : ""}
          <tr><td style="padding:3px 16px 3px 0;color:#6b7280">Att betala</td><td><strong>${esc(kr(total))}</strong></td></tr>
          ${d.paymentMeans.bankgiro ? `<tr><td style="padding:3px 16px 3px 0;color:#6b7280">Bankgiro</td><td>${esc(d.paymentMeans.bankgiro)}</td></tr>` : ""}
          <tr><td style="padding:3px 16px 3px 0;color:#6b7280">OCR</td><td>${esc(inv.ocr ?? "")}</td></tr>
        </table>
        <p>Vänliga hälsningar,<br>${esc(settings.company.signer || settings.company.legalName)}<br>${esc(d.seller.name || site.brand)}${settings.company.phone ? ` · ${esc(settings.company.phone)}` : ""}</p>
      </div>
    `,
    attachments: [{ filename: invoiceFileName(inv), content: pdf }],
  });
  return to;
}

/** Send (when `mail`) and record one reminder. Returns what was recorded. */
export async function sendReminder(invoiceId: string, actor: Actor, options: { mail: boolean; today?: string } = { mail: true }): Promise<{ plan: ReminderPlan; sentTo: string }> {
  const today = options.today ?? todayIso();
  const inv = await getInvoice(invoiceId);
  if (!inv) throw new Error("Fakturan finns inte.");
  const plan = reminderDue(
    { payableOre: inv.payableOre, paidOre: inv.paidOre, dueOn: inv.dueOn, issueDate: inv.document.issueDate, reminders: inv.reminders, remindedAt: inv.remindedAt, customerType: inv.document.buyer.type, status: inv.status, kind: inv.kind },
    today,
    { ...(await reminderSettings()), graceDays: 0, daysBetween: 1 }
  );
  if (!plan) throw new Error(`${invoiceLabel(inv)} är inte förfallen eller påmindes nyss.`);
  const sentTo = options.mail ? await mailReminder(inv, plan) : "manuellt";
  const posting = postReminder({ reminderId: crypto.randomUUID(), fee: plan.feeOre, interest: plan.interestOre, date: today, text: `Påminnelse ${plan.level} ${invoiceLabel(inv).toLowerCase()} ${inv.document.buyer.name}`, dimensions: { projectId: inv.projectId, customerId: inv.customerId } }, chartFromSettings(await getOrgSettings()));

  if (isDemo()) {
    const g = globalThis as unknown as { __binaafyInvoices?: { invoices: { id: string; reminders: number; reminded_at: string | null; updated_at: string }[]; events: unknown[] } };
    const row = g.__binaafyInvoices?.invoices.find((x) => x.id === invoiceId);
    if (row) {
      row.reminders += 1;
      row.reminded_at = new Date().toISOString();
      row.updated_at = row.reminded_at;
    }
    if (plan.feeOre + plan.interestOre > 0) demoJournalEntries().push({ id: crypto.randomUUID(), number: `${today.slice(0, 4)}-p`, ...posting });
    g.__binaafyInvoices?.events.push({ id: crypto.randomUUID(), ...makeEvent({ orgId: "demo", aggregateType: "invoice", aggregateId: invoiceId, type: "invoice.reminded", data: { number: inv.number, level: plan.level, fee: plan.feeOre, interest: plan.interestOre, to: sentTo }, actor }) });
    return { plan, sentTo };
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("register_reminder", { p_invoice: invoiceId, p_fee: plan.feeOre, p_interest: plan.interestOre, p_sent_to: sentTo, p_posting: plan.feeOre + plan.interestOre > 0 ? posting : { text: "", lines: [] }, p_actor: actor });
  if (error) throw new Error(`Påminnelsen gick iväg men kunde inte registreras: ${error.message}`);
  return { plan, sentTo };
}
