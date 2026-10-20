import Link from "next/link";
import { createRecurringAction, deleteRecurringAction, runRecurringNowAction, toggleRecurringAction } from "@/app/admin/recurring-actions";
import { formatOre } from "@/lib/core/money";
import { invoiceLabel, listInvoices } from "@/lib/core/invoices/store";
import { listRecurring } from "@/lib/core/invoices/recurring";
import { nextOccurrence, RECURRING_INTERVALS, RECURRING_INTERVAL_LABEL } from "@/lib/core/invoices/recurring-schedule";
import { todayIso } from "@/lib/quotes/schema";

const kr = (ore: number) => formatOre(ore, { decimals: 0, currency: true });
const OK: Record<string, string> = {
  skapad: "Den återkommande fakturan är sparad. Den dagliga körningen skapar nästa faktura på datumet.",
  pausad: "Pausad. Inga fakturor skapas förrän den tas upp igen.",
  aterupptagen: "Återupptagen. Ligger nästa datum bakåt i tiden skapas en faktura vid nästa körning.",
  borttagen: "Mallen är borttagen. Fakturorna den har skapat finns kvar.",
};

/**
 * Återkommande fakturor: the 01 division's monthly agreements. Each row is a
 * template made from an invoice; the daily cron (app/api/cron/invoices)
 * turns the due ones into drafts, or issues them when auto-issue is on.
 */
