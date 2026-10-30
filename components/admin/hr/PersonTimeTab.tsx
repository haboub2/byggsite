import Link from "next/link";
import { addDays } from "@/lib/core/rules/index";
import { dayLabel } from "@/lib/core/hr/absence";
import { TIME_KIND_LABEL, atlWarnings, currentEntries, isReversal, isoWeek, monthDates, monthSums, sumByKind, weekStart, type TimeStatus } from "@/lib/core/hr/time";
import { listTimeEntries, timeProjects } from "@/lib/core/hr/time-store";
import { addTimeForAction } from "@/app/admin/time-actions";
import { Back, EntryFields, StatusPill, hoursLabel } from "@/components/admin/time/parts";

const COUNTED: TimeStatus[] = ["approved", "locked"];

function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** The person's month (docs/hr-lon.md, section 11 "Person › Tid"): every row by day, week and month sums, ATL warnings. */
export async function PersonTimeTab({ employeeId, month, today, canWrite }: { employeeId: string; month: string; today: string; canWrite: boolean }) {
  const dates = monthDates(month);
  const [entries, projects] = await Promise.all([listTimeEntries({ employeeId, from: addDays(dates[0], -7), to: addDays(dates[dates.length - 1], 7) }), timeProjects()]);
  const inMonth = entries.filter((e) => e.workDate.slice(0, 7) === month);
  const projectName = new Map(projects.map((p) => [p.id, p.title]));
  const sums = monthSums(entries, month);
  const pending = sumByKind(inMonth, ["draft", "submitted"]);
  const warnings = atlWarnings(entries, { from: dates[0], to: dates[dates.length - 1] });
  const weeks = [...new Set(dates.map(weekStart))];
  const here = `/admin/personal/${employeeId}?flik=tid&manad=${month}`;
  const shown = new Set(currentEntries(inMonth, ["draft", "submitted", "approved", "locked"]).map((e) => e.id));

  return (
    <div className="hr-stack">
      <div className="tg-weekbar">
        <Link className="btn btn-ghost hr-btn-small" href={`/admin/personal/${employeeId}?flik=tid&manad=${shiftMonth(month, -1)}`}>
          ← {shiftMonth(month, -1)}
        </Link>
        <strong>{new Intl.DateTimeFormat("sv-SE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`))}</strong>
        <Link className="btn btn-ghost hr-btn-small" href={`/admin/personal/${employeeId}?flik=tid&manad=${shiftMonth(month, 1)}`}>
          {shiftMonth(month, 1)} →
        </Link>
        <Link className="link-quiet" href={`/admin/tid?vecka=${weekStart(month === today.slice(0, 7) ? today : dates[0])}`}>
          Till Tid
        </Link>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <span>Godkänt i månaden</span>
          <strong>{hoursLabel(sums.total)}</strong>
          <small>
            arbete {hoursLabel(sums.work + sums.ob)}, övertid {hoursLabel(sums.overtime)}, restid {hoursLabel(sums.travel)}, beredskap {hoursLabel(sums.on_call)}
          </small>
        </div>
        <div className={pending.total ? "kpi kpi--alert" : "kpi"}>
          <span>Inte godkänt</span>
          <strong>{hoursLabel(pending.total)}</strong>
          <small>utkast och inskickat</small>
        </div>
        <div className={warnings.length ? "kpi kpi--alert" : "kpi"}>
          <span>Arbetstidslagen</span>
          <strong>{warnings.length}</strong>
          <small>{warnings.length ? "varningar" : "inga varningar"}</small>
        </div>
      </div>

      {warnings.length > 0 && (
        <ul className="hr-clocks">
          {warnings.map((w, i) => (
            <li key={i} data-tone="alert">
              <strong>{w.date}</strong> <span>{w.message}</span>
            </li>
          ))}
        </ul>
      )}

      {weeks.map((monday) => {
        const days = dates.filter((d) => weekStart(d) === monday);
        const rows = inMonth.filter((e) => days.includes(e.workDate));
        const week = sumByKind(rows, COUNTED);
        return (
          <div key={monday} className="hr-card">
            <div className="hr-card-head">
              <h2 className="hr-h2">Vecka {isoWeek(monday).week}</h2>
              <span className="hr-muted">godkänt {hoursLabel(week.total)}</span>
            </div>
            {rows.length === 0 ? (
              <p className="efield-hint">Ingen tid.</p>
            ) : (
              <table className="org-table">
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id} data-replaced={!shown.has(e.id) || isReversal(e) || undefined}>
                      <td>{dayLabel(e.workDate)}</td>
                      <td>
                        {e.start ? `${e.start}–${e.end ?? "…"}` : ""}
                        <span className="hr-muted">
                          {hoursLabel(e.hours)}
                          {e.breakMinutes ? `, rast ${e.breakMinutes} min` : ""}
                        </span>
                      </td>
                      <td>
                        {TIME_KIND_LABEL[e.kind]}
                        <span className="hr-muted">{e.projectId ? (projectName.get(e.projectId) ?? "") : "Utan projekt"}</span>
                      </td>
                      <td>{e.note || (e.correctsId ? (isReversal(e) ? "Rättelse (vändning)" : "Rättelse (ersättning)") : "")}</td>
                      <td>
                        <StatusPill status={e.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {canWrite && (
        <details className="hr-details">
          <summary>Lägg in tid åt personen</summary>
          <form action={addTimeForAction} className="tg-correct">
            <Back to={here} />
            <input type="hidden" name="employeeId" value={employeeId} />
            <EntryFields projects={projects.filter((p) => p.status === "active")} date={today.slice(0, 7) === month ? today : dates[0]} />
            <button className="btn btn-ghost hr-btn-small" type="submit">
              Spara och skicka in
            </button>
            <p className="efield-hint">Raden skickas in och godkänns sedan under Tid, som allt annat.</p>
          </form>
        </details>
      )}
    </div>
  );
}
