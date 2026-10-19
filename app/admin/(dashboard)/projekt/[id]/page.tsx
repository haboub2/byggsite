import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addChangeOrderAction,
  deleteProject,
  inviteMemberAction,
  removeChangeOrderAction,
  removeDocumentAction,
  removeMemberAction,
  removeUpdateAction,
  savePhaseTemplateAction,
  scheduleChangeOrderAction,
} from "@/app/admin/portal-actions";
import ProjectDetailsForm from "@/components/admin/portal/ProjectDetailsForm";
import { DocumentUploader, UpdateComposer } from "@/components/admin/portal/PortalUploads";
import TimelineEditor from "@/components/admin/portal/TimelineEditor";
import { formatDateTime, formatWhen } from "@/lib/admin-format";
import { fileHref } from "@/lib/portal/files-href";
import { formatDay, formatWeekday, todayIso } from "@/lib/portal/format";
import { BUILT_IN_PHASE_TEMPLATES } from "@/lib/portal/phase-templates";
import { CHANGE_ORDER_STATUS_LABEL, changeOrderRot, DOCUMENT_KIND_LABEL, formatKr, PROJECT_STATUS_LABEL, progressPercent } from "@/lib/portal/schema";
import { changeOrdersToSchedule, phaseForDay, shiftLine } from "@/lib/portal/timeline";
import { getProjectBundle } from "@/lib/portal/store";
import { formatDays, isIsoDate } from "@/lib/workdays";
import { documentationHealth, missingPhotosLine } from "@/lib/portal/documentation";

/** Server actions on this page may render the report afterwards (after()). */
export const maxDuration = 60;

const FLASH: Record<string, string> = {
  skapat: "Projektet är skapat med mallens faser. Sätt startdatum och justera dagarna under Tidplan, och bjud sedan in kunden längst ner.",
  inbjuden: "Kunden är inbjuden och har fått ett mejl med inloggningslänk.",
  tillagd: "Kunden hade redan ett konto och har lagts till i projektet.",
  ata: "Ändringen är upplagd och kunden har fått ett mejl om att svara.",
  tidplan: "Tidplanen är sparad. Kunden ser de nya datumen direkt.",
  mall: "Tidplanen är sparad som mall och kan väljas för nästa projekt.",
};

/** "Nytt beräknat slut: 14 nov (var 12 nov)." after a delay or an ÄTA. */
function endFlash(kind: string, after: unknown, before: unknown): string | undefined {
  if (kind !== "forsening" && kind !== "ata-tid") return undefined;
  const lead = kind === "forsening" ? "Förseningen är sparad." : "ÄTA:n ligger nu i tidplanen.";
  if (typeof after !== "string" || !isIsoDate(after)) return lead;
  const was = typeof before === "string" && isIsoDate(before) && before !== after ? ` (var ${formatWeekday(before)})` : "";
  return `${lead} Nytt beräknat slut: ${formatWeekday(after)}${was}. Godta det, eller korta senare faser nedan och spara.`;
}

