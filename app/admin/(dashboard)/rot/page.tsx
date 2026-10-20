import Link from "next/link";
import { createClaimAction, markClaimSentAction, registerPayoutAction, rejectClaimAction } from "@/app/admin/rot-actions";
import { formatOre } from "@/lib/core/money";
import { ROT_CATEGORIES, ROT_CATEGORY_LABEL, validateRotClaim } from "@/lib/core/rot/claim-xml";
import { maskPersonalNumber, withPlaceholderPersonalNumbers } from "@/lib/core/rot/pnr";
import { claimToXmlWithInvoices, listClaims, listRotCandidates, ROT_CLAIM_STATUS_LABEL, rotSummary } from "@/lib/core/rot/store";
import { rotClaimDeadline } from "@/lib/core/rules";
import { todayIso } from "@/lib/quotes/schema";

const kr = (ore: number) => formatOre(ore, { decimals: 0, currency: true });
const OK: Record<string, string> = {
  skickad: "Begäran är markerad som skickad. Registrera utbetalningen när beslutet kommer.",
  utbetald: "Utbetalningen är registrerad och bokförd mot ROT-fordran.",
  avvisad: "Begäran är markerad som avvisad. Kunderna ska betala resten; fakturorna är flaggade.",
};

export default async function RotPage({ searchParams }: { searchParams: Promise<{ fel?: string; ok?: string; skapad?: string }> }) {
  const { fel, ok, skapad } = await searchParams;
  const [candidates, claims, summary] = await Promise.all([listRotCandidates(), listClaims(), rotSummary()]);
  const today = todayIso();
  const ready = candidates.filter((c) => c.problems.length === 0);
  const drafts = claims.filter((c) => c.status === "draft");
  const sent = claims.filter((c) => c.status === "sent");
  const done = claims.filter((c) => c.status === "paid" || c.status === "rejected");
  // Checked with placeholders; the numbers are opened only when the file is downloaded.
  const xmlProblems = Object.fromEntries(await Promise.all(drafts.map(async (c) => [c.id, validateRotClaim(withPlaceholderPersonalNumbers(await claimToXmlWithInvoices(c, today)))] as const)));

  return (
    <section className="sec sec--tight">
      <div className="container">
        <div className="inbox-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1>ROT-begäran</h1>
            <p className="admin-intro">
              Betalda fakturor med ROT samlas här. Skapa en fil, ladda upp den i Skatteverkets e-tjänst <em>Rot och rut – företag</em> och markera begäran som skickad. Utbetalningen registreras när beslutet kommer.
            </p>
          </div>
        </div>

        {fel && (
          <p className="form-feedback error" role="alert" style={{ marginTop: 14 }}>
            {fel}
          </p>
        )}
        {ok && OK[ok] && <p className="admin-flash">{OK[ok]}</p>}
        {skapad && <p className="admin-flash">Begäran är skapad. Ladda ner XML-filen nedan, ladda upp den hos Skatteverket och markera sedan som skickad.</p>}

        <div className="kpi-row">
          <div className="kpi">
            <span>Klart att begära</span>
            <strong>{kr(summary.claimableOre)}</strong>
            <small>{summary.claimableCount} {summary.claimableCount === 1 ? "faktura" : "fakturor"}</small>
          </div>
          <div className="kpi">
            <span>Hos Skatteverket</span>
            <strong>{kr(summary.sentOre)}</strong>
            <small>{sent.length} {sent.length === 1 ? "begäran" : "begäran"} väntar på beslut</small>
          </div>
          <div className={`kpi${summary.nextDeadline && summary.nextDeadline <= today.slice(0, 4) + "-12-31" ? " kpi--alert" : ""}`}>
            <span>Senast</span>
            <strong>{summary.nextDeadline ?? "–"}</strong>
            <small>för det kunderna betalat {summary.nextDeadline ? Number(summary.nextDeadline.slice(0, 4)) - 1 : today.slice(0, 4)}</small>
          </div>
          <div className="kpi">
            <span>Utbetalt</span>
            <strong>{kr(claims.filter((c) => c.status === "paid").reduce((s, c) => s + c.paidOre, 0))}</strong>
            <small>{claims.filter((c) => c.status === "paid").length} begäran</small>
          </div>
        </div>

        <h2 className="admin-h2" style={{ marginTop: 32 }}>
          Att begära
        </h2>
        {candidates.length === 0 ? (
          <div className="inbox-empty">
            <p>Inga betalda ROT-fakturor väntar. När en faktura med ROT är fullt betald dyker den upp här.</p>
          </div>
        ) : (
          <form action={createClaimAction} className="rot-create">
            <div style={{ overflowX: "auto" }}>
              <table className="inv-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <span className="sr-only">Välj</span>
                    </th>
                    <th>Faktura</th>
                    <th>Köpare</th>
                    <th>Kunden betalade</th>
                    <th style={{ textAlign: "right" }}>Arbete inkl. moms</th>
                    <th style={{ textAlign: "right" }}>ROT att begära</th>
                    <th>Underlag</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.invoice.id}>
                      <td>
                        <input type="checkbox" name="invoice" value={c.invoice.id} defaultChecked={c.problems.length === 0} disabled={c.problems.length > 0} aria-label={`Välj faktura ${c.invoice.number}`} style={{ width: 18, height: 18, accentColor: "var(--orange)" }} />
                      </td>
                      <td>
                        <Link href={`/admin/fakturor/${c.invoice.id}`} className="link-quiet">
                          {c.invoice.number}
                        </Link>
                        <div className="inv-muted" style={{ fontSize: 12.5 }}>{c.invoice.document.title}</div>
                      </td>
                      <td>
                        {c.buyers.map((b, i) => (
                          <div key={i}>
                            {b.name} · <span className="inv-muted">{maskPersonalNumber(b.personalNumber, today)}</span>
                          </div>
                        ))}
                        <div className="inv-muted" style={{ fontSize: 12.5 }}>
                          {c.property?.kind === "fastighet" ? c.property.designation : c.property ? `Brf ${c.property.orgNr}, lgh ${c.property.apartmentNumber}` : "Fastighet saknas"}
                          {c.buyers.length > 1 ? ` · delas ${c.buyers.length}` : ""}
                        </div>
                      </td>
                      <td>
                        {c.paidOn}
                        <div className="inv-muted" style={{ fontSize: 12.5 }}>senast {rotClaimDeadline(c.paidOn)}</div>
                      </td>
                      <td style={{ textAlign: "right" }}>{kr(c.workOre)}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{kr(c.invoice.rotOre)}</td>
                      <td>
                        {c.problems.length === 0 ? (
                          <span className="inv-status" data-status="paid">
                            Komplett
                          </span>
                        ) : (
                          <span className="inv-status" data-status="overdue" title={c.problems.join(" ")}>
                            {c.problems[0]}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="egrid egrid--three" style={{ marginTop: 16, alignItems: "end" }}>
              <div className="efield">
                <label htmlFor="rot-name">Namn på begäran (max 16 tecken)</label>
                <input id="rot-name" name="name" maxLength={16} defaultValue={`ROT ${today.slice(2, 7).replace("-", "")}`} />
              </div>
              <div className="efield">
                <label htmlFor="rot-category">Typ av arbete (Skatteverkets kategori)</label>
                <select id="rot-category" name="category" defaultValue="Bygg">
                  {ROT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {ROT_CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="efield">
                <button type="submit" className="btn btn-primary" disabled={ready.length === 0}>
                  Skapa begäran ({ready.length} {ready.length === 1 ? "faktura" : "fakturor"}, {kr(ready.reduce((s, c) => s + c.invoice.rotOre, 0))})
                </button>
              </div>
            </div>
            <p className="efield-hint" style={{ marginTop: 8 }}>
              Ofullständiga fakturor lämnas utanför. En begäran blir en XML-fil enligt Skatteverkets schema version 6 med högst 100 köpare; belopp i hela kronor och personnummer med tolv siffror.
            </p>
          </form>
        )}

        {(drafts.length > 0 || sent.length > 0) && (
          <>
            <h2 className="admin-h2" style={{ marginTop: 36 }}>
              Pågående begäran
            </h2>
            <ul className="rot-claims">
              {[...drafts, ...sent].map((c) => {
                const total = c.items.reduce((s, i) => s + i.amountOre, 0);
                const problems = xmlProblems[c.id] ?? [];
                return (
                  <li key={c.id}>
                    <div className="rot-claim-head">
                      <div>
                        <strong>{c.name}</strong>
                        <span className="inbox-meta">
                          {" "}
                          · {c.items.length} {c.items.length === 1 ? "ärende" : "ärenden"} · {kr(total)} · fakturor {[...new Set(c.items.map((i) => i.invoiceNumber))].join(", ")}
                        </span>
                      </div>
                      <span className="inv-status" data-status={c.status === "sent" ? "sent" : "draft"}>
                        {ROT_CLAIM_STATUS_LABEL[c.status]}
                        {c.sentOn ? ` ${c.sentOn}` : ""}
                      </span>
                    </div>
                    {c.status === "draft" && (
                      <div className="rot-claim-actions">
                        {problems.length > 0 ? (
                          <ul className="inv-problems">
                            {problems.map((p) => (
                              <li key={p}>{p}</li>
                            ))}
                          </ul>
                        ) : (
                          <a href={`/admin/rot/${c.id}/xml`} className="btn btn-dark" style={{ minHeight: 40, fontSize: 14 }}>
                            1. Ladda ner XML-filen
                          </a>
                        )}
                        <span className="inbox-meta">2. Ladda upp i Rot och rut – företag på skatteverket.se och signera.</span>
                        <form action={markClaimSentAction}>
                          <input type="hidden" name="claim" value={c.id} />
                          <button type="submit" className="btn btn-ghost" style={{ minHeight: 40, fontSize: 14 }}>
                            3. Markera som skickad
                          </button>
                        </form>
                      </div>
                    )}
                    {c.status === "sent" && (
                      <div className="rot-claim-actions">
                        <form action={registerPayoutAction} className="chips-add" style={{ flexWrap: "wrap", alignItems: "end" }}>
                          <input type="hidden" name="claim" value={c.id} />
                          <div className="efield">
                            <label htmlFor={`amt-${c.id}`}>Utbetalt, kr</label>
                            <input id={`amt-${c.id}`} name="amount" inputMode="decimal" defaultValue={(total / 100).toLocaleString("sv-SE").replace(/ /g, " ")} />
                          </div>
                          <div className="efield">
                            <label htmlFor={`date-${c.id}`}>Datum</label>
                            <input id={`date-${c.id}`} name="paidOn" type="date" defaultValue={today} />
                          </div>
                          <button type="submit" className="btn btn-primary" style={{ minHeight: 42 }}>
                            Registrera utbetalning
                          </button>
                        </form>
                        <form action={rejectClaimAction} className="chips-add" style={{ flexWrap: "wrap" }}>
                          <input type="hidden" name="claim" value={c.id} />
                          <input name="note" placeholder="Avvisad: Skatteverkets motivering" maxLength={500} />
                          <button type="submit" className="link-quiet" style={{ color: "var(--danger)" }}>
                            Markera avvisad
                          </button>
                        </form>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {done.length > 0 && (
          <>
            <h2 className="admin-h2" style={{ marginTop: 36 }}>
              Avslutade
            </h2>
            <ul className="inv-list">
              {done.map((c) => (
                <li key={c.id}>
                  <span>
                    {c.name} · {c.items.length} ärenden · fakturor {[...new Set(c.items.map((i) => i.invoiceNumber))].join(", ")}
                    {c.note && c.status === "rejected" ? ` · ${c.note}` : ""}
                  </span>
                  <span>
                    <span className="inv-status" data-status={c.status === "paid" ? "paid" : "overdue"}>
                      {ROT_CLAIM_STATUS_LABEL[c.status]} {c.decidedOn ?? ""}
                    </span>{" "}
                    <strong>{kr(c.status === "paid" ? c.paidOre : c.items.reduce((s, i) => s + i.amountOre, 0))}</strong>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