export default async function RecurringPage({ searchParams }: { searchParams: Promise<{ fran?: string; fel?: string; ok?: string; antal?: string }> }) {
  const q = await searchParams;
  const today = todayIso();
  const [items, invoices] = await Promise.all([listRecurring(), listInvoices()]);
  const candidates = invoices.filter((i) => i.kind === "invoice" && i.status !== "void" && i.document.buyer.customerId);
  const from = candidates.find((i) => i.id === q.fran);
  const due = items.filter((r) => r.active && r.nextOn <= today);
  const active = items.filter((r) => r.active);
  const monthly = active.reduce((s, r) => s + (r.interval === "monthly" ? r.payableOre : r.interval === "quarterly" ? r.payableOre / 3 : r.payableOre / 12), 0);

  return (
    <section className="sec sec--tight">
      <div className="container">
        <Link href="/admin/fakturor" className="link-quiet">
          ← Alla fakturor
        </Link>
        <div className="inbox-head" style={{ marginTop: 16 }}>
          <div>
            <span className="eyebrow">Fakturor</span>
            <h1>Återkommande fakturor</h1>
            <p className="admin-intro">
              Avtal som faktureras varje månad, kvartal eller år. Varje morgon skapar den dagliga körningen fakturorna som ska ut: som utkast att granska, eller utfärdade direkt om du valt det.
            </p>
          </div>
          {due.length > 0 && (
            <form action={runRecurringNowAction} className="lead-quick">
              <button type="submit" className="btn btn-primary">
                Skapa {due.length} {due.length === 1 ? "faktura" : "fakturor"} nu
              </button>
            </form>
          )}
        </div>

        {q.fel && (
          <p className="form-feedback error" role="alert" style={{ marginTop: 14 }}>
            {q.fel}
          </p>
        )}
        {q.ok && OK[q.ok] && <p className="admin-flash">{OK[q.ok]}</p>}
        {q.ok === "korning" && (
          <p className="admin-flash">
            {q.antal === "0" ? "Inget att skapa." : `${q.antal} ${q.antal === "1" ? "faktura är skapad" : "fakturor är skapade"}. Utkasten ligger under Fakturor, Utkast.`}
          </p>
        )}

        <div className="kpi-row">
          <div className="kpi">
            <span>Aktiva</span>
            <strong>{active.length}</strong>
            <small>{items.length - active.length ? `${items.length - active.length} pausade` : "inga pausade"}</small>
          </div>
          <div className="kpi">
            <span>Per månad</span>
            <strong>{kr(Math.round(monthly))}</strong>
            <small>att betala, kvartal och år utslaget</small>
          </div>
          <div className={`kpi${due.length ? " kpi--alert" : ""}`}>
            <span>Att skapa i dag</span>
            <strong>{due.length}</strong>
            <small>{due.length ? "körs i morgon bitti, eller nu" : "inget"}</small>
          </div>
        </div>

        <h2 className="admin-h2" style={{ marginTop: 32 }}>
          Avtal
        </h2>
        {items.length === 0 ? (
          <div className="inbox-empty">
            <p>Inga återkommande fakturor än. Gör en av en befintlig faktura nedan, eller med knappen Gör återkommande på fakturan.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Namn</th>
                  <th>Kund</th>
                  <th>Intervall</th>
                  <th>Nästa</th>
                  <th style={{ textAlign: "right" }}>Att betala</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Åtgärder</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      <div className="inv-muted" style={{ fontSize: 12.5 }}>
                        {r.template.lines.length} {r.template.lines.length === 1 ? "rad" : "rader"} · {r.template.paymentMeans.termsDays} dagar netto
                      </div>
                    </td>
                    <td>{r.template.buyer.name}</td>
                    <td>{RECURRING_INTERVAL_LABEL[r.interval]}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {r.nextOn}
                      <div className="inv-muted" style={{ fontSize: 12.5 }}>
                        sedan {nextOccurrence(r.nextOn, r.interval)}
                      </div>
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{kr(r.payableOre)}</td>
                    <td>
                      <span className="inv-status" data-status={!r.active ? "draft" : r.nextOn <= today ? "overdue" : "paid"}>
                        {!r.active ? "Pausad" : r.nextOn <= today ? "Att skapa" : r.autoIssue ? "Utfärdas automatiskt" : "Blir utkast"}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <form action={toggleRecurringAction} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="active" value={r.active ? "0" : "1"} />
                        <button type="submit" className="link-quiet">
                          {r.active ? "Pausa" : "Återuppta"}
                        </button>
                      </form>{" "}
                      ·{" "}
                      <form action={deleteRecurringAction} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="link-quiet" aria-label={`Ta bort ${r.name}`}>
                          Ta bort
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2 className="admin-h2" id="ny" style={{ marginTop: 36 }}>
          Gör en faktura återkommande
        </h2>
        {candidates.length === 0 ? (
          <p className="inbox-meta">
            Det finns ingen faktura med en kund ur registret att utgå från. <Link href="/admin/fakturor/ny">Skapa en faktura</Link> först; ett utkast räcker.
          </p>
        ) : (
          <form action={createRecurringAction} className="egrid" style={{ marginTop: 12 }}>
            <div className="efield efield--wide">
              <label htmlFor="rec-invoice">Utgå från</label>
              <select id="rec-invoice" name="invoice" defaultValue={from?.id ?? candidates[0].id} required>
                {candidates.map((i) => (
                  <option key={i.id} value={i.id}>
                    {invoiceLabel(i)} · {i.document.buyer.name}
                    {i.document.title ? ` · ${i.document.title}` : ""} · {kr(i.payableOre)}
                  </option>
                ))}
              </select>
              <p className="efield-hint">Rader, kund, villkor och betalningsuppgifter följer med. Nummer, datum, OCR och ROT gör det inte; varje faktura får sina egna.</p>
            </div>
            <div className="efield">
              <label htmlFor="rec-name">Namn</label>
              <input id="rec-name" name="name" maxLength={120} defaultValue={from ? from.document.title || from.document.buyer.name : ""} placeholder="Supportavtal, Kund AB" />
            </div>
            <div className="efield">
              <label htmlFor="rec-interval">Intervall</label>
              <select id="rec-interval" name="interval" defaultValue="monthly">
                {RECURRING_INTERVALS.map((i) => (
                  <option key={i} value={i}>
                    {RECURRING_INTERVAL_LABEL[i]}
                  </option>
                ))}
              </select>
            </div>
            <div className="efield">
              <label htmlFor="rec-next">Första fakturan</label>
              <input id="rec-next" name="nextOn" type="date" defaultValue={nextOccurrence(`${today.slice(0, 7)}-01`, "monthly")} required />
              <p className="efield-hint">Fakturan avser perioden från det datumet till dagen före nästa.</p>
            </div>
            <div className="efield">
              <label className="etoggle" htmlFor="rec-auto" style={{ marginTop: 26 }}>
                <input id="rec-auto" name="autoIssue" type="checkbox" />
                <span>Utfärda automatiskt</span>
              </label>
              <p className="efield-hint">Annars blir det ett utkast som du granskar och utfärdar. Utskicket görs alltid för hand.</p>
            </div>
            <div className="efield efield--wide">
              <button type="submit" className="btn btn-primary">
                Spara återkommande faktura
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
