import "server-only";
import { Resend } from "resend";
import { site } from "../../placeholder";
import { getOrgSettings } from "../org/settings-store";
import { renderInvoicePdf, invoiceFileName } from "../../pdf/render-invoice";
import { formatOre } from "../money";
import { invoiceTotals } from "./totals";
import { paymentReference } from "../documents/invoice";
import { invoiceLabel, type InvoiceRecord } from "./store";

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * E-mail the invoice to the customer with the PDF attached. Same
 * requirements as the quote mail: Resend and a verified sender (MAIL_FROM).
 * Returns the address it went to.
 */
export async function sendInvoiceMail(inv: InvoiceRecord, message: string): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key) throw new Error("Resend är inte kopplat (RESEND_API_KEY saknas). Ladda ner PDF:en och mejla den själv så länge.");
  if (!from) throw new Error("Avsändaradressen är inte verifierad (MAIL_FROM saknas). Ladda ner PDF:en och mejla den själv så länge.");
  if (inv.status === "draft") throw new Error("Utfärda fakturan innan den skickas.");
  if (inv.status === "void") throw new Error(`${invoiceLabel(inv)} är makulerad och skickas inte.`);
  const to = inv.document.buyer.email;
  if (!to) throw new Error("Kunden saknar e-postadress.");

  const settings = await getOrgSettings(inv.orgId || undefined);
  const d = inv.document;
  const t = invoiceTotals(d);
  const pdf = await renderInvoicePdf(inv);
  const firstName = d.buyer.type === "privat" ? d.buyer.name.split(" ")[0] : d.buyer.reference || d.buyer.name;
  const signer = settings.company.signer || settings.company.legalName;
  const brand = d.seller.name || site.brand;
  const label = invoiceLabel(inv);
  const isCredit = inv.kind === "credit";
  const isCorrection = inv.kind === "correction";
  const ref = paymentReference(d);
  const pay = `${formatOre(Math.abs(t.payable), { decimals: 0, currency: true })}`;

  const body = message.trim()
    ? message
    : isCorrection
      ? `Hej ${firstName},\n\nBifogat hittar du ändringsfaktura ${inv.number}. Den ersätter faktura ${d.references.precedingInvoiceNumber} och rättar uppgifter på den; beloppet är detsamma. Att betala: ${pay} senast ${d.dueDate}, om du inte redan har betalat. ${ref.instruction}\n\nHör av dig om något är oklart.`
    : isCredit
      ? `Hej ${firstName},\n\nBifogat hittar du kreditfaktura ${inv.number} som avser faktura ${d.references.precedingInvoiceNumber}. Beloppet ${pay} regleras mot fakturan eller återbetalas.\n\nHör av dig om något är oklart.`
      : `Hej ${firstName},\n\nBifogat hittar du faktura ${inv.number}${d.title ? ` för ${d.title.toLowerCase()}` : ""}. Att betala: ${pay} senast ${d.dueDate}${t.rot ? ", ROT-avdraget är redan avdraget" : ""}. ${ref.instruction}\n\nHör av dig om något är oklart.`;

  await new Resend(key).emails.send({
    from,
    to,
    replyTo: settings.company.email || undefined,
    subject: `${label} från ${brand}${d.title ? `: ${d.title}` : ""}`,
    html: `
      <div style="font-family:sans-serif;font-size:14px;color:#14161a;line-height:1.6">
        <p style="white-space:pre-wrap">${esc(body)}</p>
        <table style="margin:16px 0;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:3px 16px 3px 0;color:#6b7280">${esc(label.split(" ")[0])}</td><td>${esc(inv.number ?? "")}</td></tr>
          <tr><td style="padding:3px 16px 3px 0;color:#6b7280">${isCredit ? "Att återfå" : "Att betala"}</td><td><strong>${esc(pay)}</strong></td></tr>
          ${isCredit ? "" : `<tr><td style="padding:3px 16px 3px 0;color:#6b7280">Förfallodatum</td><td>${esc(d.dueDate)}</td></tr>`}
          ${isCredit || !d.paymentMeans.bankgiro ? "" : `<tr><td style="padding:3px 16px 3px 0;color:#6b7280">Bankgiro</td><td>${esc(d.paymentMeans.bankgiro)}</td></tr>`}
          ${isCredit ? "" : `<tr><td style="padding:3px 16px 3px 0;color:#6b7280">${ref.label}</td><td>${esc(ref.value)}</td></tr>`}
        </table>
        <p>Vänliga hälsningar,<br>${esc(signer)}<br>${esc(brand)}${settings.company.phone ? ` · ${esc(settings.company.phone)}` : ""}</p>
      </div>
    `,
    attachments: [{ filename: invoiceFileName(inv), content: pdf }],
  });
  return to;
}
