import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createHash } from "node:crypto";
import InvoiceEditor from "@/components/admin/invoices/InvoiceEditor";
import { CorrectAmountsForm, CreditInvoiceButton, DeleteDraft, IssueInvoiceForm, MarkSentForm, RegisterPaymentForm, SendInvoiceForm, SendReminderForm, VoidInvoiceForm } from "@/components/admin/invoices/InvoiceTools";
import { reminderDue, reminderText } from "@/lib/core/reminders/reminders";
import { reminderSettings } from "@/lib/core/reminders/store";
import { publicInvoiceUrl } from "@/lib/core/invoices/public";
import { formatDateTime } from "@/lib/admin-format";
import { formatOre } from "@/lib/core/money";
import { CUSTOMER_TYPE_LABEL, LINE_KIND_LABEL, paymentReference, validateForIssue } from "@/lib/core/documents/invoice";
import { customerSummary, invoiceTotals } from "@/lib/core/invoices/totals";
import { EVENT_LABEL } from "@/lib/core/events";
import { documentRecipients, eventRecipientsText } from "@/lib/core/invoices/recipients";
import { INVOICE_STATUS_LABEL, correctionBlocker, getInvoice, invoiceLabel, isOpen, isOverdue, listInvoiceEvents, listInvoicePayments } from "@/lib/core/invoices/store";
import { amountCorrectionBlocker } from "@/lib/core/invoices/amend";
import { applySellerDefaults, getSellerDefaults } from "@/lib/core/invoices/seller";
import { todayIso } from "@/lib/quotes/schema";
import { requireRole } from "@/lib/admin";
import { maskPersonalNumber } from "@/lib/core/rot/pnr";
import { RevealPersonalNumber } from "@/components/admin/invoices/RevealPersonalNumber";
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
                  }}
                />
              </div>
              <div>
                <h2 className="lead-h2">Att betala</h2>
                <p style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{kr(Math.abs(inv.payableOre))}</p>
                <p className="efield-hint">{inv.rotOre ? `varav ROT-avdrag ${kr(Math.abs(inv.rotOre))} som begärs från Skatteverket.` : "Enligt det sparade utkastet."}</p>
              </div>
              <DeleteDraft id={inv.id} />
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
  const isVoid = inv.status === "void";
  const canFix = inv.kind === "invoice" && !isVoid && inv.status !== "credited";
  const detailsBlocked = canFix ? correctionBlocker(inv) : null;
  const amountsBlocked = canFix ? await amountCorrectionBlocker(inv.id) : null;
  const canVoid = inv.kind === "invoice" && inv.status === "issued" && !inv.sentAt && inv.paidOre === 0 && !inv.correctedBy && inv.reminders === 0;
  const totals = invoiceTotals(d);
  const sum = customerSummary(d, totals);
  const overdue = isOverdue(inv, today);
  const remaining = inv.payableOre - inv.paidOre;
  const plan = overdue
    ? reminderDue({ payableOre: inv.payableOre, paidOre: inv.paidOre, dueOn: inv.dueOn, issueDate: d.issueDate, reminders: inv.reminders, remindedAt: inv.remindedAt, customerType: d.buyer.type, status: inv.status, kind: inv.kind }, today, { ...(await reminderSettings()), graceDays: 0, daysBetween: 1 })
    : null;
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
              <span className="inv-status" data-status={overdue ? "overdue" : inv.status}>
                {overdue ? "Förfallen" : INVOICE_STATUS_LABEL[inv.status]}
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
            {correction && (
              <p className="inv-banner" data-kind="corrected">
                <strong>
                  Rättad genom <Link href={`/admin/fakturor/${correction.id}`}>faktura {correction.number}</Link>
                </strong>
                Ändringsfakturan ersätter uppgifterna här. Beloppet är detsamma; betalningar och påminnelser hör till den här fakturan.
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
              <div className="qsum-pay">
                <dt>{inv.kind === "credit" ? "Att återfå" : "Att betala"}</dt>
                <dd>{sek(Math.abs(sum.payable))} kr</dd>
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
                          {p.paidOn} · {p.method}
                          {p.reference ? ` · ${p.reference}` : ""}
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
                        {e.type === "invoice.corrected" && e.data.corrects ? `Utfärdad som ändringsfaktura ${e.data.number}` : (EVENT_LABEL[e.type]?.text ?? e.type)}
                        {e.type === "invoice.issued" && e.data.number ? ` som ${e.data.number}` : ""}
                        {(e.type === "invoice.sent" || e.type === "invoice.reminded") && eventRecipientsText(e.data) && eventRecipientsText(e.data) !== "manuellt" ? ` till ${eventRecipientsText(e.data)}` : ""}
                        {e.type === "invoice.voided" && e.data.reason ? `: ${e.data.reason}` : ""}
                        {e.type === "invoice.corrected" && e.data.correctionNumber ? ` genom faktura ${e.data.correctionNumber}` : ""}
                        {e.type === "invoice.corrected" && e.data.corrects ? `, ersätter faktura ${e.data.corrects}` : ""}
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
                <CorrectAmountsForm id={inv.id} number={inv.number ?? ""} amount={kr(Math.abs(inv.payableOre))} blocked={amountsBlocked} />
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
