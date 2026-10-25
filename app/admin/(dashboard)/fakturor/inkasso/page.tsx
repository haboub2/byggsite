import Link from "next/link";
import { formatOre } from "@/lib/core/money";
import { INVOICE_LIST_TABS, INVOICE_TAB_LABEL, countInvoices, invoiceFiltersToQuery, listInvoices } from "@/lib/core/invoices/store";
import { COLLECTION_STATUS_LABEL, collectionBlocker, isOpenCase } from "@/lib/core/collections/collections";
import { caseAgeDays, claimFor, listCasesWithInvoices } from "@/lib/core/collections/store";
import { reminderSettings } from "@/lib/core/reminders/store";
import { daysBetween } from "@/lib/core/rules";
import { todayIso } from "@/lib/quotes/schema";

const kr = (ore: number) => formatOre(ore, { decimals: 0, currency: true });

/**
 * Fakturor → Inkasso: the open cases with what is owed today and for how
 * long, the overdue invoices that may be handed over now, and the closed
 * cases. The package for the agency is downloaded per case.
 */
export default async function CollectionsPage() {
  const today = todayIso();
  const [all, counts, overdue, settings] = await Promise.all([listCasesWithInvoices(), countInvoices(), listInvoices({ tab: "overdue" }), reminderSettings()]);
  const open = all.filter((x) => isOpenCase(x.case.status));
  const closed = all.filter((x) => !isOpenCase(x.case.status)).slice(0, 30);
  const owed = await Promise.all(open.map(async (x) => (await claimFor(x.invoice, today)).claim));
  const ready = overdue.filter((inv) => !collectionBlocker(inv, today, settings));
  const waiting = overdue.filter((inv) => !inv.collectionCaseId && inv.collectionDemandPayBy && today <= inv.collectionDemandPayBy);
  const openCapital = open.reduce((s, x) => s + x.invoice.payableOre - x.invoice.paidOre, 0);
  const openTotal = owed.reduce((s, c) => s + c.totalOre, 0);

  return (
    <section className="sec sec--tight">
      <div className="container">
        <div className="inbox-head">
          <div>
            <span className="eyebrow">Admin · Fakturor</span>
            <h1>Inkasso</h1>
            <p className="admin-intro">
              Förfallna fakturor som har fått påminnelse eller inkassokrav lämnas till inkasso från fakturasidan. Underlaget (fakturan, påminnelserna, inkassokravet, en sammanställning och en CSV-rad) laddar du ner här och lämnar till det inkassobolag du anlitar. En faktura hos inkasso får inga fler påminnelser, och ärendet stängs när betalningen registreras.
            </p>
          </div>
        </div>

        <div className="kpi-row">
          <div className={`kpi${open.length ? " kpi--alert" : ""}`}>
            <span>Hos inkasso</span>
            <strong>{kr(openCapital)}</strong>
            <small>
              {open.length} {open.length === 1 ? "ärende" : "ärenden"}, kapital
            </small>
          </div>
          <div className="kpi">
            <span>Fordran i dag</span>
            <strong>{kr(openTotal)}</strong>
            <small>med ränta och avgifter</small>
          </div>
          <div className="kpi">
            <span>Redo för inkasso</span>
            <strong>{ready.length}</strong>
            <small>förfallna med påminnelse</small>
          </div>
          <div className="kpi">
            <span>Avslutade</span>
            <strong>{all.length - open.length}</strong>
            <small>betalda eller återkallade</small>
          </div>
        </div>

        <nav className="inbox-tabs" aria-label="Flik">
          <Link href="/admin/fakturor">
            Alla <span>{counts.all}</span>
          </Link>
          {INVOICE_LIST_TABS.map((t) => (
            <Link key={t} href={`/admin/fakturor${invoiceFiltersToQuery({ tab: t })}`} data-status={t}>
              {INVOICE_TAB_LABEL[t]} <span>{counts[t]}</span>
            </Link>
          ))}
          <Link href="/admin/fakturor/inkasso" aria-current="page" data-status="collection">
            Inkasso <span>{open.length}</span>
          </Link>
        </nav>

        <h2 className="lead-h2" style={{ marginTop: 24 }}>
          Öppna ärenden
        </h2>
        {open.length === 0 ? (
          <div className="inbox-empty">
            <p>Inga fakturor hos inkasso.</p>
          </div>
        ) : (
          <div className="coll-scroll">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Ärende</th>
                  <th>Kund</th>
                  <th>Status</th>
                  <th className="num">Kapital</th>
                  <th className="num">Fordran i dag</th>
                  <th className="num">Förfallen</th>
                  <th className="num">Hos inkasso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {open.map(({ case: c, invoice: inv }, i) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/admin/fakturor/${inv.id}`} className="link-quiet">
                        {c.reference}
                      </Link>
                      <br />
                      <span className="inv-muted">Faktura {inv.number}</span>
                    </td>
                    <td>{inv.document.buyer.name}</td>
                    <td>
                      {COLLECTION_STATUS_LABEL[c.status]}
                      {c.agency ? (
                        <>
                          <br />
                          <span className="inv-muted">
                            {c.agency}
                            {c.externalRef ? ` · ${c.externalRef}` : ""}
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td className="num">{kr(inv.payableOre - inv.paidOre)}</td>
                    <td className="num">{kr(owed[i].totalOre)}</td>
                    <td className="num">{inv.dueOn ? `${daysBetween(inv.dueOn, today)} d` : ""}</td>
                    <td className="num">{caseAgeDays(c, today)} d</td>
                    <td className="num">
                      <a href={`/admin/fakturor/inkasso/${c.id}/underlag`} className="link-quiet">
                        Underlag
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2 className="lead-h2" style={{ marginTop: 32 }}>
          Redo för inkasso
        </h2>
        {ready.length === 0 ? (
          <p className="efield-hint">Inga förfallna fakturor med påminnelse som väntar på att lämnas till inkasso.</p>
        ) : (
          <ul className="inbox-list">
            {ready.map((inv) => (
              <li key={inv.id}>
                <Link href={`/admin/fakturor/${inv.id}`} className="inbox-row quote-row" data-status="overdue">
                  <span className="inbox-status inv-status" data-status="overdue">
                    Förfallen {daysBetween(inv.dueOn!, today)} d
                  </span>
                  <span className="inbox-main">
                    <strong>
                      {inv.number} · {inv.document.buyer.name}
                    </strong>
                    <span className="inbox-meta">
                      {inv.collectionDemandedOn ? `Inkassokrav ${inv.collectionDemandedOn}, frist ${inv.collectionDemandPayBy}` : `${inv.reminders} ${inv.reminders === 1 ? "påminnelse" : "påminnelser"}`}
                    </span>
                  </span>
                  <span className="inbox-side">
                    <strong>{kr(inv.payableOre - inv.paidOre)}</strong>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {waiting.length > 0 && (
          <p className="efield-hint" style={{ marginTop: 10 }}>
            Väntar på inkassokravets frist: {waiting.map((inv) => `${inv.number} (till ${inv.collectionDemandPayBy})`).join(", ")}.
          </p>
        )}

        {closed.length > 0 && (
          <>
            <h2 className="lead-h2" style={{ marginTop: 32 }}>
              Avslutade ärenden
            </h2>
            <ul className="inv-list">
              {closed.map(({ case: c, invoice: inv }) => (
                <li key={c.id}>
                  <span>
                    <Link href={`/admin/fakturor/${inv.id}`} className="link-quiet">
                      {c.reference}
                    </Link>{" "}
                    · {inv.document.buyer.name} · {COLLECTION_STATUS_LABEL[c.status]}
                    {c.closedAt ? ` ${c.closedAt.slice(0, 10)}` : ""}
                    {c.note ? <span className="inv-muted"> · {c.note.split("\n").pop()}</span> : null}
                  </span>
                  <a href={`/admin/fakturor/inkasso/${c.id}/underlag`} className="link-quiet">
                    Underlag
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
