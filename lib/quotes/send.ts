import "server-only";
import { Resend } from "resend";
import { site } from "../placeholder";
import { getContent } from "../content/store";
import { renderQuotePdf, quoteFileName } from "../pdf/render";
import { quoteTotals, kr, validUntil, formatDate } from "./math";
import type { Quote } from "./schema";

const esc = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * E-mail the quote to the customer with the PDF attached. Needs Resend and a
 * verified sending domain (MAIL_FROM); throws a readable message otherwise.
 */
export async function sendQuoteMail(quote: Quote, message: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key) throw new Error("Resend är inte kopplat (RESEND_API_KEY saknas). Ladda ner PDF:en och mejla den själv så länge.");
  if (!from) throw new Error("Avsändaradressen är inte verifierad (MAIL_FROM saknas). Ladda ner PDF:en och mejla den själv så länge.");
  const to = quote.data.customer.email;
  if (!to) throw new Error("Kunden saknar e-postadress.");

  const { company, quote: settings } = await getContent();
  const t = quoteTotals(quote.data);
  const d = quote.data;
  const pdf = await renderQuotePdf(quote);
  const firstName = d.customer.name.split(" ")[0];
  const signer = settings.signerName || company.legalName;
  const side = d.division === "bygg" ? "Bygg" : "Software";

  const body = message.trim()
    ? message
    : `Hej ${firstName},\n\nTack för förfrågan. Bifogat hittar du vår offert på ${d.title.toLowerCase()}. ${t.rot ? "ROT-avdraget är redan medräknat i summan att betala. " : ""}Offerten gäller till ${formatDate(validUntil(d.date, d.validDays))}.\n\nHör av dig om något är oklart, så går vi igenom det tillsammans.`;

  await new Resend(key).emails.send({
    from,
    to,
    replyTo: company.email,
    subject: `Offert ${quote.number} från ${site.brand}: ${d.title}`,
    html: `
      <div style="font-family:sans-serif;font-size:14px;color:#14161a;line-height:1.6">
        <p style="white-space:pre-wrap">${esc(body)}</p>
        <table style="margin:16px 0;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:3px 16px 3px 0;color:#6b7280">Offert</td><td>${quote.number}</td></tr>
          <tr><td style="padding:3px 16px 3px 0;color:#6b7280">${t.rot ? "Att betala efter ROT" : "Att betala"}</td><td><strong>${esc(kr(t.pay))}</strong></td></tr>
          <tr><td style="padding:3px 16px 3px 0;color:#6b7280">Gäller till</td><td>${esc(formatDate(validUntil(d.date, d.validDays)))}</td></tr>
        </table>
        <p>Vänliga hälsningar,<br>${esc(signer)}<br>${esc(site.brand)} ${side} · ${esc(company.phoneDisplay)}</p>
      </div>
    `,
    attachments: [{ filename: quoteFileName(quote), content: pdf }],
  });
}
