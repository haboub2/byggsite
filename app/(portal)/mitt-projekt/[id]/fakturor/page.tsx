import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatOre } from "@/lib/core/money";
import { EVENT_LABEL, customerTimeline } from "@/lib/core/events";
import { INVOICE_STATUS_LABEL, invoiceLabel, isOpen, isOverdue, listInvoiceEvents, listInvoicesForPortal } from "@/lib/core/invoices/store";
import { formatDay } from "@/lib/portal/format";
import { getProjectBundle } from "@/lib/portal/store";
import { todayIso } from "@/lib/quotes/schema";

export const metadata: Metadata = { title: "Fakturor" };

const kr = (ore: number) => formatOre(ore, { decimals: 0, currency: true });

/** The customer's invoices for the project: what to pay, how, and what has happened. */
export default async function PortalInvoices({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getProjectBundle(id);
  if (!bundle) notFound();
  const invoices = await listInvoicesForPortal(id);
  const today = todayIso();
  const open = invoices.filter((inv) => isOpen(inv));
  const timelines = Object.fromEntries(await Promise.all(invoices.map(async (inv) => [inv.id, customerTimeline(await listInvoiceEvents(inv.id))] as const)));

  return (
    <div className="portal-stack">
      {open.length > 0 && (
        <p className="portal-alert">
          <strong>{open.length === 1 ? "En faktura väntar på betalning." : `${open.length} fakturor väntar på betalning.`}</strong> Betala med bankgiro eller Swish och ange OCR-numret, så matchas betalningen automatiskt.
        </p>
      )}

      {invoices.length === 0 ? (
        <section className="portal-card">
          <h2>Fakturor</h2>
          <p>Inga fakturor än. Enligt betalplanen kommer de i takt med att arbetet blir klart, och du ser dem här med belopp, förfallodatum och hur du betalar.</p>
        </section>
      ) : (
        invoices.map((inv) => {
          const d = inv.document;
          const overdue = isOverdue(inv, today);
          const remaining = inv.payableOre - inv.paidOre;
          const openNow = isOpen(inv);
          const credit = inv.kind === "credit";
          return (
            <section key={inv.id} className={`portal-card${openNow ? " portal-card--attention" : ""}`} id={`faktura-${inv.number}`}>
              <div className="portal-ata-head">
                <span className="portal-when">
                  {invoiceLabel(inv)}
                  {d.references.planStep ? ` · delfaktura ${d.references.planStep.step} av ${d.references.planStep.of}` : ""}
                </span>
                <span className="etag" data-status={overdue ? "declined" : inv.status === "paid" ? "approved" : "pending"}>
                  {overdue ? "Förfallen" : credit ? "Kreditfaktura" : INVOICE_STATUS_LABEL[inv.status]}
                </span>
              </div>
              <h3 style={{ fontSize: 26, letterSpacing: "-0.02em", marginTop: 4 }}>
                {credit ? "−" : ""}
                {kr(Math.abs(openNow ? remaining : inv.payableOre))}
              </h3>
              <p className="portal-ata-desc">
                {d.title}
                {inv.dueOn && openNow ? ` · förfaller ${formatDay(inv.dueOn)}` : inv.paidAt ? ` · betald ${formatDay(inv.paidAt)}` : ""}
              </p>

              {openNow && (
                <dl className="portal-ata-sums">
                  {d.paymentMeans.bankgiro && (
                    <div>
                      <dt>Bankgiro</dt>
                      <dd>{d.paymentMeans.bankgiro}</dd>
                    </div>
                  )}
                  {d.paymentMeans.swish && (
                    <div>
                      <dt>Swish</dt>
                      <dd>{d.paymentMeans.swish}</dd>
                    </div>
                  )}
                  <div>
                    <dt>OCR / meddelande</dt>
                    <dd>{inv.ocr}</dd>
                  </div>
                  <div>
                    <dt>Att betala senast {inv.dueOn}</dt>
                    <dd>{kr(remaining)}</dd>
                  </div>
                </dl>
              )}

              <dl className="portal-ata-sums">
                <div>
                  <dt>Arbete och material inkl. moms</dt>
                  <dd>{kr(inv.totalOre)}</dd>
                </div>
                {inv.rotOre !== 0 && (
                  <div>
                    <dt>ROT-avdrag</dt>
                    <dd>{kr(-inv.rotOre)}</dd>
                  </div>
                )}
                <div>
                  <dt>{credit ? "Att återfå" : "Du betalar"}</dt>
                  <dd>
                    <strong>{kr(Math.abs(inv.payableOre))}</strong>
                  </dd>
                </div>
              </dl>
              {inv.rotOre > 0 && !credit && <p className="portal-note">ROT-avdraget begär vi hos Skatteverket när du har betalat. Du behöver inte göra något.</p>}

              <div className="lead-quick" style={{ marginTop: 14 }}>
                <a href={`/mitt-projekt/fil?p=invoice:${inv.id}&projekt=${id}`} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ minHeight: 42 }}>
                  Visa PDF
                </a>
                <a href={`/mitt-projekt/fil?p=invoice:${inv.id}&projekt=${id}&ladda-ner=1`} className="link-quiet">
                  Ladda ner
                </a>
              </div>

              {timelines[inv.id]?.length > 0 && (
                <ol className="inv-timeline" style={{ marginTop: 14 }}>
                  {[...timelines[inv.id]].reverse().map((e, i) => (
                    <li key={i}>
                      <span>{EVENT_LABEL[e.type].text}</span>
                      <small>{formatDay(e.at)}</small>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
