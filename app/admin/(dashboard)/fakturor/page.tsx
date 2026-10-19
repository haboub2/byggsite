import Link from "next/link";
import { formatWhen } from "@/lib/admin-format";
import { formatOre } from "@/lib/core/money";
import { CUSTOMER_TYPE_LABEL } from "@/lib/core/documents/invoice";
import {
  INVOICE_LIST_TABS,
  INVOICE_STATUS_LABEL,
  INVOICE_TAB_LABEL,
  countInvoices,
  invoiceFiltersToQuery,
  isOpen,
  isOverdue,
  listInvoices,
  parseInvoiceFilters,
  type InvoiceFilters,
  type InvoiceListTab,
} from "@/lib/core/invoices/store";
import { daysBetween } from "@/lib/core/rules";
import { todayIso } from "@/lib/quotes/schema";

const kr = (ore: number) => formatOre(ore, { decimals: 0, currency: true });

export default async function InvoicesList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseInvoiceFilters(await searchParams);
  const { tab, ...rest } = filters;
  const [invoices, counts] = await Promise.all([listInvoices(filters), countInvoices(rest)]);
  const link = (t?: InvoiceListTab): InvoiceFilters => ({ ...rest, tab: t });
  const today = todayIso();

  return (
    <section className="sec sec--tight">
      <div className="container">
        <div className="inbox-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1>Fakturor</h1>
            <p className="admin-intro">
              Fakturor skapas från en accepterad offert eller för en kund i registret. En utfärdad faktura är låst; fel rättas med kreditfaktura. Säljaruppgifterna kommer från{" "}
              <Link href="/admin/innehall/foretaget" className="link-quiet">
                Företaget
              </Link>{" "}
              och{" "}
              <Link href="/admin/innehall/offert" className="link-quiet">
                Offertuppgifter
              </Link>
              .
            </p>
          </div>
          <div className="lead-quick">
            <Link href="/admin/kunder" className="btn btn-ghost">
              Kunder
            </Link>
            <Link href="/admin/fakturor/ny" className="btn btn-primary">
              Ny faktura
            </Link>
          </div>
        </div>

        <div className="kpi-row">
          <div className="kpi">
            <span>Att få in</span>
            <strong>{kr(counts.openOre)}</strong>
            <small>{counts.open} obetalda</small>
          </div>
          <div className={`kpi${counts.overdue > 0 ? " kpi--alert" : ""}`}>
            <span>Förfallet</span>
            <strong>{kr(counts.overdueOre)}</strong>
            <small>{counts.overdue} {counts.overdue === 1 ? "faktura" : "fakturor"}</small>
          </div>
          <div className="kpi">
            <span>Utkast</span>
            <strong>{counts.draft}</strong>
            <small>väntar på att utfärdas</small>
          </div>
          <div className="kpi">
            <span>Betalda</span>
            <strong>{counts.paid}</strong>
            <small>totalt</small>
          </div>
        </div>

        <nav className="inbox-tabs" aria-label="Flik">
          <Link href={`/admin/fakturor${invoiceFiltersToQuery(link())}`} aria-current={!tab ? "page" : undefined}>
            Alla <span>{counts.all}</span>
          </Link>
          {INVOICE_LIST_TABS.map((t) => (
            <Link key={t} href={`/admin/fakturor${invoiceFiltersToQuery(link(t))}`} aria-current={tab === t ? "page" : undefined} data-status={t}>
              {INVOICE_TAB_LABEL[t]} <span>{counts[t]}</span>
            </Link>
          ))}
        </nav>

        <form className="inbox-filters" action="/admin/fakturor" method="get">
          {tab && <input type="hidden" name="flik" value={tab} />}
          {filters.customerId && <input type="hidden" name="kund" value={filters.customerId} />}
          <label className="sr-only" htmlFor="f-q">
            Sök
          </label>
          <input id="f-q" name="q" type="search" placeholder="Sök nummer, kund, rubrik eller OCR…" defaultValue={filters.q} />
          <button type="submit" className="btn btn-dark">
            Sök
          </button>
          {(filters.q || filters.customerId) && (
            <Link href={`/admin/fakturor${invoiceFiltersToQuery({ tab })}`} className="link-quiet">
              Rensa
            </Link>
          )}
        </form>

        {invoices.length === 0 ? (
          <div className="inbox-empty">
            <p>{counts.all === 0 && !filters.q ? "Inga fakturor än. Skapa den första från en accepterad offert eller för en kund." : "Inga fakturor matchar."}</p>
          </div>
        ) : (
          <ul className="inbox-list">
            {invoices.map((inv) => {
              const overdue = isOverdue(inv, today);
              const remaining = inv.payableOre - inv.paidOre;
              return (
                <li key={inv.id}>
                  <Link href={`/admin/fakturor/${inv.id}`} className="inbox-row quote-row" data-status={overdue ? "overdue" : inv.status}>
                    <span className="inbox-status inv-status" data-status={overdue ? "overdue" : inv.status}>
                      {overdue ? `Förfallen ${daysBetween(inv.dueOn!, today)} d` : INVOICE_STATUS_LABEL[inv.status]}
                    </span>
                    <span className="inbox-main">
                      <strong>
                        {inv.number ?? "Utkast"} · {inv.document.buyer.name || "Utan kund"}
                      </strong>
                      <span className="inbox-meta">
                        {inv.kind === "credit" ? "Kreditfaktura" : CUSTOMER_TYPE_LABEL[inv.document.buyer.type].replace(" (omvänd betalningsskyldighet)", "")}
                        {inv.document.se.reverseCharge ? " · omvänd moms" : ""}
                        {inv.rotOre ? ` · ROT ${kr(Math.abs(inv.rotOre))}` : ""}
                        {inv.document.title ? ` · ${inv.document.title}` : ""}
                        {inv.dueOn && isOpen(inv) ? ` · förfaller ${inv.dueOn}` : ""}
                      </span>
                    </span>
                    <span className="inbox-side">
                      <strong>{kr(inv.payableOre)}</strong>
                      {inv.status === "partially_paid" ? <span>{kr(remaining)} kvar</span> : <time dateTime={inv.updatedAt}>{formatWhen(inv.updatedAt)}</time>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <p className="efield-hint" style={{ marginTop: 16 }}>
          {invoices.length} av {counts.all}.
        </p>
      </div>
    </section>
  );
}
