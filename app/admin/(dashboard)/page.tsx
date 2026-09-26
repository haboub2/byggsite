import Link from "next/link";
import {
  listLeads,
  countByStatus,
  parseFilters,
  filtersToQuery,
  PAGE_SIZE,
  STATUSES,
  STATUS_LABEL,
  KIND_LABEL,
  DIVISION_LABEL,
  type LeadFilters,
} from "@/lib/leads";
import { formatWhen } from "@/lib/admin-format";

export default async function LeadsInbox({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const page = Math.max(1, Number(params.page) || 1);
  const { status, ...rest } = filters;

  const [{ leads, total }, counts] = await Promise.all([
    listLeads(filters, { page }),
    countByStatus(rest),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const tab = (s?: (typeof STATUSES)[number]): LeadFilters => ({ ...rest, status: s });

  return (
    <section className="sec sec--tight">
      <div className="container">
        <div className="inbox-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1>Förfrågningar</h1>
          </div>
          <a href={`/admin/export${filtersToQuery(filters)}`} className="btn btn-ghost">
            Exportera CSV
          </a>
        </div>

        <nav className="inbox-tabs" aria-label="Status">
          <Link href={`/admin${filtersToQuery(tab())}`} aria-current={!status ? "page" : undefined}>
            Alla <span>{counts.all}</span>
          </Link>
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={`/admin${filtersToQuery(tab(s))}`}
              aria-current={status === s ? "page" : undefined}
              data-status={s}
            >
              {STATUS_LABEL[s]} <span>{counts[s]}</span>
            </Link>
          ))}
        </nav>

        <form className="inbox-filters" action="/admin" method="get">
          {status && <input type="hidden" name="status" value={status} />}
          <label className="sr-only" htmlFor="f-q">
            Sök
          </label>
          <input id="f-q" name="q" type="search" placeholder="Sök namn, e-post, telefon, text…" defaultValue={filters.q} />
          <label className="sr-only" htmlFor="f-division">
            Verksamhet
          </label>
          <select id="f-division" name="division" defaultValue={filters.division ?? ""}>
            <option value="">Bygg och Software</option>
            <option value="bygg">Bygg</option>
            <option value="01">Software</option>
          </select>
          <label className="sr-only" htmlFor="f-kind">
            Typ
          </label>
          <select id="f-kind" name="kind" defaultValue={filters.kind ?? ""}>
            <option value="">Alla typer</option>
            <option value="offert">Offert</option>
            <option value="brief">Brief</option>
            <option value="kontakt">Kontakt</option>
          </select>
          <button type="submit" className="btn btn-dark">
            Filtrera
          </button>
          {(filters.q || filters.division || filters.kind) && (
            <Link href={`/admin${filtersToQuery({ status })}`} className="link-quiet">
              Rensa
            </Link>
          )}
        </form>

        {leads.length === 0 ? (
          <div className="inbox-empty">
            <p>
              {counts.all === 0 && !filters.q && !filters.division && !filters.kind
                ? "Inga förfrågningar än. De dyker upp här så fort någon skickar ett formulär på sajten."
                : "Inga förfrågningar matchar filtret."}
            </p>
          </div>
        ) : (
          <ul className="inbox-list">
            {leads.map((l) => (
              <li key={l.id}>
                <Link href={`/admin/leads/${l.id}`} className="inbox-row" data-status={l.status}>
                  <span className="inbox-status">{STATUS_LABEL[l.status]}</span>
                  <span className="inbox-main">
                    <strong>{l.name || l.email || "Utan namn"}</strong>
                    <span className="inbox-meta">
                      {KIND_LABEL[l.kind]} · {DIVISION_LABEL[l.division]}
                      {l.service ? ` · ${l.service}` : ""}
                    </span>
                    {l.message && <span className="inbox-snippet">{l.message}</span>}
                  </span>
                  <span className="inbox-side">
                    <time dateTime={l.created_at}>{formatWhen(l.created_at)}</time>
                    {l.phone && <span>{l.phone}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {pages > 1 && (
          <nav className="inbox-pages" aria-label="Sidor">
            {page > 1 && (
              <Link href={`/admin${filtersToQuery(filters, { page: String(page - 1) })}`} className="link-quiet">
                Föregående
              </Link>
            )}
            <span>
              Sida {page} av {pages}
            </span>
            {page < pages && (
              <Link href={`/admin${filtersToQuery(filters, { page: String(page + 1) })}`} className="link-quiet">
                Nästa
              </Link>
            )}
          </nav>
        )}
      </div>
    </section>
  );
}
