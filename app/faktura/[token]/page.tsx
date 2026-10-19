import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatOre } from "@/lib/core/money";
import { LINE_KIND_LABEL } from "@/lib/core/documents/invoice";
import { getInvoiceByToken } from "@/lib/core/invoices/public";
import { INVOICE_STATUS_LABEL, invoiceLabel, isOpen, isOverdue } from "@/lib/core/invoices/store";
import { customerSummary, invoiceTotals } from "@/lib/core/invoices/totals";
import { isSwishNumber } from "@/lib/core/payments/swish";
import { todayIso } from "@/lib/quotes/schema";

export const metadata: Metadata = { title: "Faktura", robots: { index: false, follow: false } };

const kr = (ore: number) => formatOre(ore, { decimals: 0, currency: true });
const sek = (ore: number) => formatOre(ore);

/**
 * The public invoice page, reached from the link in the mail. No login:
 * the token is the key. Shows what to pay and how, with the PDF and a
 * Swish QR when the seller has a Swish number. Never shows personal numbers.
 */
export default async function PublicInvoice({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await getInvoiceByToken(token);
  if (!inv) notFound();
  const d = inv.document;
  const today = todayIso();
  const totals = invoiceTotals(d);
  const sum = customerSummary(d, totals);
  const openNow = isOpen(inv);
  const overdue = isOverdue(inv, today);
  const remaining = inv.payableOre - inv.paidOre;
  const swish = d.paymentMeans.swish && isSwishNumber(d.paymentMeans.swish);

  return (
    <main className="pub-wrap">
      <div className="pub-card">
        <header className="pub-head">
          <div>
            <span className="eyebrow">{d.seller.name}</span>
            <h1>{invoiceLabel(inv)}</h1>
            <p className="pub-sub">
              {d.title}
              {d.buyer.name ? ` · ${d.buyer.name}` : ""}
            </p>
          </div>
          <span className="inv-status" data-status={overdue ? "overdue" : inv.status}>
            {overdue ? "Förfallen" : INVOICE_STATUS_LABEL[inv.status]}
          </span>
        </header>

        {openNow ? (
          <section className="pub-pay">
            <div>
              <span className="eyebrow">Att betala senast {inv.dueOn}</span>
              <strong className="pub-amount">{kr(remaining)}</strong>
              <dl className="pub-means">
                {d.paymentMeans.bankgiro && (
                  <div>
                    <dt>Bankgiro</dt>
                    <dd>{d.paymentMeans.bankgiro}</dd>
                  </div>
                )}
                {d.paymentMeans.plusgiro && (
                  <div>
                    <dt>Plusgiro</dt>
                    <dd>{d.paymentMeans.plusgiro}</dd>
                  </div>
                )}
                {swish && (
                  <div>
                    <dt>Swish</dt>
                    <dd>{d.paymentMeans.swish}</dd>
                  </div>
                )}
                <div>
                  <dt>OCR / meddelande</dt>
                  <dd>{inv.ocr}</dd>
                </div>
              </dl>
            </div>
            {swish && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/faktura/${token}/swish.png`} alt={`Swish-QR: ${kr(remaining)} till ${d.paymentMeans.swish} med meddelande ${inv.ocr}`} width={160} height={160} className="pub-qr" />
            )}
          </section>
        ) : (
          <p className="pub-paid">{inv.kind === "credit" ? "Kreditfaktura." : `Betald${inv.paidAt ? ` ${inv.paidAt.slice(0, 10)}` : ""}. Tack!`}</p>
        )}

        <table className="inv-table pub-table">
          <thead>
            <tr>
              <th>Beskrivning</th>
              <th style={{ textAlign: "right" }}>Belopp</th>
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l) => {
              const t = totals.lines[l.id];
              return (
                <tr key={l.id}>
                  <td>
                    {l.description}
                    <span className="inv-muted"> · {LINE_KIND_LABEL[l.kind]}</span>
                  </td>
                  <td style={{ textAlign: "right" }}>{sek(sum.inclVat ? t.gross : t.net)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <dl className="qsum" style={{ marginTop: 8, maxWidth: "none" }}>
          <div>
            <dt>{sum.inclVat ? "Summa inkl. moms" : "Summa exkl. moms"}</dt>
            <dd>{sek(sum.subtotal)}</dd>
          </div>
          {totals.vatBreakdown
            .filter((r) => r.vat !== 0)
            .map((r) => (
              <div key={r.rate}>
                <dt>{sum.inclVat ? `varav moms ${r.rate} %` : `Moms ${r.rate} %`}</dt>
                <dd>{sek(r.vat)}</dd>
              </div>
            ))}
          {sum.rot !== 0 && (
            <div>
              <dt>ROT-avdrag</dt>
              <dd>{sek(-sum.rot)}</dd>
            </div>
          )}
          <div className="qsum-pay">
            <dt>{inv.kind === "credit" ? "Att återfå" : "Att betala"}</dt>
            <dd>{sek(Math.abs(sum.payable))} kr</dd>
          </div>
        </dl>

        <div className="lead-quick" style={{ marginTop: 18 }}>
          <a href={`/faktura/${token}/pdf`} className="btn btn-primary">
            Visa PDF
          </a>
          <a href={`/faktura/${token}/pdf?ladda-ner=1`} className="btn btn-ghost">
            Ladda ner
          </a>
        </div>
        <p className="efield-hint" style={{ marginTop: 18 }}>
          Fakturadatum {inv.issuedOn}
          {d.references.quoteNumber ? ` · enligt offert ${d.references.quoteNumber}` : ""}. Frågor: {d.seller.email || d.seller.phone}.
        </p>
      </div>
    </main>
  );
}
