import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addChangeOrderAction,
  addPhaseAction,
  deleteProject,
  inviteMemberAction,
  movePhaseAction,
  removeChangeOrderAction,
  removeDocumentAction,
  removeMemberAction,
  removePhaseAction,
  removeUpdateAction,
  savePhaseAction,
  togglePhaseAction,
} from "@/app/admin/portal-actions";
import ProjectDetailsForm from "@/components/admin/portal/ProjectDetailsForm";
import ProjectEconomy from "@/components/admin/projects/ProjectEconomy";
import { DocumentUploader, UpdateComposer } from "@/components/admin/portal/PortalUploads";
import { formatDateTime, formatWhen } from "@/lib/admin-format";
import { fileHref } from "@/lib/portal/files-href";
import { CHANGE_ORDER_STATUS_LABEL, changeOrderRot, DOCUMENT_KIND_LABEL, formatKr, PROJECT_STATUS_LABEL, progressPercent } from "@/lib/portal/schema";
import { getProjectBundle } from "@/lib/portal/store";

const FLASH: Record<string, string> = {
  plan: "Betalplanen är skapad. Stegen blir fakturerbara när deras villkor är uppfyllda.",
  skapat: "Projektet är skapat. Fyll i det kunden ska se, och bjud sedan in kunden längst ner.",
  inbjuden: "Kunden är inbjuden och har fått ett mejl med inloggningslänk.",
  tillagd: "Kunden hade redan ett konto och har lagts till i projektet.",
  ata: "Ändringen är upplagd och kunden har fått ett mejl om att svara.",
};

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
  const { project, phases, updates, documents, members, changeOrders } = bundle;
  const flash = typeof q.sparat === "string" ? FLASH[q.sparat] : undefined;
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

        {flash && <p className="admin-flash">{flash}</p>}
        {error && (
          <p className="form-feedback error" role="alert" style={{ marginTop: 14 }}>
            {error}
          </p>
        )}

        <ProjectDetailsForm project={project} />

        {/* ---- Ekonomi och betalplan ---- */}
        <ProjectEconomy bundle={bundle} />

        {/* ---- Faser ---- */}
        <h2 className="admin-h2" id="faser" style={{ marginTop: 44 }}>
          Tidplan
        </h2>
        <p className="admin-shown">Bocka av fasen när den är klar. Den första obockade visas som pågående.</p>
        <ol className="portal-phases-edit">
          {phases.map((ph, i) => (
            <li key={ph.id} data-done={ph.done_at ? "1" : undefined}>
              <form action={togglePhaseAction} className="portal-phase-done">
                {hidden}
                <input type="hidden" name="phase" value={ph.id} />
                <input type="hidden" name="done" value={ph.done_at ? "0" : "1"} />
                <button type="submit" aria-label={ph.done_at ? `Markera ${ph.name} som inte klar` : `Markera ${ph.name} som klar`} aria-pressed={Boolean(ph.done_at)}>
                  {ph.done_at ? "✓" : ""}
                </button>
              </form>
              <form action={savePhaseAction} className="portal-phase-fields">
                {hidden}
                <input type="hidden" name="phase" value={ph.id} />
                <input name="name" defaultValue={ph.name} maxLength={80} aria-label="Fasens namn" />
                <input name="starts_on" type="date" defaultValue={ph.starts_on ?? ""} aria-label="Start" />
                <input name="ends_on" type="date" defaultValue={ph.ends_on ?? ""} aria-label="Slut" />
                <button type="submit" className="link-quiet">
                  Spara
                </button>
              </form>
              <div className="portal-phase-tools">
                <form action={movePhaseAction}>
                  {hidden}
                  <input type="hidden" name="phase" value={ph.id} />
                  <input type="hidden" name="dir" value="up" />
                  <button type="submit" aria-label="Flytta upp" disabled={i === 0}>
                    ↑
                  </button>
                </form>
                <form action={movePhaseAction}>
                  {hidden}
                  <input type="hidden" name="phase" value={ph.id} />
                  <input type="hidden" name="dir" value="down" />
                  <button type="submit" aria-label="Flytta ner" disabled={i === phases.length - 1}>
                    ↓
                  </button>
                </form>
                <form action={removePhaseAction}>
                  {hidden}
                  <input type="hidden" name="phase" value={ph.id} />
                  <button type="submit" aria-label="Ta bort fasen">
                    ×
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ol>
        <form action={addPhaseAction} className="portal-phase-add">
          {hidden}
          <input name="name" placeholder="Ny fas, t.ex. Målning" maxLength={80} required aria-label="Ny fas" />
          <input name="starts_on" type="date" aria-label="Start" />
          <input name="ends_on" type="date" aria-label="Slut" />
          <button type="submit" className="btn btn-ghost">
            Lägg till fas
          </button>
        </form>

        {/* ---- Uppdateringar ---- */}
        <h2 className="admin-h2" id="uppdateringar" style={{ marginTop: 44 }}>
          Uppdateringar och foton
        </h2>
        <p className="admin-shown">Korta lägesrapporter med bilder från bygget. Kunden ser den nyaste överst.</p>
        <UpdateComposer project={project.id} />
        {updates.length > 0 && (
          <ul className="portal-diary portal-diary--admin">
            {updates.map((u) => (
              <li key={u.id}>
                <div className="portal-diary-head">
                  <time dateTime={u.created_at}>{formatDateTime(u.created_at)}</time>
                  <form action={removeUpdateAction}>
                    {hidden}
                    <input type="hidden" name="update" value={u.id} />
                    <button type="submit" className="link-quiet">
                      Ta bort
                    </button>
                  </form>
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
                    Arbete {formatKr(o.labor_amount)} · ROT {formatKr(rot)}
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
            <span className="inbox-meta">Tar bort tidplan, uppdateringar, foton och dokument. Offerten påverkas inte.</span>
          </div>
          <form action={deleteProject}>
            <input type="hidden" name="id" value={project.id} />
            <button type="submit" className="btn btn-ghost">
              Ta bort
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
