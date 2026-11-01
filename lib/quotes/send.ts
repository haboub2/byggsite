import "server-only";
import { Resend } from "resend";
import { getQuoteProfile } from "./profile-store";
import { quoteTotals, kr, validUntil, formatDate, deductionLabel } from "./math";
import { WITHDRAWAL_DAYS, type Quote } from "./schema";

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

  // The quote's own organisation: seller, signer and reply address.
  const profile = await getQuoteProfile(quote.orgId);
  const { company, settings, brand } = profile;
  const t = quoteTotals(quote.data);
  const d = quote.data;
  // The PDF renderer loads here, not with every page whose actions can send a quote.
  const { renderQuotePdf, quoteFileName } = await import("../pdf/render");
  const pdf = await renderQuotePdf(quote, profile);
  const firstName = d.customer.name.split(" ")[0];
  const signer = settings.signerName || company.legalName;
  const side = d.division === "bygg" ? "Bygg" : "Software";

  const consumer = d.customer.type === "privat";
  const priceNote = d.priceType === "ungefarlig" ? "Priset är ungefärligt; slutpriset får överstiga det med högst 15 procent utöver tillägg ni godkänt. " : d.priceType === "lopande" ? "Arbetet utförs på löpande räkning; beloppet är en uppskattning. " : "";
  const body = message.trim()
    ? message
    : `Hej ${firstName},\n\nTack för förfrågan. Bifogat hittar du vår offert på ${d.title.toLowerCase()}. ${priceNote}${t.rot ? `${deductionLabel(t.deductionKind)}-avdraget är preliminärt och förutsätter att du har utrymme för det; priset före avdrag står i offerten. ` : ""}Offerten gäller till ${formatDate(validUntil(d.date, d.validDays))}.${consumer ? `\n\nSom privatperson har du ${WITHDRAWAL_DAYS} dagars ångerrätt från den dag du godkänner offerten. Hur du gör, och en ångerblankett, finns i offerten.` : ""}\n\nHör av dig om något är oklart, så går vi igenom det tillsammans.`;

  await new Resend(key).emails.send({
    from,
    to,
    replyTo: company.email || undefined,
    subject: `Offert ${quote.number} från ${brand}: ${d.title}`,
    html: `
      <div style="font-family:sans-serif;font-size:14px;color:#14161a;line-height:1.6">
        <p style="white-space:pre-wrap">${esc(body)}</p>
        <table style="margin:16px 0;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:3px 16px 3px 0;color:#6b7280">Offert</td><td>${quote.number}</td></tr>
          <tr><td style="padding:3px 16px 3px 0;color:#6b7280">${consumer ? "Pris inkl. moms" : "Totalt exkl. moms"}</td><td><strong>${esc(kr(consumer ? t.gross : t.net))}</strong></td></tr>
          ${t.rot ? `<tr><td style="padding:3px 16px 3px 0;color:#6b7280">Efter ${deductionLabel(t.deductionKind)}-avdrag, preliminärt</td><td>${esc(kr(t.pay))}</td></tr>` : ""}
          ${!consumer ? `<tr><td style="padding:3px 16px 3px 0;color:#6b7280">Att betala inkl. moms</td><td>${esc(kr(t.gross))}</td></tr>` : ""}
          <tr><td style="padding:3px 16px 3px 0;color:#6b7280">Gäller till</td><td>${esc(formatDate(validUntil(d.date, d.validDays)))}</td></tr>
        </table>
        <p>Vänliga hälsningar,<br>${esc(signer)}<br>${esc([`${brand} ${side}`, company.phoneDisplay].filter(Boolean).join(" · "))}</p>
      </div>
    `,
    attachments: [{ filename: quoteFileName(quote, brand), content: pdf }],
  });
}
