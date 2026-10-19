"use client";

import { useEffect, useMemo, useState } from "react";
import { addDelayAction, removeDelayAction, saveTimelineAction, togglePhaseAction } from "@/app/admin/portal-actions";
import { formatDay, formatWeekday } from "@/lib/portal/format";
import type { ChangeOrder, PortalProject, ProjectPhase, TimelineShift } from "@/lib/portal/schema";
import { computeTimeline, shiftDaysLabel } from "@/lib/portal/timeline";
import { formatDays, roundHalf } from "@/lib/workdays";
import { photoRequiredByDefault } from "@/lib/portal/phase-templates";

/**
 * Tidplan in admin: a start date, a duration per phase, and the dates as the
 * calendar computes them, live while typing. Names, durations, order and
 * new or removed phases are saved together with "Spara tidplan". Ticking a
 * phase done and reporting a delay are saved at once, so they wait until
 * the plan has no unsaved edits.
 */

type Row = { key: string; id: string | null; name: string; days: string; change_order_id: string | null; done_at: string | null; photo_required: boolean };

/** "1,5" or "1.5" → 1.5; NaN when it isn't a half-day count. */
function parseDays(value: string): number {
  const n = Number(value.trim().replace(",", ".") || "0");
  return Number.isFinite(n) && n >= 0 && n <= 999 && Number.isInteger(n * 2) ? n : Number.NaN;
}
const showDays = (n: number) => String(n).replace(".", ",");

const rangeText = (a: string | null, b: string | null) => (!a ? "Inget datum" : a === b || !b ? formatWeekday(a) : `${formatWeekday(a)} – ${formatWeekday(b)}`);

let nextKey = 0;

