import Link from "next/link";
import { notFound } from "next/navigation";
import { fileHref } from "@/lib/portal/files-href";
import { formatLongDay, formatRange } from "@/lib/portal/format";
import { currentPhase, formatKr, pendingChangeOrders } from "@/lib/portal/schema";
import { getProjectBundle } from "@/lib/portal/store";

export default async function PortalOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getProjectBundle(id);
  if (!bundle) notFound();
  const { project, phases, updates, changeOrders } = bundle;
  const pending = pendingChangeOrders(changeOrders);
  const phase = currentPhase(phases);
  const next = phase ? phases[phases.indexOf(phase) + 1] : null;
  const latest = updates[0];
  const tel = project.contact_phone.replace(/\s/g, "");

  return (
    <div className="portal-stack">
      {pending.length > 0 && (
        <section className="portal-card portal-card--attention">
          <h2>
            <span className="portal-badge" aria-hidden="true">
              {pending.length}
            </span>
            Väntar på ditt svar
          </h2>
          <ul className="portal-attention-list">
            {pending.map((o) => (
              <li key={o.id}>
                <Link href={`/mitt-projekt/${project.id}/andringar#ata-${o.number}`}>
                  <strong>
                    ÄTA {o.number}: {o.title}
                  </strong>
                  <span>{formatKr(o.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href={`/mitt-projekt/${project.id}/andringar`} className="portal-more">
            Godkänn eller avböj →
          </Link>
        </section>
      )}

      {(project.this_week || phase) && (
        <section className="portal-card">
          <h2>Den här veckan</h2>
          {project.this_week ? <p>{project.this_week}</p> : <p>Vi arbetar med <strong>{phase?.name}</strong>{phase?.ends_on ? `, beräknat klart ${formatRange(null, phase.ends_on)}` : ""}.</p>}
        </section>
      )}

      <section className="portal-card">
        <h2>Nästa steg</h2>
        {project.next_step ? (
          <p>{project.next_step}</p>
        ) : next ? (
          <p>
            <strong>{next.name}</strong>
            {formatRange(next.starts_on, next.ends_on) ? ` · ${formatRange(next.starts_on, next.ends_on)}` : ""}
          </p>
        ) : (
          <p>{phases.every((p) => p.done_at) && phases.length ? "Alla faser är klara." : "Tidplanen fylls på snart."}</p>
        )}
        <Link href={`/mitt-projekt/${project.id}/tidplan`} className="portal-more">
          Hela tidplanen →
        </Link>
      </section>

      {latest && (
        <section className="portal-card">
          <h2>Senaste från bygget</h2>
          <p className="portal-when">{formatLongDay(latest.created_at)}</p>
          {latest.body && <p>{latest.body}</p>}
          {latest.photos.length > 0 && (
            <ul className="portal-photos">
              {latest.photos.slice(0, 3).map((p) => (
                <li key={p}>
                  <a href={fileHref(p)} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fileHref(p)} alt="" loading="lazy" />
                  </a>
                </li>
              ))}
            </ul>
          )}
          <Link href={`/mitt-projekt/${project.id}/foton`} className="portal-more">
            Alla uppdateringar →
          </Link>
        </section>
      )}

      {(project.contact_name || tel) && (
        <section className="portal-card portal-contact">
          <h2>Din kontakt</h2>
          <p>
            <strong>{project.contact_name || "Binaafy Bygg"}</strong>
            {tel && <span className="portal-when">{project.contact_phone}</span>}
          </p>
          {tel && (
            <div className="portal-contact-actions">
              <a href={`tel:${tel}`} className="btn btn-primary">
                Ring
              </a>
              <a href={`sms:${tel}`} className="btn btn-ghost">
                Sms
              </a>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
