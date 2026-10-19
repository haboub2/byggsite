import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { documentationTree } from "@/lib/portal/documentation";
import { fileHref } from "@/lib/portal/files-href";
import { formatLongDay, formatWeekday } from "@/lib/portal/format";
import { getProjectBundle } from "@/lib/portal/store";
import ReportDownload from "@/components/portal/ReportDownload";

export const metadata: Metadata = { title: "Dokumentation" };

const range = (a: string | null, b: string | null) => (!a ? "" : a === b || !b ? formatWeekday(a) : `${formatWeekday(a)} – ${formatWeekday(b)}`);

/**
 * Dokumentation: the diary (newest first, as before) or the same content per
 * phase and day, like the report. Only phases and days with content show.
 */
export default async function PortalDocumentation({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const bundle = await getProjectBundle(id);
  if (!bundle) notFound();
  const { project, updates, phases, photos } = bundle;
  const byPhase = q.vy === "fas";
  const base = `/mitt-projekt/${project.id}/dokumentation`;
  const chapters = documentationTree(phases, updates, photos, { withEmpty: true }).filter((c) => c.days.length > 0 || c.phase?.summary.trim());

  return (
    <div className="portal-stack">
      <section className="portal-card">
        <div className="doc-portal-head">
          <h2>Dokumentation</h2>
          <nav className="doc-views" aria-label="Visa">
            <Link href={base} aria-current={!byPhase ? "page" : undefined} replace scroll={false}>
              Dagbok
            </Link>
            <Link href={`${base}?vy=fas`} aria-current={byPhase ? "page" : undefined} replace scroll={false}>
              Per fas
            </Link>
          </nav>
        </div>
        <ReportDownload project={project} />
      </section>

      {!byPhase ? (
        <section className="portal-card">
          <h2>Från bygget</h2>
          {updates.length === 0 ? (
            <p>Inga uppdateringar än. Här kommer korta rapporter och foton medan vi bygger.</p>
          ) : (
            <ul className="portal-diary">
              {updates.map((u) => (
                <li key={u.id}>
                  <p className="portal-when">
                    {formatLongDay(`${u.day}T12:00:00`)}
                    {u.phase_id ? ` · ${phases.find((p) => p.id === u.phase_id)?.name ?? ""}` : ""}
                  </p>
                  {u.body && <p>{u.body}</p>}
                  {u.photos.length > 0 && (
                    <ul className="portal-photos">
                      {u.photos.map((p) => (
                        <li key={p}>
                          <a href={fileHref(p)} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={fileHref(p)} alt="" loading="lazy" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : chapters.length === 0 && !project.final_summary.trim() ? (
        <section className="portal-card">
          <p>Inget dokumenterat än. Foton och anteckningar sorteras här per fas och dag medan vi bygger.</p>
        </section>
      ) : (
        <>
          {chapters.map((c) => (
            <section key={c.phase?.id ?? "utan-fas"} id={c.phase ? `fas-${c.phase.id}` : "utan-fas"} className="portal-card doc-portal-chapter">
              <h2>{c.phase ? c.phase.name : "Övrigt från bygget"}</h2>
              {c.phase && (
                <p className="portal-when">
                  {[range(c.phase.starts_on, c.phase.ends_on), c.phase.done_at ? "Klar" : ""].filter(Boolean).join(" · ")}
                </p>
              )}
              {c.phase?.summary.trim() && <p className="doc-portal-summary">{c.phase.summary}</p>}
              {c.days.map((d) => (
                <div key={d.day} className="doc-portal-day">
                  <h3>{formatLongDay(`${d.day}T12:00:00`)}</h3>
                  {d.notes.map((n) => (
                    <p key={n.id}>{n.body}</p>
                  ))}
                  {d.photos.length > 0 && (
                    <ul className="doc-portal-photos">
                      {d.photos.map((ph) => (
                        <li key={ph.id} data-figure={ph.caption ? "1" : undefined}>
                          <a href={fileHref(ph.path)} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={fileHref(ph.path)} alt={ph.caption} loading="lazy" />
                          </a>
                          {ph.caption && <span>{ph.caption}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          ))}
          {project.final_summary.trim() && (
            <section className="portal-card" id="slutdokumentation">
              <h2>Slutdokumentation</h2>
              {project.final_summary
                .split(/\n+/)
                .filter((l) => l.trim())
                .map((l, i) => (
                  <p key={i}>{l}</p>
                ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
