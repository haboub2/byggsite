import Link from "next/link";
import { togglePhaseAction } from "@/app/admin/portal-actions";
import { formatWhen } from "@/lib/admin-format";
import { formatRange, formatWeekday } from "@/lib/portal/format";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, type ProjectStatus } from "@/lib/portal/schema";
import { listOverduePhases, listProjects } from "@/lib/portal/store";

export default async function PortalProjectsList({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = PROJECT_STATUSES.includes(params.status as ProjectStatus) ? (params.status as ProjectStatus) : undefined;
  const error = typeof params.fel === "string" ? params.fel : undefined;
  const [all, overdue] = await Promise.all([listProjects(), listOverduePhases()]);
  const shown = status ? all.filter((p) => p.status === status) : all;
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
          <Link href="/admin/projekt" aria-current={!status ? "page" : undefined}>
            Alla <span>{count()}</span>
          </Link>
          {PROJECT_STATUSES.map((s) => (
            <Link key={s} href={`/admin/projekt?status=${s}`} aria-current={status === s ? "page" : undefined}>
              {PROJECT_STATUS_LABEL[s]} <span>{count(s)}</span>
            </Link>
          ))}
        </nav>

        {shown.length === 0 ? (
          <div className="inbox-empty">
            <p>{all.length === 0 ? "Inga projekt än. Skapa det första från en accepterad offert." : "Inga projekt med den statusen."}</p>
          </div>
        ) : (
          <ul className="inbox-list">
            {shown.map((p) => {
              const moved = p.planned_ends_on && p.ends_on && p.planned_ends_on !== p.ends_on;
              return (
                <li key={p.id}>
                  <Link href={`/admin/projekt/${p.id}`} className="inbox-row" data-status={p.status}>
                    <span className="inbox-status">{PROJECT_STATUS_LABEL[p.status]}</span>
                    <span className="inbox-main">
                      <strong>{p.title}</strong>
                      <span className="inbox-meta">{[p.customer_name, p.address].filter(Boolean).join(" · ")}</span>
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
