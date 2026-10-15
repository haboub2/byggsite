import Link from "next/link";
import { formatWhen } from "@/lib/admin-format";
import { kr } from "@/lib/quotes/math";
import { QUOTE_DIVISION_LABEL, QUOTE_STATUS_LABEL, QUOTE_STATUSES, type QuoteStatus } from "@/lib/quotes/schema";
import { countQuotesByStatus, listQuotes, parseQuoteFilters, quoteFiltersToQuery, type QuoteFilters } from "@/lib/quotes/store";
import { quoteTotals } from "@/lib/quotes/math";

export default async function QuotesList({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseQuoteFilters(await searchParams);
  const { status, ...rest } = filters;
  const [quotes, counts] = await Promise.all([listQuotes(filters), countQuotesByStatus(rest)]);
  const tab = (s?: QuoteStatus): QuoteFilters => ({ ...rest, status: s });

  return (
    <section className="sec sec--tight">
      <div className="container">
        <div className="inbox-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1>Offerter</h1>
            <p className="admin-intro">
              Skriv offerten här, ladda ner den som PDF eller mejla den direkt till kunden. Företagsuppgifterna på
              PDF:en kommer från <Link href="/admin/innehall/foretaget" className="link-quiet">Företaget</Link> och{" "}
              <Link href="/admin/innehall/offert" className="link-quiet">Offertuppgifter</Link>.
            </p>
          </div>
          <Link href="/admin/offerter/ny" className="btn btn-primary">
            Ny offert
          </Link>
        </div>

        <nav className="inbox-tabs" aria-label="Status">
          <Link href={`/admin/offerter${quoteFiltersToQuery(tab())}`} aria-current={!status ? "page" : undefined}>
            Alla <span>{counts.all}</span>
          </Link>
          {QUOTE_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/admin/offerter${quoteFiltersToQuery(tab(s))}`}
              aria-current={status === s ? "page" : undefined}
              data-status={s}
            >
              {QUOTE_STATUS_LABEL[s]} <span>{counts[s]}</span>
            </Link>
          ))}
        </nav>

        <form className="inbox-filters" action="/admin/offerter" method="get">
          {status && <input type="hidden" name="status" value={status} />}
          <label className="sr-only" htmlFor="q-q">
            Sök
          </label>
          <input id="q-q" name="q" type="search" placeholder="Sök nummer, kund eller rubrik…" defaultValue={filters.q} />
          <label className="sr-only" htmlFor="q-division">
            Verksamhet
          </label>
          <select id="q-division" name="division" defaultValue={filters.division ?? ""}>
            <option value="">Bygg och Software</option>
            <option value="bygg">Bygg</option>
            <option value="01">Software</option>
          </select>
          <button type="submit" className="btn btn-dark">
            Filtrera
          </button>
          {(filters.q || filters.division) && (
            <Link href={`/admin/offerter${quoteFiltersToQuery({ status })}`} className="link-quiet">
              Rensa
            </Link>
          )}
        </form>

        {quotes.length === 0 ? (
          <div className="inbox-empty">
            <p>
              {counts.all === 0 && !filters.q && !filters.division
                ? "Inga offerter än. Skapa den första från en mall, eller direkt från en förfrågan i inkorgen."
                : "Inga offerter matchar filtret."}
            </p>
          </div>
        ) : (
          <ul className="inbox-list">
            {quotes.map((q) => {
              const t = quoteTotals(q.data);
              return (
                <li key={q.id}>
                  <Link href={`/admin/offerter/${q.id}`} className="inbox-row quote-row" data-status={q.status}>
                    <span className="inbox-status">{QUOTE_STATUS_LABEL[q.status]}</span>
                    <span className="inbox-main">
                      <strong>
                        {q.number} · {q.data.customer.company || q.data.customer.name || "Utan kund"}
                      </strong>
                      <span className="inbox-meta">
                        {QUOTE_DIVISION_LABEL[q.data.division]}
                        {q.data.title ? ` · ${q.data.title}` : ""}
                        {q.data.customer.type === "privat" ? " · Privatperson" : " · Företag"}
                      </span>
                    </span>
                    <span className="inbox-side">
                      <strong>{kr(t.pay)}</strong>
                      <time dateTime={q.updated_at}>{formatWhen(q.updated_at)}</time>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