export default async function PortalProjectAdmin({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const bundle = await getProjectBundle(id);
  if (!bundle) notFound();
  const { project, phases, updates, documents, members, changeOrders, shifts, photos } = bundle;
  const locked = Boolean(project.archived_at);
  const health = documentationHealth(project, phases, photos, todayIso());
  const flash = typeof q.sparat === "string" ? (FLASH[q.sparat] ?? endFlash(q.sparat, q.slut, q.var)) : undefined;
  // Timeline actions land on #tidplan; show their message there instead of at the top.
  const inTimeline = q.vid === "tidplan";
  const today = todayIso();
  const todaysPhase = phaseForDay(phases, today);
  const toSchedule = changeOrdersToSchedule(changeOrders, phases);
  const phaseName = (id: string | null) => phases.find((p) => p.id === id)?.name;
  const openDelay = typeof q.forsening === "string" ? q.forsening : undefined;
  const error = typeof q.fel === "string" ? q.fel : undefined;
  const hidden = <input type="hidden" name="project" value={project.id} />;

  return (
    <section className="sec sec--tight">
      <div className="container" style={{ maxWidth: 960 }}>
        <Link href="/admin/projekt" className="link-quiet">
          ← Alla byggprojekt
        </Link>

        <div className="lead-head">
          <div>
            <span className="eyebrow">{PROJECT_STATUS_LABEL[project.status]} · {progressPercent(phases)} %</span>
            <h1 className="admin-h1">{project.title}</h1>
            <p className="admin-intro">{[project.customer_name, project.address].filter(Boolean).join(" · ")}</p>
          </div>
          <Link href={`/mitt-projekt/${project.id}`} className="btn btn-ghost" target="_blank" rel="noreferrer">
            Visa som kund
          </Link>
        </div>

        {flash && !inTimeline && <p className="admin-flash">{flash}</p>}
        {error && !inTimeline && (
          <p className="form-feedback error" role="alert" style={{ marginTop: 14 }}>
            {error}
          </p>
        )}

        {toSchedule.map((o) => (
          <form key={o.id} action={scheduleChangeOrderAction} className="tl-schedule">
            {hidden}
            <input type="hidden" name="order" value={o.id} />
            <p>
              <strong>
                ÄTA {o.number} är godkänd ({formatDays(o.duration_days)}).
              </strong>{" "}
              {o.title}
            </p>
            <label>
              <span>Lägg in i tidplanen efter</span>
              <select name="after" defaultValue={todaysPhase?.id ?? phases[phases.length - 1]?.id ?? ""}>
                <option value="">Först</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn-primary">
              Lägg in
            </button>
          </form>
        ))}

        <h2 className="admin-h2" id="ny-uppdatering" style={{ marginTop: 32 }}>
          Dagens uppdatering
        </h2>
        {locked ? (
          <p className="admin-shown">Dokumentationen är låst, så inga nya foton eller anteckningar kan läggas till. Lås upp den under Dokumentation om det behövs.</p>
        ) : (
          <>
            <p className="admin-shown">Ta foton, skriv en rad, tryck Publicera. Fas och dag är ifyllda; tryck på en annan fas om det behövs.</p>
            <UpdateComposer project={project.id} phases={phases.map((p) => ({ id: p.id, name: p.name }))} defaultPhase={todaysPhase?.id ?? null} today={today} />
          </>
        )}

        {/* ---- Dokumentation ---- */}
        <div className="doc-panel" id="dokumentation">
          <div className="doc-panel-facts">
            <strong>Dokumentation</strong>
            <span>
              Foton {health.daysWithPhotos} av {health.daysSoFar} dagar hittills
            </span>
            {health.missing.length > 0 && <span className="doc-warn">{missingPhotosLine(health.missing)}</span>}
            {locked && <span>Låst {formatDay(project.archived_at)}</span>}
          </div>
          <div className="doc-panel-actions">
            <Link href={`/admin/projekt/${project.id}/dokumentation`} className="btn btn-primary">
              Öppna dokumentationen
            </Link>
            <a href={`/admin/projekt/${project.id}/rapport`} target="_blank" rel="noreferrer" className="btn btn-ghost">
              Visa PDF
            </a>
          </div>
          <p className="inbox-meta">Flytta foton, skriv bildtexter och sammanfattningar, och lås dokumentationen när projektet är klart.</p>
        </div>

        <div style={{ marginTop: 44 }}>
          <ProjectDetailsForm project={project} />
        </div>

        {/* ---- Tidplan ---- */}
        <h2 className="admin-h2" id="tidplan" style={{ marginTop: 44 }}>
          Tidplan
        </h2>
        <p className="admin-shown">
          Startdatum och dagar per fas; datumen räknas fram. Slutdatumet flyttas bara av en försening eller en godkänd ÄTA, och kunden ser varför. Kameran på
          en fas betyder att den inte kan bockas av utan minst ett foto.
        </p>
        {flash && inTimeline && <p className="admin-flash">{flash}</p>}
        {error && inTimeline && (
          <p className="form-feedback error" role="alert" style={{ marginTop: 14 }}>
            {error}
          </p>
        )}
        <fieldset className="doc-fieldset" disabled={locked}>
        <TimelineEditor
          key={`${project.updated_at}-${openDelay ?? ""}`}
          project={project}
          phases={phases}
          shifts={shifts}
          changeOrders={changeOrders}
          hasMembers={members.length > 0}
          openDelay={openDelay}
        />
        </fieldset>
        {shifts.length > 0 && (
          <div className="tl-shifts">
            <h3>Förskjutningar som kunden ser</h3>
            <p className="inbox-meta">
              Ursprungligen klart {formatWeekday(project.planned_ends_on)}, nu {formatWeekday(project.ends_on)}.
            </p>
            <ul>
              {shifts.map((s) => (
                <li key={s.id}>
                  <span>{shiftLine(s)}</span>
                  <span className="inbox-meta">
                    {phaseName(s.phase_id) ?? ""} · {formatDay(s.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <details className="tl-template">
          <summary>Spara tidplanen som mall</summary>
          <form action={savePhaseTemplateAction} className="portal-phase-add">
            {hidden}
            <input name="name" placeholder="Mallens namn, t.ex. Badrum litet" maxLength={80} required aria-label="Mallens namn" />
            <select name="job_type" aria-label="Jobbtyp" defaultValue="">
              <option value="">Jobbtyp</option>
              {[...new Set(BUILT_IN_PHASE_TEMPLATES.map((t) => t.job_type))].map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-ghost">
              Spara som mall
            </button>
          </form>
          <p className="inbox-meta">Faserna och deras dagar sparas, inte ÄTA-faserna. Mallen kan väljas när nästa projekt skapas.</p>
        </details>

        {/* ---- Uppdateringar ---- */}
        <h2 className="admin-h2" id="uppdateringar" style={{ marginTop: 44 }}>
          Alla uppdateringar
        </h2>
        <p className="admin-shown">Korta lägesrapporter med bilder från bygget. Kunden ser den nyaste överst.</p>
        {updates.length > 0 && (
          <ul className="portal-diary portal-diary--admin">
            {updates.map((u) => (
              <li key={u.id}>
                <div className="portal-diary-head">
                  <span>
                    <time dateTime={u.created_at}>{formatDateTime(u.created_at)}</time>
                    <span className="inbox-meta">
                      {" "}
                      · {phaseName(u.phase_id) ?? "Ingen fas"}
                      {u.day !== todayIso(new Date(u.created_at)) ? ` · gäller ${formatWeekday(u.day)}` : ""}
                    </span>
                  </span>
                  {!locked && (
                    <form action={removeUpdateAction}>
                      {hidden}
                      <input type="hidden" name="update" value={u.id} />
                      <button type="submit" className="link-quiet">
                        Ta bort
                      </button>
                    </form>
                  )}
                </div>
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

        {/* ---- ÄTA ---- */}
        <h2 className="admin-h2" id="ata" style={{ marginTop: 44 }}>
          Ändringar och tillägg (ÄTA)
        </h2>
        <p className="admin-shown">
          Lägg upp arbete utöver offerten med pris inkl. moms. Kunden godkänner eller avböjer i portalen; svaret sparas med namn och tid. Arbetskostnaden styr
          ROT-avdraget (30 %).
        </p>
        <form action={addChangeOrderAction} className="portal-compose" id="ny-ata">
          {hidden}
          <div className="egrid">
            <div className="efield efield--wide">
              <label htmlFor="ata-title">Rubrik</label>
              <input id="ata-title" name="title" maxLength={120} required placeholder="Golvvärme även i hallen" />
            </div>
            <div className="efield efield--wide">
              <label htmlFor="ata-description">Beskrivning</label>
              <textarea id="ata-description" name="description" rows={3} maxLength={3000} placeholder="Vad som görs, varför och hur det påverkar tidplanen." />
            </div>
            <div className="efield">
              <label htmlFor="ata-amount">Pris inkl. moms (kr)</label>
              <input id="ata-amount" name="amount" inputMode="numeric" pattern="-?[0-9 ]*" required placeholder="9800" />
              <span className="efield-hint">Minus för avdrag när något utgår.</span>
            </div>
            <div className="efield">
              <label htmlFor="ata-labor">Varav arbete (kr)</label>
              <input id="ata-labor" name="labor_amount" inputMode="numeric" pattern="[0-9 ]*" placeholder="6500" />
              <span className="efield-hint">Den del ROT räknas på. Lämna tom om bara material.</span>
            </div>
            <div className="efield">
              <label htmlFor="ata-days">Tid (arbetsdagar)</label>
              <input id="ata-days" name="duration_days" inputMode="decimal" placeholder="0" />
              <span className="efield-hint">Hur mycket längre projektet blir, i hela eller halva dagar. 0 om tiden inte påverkas. Kunden ser det innan hen svarar.</span>
            </div>
          </div>
          <div className="portal-compose-bar">
            <span className="inbox-meta">Kunden får ett mejl med länk till portalen.</span>
            <button type="submit" className="btn btn-primary">
              Lägg upp ÄTA
            </button>
          </div>
        </form>
        {changeOrders.length > 0 && (
          <ul className="portal-ata portal-ata--admin">
            {changeOrders.map((o) => {
              const { rot } = changeOrderRot(o);
              return (
                <li key={o.id} data-status={o.status}>
                  <div className="portal-ata-head">
                    <span className="inbox-meta">
                      ÄTA {o.number} · {formatWhen(o.created_at)}
                    </span>
                    <span className="etag" data-status={o.status}>
                      {CHANGE_ORDER_STATUS_LABEL[o.status]}
                    </span>
                  </div>
                  <h3>
                    {o.title} <span className="portal-ata-amount">{formatKr(o.amount)}</span>
                  </h3>
                  {o.description && <p className="portal-ata-desc">{o.description}</p>}
                  <p className="inbox-meta">
                    Arbete {formatKr(o.labor_amount)} · ROT {formatKr(rot)} · {o.duration_days > 0 ? `+${formatDays(o.duration_days)}` : "ingen tid"}
                    {o.status !== "pending" && o.answered_at
                      ? ` · ${o.status === "approved" ? "Godkänd" : "Avböjd"} av ${o.answered_name || "kunden"} ${formatDateTime(o.answered_at)}`
                      : ""}
                  </p>
                  {o.status === "pending" && (
                    <form action={removeChangeOrderAction}>
                      {hidden}
                      <input type="hidden" name="order" value={o.id} />
                      <button type="submit" className="link-quiet">
                        Ta bort
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* ---- Dokument ---- */}
        <h2 className="admin-h2" id="dokument" style={{ marginTop: 44 }}>
          Dokument
        </h2>
        <p className="admin-shown">Offerten kommer från offertverktyget. Lägg till fakturor, intyg och garantibevis som PDF.</p>
        <DocumentUploader project={project.id} />
        {documents.length > 0 && (
          <ul className="portal-docs">
            {documents.map((d) => (
              <li key={d.id}>
                <span className="etag">{DOCUMENT_KIND_LABEL[d.kind]}</span>
                <a href={fileHref(d.path, project.id)} target="_blank" rel="noreferrer">
                  {d.title}
                </a>
                <time dateTime={d.created_at}>{formatWhen(d.created_at)}</time>
                <form action={removeDocumentAction}>
                  {hidden}
                  <input type="hidden" name="document" value={d.id} />
                  <button type="submit" className="link-quiet">
                    Ta bort
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {/* ---- Kunder ---- */}
        <h2 className="admin-h2" id="kunder" style={{ marginTop: 44 }}>
          Kunder med tillgång
        </h2>
        <p className="admin-shown">
          Den inbjudna får ett mejl med en inloggningslänk och loggar sedan in med engångskod. Delar två ägare på ROT-avdraget,
          bjud in båda.
        </p>
        {members.length > 0 && (
          <ul className="portal-members">
            {members.map((m) => (
              <li key={m.user_id}>
                <span>
                  <strong>{m.email}</strong>
                  {m.name ? ` · ${m.name}` : ""}
                </span>
                <span className="inbox-meta">Inbjuden {formatWhen(m.invited_at)}</span>
                <form action={removeMemberAction}>
                  {hidden}
                  <input type="hidden" name="user" value={m.user_id} />
                  <button type="submit" className="link-quiet">
                    Ta bort
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={inviteMemberAction} className="portal-phase-add">
          {hidden}
          <input name="email" type="email" placeholder="kund@exempel.se" required aria-label="E-post" />
          <input name="name" placeholder="Namn (valfritt)" maxLength={80} aria-label="Namn" />
          <button type="submit" className="btn btn-primary">
            Bjud in kund
          </button>
        </form>

        <div className="danger-zone">
          <div>
            <strong>Ta bort projektet</strong>
            <span className="inbox-meta">
              {locked
                ? "Dokumentationen är låst och arkiverad (spara minst tio år). Lås upp den under Dokumentation först om projektet verkligen ska bort."
                : "Tar bort tidplan, uppdateringar, foton och dokument. Offerten påverkas inte."}
            </span>
          </div>
          {!locked && (
            <form action={deleteProject}>
              <input type="hidden" name="id" value={project.id} />
              <button type="submit" className="btn btn-ghost">
                Ta bort
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