export default function TimelineEditor({
  project,
  phases,
  shifts,
  changeOrders,
  hasMembers,
  openDelay,
}: {
  project: Pick<PortalProject, "id" | "starts_on" | "ends_on" | "planned_ends_on" | "works_saturdays">;
  phases: ProjectPhase[];
  shifts: TimelineShift[];
  changeOrders: ChangeOrder[];
  hasMembers: boolean;
  /** Phase whose Försening panel opens on load (from the nudge on the list). */
  openDelay?: string;
}) {
  const initialRows = useMemo<Row[]>(
    () => phases.map((p) => ({ key: p.id, id: p.id, name: p.name, days: showDays(p.duration_days), change_order_id: p.change_order_id, done_at: p.done_at, photo_required: p.photo_required })),
    [phases]
  );
  const [start, setStart] = useState(project.starts_on);
  const [saturdays, setSaturdays] = useState(project.works_saturdays);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [newName, setNewName] = useState("");
  const [newDays, setNewDays] = useState("1");
  const [delayFor, setDelayFor] = useState<string | null>(openDelay ?? null);

  // Arriving from "Försening" on the list: bring the open panel into view.
  useEffect(() => {
    if (openDelay) document.getElementById(`fas-${openDelay}`)?.scrollIntoView({ block: "center" });
  }, [openDelay]);

  const dirty =
    start !== project.starts_on ||
    saturdays !== project.works_saturdays ||
    JSON.stringify(rows.map((r) => [r.id, r.name, parseDays(r.days), r.photo_required])) !==
      JSON.stringify(initialRows.map((r) => [r.id, r.name, parseDays(r.days), r.photo_required]));
  const invalid = rows.some((r) => Number.isNaN(parseDays(r.days)) || !r.name.trim());

  const preview = computeTimeline({
    starts_on: start,
    works_saturdays: saturdays,
    planned_ends_on: project.planned_ends_on,
    phases: rows.map((r) => ({ id: r.key, duration_days: parseDays(r.days) || 0, change_order_id: r.change_order_id })),
    shifts,
  });
  const ataNumber = (id: string | null) => changeOrders.find((o) => o.id === id)?.number;
  const delaysOn = (id: string | null) => shifts.filter((s) => s.kind === "delay" && s.phase_id === id);

  const move = (i: number, dir: -1 | 1) =>
    setRows((rs) => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const out = rs.slice();
      [out[i], out[j]] = [out[j], out[i]];
      return out;
    });
  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const add = () => {
    if (!newName.trim() || Number.isNaN(parseDays(newDays))) return;
    setRows((rs) => [...rs, { key: `new-${nextKey++}`, id: null, name: newName.trim().slice(0, 80), days: newDays, change_order_id: null, done_at: null, photo_required: photoRequiredByDefault(newName) }]);
    setNewName("");
    setNewDays("1");
  };

  const payload = JSON.stringify({
    starts_on: start,
    works_saturdays: saturdays,
    phases: rows.map((r) => ({ id: r.id, name: r.name.trim(), duration_days: parseDays(r.days), photo_required: r.photo_required })),
  });
  const totalDays = rows.reduce((n, r) => n + (parseDays(r.days) || 0), 0);
  const moved = preview.planned_ends_on && preview.ends_on && preview.planned_ends_on !== preview.ends_on;

  return (
    <div className="tl-editor">
      <form action={saveTimelineAction} className="tl-settings" id="tidplan-form">
        <input type="hidden" name="project" value={project.id} />
        <input type="hidden" name="timeline" value={payload} />
        <label className="tl-start">
          <span>Startdatum</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="tl-check">
          <input type="checkbox" checked={saturdays} onChange={(e) => setSaturdays(e.target.checked)} />
          <span>Vi jobbar lördagar</span>
        </label>
        <span className="inbox-meta">Helger och röda dagar hoppas över. Dagar anges i hela eller halva arbetsdagar.</span>
      </form>

      <ol className="tl-rows">
        {rows.map((r, i) => {
          const dates = preview.phases[i];
          const days = parseDays(r.days);
          const delays = delaysOn(r.id);
          const late = delays.reduce((n, s) => n + s.days, 0);
          const canAct = Boolean(r.id) && !dirty;
          return (
            <li key={r.key} id={r.id ? `fas-${r.id}` : undefined} data-done={r.done_at ? "1" : undefined} data-ata={r.change_order_id ? "1" : undefined}>
              <div className="tl-row">
                <form action={togglePhaseAction} className="portal-phase-done">
                  <input type="hidden" name="project" value={project.id} />
                  <input type="hidden" name="phase" value={r.id ?? ""} />
                  <input type="hidden" name="done" value={r.done_at ? "0" : "1"} />
                  <button
                    type="submit"
                    disabled={!canAct}
                    title={canAct ? undefined : "Spara tidplanen först"}
                    aria-label={r.done_at ? `Markera ${r.name} som inte klar` : `Markera ${r.name} som klar`}
                    aria-pressed={Boolean(r.done_at)}
                  >
                    {r.done_at ? "✓" : ""}
                  </button>
                </form>
                <div className="tl-name">
                  {r.change_order_id && !r.name.startsWith("ÄTA") && <span className="etag tl-ata">ÄTA {ataNumber(r.change_order_id) ?? ""}</span>}
                  <input value={r.name} maxLength={80} aria-label="Fasens namn" onChange={(e) => patch(r.key, { name: e.target.value })} />
                </div>
                <label className={`tl-days${Number.isNaN(days) ? " has-error" : ""}`}>
                  <input value={r.days} inputMode="decimal" aria-label={`Dagar för ${r.name}`} onChange={(e) => patch(r.key, { days: e.target.value })} />
                  <span>dagar</span>
                </label>
                <span className="tl-dates">
                  {rangeText(dates.starts_on, dates.ends_on)}
                  {late > 0 && <em className="tl-late">{shiftDaysLabel(late)} försening</em>}
                </span>
                <div className="portal-phase-tools">
                  <button
                    type="button"
                    className="tl-photo"
                    aria-pressed={r.photo_required}
                    aria-label={r.photo_required ? `Foto krävs för ${r.name}. Tryck för att stänga av.` : `Kräv foto innan ${r.name} bockas av`}
                    title={r.photo_required ? "Foto krävs innan fasen bockas av" : "Kräv foto innan fasen bockas av"}
                    onClick={() => patch(r.key, { photo_required: !r.photo_required })}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 7h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                    </svg>
                  </button>
                  <button type="button" aria-label="Flytta upp" disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button type="button" aria-label="Flytta ner" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                    ↓
                  </button>
                  <button type="button" aria-label={`Ta bort ${r.name}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                    ×
                  </button>
                </div>
              </div>

              {delays.length > 0 && (
                <ul className="tl-notes">
                  {delays.map((s) => (
                    <li key={s.id}>
                      <span>
                        <strong>{shiftDaysLabel(s.days)}</strong> {s.reason} <span className="inbox-meta">· {formatDay(s.created_at)}</span>
                      </span>
                      <form action={removeDelayAction}>
                        <input type="hidden" name="project" value={project.id} />
                        <input type="hidden" name="shift" value={s.id} />
                        <button type="submit" className="link-quiet" disabled={dirty}>
                          Ångra
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}

              {!r.done_at && r.id && (
                <div className="tl-delay">
                  {delayFor === r.id ? (
                    <DelayForm
                      projectId={project.id}
                      phaseId={r.id}
                      phaseName={r.name}
                      hasMembers={hasMembers}
                      disabled={dirty}
                      previewEnd={(d) =>
                        computeTimeline({
                          starts_on: project.starts_on,
                          works_saturdays: project.works_saturdays,
                          planned_ends_on: project.planned_ends_on,
                          phases,
                          shifts: [...shifts, { kind: "delay", phase_id: r.id, days: d }],
                        }).ends_on
                      }
                      currentEnd={project.ends_on}
                      onCancel={() => setDelayFor(null)}
                    />
                  ) : (
                    <button type="button" className="link-quiet" onClick={() => setDelayFor(r.id)} disabled={!canAct} title={canAct ? undefined : "Spara tidplanen först"}>
                      Försening…
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="tl-add">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ny fas, t.ex. Målning" maxLength={80} aria-label="Ny fas" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
        <label className={`tl-days${Number.isNaN(parseDays(newDays)) ? " has-error" : ""}`}>
          <input value={newDays} onChange={(e) => setNewDays(e.target.value)} inputMode="decimal" aria-label="Dagar för den nya fasen" />
          <span>dagar</span>
        </label>
        <button type="button" className="btn btn-ghost" onClick={add} disabled={!newName.trim()}>
          Lägg till fas
        </button>
      </div>

      <div className="tl-bar">
        <div className="tl-end">
          <span className="inbox-meta">Beräknat slut</span>
          <strong>{preview.ends_on ? formatWeekday(preview.ends_on) : "Sätt ett startdatum"}</strong>
          {moved && <span className="inbox-meta">ursprungligen {formatWeekday(preview.planned_ends_on)}</span>}
          <span className="inbox-meta">{formatDays(roundHalf(totalDays))} arbete</span>
        </div>
        <div className="tl-save">
          <span className="editor-state">{dirty ? (invalid ? "Varje fas behöver namn och dagar i hela eller halva dagar." : "Osparade ändringar.") : ""}</span>
          <SaveButton disabled={!dirty || invalid} />
        </div>
      </div>
    </div>
  );
}

/** Sits outside its form (form="tidplan-form"), where useFormStatus can't see the submit, so it tracks the click. */
function SaveButton({ disabled }: { disabled: boolean }) {
  const [pending, setPending] = useState(false);
  return (
    <button type="submit" form="tidplan-form" className="btn btn-primary" disabled={disabled || pending} onClick={() => setTimeout(() => setPending(true))}>
      {pending ? "Sparar…" : "Spara tidplan"}
    </button>
  );
}

/** Days and a reason for the customer, with the new end shown before saving. */
function DelayForm({
  projectId,
  phaseId,
  phaseName,
  hasMembers,
  disabled,
  previewEnd,
  currentEnd,
  onCancel,
}: {
  projectId: string;
  phaseId: string;
  phaseName: string;
  hasMembers: boolean;
  disabled: boolean;
  previewEnd: (days: number) => string | null;
  currentEnd: string;
  onCancel: () => void;
}) {
  const [days, setDays] = useState("1");
  const [pending, setPending] = useState(false);
  const d = parseDays(days);
  const end = d > 0 ? previewEnd(d) : null;
  return (
    <form action={addDelayAction} className="tl-delay-form" onSubmit={() => setPending(true)}>
      <input type="hidden" name="project" value={projectId} />
      <input type="hidden" name="phase" value={phaseId} />
      <strong>Försening i {phaseName}</strong>
      <div className="tl-delay-fields">
        <label className={`tl-days${Number.isNaN(d) || d === 0 ? " has-error" : ""}`}>
          <input name="days" value={days} onChange={(e) => setDays(e.target.value)} inputMode="decimal" aria-label="Dagar försening" />
          <span>dagar</span>
        </label>
        <input name="reason" required maxLength={300} placeholder="Orsak, skriven för kunden: Kakelleveransen är försenad." aria-label="Orsak" />
      </div>
      <p className="inbox-meta">
        {end && currentEnd ? (
          <>
            Nytt beräknat slut: <strong>{formatWeekday(end)}</strong> (var {formatWeekday(currentEnd)}). Kunden ser orsaken ordagrant. Korta gärna senare faser efteråt om ni kan
            ta igen tiden.
          </>
        ) : (
          "Kunden ser orsaken ordagrant."
        )}
      </p>
      <div className="tl-delay-bar">
        {hasMembers ? (
          <label className="tl-check">
            <input type="checkbox" name="notify" defaultChecked />
            <span>Mejla kunden</span>
          </label>
        ) : (
          <span className="inbox-meta">Ingen kund inbjuden, inget mejl.</span>
        )}
        <span className="tl-delay-actions">
          <button type="button" className="link-quiet" onClick={onCancel}>
            Avbryt
          </button>
          <button type="submit" className="btn btn-primary" disabled={disabled || pending || !(d > 0)}>
            {pending ? "Sparar…" : "Spara förseningen"}
          </button>
        </span>
      </div>
    </form>
  );
}
