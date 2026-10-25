import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createHash } from "node:crypto";
import InvoiceEditor from "@/components/admin/invoices/InvoiceEditor";
import { CorrectAmountsForm, CreditInvoiceButton, DeleteDraft, IssueInvoiceForm, MarkSentForm, RegisterPaymentForm, RegisterRefundForm, SendInvoiceForm, SendReminderForm, VoidInvoiceForm } from "@/components/admin/invoices/InvoiceTools";
import { reminderDue, reminderInput, reminderText } from "@/lib/core/reminders/reminders";
import { reminderSettings } from "@/lib/core/reminders/store";
import { publicInvoiceUrl } from "@/lib/core/invoices/public";
import { formatDateTime } from "@/lib/admin-format";
import { formatOre } from "@/lib/core/money";
import { CUSTOMER_TYPE_LABEL, LINE_KIND_LABEL, paymentReference, validateForIssue } from "@/lib/core/documents/invoice";
import { amountDue, customerSummary, invoiceTotals } from "@/lib/core/invoices/totals";
import { EVENT_LABEL } from "@/lib/core/events";
import { documentRecipients, eventRecipientsText } from "@/lib/core/invoices/recipients";
import { INVOICE_STATUS_LABEL, correctionBlocker, deleteBlocker, getInvoice, invoiceLabel, isOpen, isOverdue, listInvoiceEvents, listInvoicePayments, listInvoices, refundDue, replacementOf } from "@/lib/core/invoices/store";
import { PAYMENT_METHOD_LABEL } from "@/lib/core/export/model";
import { amountCorrectionBlocker } from "@/lib/core/invoices/amend";
import { applySellerDefaults, getSellerDefaults } from "@/lib/core/invoices/seller";
import { todayIso } from "@/lib/quotes/schema";
import { requireRole } from "@/lib/admin";
import { maskPersonalNumber } from "@/lib/core/rot/pnr";
import { RevealPersonalNumber } from "@/components/admin/invoices/RevealPersonalNumber";
import { CaseControls, DemandForm, OpenCaseForm, type AmountRow } from "@/components/admin/invoices/CollectionTools";
import { COLLECTION_STATUS_LABEL, collectionBlocker, collectionEventText, defaultPayBy, demandBlocker, isOpenCase, minimumPayBy } from "@/lib/core/collections/collections";
import { claimFor, listCases, planDemand } from "@/lib/core/collections/store";
import { listSwishRequests } from "@/lib/core/payments/swish-store";
import { SWISH_STATUS_LABEL } from "@/lib/core/payments/swish-commerce";

