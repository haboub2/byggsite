import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { hasAccess } from "@/lib/core/org/roles";
import { todayIso } from "@/lib/quotes/schema";
import { listEmployees, listEmployments } from "@/lib/core/hr/store";
import { ABSENCE_KIND_LABEL, WEEKDAY_LABEL, WEEKDAY_SHORT, dayLabel, lastDay, scheduleFromRules } from "@/lib/core/hr/absence";
import { blockHours, monthDates } from "@/lib/core/hr/time";
import { listAbsences, listSchedules, listShifts, timeProjects } from "@/lib/core/hr/time-store";
import { payVersionOn } from "@/lib/core/hr/person-time";
import { weeklyHours } from "@/lib/core/payroll/sick-pay";
import { FORM_SHORT } from "@/lib/core/hr/schema";
import { deleteShiftAction, planShiftAction, setScheduleAction } from "@/app/admin/time-actions";
import { Back, Flash, ProjectSelect, hoursLabel } from "@/components/admin/time/parts";

export const metadata: Metadata = { title: "Schema" };

const ABSENCE_CODE: Record<string, string> = { sjuk: "S", vab: "V", semester: "Sem", foraldraledig: "FL", tjanstledig: "TL", permission: "P", kompledig: "K" };

function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Schema (docs/hr-lon.md, section 11): the weekly pattern of each person's
 * current employment (sjuklön and semester are counted from it) and the
 * month calendar with shifts and absence. A new pattern on a version that
 * already has one is a new version from the chosen day (the working time
 * is part of the contract). Owner and admin write; the accountant reads.
 */
