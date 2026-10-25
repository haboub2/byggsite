import Link from "next/link";
import { lockPeriodAction, requestPdfArchiveAction } from "@/app/admin/export-actions";
import { ExportJobRefresh } from "@/components/admin/invoices/ExportJobRefresh";
import { countArchiveInvoices, listExportJobs } from "@/lib/core/export/job-store";
import { isDownloadable, jobStatusText, LINK_DAYS, QUEUE_THRESHOLD, shouldQueue } from "@/lib/core/export/jobs";
import { formatDateTime } from "@/lib/admin-format";
import { formatOre } from "@/lib/core/money";
import { accountTotals, isPeriod, isPeriodLocked, lockProblem, monthRange, previousMonth, recentPeriods, sieFileName, vatSummary, VAT_BOX_LABEL, type VatBoxes } from "@/lib/core/ledger/period";
import { listAccounts, listJournalEntries, listPeriodLocks } from "@/lib/core/ledger/store";
import { getOrgSettings } from "@/lib/core/org/settings-store";
import { todayIso } from "@/lib/quotes/schema";

const kr = (ore: number) => formatOre(ore, { decimals: 2, currency: true });
const MONTH = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const SHORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const monthLabel = (p: string) => `${MONTH[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
const BOXES: (keyof VatBoxes)[] = ["05", "06", "07", "42", "10", "11", "12", "41"];
const SOURCE_LABEL: Record<string, string> = { invoice: "Faktura", credit: "Kreditfaktura", payment: "Betalning", reminder: "Påminnelse", reversal: "Rättelsepost" };

/**
 * Bokföringen: one month of the ledger at a time. The SIE 4 file for the
 * bookkeeping program, the VAT return's boxes, balances per account and
 * every verifikation. Locking the month stops new entries dated inside it.
 */
export default async function ExportPage({ searchParams }: { searchParams: Promise<{ period?: string; fel?: string; ok?: string }> }) {
  const q = await searchParams;
  const today = todayIso();
  const current = today.slice(0, 7);
  const period = isPeriod(q.period) ? q.period : previousMonth(current);
  const { from, to } = monthRange(period);
  const [entries, accounts, locks, { company }, archiveCount, jobs] = await Promise.all([
    listJournalEntries({ from, to }),
    listAccounts(),
    listPeriodLocks(),
    getOrgSettings(),
    countArchiveInvoices(),
    listExportJobs(5),
  ]);
  const queueOnly = shouldQueue(archiveCount);
  const jobOpen = jobs.some((j) => j.status === "queued" || j.status === "running");
  const names = new Map(accounts.map((a) => [a.number, a.name]));
  const totals = accountTotals(entries);
  const vat = vatSummary(entries);
  const locked = isPeriodLocked(locks, period);
  const problem = lockProblem(locks, period, today);
  const periods = recentPeriods(current, 12);

  return (
    <section className="sec sec--tight">
      <div className="container">
        <div className="inbox-head">
          <div>
            <span className="eyebrow">
              <Link href="/admin/ekonomi" className="link-quiet">
                Ekonomi
              </Link>{" "}
              · Bokföringen
            </span>
            <h1>Bokföringen, {monthLabel(period)}</h1>
            <p className="admin-intro">
              Varje faktura, betalning och påminnelse har redan en verifikation. Här hämtar du månaden som SIE-fil till bokföringsprogrammet, ser momsdeklarationens underlag och låser månaden när den är inläst.
            </p>
          </div>
          <div className="lead-quick">
            <a href={`/admin/ekonomi/export/sie?period=${period}`} className="btn btn-primary" download={sieFileName(company.legalName, period)}>
              Ladda ner SIE4-fil
            </a>
            <a href="#full-export" className="btn btn-ghost">
              Full export
            </a>
          </div>
        </div>

        {q.fel && (
          <p className="form-feedback error" role="alert" style={{ marginTop: 14 }}>
            {q.fel}
          </p>
        )}
        {q.ok === "last" && <p className="admin-flash">{monthLabel(period)} är låst. Nya verifikationer daterade i månaden stoppas av databasen.</p>}
        {q.ok === "arkiv" && <p className="admin-flash">PDF-arkivet byggs i bakgrunden. Du får en länk per mejl när det är klart, och den syns också under Full export.</p>}
        {jobOpen && <ExportJobRefresh />}

        <nav className="inbox-tabs" aria-label="Period">
          {periods.map((p) => (
            <Link key={p} href={`/admin/ekonomi/export?period=${p}`} aria-current={p === period ? "page" : undefined}>
              {SHORT[Number(p.slice(5, 7)) - 1]} {p.slice(2, 4)}
              {isPeriodLocked(locks, p) ? <span aria-label="låst">🔒</span> : null}
            </Link>
          ))}
        </nav>

        <div className="kpi-row" style={{ marginTop: 18 }}>
          <div className="kpi">
            <span>Verifikationer</span>
            <strong>{entries.length}</strong>
            <small>
              {from} – {to}
            </small>
          </div>
          <div className="kpi">
            <span>Utgående moms</span>
            <strong>{kr(vat.outputVatTotal)}</strong>
            <small>ruta 10–12</small>
          </div>
          <div className="kpi">
            <span>Omvänd betalningsskyldighet</span>
            <strong>{kr(vat.reverseCharge)}</strong>
            <small>byggtjänster, ruta 41</small>
          </div>
          <div className="kpi">
            <span>Perioden</span>
            <strong>{locked ? "Låst" : "Öppen"}</strong>
            <small>{locked ? "inga nya verifikationer" : period >= current ? "månaden pågår" : "kan låsas"}</small>
          </div>
        </div>

        <div className="dash-grid">
          <section className="dash-card dash-card--wide">
            <div className="dash-head">
              <h2 className="admin-h2">Momsdeklarationen</h2>
              <span className="inbox-meta">{monthLabel(period)}</span>
            </div>
            <table className="inv-table">
              <tbody>
                {BOXES.map((box) => (
                  <tr key={box}>
                    <td style={{ width: 44, fontWeight: 600 }}>{box}</td>
                    <td>{VAT_BOX_LABEL[box]}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatOre(vat.boxes[box], { decimals: 0, currency: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="efield-hint" style={{ marginTop: 10 }}>
              Underlaget är fakturornas försäljning ur huvudboken (3001–3004, 3231) och utgående moms (2611, 2621, 2631). Inköp och ingående moms (ruta 48) finns inte här; de kommer från bokföringen. Skatteverket vill ha hela kronor.
            </p>
          </section>

          <section className="dash-card">
            <div className="dash-head">
              <h2 className="admin-h2">Lås perioden</h2>
            </div>
            {locked ? (
              <p className="inbox-meta">
                Låst
                {(() => {
                  const l = locks.find((x) => x.periodStart <= from && to <= x.periodEnd);
                  return l ? ` ${formatDateTime(l.lockedAt)}${l.lockedBy ? ` av ${l.lockedBy}` : ""}` : "";
                })()}
                . Fel rättas med en verifikation i en öppen period.
              </p>
            ) : (
              <form action={lockPeriodAction}>
                <input type="hidden" name="period" value={period} />
                <p className="inbox-meta" style={{ marginBottom: 12 }}>
                  Lås när SIE-filen är inläst i bokföringen. Därefter stoppar databasen nya verifikationer daterade i {monthLabel(period)}, så filen och bokföringen kan inte glida isär.
                </p>
                <button type="submit" className="btn btn-dark" disabled={Boolean(problem)}>
                  Lås {monthLabel(period)}
                </button>
                {problem && (
                  <p className="efield-hint" style={{ marginTop: 8 }}>
                    {problem}
                  </p>
                )}
              </form>
            )}
            <dl className="dash-facts" style={{ marginTop: 16 }}>
              <div>
                <dt>Kundfordringar (1510), förändring</dt>
                <dd>{kr(vat.movement.receivables)}</dd>
              </div>
              <div>
                <dt>ROT-fordran (1513), förändring</dt>
                <dd>{kr(vat.movement.rotReceivable)}</dd>
              </div>
              <div>
                <dt>Bank (1930), in</dt>
                <dd>{kr(vat.movement.bank)}</dd>
              </div>
            </dl>
          </section>
        </div>

        <h2 className="admin-h2" style={{ marginTop: 32 }} id="full-export">
          Full export
        </h2>
        <p className="admin-intro" style={{ marginTop: 6 }}>
          Allt {company.legalName || "organisationen"} har i faktureringen, för Excel, för revisorn eller för att ta med sig. Varje nedladdning loggas.
        </p>
        <div className="dash-grid">
          <section className="dash-card dash-card--wide">
            <div className="dash-head">
              <h3 className="admin-h2">CSV för Excel</h3>
            </div>
            <form action="/admin/ekonomi/export/csv" method="get">
              <div className="egrid">
                <div className="efield">
                  <label htmlFor="export-fran">Från (valfritt)</label>
                  <input id="export-fran" name="fran" type="date" />
                </div>
                <div className="efield">
                  <label htmlFor="export-till">Till (valfritt)</label>
                  <input id="export-till" name="till" type="date" />
                </div>
              </div>
              <div className="lead-quick" style={{ marginTop: 12, flexWrap: "wrap" }}>
                <button type="submit" name="typ" value="fakturor" className="btn btn-dark">
                  Fakturor
                </button>
                <button type="submit" name="typ" value="betalningar" className="btn btn-dark">
                  Betalningar
                </button>
                <button type="submit" name="typ" value="kunder" className="btn btn-ghost">
                  Kunder
                </button>
              </div>
            </form>
            <p className="efield-hint" style={{ marginTop: 10 }}>
              Semikolon, decimalkomma och UTF-8, så att Excel öppnar filen direkt. Datumen gäller fakturadatum och betaldatum; kundlistan är alltid hel. Utkast kommer inte med.
            </p>
          </section>

          <section className="dash-card">
            <div className="dash-head">
              <h3 className="admin-h2">Arkiv</h3>
            </div>
            <div className="lead-quick" style={{ flexWrap: "wrap" }}>
              {queueOnly ? (
                <form action={requestPdfArchiveAction}>
                  <button type="submit" className="btn btn-dark" disabled={jobOpen}>
                    Bygg PDF-arkivet
                  </button>
                </form>
              ) : (
                <a href="/admin/ekonomi/export/pdf-arkiv" className="btn btn-dark" download>
                  PDF-arkiv (zip)
                </a>
              )}
              <a href="/admin/ekonomi/export/json" className="btn btn-ghost" download>
                Allt som JSON
              </a>
            </div>
            <p className="efield-hint" style={{ marginTop: 10 }}>
              Zip-filen har varje utfärdad faktura och kreditfaktura som PDF och en index.csv. JSON-filen har inställningar, kunder, fakturor med hela fakturadokumentet, betalningar, verifikationer, ROT, betalplaner och händelseloggen, med belopp i öre.
            </p>
            {queueOnly ? (
              <p className="efield-hint">
                {archiveCount} fakturor är fler än {QUEUE_THRESHOLD}, så arkivet byggs i bakgrunden, 50 fakturor åt gången. Du får en länk per mejl som gäller i {LINK_DAYS} dagar.
              </p>
            ) : (
              <form action={requestPdfArchiveAction} className="efield-hint">
                {archiveCount} {archiveCount === 1 ? "faktura" : "fakturor"}.{" "}
                <button type="submit" className="link-quiet" disabled={jobOpen} style={{ background: "none", border: 0, padding: 0, font: "inherit", textDecoration: "underline", cursor: "pointer" }}>
                  Bygg i bakgrunden och mejla länken
                </button>
              </form>
            )}
            {jobs.length > 0 && (
              <ul className="inv-list" style={{ marginTop: 12 }}>
                {jobs.map((j) => (
                  <li key={j.id} style={{ alignItems: "flex-start" }}>
                    <span>
                      PDF-arkiv beställt {formatDateTime(j.createdAt)}
                      {j.requestedEmail ? <span className="inv-muted"> av {j.requestedEmail}</span> : null}
                      <span className="inbox-meta" style={{ display: "block" }}>
                        {jobStatusText(j)}
                      </span>
                    </span>
                    {isDownloadable(j) ? (
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        {j.outputs.map((o, k) => (
                          <a key={o.path} href={`/admin/ekonomi/export/jobb/${j.id}?del=${k}`} className="link-quiet">
                            {j.outputs.length > 1 ? `Del ${k + 1}` : "Ladda ner"} ({Math.max(0.1, Math.round(o.bytes / 104857.6) / 10).toLocaleString("sv-SE")} MB)
                          </a>
                        ))}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <h2 className="admin-h2" style={{ marginTop: 32 }}>
          Saldon per konto
        </h2>
        {totals.length === 0 ? (
          <div className="inbox-empty">
            <p>Inga verifikationer i {monthLabel(period)}.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Konto</th>
                  <th style={{ textAlign: "right" }}>Debet</th>
                  <th style={{ textAlign: "right" }}>Kredit</th>
                  <th style={{ textAlign: "right" }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((t) => (
                  <tr key={t.account}>
                    <td>
                      {t.account} <span className="inv-muted">{names.get(t.account) ?? ""}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>{kr(t.debit)}</td>
                    <td style={{ textAlign: "right" }}>{kr(t.credit)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{kr(t.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {entries.length > 0 && (
          <>
            <h2 className="admin-h2" style={{ marginTop: 32 }}>
              Verifikationer
            </h2>
            <div style={{ overflowX: "auto" }}>
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Nr</th>
                    <th>Datum</th>
                    <th>Text</th>
                    <th>Konteringar</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {e.series}
                        {e.number}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{e.date}</td>
                      <td>
                        {e.text}
                        <div className="inv-muted" style={{ fontSize: 12.5 }}>
                          {SOURCE_LABEL[e.sourceType] ?? e.sourceType}
                        </div>
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {e.lines.map((l, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                            <span>{l.account}</span>
                            <span>{l.debit ? kr(l.debit) : `−${kr(l.credit)}`}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h2 className="admin-h2" style={{ marginTop: 32 }}>
          Låsta perioder
        </h2>
        {locks.length === 0 ? (
          <p className="inbox-meta">Ingen period är låst än.</p>
        ) : (
          <ul className="inv-list">
            {locks.map((l) => (
              <li key={l.periodStart}>
                <span>
                  <Link href={`/admin/ekonomi/export?period=${l.periodStart.slice(0, 7)}`} className="link-quiet">
                    {l.periodStart} – {l.periodEnd}
                  </Link>
                </span>
                <span className="inbox-meta">
                  {formatDateTime(l.lockedAt)}
                  {l.lockedBy ? ` · ${l.lockedBy}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