const kr = (ore: number) => formatOre(ore, { decimals: 0, currency: true });
const sek = (ore: number) => formatOre(ore);

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kredit?: string; rattad?: string; ersatter?: string }> }) {
  const { id } = await params;
  const { kredit, rattad, ersatter } = await searchParams;
  const inv = await getInvoice(id);
  if (!inv) notFound();
  const isDraft = inv.status === "draft";
  const d = inv.document;
  const label = invoiceLabel(inv);
  const today = todayIso();
  const mailReady = Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
  // Owner/admin may open a ROT buyer's personal number; everyone else sees it masked.
  const canSeePnr = Boolean(d.se.rot) && (await requireRole("admin")).ok;

  if (isDraft) {
    const version = createHash("sha1").update(JSON.stringify(d)).digest("hex").slice(0, 12);
    // The gate checks the document as it will be frozen: with today's seller settings applied.
    const problems = validateForIssue({ ...applySellerDefaults(d, await getSellerDefaults()), number: null });
    const draftTotals = invoiceTotals(d);
    // Rätta belopp: the original this draft replaces, and the payment that moves here when it is issued.
    const replacing = inv.replacesInvoiceId ? await replacementOf(inv).catch(() => null) : null;
    const offset = replacing?.offset ? amountDue(draftTotals.payable, replacing.offset.amountOre) : null;
    const afterOffset = offset ? (offset.refund > 0 ? { label: "Att återbetala", value: kr(offset.refund) } : { label: "Kvar att betala", value: kr(offset.due) }) : null;
    return (
      <section className="sec sec--tight">
        <div className="container">
          <Link href="/admin/fakturor" className="link-quiet">
            ← Alla fakturor
          </Link>
          <div className="inbox-head" style={{ marginTop: 16 }}>
            <div>
              <span className="eyebrow">
                {label} · {CUSTOMER_TYPE_LABEL[d.buyer.type]}
                {d.references.quoteNumber ? ` · från offert ${d.references.quoteNumber}` : ""}
              </span>
              <h1 className="admin-h1">{d.title || (inv.kind === "credit" ? "Kreditfaktura" : "Faktura utan rubrik")}</h1>
            </div>
            <div className="lead-quick">
              <a href={`/admin/fakturor/${inv.id}/pdf`} target="_blank" rel="noopener" className="btn btn-ghost">
                Förhandsgranska PDF
              </a>
              {inv.kind === "invoice" && d.buyer.customerId && (
                <Link href={`/admin/fakturor/aterkommande?fran=${inv.id}#ny`} className="btn btn-ghost">
                  Gör återkommande
                </Link>
              )}
            </div>
          </div>
          {kredit && <p className="admin-flash">Kreditfakturan är skapad som utkast och speglar originalet. Ändra rader om bara en del ska krediteras, och utfärda sedan.</p>}
          {ersatter && (
            <p className="admin-flash">
              Originalet är krediterat i sin helhet och kreditfakturan är utfärdad. Det här är den nya fakturan som ersätter det, med samma kund, rader och villkor: rätta beloppen, spara och utfärda.
            </p>
          )}
          {replacing && (
            <p className="inv-banner" data-kind="correction">
              <strong>
                Ersätter <Link href={`/admin/fakturor/${replacing.original.id}`}>faktura {replacing.original.number}</Link>
              </strong>
              {replacing.offset
                ? `Kunden har betalat ${kr(replacing.offset.amountOre)} på faktura ${replacing.original.number}, som är krediterad med ${replacing.offset.creditNumber}. Betalningen kvittas mot den här fakturan när du utfärdar den och står på PDF:en som "Kvittat mot faktura ${replacing.original.number}".`
                : `Faktura ${replacing.original.number} är krediterad och obetald; den här fakturan ersätter den.`}
            </p>
          )}

          <div className="quote-layout">
            <InvoiceEditor key={version} id={inv.id} initial={d} />
            <aside className="lead-aside quote-aside">
              <div>
                <h2 className="lead-h2">Utfärda</h2>
                <IssueInvoiceForm
                  id={inv.id}
                  problems={problems}
                  isCredit={inv.kind === "credit"}
                  summary={{
                    buyer: d.buyer.name,
                    payableLabel: inv.kind === "credit" ? "Att återfå" : "Att betala",
                    payable: kr(Math.abs(draftTotals.payable)),
                    dueDate: inv.kind === "credit" ? null : d.dueDate,
                    rot: draftTotals.rot && draftTotals.rot.deduction !== 0 ? `${kr(Math.abs(draftTotals.rot.deduction))} begärs från Skatteverket` : null,
                    reverseCharge: d.se.reverseCharge,
                    lines: d.lines.length,
                    offset:
                      offset && afterOffset && replacing?.offset
                        ? { text: `${kr(offset.offset)} betalt på faktura ${replacing.offset.invoiceNumber}`, afterLabel: afterOffset.label, after: afterOffset.value }
                        : null,
                  }}
                />
              </div>
              <div>
                <h2 className="lead-h2">Att betala</h2>
                <p style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{kr(Math.abs(inv.payableOre))}</p>
                <p className="efield-hint">{inv.rotOre ? `varav ROT-avdrag ${kr(Math.abs(inv.rotOre))} som begärs från Skatteverket.` : "Enligt det sparade utkastet."}</p>
                {offset && afterOffset && (
                  <p className="efield-hint">
                    {kr(offset.offset)} kvittas från faktura {replacing?.offset?.invoiceNumber}. {afterOffset.label}: <strong>{afterOffset.value}</strong>.
                  </p>
                )}
              </div>
              <DeleteDraft id={inv.id} blocked={await deleteBlocker(inv.id)} />
            </aside>
          </div>
        </div>
      </section>
    );
  }

  const [events, payments, swishRequests] = await Promise.all([listInvoiceEvents(inv.id), listInvoicePayments(inv.id), listSwishRequests(inv.id)]);
  // The other end of a correction: the change invoice that replaced this one, or the original this one replaces.
  const [correction, original] = await Promise.all([
    inv.correctedBy ? getInvoice(inv.correctedBy) : null,
    inv.correctsInvoiceId ? getInvoice(inv.correctsInvoiceId) : null,
  ]);
  // Rätta belopp: the original this invoice replaces, or the invoice (or draft) that replaces this one.
  const [replaced, replacedBy] = await Promise.all([
    inv.replacesInvoiceId ? getInvoice(inv.replacesInvoiceId) : null,
    inv.status === "credited" ? listInvoices({ customerId: inv.customerId ?? undefined }).then((all) => all.find((x) => x.replacesInvoiceId === inv.id) ?? null) : null,
  ]);
  const isVoid = inv.status === "void";
  const canFix = inv.kind === "invoice" && !isVoid && inv.status !== "credited";
  const detailsBlocked = canFix ? correctionBlocker(inv) : null;
  const amountsBlocked = canFix ? await amountCorrectionBlocker(inv.id) : null;
  const canVoid = inv.kind === "invoice" && inv.status === "issued" && !inv.sentAt && inv.paidOre === 0 && !inv.correctedBy && inv.reminders === 0;
  const totals = invoiceTotals(d);
  const sum = customerSummary(d, totals);
  const overdue = isOverdue(inv, today);
  const remaining = inv.payableOre - inv.paidOre;
  const refund = refundDue(inv);
  const reminderConf = await reminderSettings();
  const plan = overdue
    ? reminderDue(reminderInput(inv), today, { ...reminderConf, graceDays: 0, daysBetween: 1 })
    : null;
  // Inkasso (0031): the inkassokrav and the case, for an unpaid invoice past its due date.
  const cases = inv.kind === "invoice" ? await listCases({ invoiceId: inv.id }) : [];
  const openCase = cases.find((c) => isOpenCase(c.status)) ?? null;
  const demandBlocked = overdue ? demandBlocker(inv, today, reminderConf) : null;
  const caseBlocked = overdue ? collectionBlocker(inv, today, reminderConf) : null;
  const demand = overdue && !demandBlocked ? await planDemand(inv, defaultPayBy(today), today) : null;
  const claim = overdue && !inv.collectionCaseId ? (await claimFor(inv, today)).claim : null;
  const demandRows: AmountRow[] = demand
    ? [
        { label: "Kapital", value: kr(demand.remainingOre) },
        ...(demand.earlierFeesOre ? [{ label: "Påminnelseavgifter", value: kr(demand.earlierFeesOre) }] : []),
        ...(demand.earlierInterestOre ? [{ label: "Ränta på påminnelserna", value: kr(demand.earlierInterestOre) }] : []),
        ...(demand.interestOre ? [{ label: "Dröjsmålsränta", detail: `${String(demand.interestPercent).replace(".", ",")} % från ${demand.interestFrom}`, value: kr(demand.interestOre) }] : []),
        { label: "Inkassoavgift", detail: "Lag (1981:739), även för privatpersoner", value: kr(demand.feeOre) },
      ]
    : [];
  const claimRows: AmountRow[] = claim
    ? [
        { label: "Kapital", value: kr(claim.capitalOre) },
        { label: "Dröjsmålsränta", detail: `Från ${claim.interest.from}, i dag ${String(claim.interest.percentToday).replace(".", ",")} %`, value: kr(claim.interest.totalOre) },
        ...(claim.reminderFeesOre ? [{ label: "Påminnelseavgifter", value: kr(claim.reminderFeesOre) }] : []),
        ...(claim.demandFeeOre ? [{ label: "Inkassoavgift", value: kr(claim.demandFeeOre) }] : []),
      ]
    : [];
  const publicUrl = publicInvoiceUrl(inv.publicToken);
  const sections = [...new Set(d.lines.map((l) => l.section.trim()))];
  const grouped = sections.some(Boolean);

  return (
    <section className="sec sec--tight">
      <div className="container">
        <Link href="/admin/fakturor" className="link-quiet">
          ← Alla fakturor
        </Link>
        <div className="inbox-head" style={{ marginTop: 16 }}>
          <div>
            <span className="eyebrow">
              {label} ·{" "}
              <span className="inv-status" data-status={inv.collectionCaseId ? "collection" : overdue ? "overdue" : inv.status}>
                {inv.collectionCaseId ? "Hos inkasso" : overdue ? "Förfallen" : INVOICE_STATUS_LABEL[inv.status]}
              </span>
              {inv.sentAt ? ` · skickad ${formatDateTime(inv.sentAt)}` : ""}
            </span>
            <h1 className="admin-h1">{d.title || label}</h1>
            <p className="admin-shown">
              {d.buyer.name} · {CUSTOMER_TYPE_LABEL[d.buyer.type]}
              {d.references.quoteNumber ? ` · enligt offert ${d.references.quoteNumber}` : ""}
              {inv.creditsInvoiceId && d.references.precedingInvoiceNumber ? ` · krediterar faktura ${d.references.precedingInvoiceNumber}` : ""}
              {inv.kind === "correction" && d.references.precedingInvoiceNumber ? ` · ersätter faktura ${d.references.precedingInvoiceNumber}` : ""}
            </p>
          </div>
          <div className="lead-quick">
            <a href={`/admin/fakturor/${inv.id}/pdf`} target="_blank" rel="noopener" className="btn btn-primary">
              Visa PDF
            </a>
            <a href={`/admin/fakturor/${inv.id}/pdf?ladda-ner=1`} className="btn btn-ghost">
              Ladda ner
            </a>
            {d.buyer.type !== "privat" && (
              <a href={`/admin/fakturor/${inv.id}/peppol.xml`} className="btn btn-ghost" title="E-faktura enligt Peppol BIS Billing 3">
                Peppol-XML
              </a>
            )}
            {inv.kind === "invoice" && d.buyer.customerId && (
              <Link href={`/admin/fakturor/aterkommande?fran=${inv.id}#ny`} className="btn btn-ghost">
                Gör återkommande
              </Link>
            )}
          </div>
        </div>

        {rattad && inv.kind === "correction" && (
          <p className="admin-flash">Ändringsfakturan är utfärdad som nummer {inv.number}. Skicka den till kunden; betalningen registreras på faktura {d.references.precedingInvoiceNumber}.</p>
        )}

        <div className="quote-layout" style={{ marginTop: 24 }}>
          <div className="inv-view">
            {isVoid && (
              <p className="inv-banner" data-kind="void">
                <strong>
                  Makulerad{inv.voidedAt ? ` ${formatDateTime(inv.voidedAt)}` : ""}
                  {inv.voidedBy ? ` av ${inv.voidedBy}` : ""}
                </strong>
                Orsak: {inv.voidReason}. Fakturan skickades aldrig och gäller inte. Numret {inv.number} finns kvar i serien, och bokföringen är vänd med en rättelsepost.
              </p>
            )}
            {openCase && (
              <p className="inv-banner" data-kind="collection">
                <strong>
                  Hos inkasso, ärende {openCase.reference} · {COLLECTION_STATUS_LABEL[openCase.status]}
                  {openCase.agency ? ` · ${openCase.agency}` : ""}
                  {openCase.externalRef ? ` (${openCase.externalRef})` : ""}
                </strong>
                Lämnad {openCase.createdAt.slice(0, 10)}
                {openCase.sentAt ? `, skickad till bolaget ${openCase.sentAt.slice(0, 10)}` : ""}. Fakturan får inga fler påminnelser. Betalningar registreras som vanligt; när fakturan är betald stängs ärendet av sig självt.
              </p>
            )}
            {!openCase && inv.collectionDemandedOn && isOpen(inv) && (
              <p className="inv-banner" data-kind="collection">
                <strong>Inkassokrav skickat {inv.collectionDemandedOn}</strong>
                Kunden har till och med {inv.collectionDemandPayBy} att betala eller invända. Efter det kan fakturan lämnas till inkasso.{" "}
                <a href={`/admin/fakturor/${inv.id}/inkassokrav`} target="_blank" rel="noopener">
                  Visa inkassokravet
                </a>
              </p>
            )}
            {correction && (
              <p className="inv-banner" data-kind="corrected">
                <strong>
                  Rättad genom <Link href={`/admin/fakturor/${correction.id}`}>faktura {correction.number}</Link>
                </strong>
                Ändringsfakturan ersätter uppgifterna här. Beloppet är detsamma; betalningar och påminnelser hör till den här fakturan.
              </p>
            )}
            {replaced && (
              <p className="inv-banner" data-kind="correction">
                <strong>
                  Ersätter <Link href={`/admin/fakturor/${replaced.id}`}>faktura {replaced.number}</Link>
                </strong>
                {d.se.offset
                  ? `Faktura ${replaced.number} krediterades med ${d.se.offset.creditNumber}, och de ${kr(d.se.offset.amountOre)} kunden betalade på den är kvittade mot den här fakturan.`
                  : `Faktura ${replaced.number} är krediterad; den här fakturan ersätter den.`}
              </p>
            )}
            {replacedBy && (
              <p className="inv-banner" data-kind="corrected">
                <strong>
                  Ersatt av <Link href={`/admin/fakturor/${replacedBy.id}`}>{replacedBy.number ? `faktura ${replacedBy.number}` : "ett utkast"}</Link>
                </strong>
                {replacedBy.number
                  ? "Fakturan är krediterad i sin helhet och ersatt; det kunden betalade här är flyttat till den nya fakturan."
                  : `Fakturan är krediterad i sin helhet. ${inv.paidOre ? `Det kunden har betalat, ${kr(inv.paidOre)}, flyttas till den nya fakturan när utkastet utfärdas.` : "Utfärda utkastet som ersätter den."}`}
              </p>
            )}
            {inv.kind === "correction" && (
              <p className="inv-banner" data-kind="correction">
                <strong>
                  Ändringsfaktura till {original ? <Link href={`/admin/fakturor/${original.id}`}>faktura {original.number}</Link> : `faktura ${d.references.precedingInvoiceNumber}`}
                </strong>
                {d.correctionNote} Den bokförs inte; betalningar registreras på originalet, med samma {paymentReference(d).ocr ? "OCR-nummer" : "referens"} och förfallodag.
              </p>
            )}
            <p className="inv-locked">
              Låst vid utfärdandet {inv.issuedOn}
              {inv.createdBy ? ` · ${inv.createdBy}` : ""}. Ändras aldrig; fel uppgifter rättas med ändringsfaktura och fel belopp med kreditfaktura.
              {inv.sha256 ? ` Dokumentets hash ${inv.sha256.slice(0, 12)}…` : ""}
            </p>

            <div className="inv-grid">
              <div>
                <span className="lead-h2">Kund</span>
                <strong>{d.buyer.name}</strong>
                <br />
                {d.buyer.street}
                <br />
                {d.buyer.postalCode} {d.buyer.city}
                {d.buyer.orgNr ? (
                  <>
                    <br />
                    Org.nr {d.buyer.orgNr}
                  </>
                ) : null}
                {d.buyer.vatNr ? (
                  <>
                    <br />
                    Momsreg.nr {d.buyer.vatNr}
                  </>
                ) : null}
                {d.buyer.email ? (
                  <>
                    <br />
                    {d.buyer.email}
                  </>
                ) : null}
              </div>
              <div>
                <span className="lead-h2">Datum</span>
                Fakturadatum <strong>{inv.issuedOn}</strong>
                <br />
                Förfaller <strong>{inv.dueOn}</strong>
                {d.deliveryDate ? (
                  <>
                    <br />
                    Utfört {d.deliveryDate}
                  </>
                ) : null}
                <br />
                {d.paymentMeans.termsText}
              </div>
              <div>
                <span className="lead-h2">Betalning</span>
                {d.paymentMeans.bankgiro ? (
                  <>
                    Bankgiro <strong>{d.paymentMeans.bankgiro}</strong>
                    <br />
                  </>
                ) : null}
                {paymentReference(d).ocr ? "OCR" : "Referens"} <strong>{paymentReference(d).value}</strong>
                {d.paymentMeans.swish ? (
                  <>
                    <br />
                    Swish {d.paymentMeans.swish}
                  </>
                ) : null}
                {d.se.reverseCharge ? (
                  <>
                    <br />
                    Omvänd betalningsskyldighet
                  </>
                ) : null}
              </div>
            </div>

            <table className="inv-table">
              <thead>
                <tr>
                  <th>Beskrivning</th>
                  <th>Typ</th>
                  <th style={{ textAlign: "right" }}>Antal</th>
                  <th style={{ textAlign: "right" }}>{sum.inclVat ? "À-pris inkl." : "À-pris"}</th>
                  <th style={{ textAlign: "right" }}>Belopp</th>
                </tr>
              </thead>
              <tbody>
                {(grouped ? sections : [""]).map((section) => (
                  <Fragment key={section || "_"}>
                    {grouped && (
                      <tr className="inv-section">
                        <td colSpan={5}>{section || "Övrigt"}</td>
                      </tr>
                    )}
                    {d.lines
                      .filter((l) => !grouped || l.section.trim() === section)
                      .map((l) => {
                        const t = totals.lines[l.id];
                        return (
                          <tr key={l.id}>
                            <td>{l.description}</td>
                            <td className="inv-muted">{LINE_KIND_LABEL[l.kind]}</td>
                            <td style={{ textAlign: "right" }}>
                              {l.quantity.toLocaleString("sv-SE")} {l.unit}
                            </td>
                            <td style={{ textAlign: "right" }}>{sek(sum.inclVat && l.quantity ? Math.round(t.gross / l.quantity) : l.unitPriceOre)}</td>
                            <td style={{ textAlign: "right" }}>{sek(sum.inclVat ? t.gross : t.net)}</td>
                          </tr>
                        );
                      })}
                  </Fragment>
                ))}
              </tbody>
            </table>

            <dl className="qsum" style={{ marginTop: 10 }}>
              {sum.byKind.map((k) => (
                <div key={k.kind}>
                  <dt>{LINE_KIND_LABEL[k.kind]}</dt>
                  <dd>{sek(k.amount)}</dd>
                </div>
              ))}
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
              {sum.rounding !== 0 && (
                <div>
                  <dt>Öresavrundning</dt>
                  <dd>{sek(sum.rounding)}</dd>
                </div>
              )}
              {sum.offset !== 0 && (
                <>
                  <div>
                    <dt>Summa att betala</dt>
                    <dd>{sek(sum.payable)}</dd>
                  </div>
                  <div>
                    <dt>Kvittat mot faktura {d.se.offset?.invoiceNumber}</dt>
                    <dd>{sek(-sum.offset)}</dd>
                  </div>
                </>
              )}
              <div className="qsum-pay">
                <dt>{inv.kind === "credit" ? "Att återfå" : sum.refund > 0 ? "Att återbetala" : "Att betala"}</dt>
                <dd>{sek(sum.offset !== 0 ? sum.due || sum.refund : Math.abs(sum.payable))} kr</dd>
              </div>
            </dl>

            {d.se.rot && totals.rot && (
              <div className="inv-box">
                <span className="lead-h2">ROT på den här fakturan</span>
                <div className="inv-grid">
                  {d.se.rot.buyers.map((b, i) => (
                    <div key={i}>
                      <strong>{b.name}</strong>
                      <br />
                      {canSeePnr ? <RevealPersonalNumber invoiceId={inv.id} index={i} masked={maskPersonalNumber(b.personalNumber, today)} /> : <span className="inv-muted">{maskPersonalNumber(b.personalNumber, today) || "Personnummer saknas"}</span>}
                      <br />
                      {kr(Math.abs(totals.rot!.perBuyer[i] ?? 0))}
                    </div>
                  ))}
                  <div>
                    {d.se.rot.property?.kind === "fastighet" ? d.se.rot.property.designation : d.se.rot.property ? `Brf ${d.se.rot.property.orgNr}, lgh ${d.se.rot.property.apartmentNumber}` : ""}
                    <br />
                    <span className="inv-muted">Begärs från Skatteverket när kunden har betalat.</span>
                  </div>
                </div>
              </div>
            )}

            <div className="inv-cols">
              <div>
                <h2 className="lead-h2">Betalningar</h2>
                {payments.length === 0 ? (
                  <p className="efield-hint">Inga inbetalningar registrerade.</p>
                ) : (
                  <ul className="inv-list">
                    {payments.map((p) => (
                      <li key={p.id}>
                        <span>
                          {p.paidOn} · {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
                          {p.method === "offset"
                            ? p.amountOre > 0
                              ? ` från faktura ${p.reference}`
                              : ` till faktura ${replacedBy?.number ?? "som ersätter den"}`
                            : p.reference
                              ? ` · ${p.reference}`
                              : ""}
                          {p.method !== "offset" && p.amountOre < 0 ? " · återbetalning" : ""}
                        </span>
                        <strong>{kr(p.amountOre)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
                {inv.kind === "correction" ? (
                  <p className="inv-remaining">Betalningar registreras på {original ? <Link href={`/admin/fakturor/${original.id}`}>faktura {original.number}</Link> : `faktura ${d.references.precedingInvoiceNumber}`}.</p>
                ) : (
                <p className="inv-remaining">
                  Betalt {kr(inv.paidOre)} av {kr(inv.payableOre)}
                  {remaining > 0 && isOpen(inv) ? ` · ${kr(remaining)} kvar` : ""}
                  {refund > 0 ? ` · ${kr(refund)} att återbetala` : ""}
                </p>
                )}
                {swishRequests.length > 0 && (
                  <div className="swish-requests">
                    <h3 className="lead-h2" style={{ fontSize: 17 }}>Swish Handel</h3>
                    <ul className="inv-list">
                      {swishRequests.map((r) => (
                        <li key={r.id}>
                          <span>
                            {formatDateTime(r.createdAt)} · {SWISH_STATUS_LABEL[r.status]} · {r.flow === "mcommerce" ? "Swish-appen" : `nr ${r.payerAlias}`}
                            {r.environment === "test" ? " · testmiljö" : ""}
                            {r.paymentReference ? ` · ref ${r.paymentReference}` : ""}
                            {r.error && (
                              <>
                                <br />
                                <small>{r.error}</small>
                              </>
                            )}
                          </span>
                          <strong>{kr(r.amountOre)}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div>
                <h2 className="lead-h2">Tidslinje</h2>
                <ol className="inv-timeline">
                  {events.map((e, i) => (
                    <li key={`${e.at}-${i}`}>
                      <span>
                        {e.type === "invoice.collection"
                          ? collectionEventText(e.data)
                          : e.type === "invoice.corrected" && e.data.corrects
                            ? `Utfärdad som ändringsfaktura ${e.data.number}`
                            : e.type === "payment.received" && typeof e.data.amount === "number" && e.data.amount < 0
                              ? "Återbetalning"
                              : (EVENT_LABEL[e.type]?.text ?? e.type)}
                        {e.type === "invoice.issued" && e.data.number ? ` som ${e.data.number}` : ""}
                        {(e.type === "invoice.sent" || e.type === "invoice.reminded") && eventRecipientsText(e.data) && eventRecipientsText(e.data) !== "manuellt" ? ` till ${eventRecipientsText(e.data)}` : ""}
                        {e.type === "invoice.voided" && e.data.reason ? `: ${e.data.reason}` : ""}
                        {e.type === "invoice.corrected" && e.data.correctionNumber ? ` genom faktura ${e.data.correctionNumber}` : ""}
                        {e.type === "invoice.corrected" && e.data.corrects ? `, ersätter faktura ${e.data.corrects}` : ""}
                        {e.type === "invoice.offset" && typeof e.data.amount === "number" ? ` ${kr(e.data.amount)}` : ""}
                        {e.type === "invoice.offset" && e.data.fromNumber ? ` från faktura ${e.data.fromNumber}` : ""}
                        {e.type === "invoice.offset" && e.data.toNumber ? `, flyttad till faktura ${e.data.toNumber}` : ""}
                        {e.type === "payment.received" && typeof e.data.amount === "number" ? ` ${kr(e.data.amount)}` : ""}
                        {e.type === "invoice.reminded" && typeof e.data.level === "number" ? ` (${e.data.level})` : ""}
                        {e.type === "invoice.reminded" && typeof e.data.fee === "number" && e.data.fee > 0 ? ` · avgift ${kr(e.data.fee)}` : ""}
                        {e.type === "invoice.reminded" && typeof e.data.interest === "number" && e.data.interest > 0 ? ` · ränta ${kr(e.data.interest)}` : ""}
                      </span>
                      <small>
                        {formatDateTime(e.at)}
                        {e.actor.kind === "user" ? ` · ${e.actor.name}` : ""}
                      </small>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>

          <aside className="lead-aside quote-aside">
            {plan && (
              <div>
                <h2 className="lead-h2">Påminnelse {plan.level}</h2>
                <SendReminderForm id={inv.id} recipients={documentRecipients(d)} ready={mailReady} summary={`${reminderText(plan, inv.number ?? "", inv.dueOn ?? "")}${inv.reminders ? ` Tidigare påminnelser: ${inv.reminders}.` : ""}`} />
              </div>
            )}
            {refund > 0 && (
              <div>
                <h2 className="lead-h2">Att återbetala</h2>
                <RegisterRefundForm id={inv.id} refund={kr(refund)} today={today} />
              </div>
            )}
            {openCase && (
              <div>
                <h2 className="lead-h2">Inkassoärende {openCase.reference}</h2>
                <CaseControls caseId={openCase.id} reference={openCase.reference} status={openCase.status} agency={openCase.agency} externalRef={openCase.externalRef} />
              </div>
            )}
            {overdue && !openCase && (
              <div style={{ display: "grid", gap: 8 }}>
                <h2 className="lead-h2" style={{ marginBottom: 4 }}>
                  Inkasso
                </h2>
                {demand ? (
                  <>
                    <DemandForm id={inv.id} number={inv.number ?? ""} rows={demandRows} total={kr(demand.totalOre)} defaultPayBy={demand.payBy} minPayBy={minimumPayBy(today)} recipients={documentRecipients(d)} ready={mailReady} />
                    <span className="efield-hint">Eget inkassokrav med lagstadgad inkassoavgift {kr(demand.feeOre)} och minst åtta dagars frist. Skickas en gång.</span>
                  </>
                ) : inv.collectionDemandedOn ? (
                  <a href={`/admin/fakturor/${inv.id}/inkassokrav`} target="_blank" rel="noopener" className="link-quiet">
                    Inkassokravet {inv.collectionDemandedOn} (PDF)
                  </a>
                ) : demandBlocked ? (
                  <span className="efield-hint">Inkassokrav: {demandBlocked}</span>
                ) : null}
                <OpenCaseForm id={inv.id} number={inv.number ?? ""} rows={claimRows} total={claim ? kr(claim.totalOre) : ""} asOf={today} blocked={caseBlocked} />
              </div>
            )}
            {cases.some((c) => !isOpenCase(c.status)) && (
              <div>
                <h2 className="lead-h2">Tidigare inkassoärenden</h2>
                <ul className="inv-list">
                  {cases
                    .filter((c) => !isOpenCase(c.status))
                    .map((c) => (
                      <li key={c.id}>
                        <span>
                          {c.reference} · {COLLECTION_STATUS_LABEL[c.status]}
                          {c.closedAt ? ` ${c.closedAt.slice(0, 10)}` : ""}
                        </span>
                        <a href={`/admin/fakturor/inkasso/${c.id}/underlag`} className="link-quiet">
                          Underlag
                        </a>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            {isOpen(inv) && (
              <div>
                <h2 className="lead-h2">Registrera betalning</h2>
                <RegisterPaymentForm id={inv.id} remainingKronor={(remaining / 100).toLocaleString("sv-SE").replace(/ /g, " ")} today={today} />
              </div>
            )}
            {!isVoid && (
            <div>
              <h2 className="lead-h2">Skicka till kund</h2>
              <SendInvoiceForm id={inv.id} recipients={documentRecipients(d)} ready={mailReady} />
              {!inv.sentAt && <MarkSentForm id={inv.id} />}
              {publicUrl && (
                <p className="efield-hint" style={{ marginTop: 10, wordBreak: "break-all" }}>
                  Publik sida utan inloggning:{" "}
                  <a href={publicUrl} target="_blank" rel="noreferrer" className="link-quiet">
                    {publicUrl.replace(/^https?:\/\//, "")}
                  </a>
                </p>
              )}
            </div>
            )}
            {canFix && (
              <div style={{ display: "grid", gap: 8 }}>
                <h2 className="lead-h2" style={{ marginBottom: 4 }}>
                  Rätta
                </h2>
                {detailsBlocked ? (
                  <span className="efield-hint">{detailsBlocked}</span>
                ) : (
                  <Link href={`/admin/fakturor/${inv.id}/ratta`} className="btn btn-ghost quote-aside-btn">
                    Rätta uppgifter…
                  </Link>
                )}
                <span className="efield-hint">Namn, adress, referenser, rubrik, text eller radernas benämning: en ändringsfaktura med samma belopp.</span>
                <CorrectAmountsForm id={inv.id} number={inv.number ?? ""} amount={kr(Math.abs(inv.payableOre))} paid={inv.paidOre ? kr(inv.paidOre) : null} blocked={amountsBlocked} />
                <span className="efield-hint">Fel antal, pris, moms eller ROT: kreditfaktura för hela beloppet och ett nytt utkast.</span>
                {canVoid && (
                  <>
                    <VoidInvoiceForm id={inv.id} number={inv.number ?? ""} />
                    <span className="efield-hint">Bara innan fakturan har skickats: den blir ogiltig och bokföringen vänds.</span>
                  </>
                )}
                <CreditInvoiceButton id={inv.id} number={inv.number ?? ""} />
                <span className="efield-hint">Kreditera en del eller allt för hand, som ett utkast du ändrar innan du utfärdar.</span>
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
