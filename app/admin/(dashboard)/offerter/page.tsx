import Link from "next/link";
import { formatWhen } from "@/lib/admin-format";
import { kr } from "@/lib/quotes/math";
import { QUOTE_DIVISION_LABEL, QUOTE_STATUS_LABEL, QUOTE_STATUSES, type Quote, type QuoteStatus } from "@/lib/quotes/schema";
import { countQuotesByStatus, listQuotes, parseQuoteFilters, quoteFiltersToQuery, type QuoteFilters } from "@/lib/quotes/store";
import { quoteTotals } from "@/lib/quotes/math";

export default async function QuotesList({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const filters = parseQuoteFilters(raw);
  const { status, ...rest } = filters;
  const [quotes, counts] = await Promise.all([listQuotes(filters), countQuotesByStatus(rest)]);
  const tab = (s?: QuoteStatus): QuoteFilters => ({ ...rest, status: s });
  // ?valj=ID shows the quote beside the list, so the list stays where it was.
  const pickedId = typeof raw.valj === "string" ? raw.valj : "";
  const picked = quotes.find((q) => q.id === pickedId) ?? null;
  const base = quoteFiltersToQuery(filters);
  const pick = (id: string) => `/admin/offerter${base}${base ? "&" : "?"}valj=${id}`;

  return (
    <section className="sec sec--tight">
      <div className="container">
        <div className="inbox-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1>Offerter</h1>
            <p className="admin-intro">
              Skriv offerten här, ladda ner den som PDF eller mejla den direkt till kunden. Säljaren, betalningen,
              villkoren och undertecknaren på PDF:en kommer från{" "}
              <Link href="/admin/installningar" className="link-quiet">Inställningar</Link>.
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
          <div className={picked ? "lp" : undefined}>
          <ul className="inbox-list">
            {quotes.map((q) => {
              const t = quoteTotals(q.data);
              return (
                <li key={q.id}>
                  <Link
                    href={pick(q.id)}
                    scroll={false}
                    className="inbox-row quote-row"
                    data-status={q.status}
                    aria-current={picked?.id === q.id ? "true" : undefined}
                  >
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
          {picked && <QuotePreview q={picked} close={`/admin/offerter${base}`} />}
          </div>
        )}
      </div>
    </section>
  );
}

function QuotePreview({ q, close }: { q: Quote; close: string }) {
  const t = quoteTotals(q.data);
  const c = q.data.customer;
  const validUntil = new Date(Date.parse(`${q.data.date}T12:00:00Z`) + q.data.validDays * 86_400_000).toISOString().slice(0, 10);
  const facts: [string, string][] = [
    ["Kund", [c.company, c.name].filter(Boolean).join(", ") || "Utan kund"],
    ["Kontakt", [c.phone, c.email].filter(Boolean).join(" · ") || "Saknas"],
    ["Adress", [c.street, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Saknas"],
    ["Datum", q.data.date],
    ["Giltig till", validUntil],
    ["Skickad", q.sent_at ? formatWhen(q.sent_at) : "Inte än"],
  ];
  return (
    <aside className="lp-panel" aria-label={`Offert ${q.number}`}>
      <div className="lp-head">
        <span className="inbox-status" data-status={q.status}>
          {QUOTE_STATUS_LABEL[q.status]}
        </span>
        <Link href={close} scroll={false} className="lp-close" aria-label="Stäng">
          ×
        </Link>
      </div>
      <h2 className="lp-title">
        Offert {q.number}
        <span>{q.data.title || "Utan rubrik"}</span>
      </h2>
      <p className="lp-amount">
        {kr(t.pay)}
        {t.rot && <span>efter {t.deductionKind === "rut" ? "RUT" : "ROT"}, {kr(t.gross)} före</span>}
      </p>
      <dl className="lp-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="lp-actions">
        <Link href={`/admin/offerter/${q.id}`} className="btn btn-primary">
          Öppna offerten
        </Link>
        <a href={`/admin/offerter/${q.id}/pdf`} target="_blank" rel="noreferrer" className="btn btn-ghost">
          PDF
        </a>
        {q.status === "accepted" && (
          <Link href="/admin/projekt/ny" className="btn btn-ghost">
            Skapa projekt
          </Link>
        )}
        {c.phone && (
          <a href={`tel:${c.phone.replace(/\s+/g, "")}`} className="btn btn-ghost">
            Ring
          </a>
        )}
      </div>
    </aside>
  );
}
