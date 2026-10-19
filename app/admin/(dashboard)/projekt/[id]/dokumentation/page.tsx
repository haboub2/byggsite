import Link from "next/link";
import { notFound } from "next/navigation";
import { lockAction, unlockAction } from "@/app/admin/documentation-actions";
import { NoteCard, PhotoCard, SummaryField } from "@/components/admin/portal/DocumentationEditor";
import { chapterPhotoCount, documentationHealth, documentationTree, missingPhotosLine } from "@/lib/portal/documentation";
import { formatDay, formatLongDay, formatWeekday, todayIso } from "@/lib/portal/format";
import { PROJECT_STATUS_LABEL } from "@/lib/portal/schema";
import { getProjectBundle } from "@/lib/portal/store";

/** Locking renders the final report inside the action. */
export const maxDuration = 60;

const FLASH: Record<string, string> = {
  last: "Dokumentationen är låst. Kunden hittar slutrapporten under Dokument och Dokumentation, och zip-filen med originalfotona byggs nu.",
  upplast: "Dokumentationen är upplåst och kan ändras. Lås den igen när den är klar.",
};

const range = (a: string | null, b: string | null) => (!a ? "" : a === b || !b ? formatWeekday(a) : `${formatWeekday(a)} – ${formatWeekday(b)}`);

/**
 * The documentation of one project: the tree phase → day → notes and
 * photos, where the team moves a photo to the right phase or day, writes
 * captions, leaves a photo out of the report, writes each phase's summary
 * and the final summary, and finally locks it all for the customer.
 */
