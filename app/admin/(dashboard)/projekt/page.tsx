import Link from "next/link";
import { togglePhaseAction } from "@/app/admin/portal-actions";
import { formatWhen } from "@/lib/admin-format";
import { documentationHealth, missingPhotosLine } from "@/lib/portal/documentation";
import { formatDay, formatRange, formatWeekday, todayIso } from "@/lib/portal/format";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, type PortalProject, type ProjectStatus } from "@/lib/portal/schema";
import { listDocumentationOverview, listOverduePhases, listProjects } from "@/lib/portal/store";

/** The year an archived project belongs to: when it was done (locked), else when it started. */
const yearOf = (p: PortalProject) => (p.archived_at || p.starts_on || p.created_at).slice(0, 4);

/** Archive search: every word must be found in the customer, the address or the title. */
function matches(p: PortalProject, q: string): boolean {
  const hay = [p.customer_name, p.address, p.title].join(" ").toLocaleLowerCase("sv");
  return q
    .toLocaleLowerCase("sv")
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export default async function PortalProjectsList({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const archive = params.arkiv === "1";
  const status = !archive && PROJECT_STATUSES.includes(params.status as ProjectStatus) ? (params.status as ProjectStatus) : undefined;
  const error = typeof params.fel === "string" ? params.fel : undefined;
  // ?vy=tavla shows the open projects as a board, one column per status.
  const board = !archive && !status && params.vy === "tavla";
  const search = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const year = typeof params.ar === "string" && /^\d{4}$/.test(params.ar) ? params.ar : "";
  const [all, overdue] = await Promise.all([listProjects(), listOverduePhases()]);
  const archived = all.filter((p) => p.archived_at);
  const years = [...new Set(archived.map(yearOf))].sort().reverse();
  const shown = archive
    ? archived.filter((p) => (!year || yearOf(p) === year) && (!search || matches(p, search))).sort((a, b) => (b.archived_at ?? "").localeCompare(a.archived_at ?? ""))
    : status
      ? all.filter((p) => p.status === status)
      : all;
  // Photo health for the projects still being documented.
  const today = todayIso();
  const open = shown.filter((p) => !p.archived_at);
  const overview = archive ? { phases: [], photos: [] } : await listDocumentationOverview(open.map((p) => p.id));
  const health = new Map(
    open.map((p) => [
      p.id,
      documentationHealth(
        p,
        overview.phases.filter((ph) => ph.project_id === p.id),
        overview.photos.filter((ph) => ph.project_id === p.id),
        today
      ),
    ])
  );
  const count = (s?: ProjectStatus) => (s ? all.filter((p) => p.status === s).length : all.length);
  const byId = new Map(all.map((p) => [p.id, p]));
  const nudges = overdue.filter((ph) => byId.has(ph.project_id));

  return (
    <section className="sec sec--tight">
      <div className="container">
        <div className="inbox-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1>Byggprojekt</h1>
            <p className="admin-intro">
              Varje pågående jobb som kunden följer i <Link href="/mitt-projekt" className="link-quiet">Mitt projekt</Link>: tidplan,
              foton och dokument. Skapa projektet från en accepterad offert, bjud sedan in kunden.
            </p>
          </div>
          <Link href="/admin/projekt/ny" className="btn btn-primary">
            Nytt projekt
          </Link>
        </div>

        {error && (
          <p className="form-feedback error" role="alert" style={{ marginTop: 14 }}>
            {error}
          </p>
        )}

        {nudges.length > 0 && (
          <section className="tl-nudge" aria-labelledby="nudge-h">
            <h2 id="nudge-h">Borde vara klart</h2>
            <p className="inbox-meta">Enligt tidplanen skulle de här faserna vara klara. Bocka av, eller lägg in en försening så att kunden ser varför.</p>
            <ul>
              {nudges.map((ph) => {
                const p = byId.get(ph.project_id)!;
                return (
                  <li key={ph.id}>
                    <span className="tl-nudge-text">
                      <strong>{ph.name}</strong>
                      <span className="inbox-meta">
                        {p.title}
                        {p.customer_name ? ` · ${p.customer_name}` : ""} · skulle vara klar {formatWeekday(ph.ends_on)}
                      </span>
                    </span>
                    <span className="tl-nudge-actions">
                      <form action={togglePhaseAction}>
                        <input type="hidden" name="project" value={p.id} />
                        <input type="hidden" name="phase" value={ph.id} />
                        <input type="hidden" name="done" value="1" />
                        <input type="hidden" name="back" value="list" />
                        <button type="submit" className="btn btn-dark">
                          Klar
                        </button>
                      </form>
                      <Link href={`/admin/projekt/${p.id}?forsening=${ph.id}#fas-${ph.id}`} className="btn btn-ghost">
                        Försening
                      </Link>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <nav className="inbox-tabs" aria-label="Status">
          <Link href="/admin/projekt" aria-current={!status && !archive ? "page" : undefined}>
            Alla <span>{count()}</span>
          </Link>
          {PROJECT_STATUSES.map((s) => (
            <Link key={s} href={`/admin/projekt?status=${s}`} aria-current={status === s ? "page" : undefined}>
              {PROJECT_STATUS_LABEL[s]} <span>{count(s)}</span>
            </Link>
          ))}
          <Link href="/admin/projekt?arkiv=1" aria-current={archive ? "page" : undefined}>
            Arkiv <span>{archived.length}</span>
          </Link>
        </nav>

        {!archive && !status && (
          <nav className="lp-view" aria-label="Visning">
            <Link href="/admin/projekt" aria-current={!board ? "page" : undefined}>
              Lista
            </Link>
            <Link href="/admin/projekt?vy=tavla" aria-current={board ? "page" : undefined}>
              Tavla
            </Link>
          </nav>
        )}

        {board && shown.length > 0 && (
          <div className="pb">
            {PROJECT_STATUSES.map((s) => {
              const col = shown.filter((p) => p.status === s && !p.archived_at);
              return (
                <section key={s} className="pb-col" aria-labelledby={`pb-${s}`}>
                  <h2 id={`pb-${s}`}>
                    {PROJECT_STATUS_LABEL[s]} <span>{col.length}</span>
                  </h2>
                  {col.length === 0 && <p className="inbox-meta">Inga projekt.</p>}
                  {col.map((p) => {
                    const h = health.get(p.id);
                    const late = nudges.some((ph) => ph.project_id === p.id);
                    return (
                      <article key={p.id} className={late ? "pb-card pb-card--late" : "pb-card"}>
                        <Link href={`/admin/projekt/${p.id}`} className="pb-card-main">
                          <strong>{p.title}</strong>
                          <span className="inbox-meta">{[p.customer_name, p.address].filter(Boolean).join(" · ")}</span>
                          <span className="inbox-meta">{formatRange(p.starts_on, p.ends_on) || "Inga datum"}</span>
                          {late && <span className="doc-warn">En fas borde vara klar</span>}
                          {h?.missing.length ? <span className="doc-warn">{missingPhotosLine(h.missing)}</span> : null}
                        </Link>
                        {s === "active" && (
                          <div className="pb-card-actions">
                            <Link href={`/admin/projekt/${p.id}#ny-uppdatering`}>Foto och rad</Link>
                            <Link href={`/admin/projekt/${p.id}#tidplan`}>Tidplan</Link>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </section>
              );
            })}
          </div>
        )}

        {archive && (
          <form className="doc-archive-search" action="/admin/projekt" role="search">
            <input type="hidden" name="arkiv" value="1" />
            <input name="q" defaultValue={search} placeholder="Sök kund, adress eller projekt" aria-label="Sök i arkivet" />
            <select name="ar" defaultValue={year} aria-label="År">
              <option value="">Alla år</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-ghost">
              Sök
            </button>
          </form>
        )}

        {shown.length === 0 ? (
          <div className="inbox-empty">
            <p>
              {all.length === 0
                ? "Inga projekt än. Skapa det första från en accepterad offert."
                : archive
                  ? archived.length === 0
                    ? "Arkivet är tomt. Ett projekt hamnar här när dess dokumentation låses."
                    : "Inget i arkivet matchar sökningen."
                  : "Inga projekt med den statusen."}
            </p>
          </div>
        ) : board ? null : (
          <ul className="inbox-list">
            {shown.map((p) => {
              const moved = p.planned_ends_on && p.ends_on && p.planned_ends_on !== p.ends_on;
              if (archive) {
                return (
                  <li key={p.id} className="doc-archive-row">
                    <a href={`/admin/projekt/${p.id}/rapport`} target="_blank" rel="noreferrer" className="inbox-row" data-status={p.status}>
                      <span className="inbox-status">{yearOf(p)}</span>
                      <span className="inbox-main">
                        <strong>{p.title}</strong>
                        <span className="inbox-meta">{[p.customer_name, p.address].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="inbox-side">
                        <strong>Öppna rapporten</strong>
                        <span className="inbox-meta">låst {formatDay(p.archived_at)}</span>
                      </span>
                    </a>
                    <Link href={`/admin/projekt/${p.id}`} className="link-quiet doc-archive-open">
                      Till projektet
                    </Link>
                  </li>
                );
              }
              const h = health.get(p.id);
              const docLine = h && h.daysSoFar > 0 ? `Foton ${h.daysWithPhotos} av ${h.daysSoFar} dagar` : "";
              return (
                <li key={p.id}>
                  <Link href={`/admin/projekt/${p.id}`} className="inbox-row" data-status={p.status}>
                    <span className="inbox-status">{PROJECT_STATUS_LABEL[p.status]}</span>
                    <span className="inbox-main">
                      <strong>{p.title}</strong>
                      <span className="inbox-meta">{[p.customer_name, p.address].filter(Boolean).join(" · ")}</span>
                      {docLine || h?.missing.length ? (
                        <span className="inbox-meta doc-row-health">
                          {docLine}
                          {h?.missing.length ? <span className="doc-warn">{missingPhotosLine(h.missing)}</span> : null}
                        </span>
                      ) : null}
                      {p.archived_at && <span className="inbox-meta">Dokumentationen låst {formatDay(p.archived_at)}</span>}
                    </span>
                    <span className="inbox-side">
                      <strong>{formatRange(p.starts_on, p.ends_on) || "Inga datum"}</strong>
                      {moved ? <span className="inbox-meta">ursprungligen {formatWeekday(p.planned_ends_on)}</span> : <time dateTime={p.updated_at}>{formatWhen(p.updated_at)}</time>}
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
