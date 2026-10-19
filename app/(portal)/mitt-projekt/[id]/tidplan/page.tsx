import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fileHref } from "@/lib/portal/files-href";
import { formatDay, formatLongDay, formatWeekday } from "@/lib/portal/format";
import { currentPhase, type ProjectPhoto } from "@/lib/portal/schema";
import { shiftLine } from "@/lib/portal/timeline";
import { formatDays } from "@/lib/workdays";
import { getProjectBundle } from "@/lib/portal/store";

export const metadata: Metadata = { title: "Tidplan" };

const range = (a: string | null, b: string | null) => (!a ? "" : a === b || !b ? formatWeekday(a) : `${formatWeekday(a)} – ${formatWeekday(b)}`);

/** A phase's photos grouped by day, oldest day first. */
function byDay(photos: ProjectPhoto[]): [string, ProjectPhoto[]][] {
  const days = new Map<string, ProjectPhoto[]>();
  for (const p of photos) days.set(p.day, [...(days.get(p.day) ?? []), p]);
  return [...days].sort(([a], [b]) => a.localeCompare(b));
}

export default async function PortalTimeline({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getProjectBundle(id);
  if (!bundle) notFound();
  const { project, phases, shifts, photos, changeOrders } = bundle;
  const current = currentPhase(phases);
  const moved = project.planned_ends_on && project.ends_on && project.planned_ends_on !== project.ends_on;
  const ataNumber = (orderId: string | null) => changeOrders.find((o) => o.id === orderId)?.number;

  return (
    <div className="portal-stack">
      <section className="portal-card">
        <h2>Tidplan</h2>
        {project.ends_on && (
          <div className="portal-end">
            <p>
              Slut: <strong>{formatWeekday(project.ends_on)}</strong>
              {moved && <span> (ursprungligen {formatWeekday(project.planned_ends_on)})</span>}
            </p>
            {shifts.length > 0 && (
              <ul className="portal-shifts">
                {shifts.map((s) => (
                  <li key={s.id}>
                    {shiftLine(s)} <span className="portal-when">· {formatDay(s.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {phases.length === 0 ? (
          <p>Tidplanen läggs upp inom kort.</p>
        ) : (
          <ol className="portal-timeline">
            {phases.map((p) => {
              const state = p.done_at ? "done" : p.id === current?.id ? "current" : "todo";
              const delays = shifts.filter((s) => s.kind === "delay" && s.phase_id === p.id);
              const days = byDay(photos.filter((ph) => ph.phase_id === p.id));
              const dates = range(p.starts_on, p.ends_on);
              const number = ataNumber(p.change_order_id);
              return (
                <li key={p.id} data-state={state}>
                  <span className="portal-timeline-dot" aria-hidden="true">
                    {state === "done" ? "✓" : ""}
                  </span>
                  <span className="portal-timeline-text">
                    <strong>
                      {p.name}
                      {p.change_order_id && !p.name.startsWith("ÄTA") && <span className="etag portal-ata-tag">ÄTA {number ?? ""}</span>}
                    </strong>
                    <span>
                      {state === "done" ? "Klar" : state === "current" ? "Pågår" : "Kommer"}
                      {dates ? ` · ${dates}` : ""}
                    </span>
                    {delays.map((s) => (
                      <span key={s.id} className="portal-delay">
                        Försenad {formatDays(s.days)}: {s.reason}
                      </span>
                    ))}
                    {days.length > 0 && (
                      <details className="portal-phase-photos">
                        <summary>
                          {days.length === 1 ? "1 dag" : `${days.length} dagar`} med foton
                        </summary>
                        {days.map(([day, list]) => (
                          <div key={day} className="portal-phase-day">
                            <p className="portal-when">{formatLongDay(`${day}T12:00:00`)}</p>
                            <ul className="portal-photos portal-photos--small">
                              {list.map((ph) => (
                                <li key={ph.id}>
                                  <a href={fileHref(ph.path)} target="_blank" rel="noreferrer">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={fileHref(ph.path)} alt={ph.caption} loading="lazy" />
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </details>
                    )}
                    {(days.length > 0 || p.summary.trim()) && (
                      <Link href={`/mitt-projekt/${project.id}/dokumentation?vy=fas#fas-${p.id}`} className="portal-phase-doc">
                        Se fasens dokumentation →
                      </Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <p className="portal-note">
          Datumen räknas i arbetsdagar och hoppar över helger och röda dagar. Slutdatumet flyttas bara om något försenas eller om du godkänner en ändring som tar tid,
          och då står orsaken här.
        </p>
      </section>
    </div>
  );
}
