/**
 * Small server-rendered pieces the time pages share: the flash from a
 * redirecting action, a hidden "back" field, and the fields of a time row.
 * No client JavaScript: every form posts to a server action that redirects.
 */

import { TIME_KINDS, TIME_KIND_LABEL, TIME_STATUS_LABEL, type TimeStatus } from "@/lib/core/hr/time";
import type { TimeProject } from "@/lib/core/hr/time-store";

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (error) return <p className="admin-flash tg-flash-error" role="alert">{error}</p>;
  if (ok) return <p className="admin-flash" role="status">{ok}</p>;
  return null;
}

export const Back = ({ to }: { to: string }) => <input type="hidden" name="back" value={to} />;

export function StatusPill({ status }: { status: TimeStatus }) {
  return (
    <span className="tg-status" data-status={status}>
      {TIME_STATUS_LABEL[status]}
    </span>
  );
}

export function ProjectSelect({ projects, name = "projectId", value = "", required = false, label = "Projekt" }: { projects: readonly TimeProject[]; name?: string; value?: string; required?: boolean; label?: string }) {
  return (
    <div className="efield">
      <label htmlFor={`f-${name}`}>{label}</label>
      <select id={`f-${name}`} name={name} defaultValue={value} required={required} className="tg-select">
        <option value="">{required ? "Välj projekt" : "Inget projekt"}</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
            {p.status !== "active" ? " (avslutat)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Date, start, end, break or hours, kind, project, note: the fields timeEntryInputSchema reads. */
export function EntryFields({ projects, date, fixedDate = false, defaults = {} }: { projects: readonly TimeProject[]; date: string; fixedDate?: boolean; defaults?: { start?: string; end?: string; breakMinutes?: number; hours?: string; kind?: string; projectId?: string; note?: string } }) {
  return (
    <div className="tg-fields">
      {fixedDate ? (
        <input type="hidden" name="date" value={date} />
      ) : (
        <div className="efield">
          <label>Datum</label>
          <input type="date" name="date" defaultValue={date} required />
        </div>
      )}
      <div className="efield">
        <label>Start</label>
        <input type="time" name="start" defaultValue={defaults.start ?? ""} />
      </div>
      <div className="efield">
        <label>Slut</label>
        <input type="time" name="end" defaultValue={defaults.end ?? ""} />
      </div>
      <div className="efield">
        <label>Rast (min)</label>
        <input type="number" name="breakMinutes" min={0} max={600} step={5} defaultValue={defaults.breakMinutes ?? 0} />
      </div>
      <div className="efield">
        <label>eller timmar</label>
        <input type="text" inputMode="decimal" name="hours" placeholder="t.ex. 7,5" defaultValue={defaults.hours ?? ""} />
      </div>
      <div className="efield">
        <label>Sort</label>
        <select name="kind" defaultValue={defaults.kind ?? "work"} className="tg-select">
          {TIME_KINDS.map((k) => (
            <option key={k} value={k}>
              {TIME_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
      <ProjectSelect projects={projects} value={defaults.projectId ?? ""} />
      <div className="efield tg-wide">
        <label>Anteckning</label>
        <input type="text" name="note" maxLength={500} defaultValue={defaults.note ?? ""} />
      </div>
    </div>
  );
}

/** "7,5 h" */
export const hoursLabel = (h: number) => `${String(Math.round(h * 100) / 100).replace(".", ",")} h`;