export default async function ProjectDocumentation({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const bundle = await getProjectBundle(id);
  if (!bundle) notFound();
  const { project, phases, updates, photos } = bundle;
  const today = todayIso();
  const locked = Boolean(project.archived_at);
  const tree = documentationTree(phases, updates, photos, { withEmpty: true });
  // Content without a phase needs a home: show it first.
  const ordered = [...tree.filter((c) => !c.phase), ...tree.filter((c) => c.phase)];
  const health = documentationHealth(project, phases, photos, today);
  const options = phases.map((p) => ({ id: p.id, name: p.name }));
  const flash = typeof q.sparat === "string" ? FLASH[q.sparat] : undefined;
  const error = typeof q.fel === "string" ? q.fel : undefined;
  const inReport = photos.filter((p) => p.in_report).length;

  return (
    <section className="sec sec--tight">
      <div className="container" style={{ maxWidth: 960 }}>
        <Link href={`/admin/projekt/${project.id}`} className="link-quiet">
          ← {project.title}
        </Link>

        <div className="lead-head">
          <div>
            <span className="eyebrow">Dokumentation · {PROJECT_STATUS_LABEL[project.status]}</span>
            <h1 className="admin-h1">{project.title}</h1>
            <p className="admin-intro">
              Varje foto hör till en fas och en dag. Flytta det som hamnat fel, skriv bildtexter där det behövs och en kort sammanfattning per fas. Ett foto med
              bildtext blir en stor bild i rapporten, de andra hamnar i dagens bildrutnät.
            </p>
          </div>
        </div>

        {flash && <p className="admin-flash">{flash}</p>}
        {error && (
          <p className="form-feedback error" role="alert" style={{ marginTop: 14 }}>
            {error}
          </p>
        )}

        <div className="doc-panel">
          <div className="doc-panel-facts">
            <span>
              <strong>
                {health.daysWithPhotos} av {health.daysSoFar}
              </strong>{" "}
              dagar hittills har foton
            </span>
            <span>
              <strong>{inReport}</strong> av {photos.length} foton med i rapporten
            </span>
            {health.missing.length > 0 && <span className="doc-warn">{missingPhotosLine(health.missing)}</span>}
          </div>
          <div className="doc-panel-actions">
            <a href={`/admin/projekt/${project.id}/rapport`} target="_blank" rel="noreferrer" className="btn btn-ghost">
              Visa PDF
            </a>
            <a href={`/admin/projekt/${project.id}/rapport?ladda-ner=1`} className="btn btn-ghost">
              Ladda ner PDF
            </a>
            {locked && (
              <a href={`/admin/projekt/${project.id}/rapport/zip`} className="btn btn-ghost">
                Ladda ner allt (zip)
              </a>
            )}
          </div>
          {locked ? (
            <p className="doc-locked">
              <strong>Låst {formatDay(project.archived_at)}.</strong> Faser, dagar, foton och texter kan inte ändras längre. Bilagor som intyg eller en garantiåtgärd
              läggs fortfarande till under Dokument på projektet.
            </p>
          ) : project.status === "active" ? (
            <p className="inbox-meta">Kunden kan ladda ner dokumentationen hittills. När projektet är satt till Klart kan ni låsa den och lämna slutversionen.</p>
          ) : (
            <form action={lockAction} className="doc-lock">
              <input type="hidden" name="project" value={project.id} />
              <span className="inbox-meta">
                Projektet är klart. Lås dokumentationen så sparas slutrapporten under Dokument, kunden får en zip med alla originalfoton, och inget kan ändras i
                efterhand.
              </span>
              <button type="submit" className="btn btn-primary">
                Lås dokumentationen
              </button>
            </form>
          )}
        </div>

        <ol className="doc-tree">
          {ordered.map((c) => {
            const p = c.phase;
            const count = chapterPhotoCount(c);
            const needs = p && health.missing.some((m) => m.id === p.id);
            return (
              <li key={p?.id ?? "utan-fas"} id={p ? `fas-${p.id}` : "utan-fas"} className="doc-chapter" data-loose={p ? undefined : "1"}>
                <div className="doc-chapter-head">
                  <h2>{p ? p.name : "Utan fas"}</h2>
                  <span className="inbox-meta">
                    {p ? [range(p.starts_on, p.ends_on), p.done_at ? "Klar" : ""].filter(Boolean).join(" · ") : "Flytta de här till rätt fas med Flytta."}
                    {count ? ` · ${count} ${count === 1 ? "foto" : "foton"}` : ""}
                  </span>
                  {p?.photo_required && <span className={`etag${needs ? " doc-tag-warn" : ""}`}>{needs ? "Saknar foton" : "Foto krävs"}</span>}
                </div>
                {p && (
                  <SummaryField
                    project={project.id}
                    phase={p.id}
                    initial={p.summary}
                    label="Sammanfattning"
                    placeholder="Valfritt: vad som gjordes i fasen, material, något kunden bör veta."
                    locked={locked}
                  />
                )}
                {c.days.length === 0 ? (
                  <p className="doc-empty">Inga foton eller anteckningar än.</p>
                ) : (
                  c.days.map((d) => (
                    <section key={d.day} className="doc-day">
                      <h3>{formatLongDay(`${d.day}T12:00:00`)}</h3>
                      {d.notes.map((n) => (
                        <NoteCard key={n.id} project={project.id} note={n} phases={options} today={today} locked={locked} />
                      ))}
                      {d.photos.length > 0 && (
                        <ul className="doc-photos">
                          {d.photos.map((ph) => (
                            <PhotoCard key={`${ph.id}-${ph.phase_id}-${ph.day}`} project={project.id} photo={ph} phases={options} today={today} locked={locked} />
                          ))}
                        </ul>
                      )}
                    </section>
                  ))
                )}
              </li>
            );
          })}
        </ol>

        <h2 className="admin-h2" id="slutdokumentation" style={{ marginTop: 40 }}>
          Slutdokumentation
        </h2>
        <p className="admin-shown">Det färdiga resultatet med era ord: vad som gjorts, material och fabrikat, skötsel. Står sist i rapporten före bilagorna.</p>
        <SummaryField
          project={project.id}
          phase={null}
          initial={project.final_summary}
          label="Text"
          placeholder="Badrummet är helrenoverat med nytt tätskikt (godkänt system), golvvärme och …"
          locked={locked}
        />
        {locked && !project.final_summary.trim() && <p className="doc-empty">Ingen slutdokumentation skrevs.</p>}

        {locked && (
          <details className="tl-template">
            <summary>Lås upp dokumentationen</summary>
            <form action={unlockAction} className="doc-lock">
              <input type="hidden" name="project" value={project.id} />
              <span className="inbox-meta">Bara om något blev fel. Den låsta rapporten tas bort från Dokument; lås igen när det är rättat så får kunden en ny.</span>
              <button type="submit" className="btn btn-ghost">
                Lås upp
              </button>
            </form>
          </details>
        )}
      </div>
    </section>
  );
}