export default async function SchemaPage({ searchParams }: { searchParams: Promise<{ manad?: string; ok?: string; fel?: string }> }) {
  const check = await requireRole("payroll");
  if (!check.ok) redirect("/admin/login");
  const canWrite = hasAccess(check.role, "admin");
  const sp = await searchParams;
  const today = todayIso();
  const month = /^\d{4}-\d{2}$/.test(sp.manad ?? "") ? (sp.manad as string) : today.slice(0, 7);
  const dates = monthDates(month);
  const here = `/admin/schema?manad=${month}`;

  const [employees, versions, schedules, shifts, absences, projects] = await Promise.all([
    listEmployees(),
    listEmployments(),
    listSchedules(),
    listShifts({ from: dates[0], to: dates[dates.length - 1] }),
    listAbsences({ from: dates[0], to: dates[dates.length - 1] }),
    timeProjects(),
  ]);
  const projectName = new Map(projects.map((p) => [p.id, p.title]));
  const people = employees
    .filter((e) => !e.endedAt)
    .map((e) => {
      const mine = versions.filter((v) => v.employeeId === e.id);
      const current = payVersionOn(mine, today) ?? payVersionOn(mine, dates[dates.length - 1]);
      const schedule = current?.scheduleId ? (schedules.find((s) => s.id === current.scheduleId) ?? null) : null;
      return { e, current, schedule };
    });

  return (
    <section className="sec sec--tight">
      <div className="container">
        <div className="inbox-head">
          <div>
            <span className="eyebrow">Personal</span>
            <h1>Schema</h1>
            <p className="admin-intro">Veckoschemat per anställning (sjuklön, karens och semesterdagar räknas från det) och månadens pass och frånvaro.</p>
          </div>
        </div>
        <Flash ok={sp.ok} error={sp.fel} />

        <div className="tg-weekbar">
          <Link className="btn btn-ghost hr-btn-small" href={`/admin/schema?manad=${shiftMonth(month, -1)}`}>
            ← {shiftMonth(month, -1)}
          </Link>
          <strong>{new Intl.DateTimeFormat("sv-SE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`))}</strong>
          <Link className="btn btn-ghost hr-btn-small" href={`/admin/schema?manad=${shiftMonth(month, 1)}`}>
            {shiftMonth(month, 1)} →
          </Link>
        </div>

        {people.length === 0 ? (
          <div className="inbox-empty">Ingen personal med gällande avtal.</div>
        ) : (
          <div className="hr-table-wrap">
            <table className="org-table tg-month">
              <thead>
                <tr>
                  <th>Person</th>
                  {dates.map((d) => (
                    <th key={d} data-weekend={/^(Lör|Sön)/.test(dayLabel(d)) || undefined}>
                      {dayLabel(d).replace(" ", "\n")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map(({ e, schedule }) => {
                  const ws = schedule ? scheduleFromRules(schedule.rules) : null;
                  return (
                    <tr key={e.id}>
                      <td>
                        <Link href={`/admin/personal/${e.id}?flik=tid`} className="hr-name">
                          {e.name}
                        </Link>
                      </td>
                      {dates.map((d) => {
                        const s = shifts.filter((x) => x.employeeId === e.id && x.date === d);
                        const a = absences.find((x) => x.employeeId === e.id && x.from <= d && lastDay(x, today) >= d);
                        const planned = ws ? ws.hours[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7] : 0;
                        return (
                          <td key={d} className="tg-mcell" data-absence={a?.kind} title={a ? `${ABSENCE_KIND_LABEL[a.kind]}${a.extent < 1 ? ` ${a.extent * 100} %` : ""}` : undefined}>
                            {a ? <span className="tg-abs">{ABSENCE_CODE[a.kind]}</span> : null}
                            {s.map((x) => (
                              <span key={x.id} className="tg-shift" data-accepted={x.offerStatus === "accepted" || undefined} title={x.projectId ? projectName.get(x.projectId) : undefined}>
                                {x.start.slice(0, 2)}–{x.end.slice(0, 2)}
                              </span>
                            ))}
                            {!a && !s.length && planned > 0 ? <span className="tg-plan">{String(planned).replace(".", ",")}</span> : null}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="efield-hint tg-legend">
          Siffra: schemats timmar · 07–16: pass (fet: inringt och accepterat) · S sjuk, V VAB, Sem semester, FL föräldraledig, TL tjänstledig, P permission, K kompledig.
        </p>

        <div className="hr-two tg-gap">
          <div className="hr-stack">
            {people.map(({ e, current, schedule }) => (
              <article key={e.id} className="hr-card">
                <div className="hr-card-head">
                  <div>
                    <h2 className="hr-h2">{e.name}</h2>
                    <p className="hr-muted">{current ? `${FORM_SHORT[current.form]} · version ${current.version} från ${current.validFrom}${current.weeklyHours ? ` · ${current.weeklyHours} tim/vecka i avtalet` : ""}` : "Ingen anställning med lön gäller"}</p>
                  </div>
                  {schedule && <span className="inv-status" data-status="paid">{hoursLabel(weeklyHours(scheduleFromRules(schedule.rules)))}/vecka</span>}
                </div>
                {schedule ? (
                  <p className="tg-pattern">
                    {schedule.rules.map((r) => (
                      <span key={r.weekday}>
                        {WEEKDAY_SHORT[r.weekday - 1]} {r.start}–{r.end}
                        {r.breakMinutes ? ` (rast ${r.breakMinutes})` : ""}
                      </span>
                    ))}
                  </p>
                ) : (
                  <p className="efield-hint">{current?.payForm === "hourly" ? "Inget veckoschema: sjuklön räknas på bokade pass." : "Inget veckoschema: sjuklön räknas på avtalets timmar måndag–fredag tills ett schema finns."}</p>
                )}
                {canWrite && current && (
                  <details className="hr-details">
                    <summary>{schedule ? "Nytt schema (ny version av avtalet)" : "Lägg in veckoschema"}</summary>
                    <form action={setScheduleAction} className="tg-schedule">
                      <Back to={here} />
                      <input type="hidden" name="employmentId" value={current.id} />
                      {[1, 2, 3, 4, 5, 6, 7].map((wd) => {
                        const r = schedule?.rules.find((x) => x.weekday === wd);
                        const on = r ? true : !schedule && wd <= 5;
                        return (
                          <div key={wd} className="tg-sday">
                            <label className="etoggle" style={{ marginTop: 0 }}>
                              <input type="checkbox" name={`on${wd}`} defaultChecked={on} /> {WEEKDAY_LABEL[wd - 1]}
                            </label>
                            <input type="time" name={`start${wd}`} defaultValue={r?.start ?? "07:00"} aria-label={`Start ${WEEKDAY_LABEL[wd - 1]}`} className="hr-date" />
                            <input type="time" name={`end${wd}`} defaultValue={r?.end ?? "16:00"} aria-label={`Slut ${WEEKDAY_LABEL[wd - 1]}`} className="hr-date" />
                            <input type="number" name={`break${wd}`} min={0} max={600} step={5} defaultValue={r?.breakMinutes ?? 60} aria-label={`Rast ${WEEKDAY_LABEL[wd - 1]}`} className="hr-date tg-num" />
                            <span className="hr-muted">{r ? hoursLabel(blockHours(r.start, r.end, r.breakMinutes)) : ""}</span>
                          </div>
                        );
                      })}
                      {schedule && (
                        <div className="efield">
                          <label>Gäller från</label>
                          <input type="date" name="validFrom" defaultValue={today} min={current.validFrom} required />
                        </div>
                      )}
                      <button className="btn btn-primary hr-btn-small" type="submit">
                        Spara schemat
                      </button>
                      <p className="efield-hint">Rast i minuter. {schedule ? "Den gällande versionen stängs dagen före; avtalet i övrigt följer med." : "Schemat läggs på den gällande versionen."}</p>
                    </form>
                  </details>
                )}
              </article>
            ))}
          </div>
          <aside className="hr-stack">
            {canWrite && (
              <div className="hr-card">
                <h2 className="lead-h2">Planera ett pass</h2>
                <p className="efield-hint">Ett pass för en namngiven person (en behovsanställd utan veckoschema får sjuklön på bokade pass). Att erbjuda poolen görs under Tid.</p>
                <form action={planShiftAction} className="tg-fields">
                  <Back to={here} />
                  <div className="efield tg-wide">
                    <label>Person</label>
                    <select name="employeeId" required className="tg-select">
                      <option value="">Välj</option>
                      {people.map(({ e }) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="efield">
                    <label>Datum</label>
                    <input type="date" name="date" defaultValue={today} required />
                  </div>
                  <div className="efield">
                    <label>Start</label>
                    <input type="time" name="start" defaultValue="07:00" required />
                  </div>
                  <div className="efield">
                    <label>Slut</label>
                    <input type="time" name="end" defaultValue="16:00" required />
                  </div>
                  <div className="efield">
                    <label>Rast (min)</label>
                    <input type="number" name="breakMinutes" min={0} max={600} step={5} defaultValue={60} />
                  </div>
                  <ProjectSelect projects={projects.filter((p) => p.status === "active")} />
                  <button className="btn btn-ghost hr-btn-small" type="submit">
                    Planera
                  </button>
                </form>
              </div>
            )}
            <div className="hr-card">
              <h2 className="lead-h2">Månadens pass</h2>
              {shifts.length === 0 ? (
                <p className="efield-hint">Inga pass i månaden.</p>
              ) : (
                <ul className="hr-history">
                  {shifts.map((s) => (
                    <li key={s.id}>
                      <span>
                        {s.date} kl. {s.start}–{s.end} · {s.employeeId ? (employees.find((e) => e.id === s.employeeId)?.name ?? "?") : "inte tillsatt"}
                      </span>
                      <small>
                        {s.projectId ? projectName.get(s.projectId) : "Utan projekt"}
                        {s.offerStatus === "accepted" ? " · inringt, SÄVA registrerad" : s.offerStatus ? ` · erbjudande: ${s.offerStatus === "offered" ? "öppet" : s.offerStatus === "declined" ? "alla nej" : "avslutat"}` : " · planerat"}
                      </small>
                      {canWrite && s.offerStatus === null && (
                        <form action={deleteShiftAction}>
                          <Back to={here} />
                          <input type="hidden" name="shiftId" value={s.id} />
                          <button className="link-quiet" type="submit">
                            Ta bort
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
