import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { hasAccess } from "@/lib/core/org/roles";
import { todayIso } from "@/lib/quotes/schema";
import { addDays } from "@/lib/core/rules/index";
import { dayLabel } from "@/lib/core/hr/absence";
import { TIME_KIND_LABEL, TIME_KIND_SHORT, atlWarnings, currentEntries, isApproved, isOpenClock, isReversal, isoWeek, weekDates, weekStart, type TimeEntry } from "@/lib/core/hr/time";
import { leaderCandidates, listShifts, listTimeEntries, listTimeLocks, openOffer, shiftPool, timePeople, timeProjects } from "@/lib/core/hr/time-store";
import {
  approveTimeAction,
  correctTimeAction,
  deleteTimeAction,
  lockPeriodAction,
  offerShiftAction,
  returnTimeAction,
  setProjectLeaderAction,
  withdrawShiftAction,
} from "@/app/admin/time-actions";
import { Back, EntryFields, Flash, ProjectSelect, StatusPill, hoursLabel } from "@/components/admin/time/parts";

export const metadata: Metadata = { title: "Tid" };

const PENDING: TimeEntry["status"][] = ["draft", "submitted", "approved", "locked"];

/**
 * Tid (docs/hr-lon.md, section 11): the week per project and person,
 * approve by day or week, the ATL warnings, corrections, locking a period,
 * call-ins to the pool of behovsanställda, and who leads each project.
 * Owner and admin see and approve everything; staff see and approve the
 * projects they lead (RLS); the accountant reads.
 */
export default async function TidPage({ searchParams }: { searchParams: Promise<{ vecka?: string; projekt?: string; ok?: string; fel?: string }> }) {
  const check = await requireRole("time");
  if (!check.ok) redirect("/admin/login");
  const canApprove = hasAccess(check.role, "write");
  const isAdmin = hasAccess(check.role, "admin");
  const sp = await searchParams;
  const today = todayIso();
  const monday = weekStart(/^\d{4}-\d{2}-\d{2}$/.test(sp.vecka ?? "") ? (sp.vecka as string) : today);
  const sunday = addDays(monday, 6);
  const dates = weekDates(monday);
  const here = `/admin/tid?vecka=${monday}${sp.projekt ? `&projekt=${sp.projekt}` : ""}`;

  const [around, people, projects, locks, shifts, pool, candidates] = await Promise.all([
    // A week either side, so the rest checks see the neighbours.
    listTimeEntries({ from: addDays(monday, -7), to: addDays(sunday, 7) }),
    timePeople(),
    timeProjects(),
    listTimeLocks(),
    listShifts({ from: today < monday ? today : monday, to: addDays(today > sunday ? today : sunday, 28) }),
    canApprove ? shiftPool().catch(() => []) : Promise.resolve([]),
    isAdmin ? leaderCandidates() : Promise.resolve([]),
  ]);
  const name = new Map(people.map((p) => [p.id, p.name]));
  const projectName = new Map(projects.map((p) => [p.id, p.title]));
  const week = around.filter((e) => e.workDate >= monday && e.workDate <= sunday && (!sp.projekt || e.projectId === sp.projekt));
  const warnings = atlWarnings(around, { from: monday, to: sunday });
  const lockedDay = (d: string) => locks.some((l) => d >= l.from && d <= l.to);

  // Rows: project, then person.
  type Row = { key: string; projectId: string | null; employeeId: string; entries: TimeEntry[] };
  const rows = new Map<string, Row>();
  for (const e of week) {
    const key = `${e.projectId ?? ""}|${e.employeeId}`;
    const r = rows.get(key) ?? { key, projectId: e.projectId, employeeId: e.employeeId, entries: [] };
    r.entries.push(e);
    rows.set(key, r);
  }
  const grouped = [...rows.values()].sort(
    (a, b) => (projectName.get(a.projectId ?? "") ?? "~").localeCompare(projectName.get(b.projectId ?? "") ?? "~", "sv") || (name.get(a.employeeId) ?? "").localeCompare(name.get(b.employeeId) ?? "", "sv")
  );
  const submittedAll = week.filter((e) => e.status === "submitted");
  const { week: weekNo } = isoWeek(monday);
  const upcoming = shifts.filter((s) => s.offerStatus !== null && s.date >= today);
  const reversed = new Set(around.filter((e) => isReversal(e) && isApproved(e)).map((e) => e.correctsId));

  return (
    <section className="sec sec--tight">
      <div className="container">
        <div className="inbox-head">
          <div>
            <span className="eyebrow">Personal</span>
            <h1>Tid</h1>
            <p className="admin-intro">
              Veckan per projekt och person. Godkänd tid blir projektkostnad och kan inte ändras; ett fel rättas med en rättelse som godkänns som vanligt. {canApprove ? "" : "Du läser; godkännande görs av ägare, administratörer och projektledare."}
            </p>
          </div>
        </div>
        <Flash ok={sp.ok} error={sp.fel} />

        <div className="tg-weekbar">
          <Link className="btn btn-ghost hr-btn-small" href={`/admin/tid?vecka=${addDays(monday, -7)}${sp.projekt ? `&projekt=${sp.projekt}` : ""}`}>
            ← Vecka {isoWeek(addDays(monday, -7)).week}
          </Link>
          <strong>
            Vecka {weekNo} · {monday} – {sunday}
          </strong>
          <Link className="btn btn-ghost hr-btn-small" href={`/admin/tid?vecka=${addDays(monday, 7)}${sp.projekt ? `&projekt=${sp.projekt}` : ""}`}>
            Vecka {isoWeek(addDays(monday, 7)).week} →
          </Link>
          <form className="hr-inline" method="get" action="/admin/tid">
            <input type="hidden" name="vecka" value={monday} />
            <select name="projekt" defaultValue={sp.projekt ?? ""} className="tg-select" aria-label="Projekt">
              <option value="">Alla projekt</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost hr-btn-small" type="submit">
              Visa
            </button>
          </form>
          {canApprove && submittedAll.length > 0 && (
            <form action={approveTimeAction}>
              <Back to={here} />
              <input type="hidden" name="ids" value={submittedAll.map((e) => e.id).join(",")} />
              <button className="btn btn-primary hr-btn-small" type="submit">
                Godkänn allt inskickat ({submittedAll.length})
              </button>
            </form>
          )}
        </div>

        {grouped.length === 0 ? (
          <div className="inbox-empty">
            <p>Ingen tid rapporterad den här veckan{sp.projekt ? " på projektet" : ""}.</p>
          </div>
        ) : (
          <div className="hr-table-wrap">
            <table className="org-table tg-grid">
              <thead>
                <tr>
                  <th>Projekt och person</th>
                  {dates.map((d) => (
                    <th key={d} data-locked={lockedDay(d) || undefined}>
                      {dayLabel(d)}
                    </th>
                  ))}
                  <th>Vecka</th>
                  {canApprove && <th aria-label="Åtgärder" />}
                </tr>
              </thead>
              <tbody>
                {grouped.map((r) => {
                  const shown = currentEntries(r.entries, PENDING);
                  const waiting = r.entries.filter((e) => e.status === "submitted");
                  return (
                    <tr key={r.key}>
                      <td>
                        <span className="hr-name">{name.get(r.employeeId) ?? "Okänd"}</span>
                        <span className="hr-muted">{r.projectId ? (projectName.get(r.projectId) ?? "Projekt") : "Utan projekt"}</span>
                      </td>
                      {dates.map((d) => {
                        const cell = r.entries.filter((e) => e.workDate === d);
                        const net = shown.filter((e) => e.workDate === d).reduce((a, e) => a + e.hours, 0);
                        const cellWaiting = cell.filter((e) => e.status === "submitted");
                        const state = cell.some((e) => e.status === "submitted") ? "submitted" : cell.some((e) => e.status === "draft") ? "draft" : cell.some((e) => e.status === "locked") ? "locked" : cell.length ? "approved" : "";
                        const kinds = [...new Set(cell.map((e) => TIME_KIND_SHORT[e.kind]).filter(Boolean))].join(" ");
                        return (
                          <td key={d} className="tg-cell" data-state={state || undefined}>
                            {cell.length > 0 && (
                              <>
                                <span className="tg-hours">{hoursLabel(net)}</span>
                                {kinds && <span className="hr-muted">{kinds}</span>}
                                {cell.some(isOpenClock) && <span className="hr-muted">instämplad</span>}
                                {canApprove && cellWaiting.length > 0 && (
                                  <form action={approveTimeAction}>
                                    <Back to={here} />
                                    <input type="hidden" name="ids" value={cellWaiting.map((e) => e.id).join(",")} />
                                    <button type="submit" className="link-quiet tg-approve" aria-label={`Godkänn ${d}`}>
                                      Godkänn
                                    </button>
                                  </form>
                                )}
                              </>
                            )}
                          </td>
                        );
                      })}
                      <td className="tg-hours">{hoursLabel(shown.reduce((a, e) => a + e.hours, 0))}</td>
                      {canApprove && (
                        <td>
                          {waiting.length > 0 && (
                            <div className="tg-actions">
                              <form action={approveTimeAction}>
                                <Back to={here} />
                                <input type="hidden" name="ids" value={waiting.map((e) => e.id).join(",")} />
                                <button className="btn btn-ghost hr-btn-small" type="submit">
                                  Godkänn veckan
                                </button>
                              </form>
                              <details>
                                <summary className="link-quiet">Skicka tillbaka</summary>
                                <form action={returnTimeAction} className="hr-inline">
                                  <Back to={here} />
                                  <input type="hidden" name="ids" value={waiting.map((e) => e.id).join(",")} />
                                  <input name="note" maxLength={200} placeholder="Vad ska rättas?" className="hr-date" />
                                  <button className="btn btn-ghost hr-btn-small" type="submit">
                                    Skicka
                                  </button>
                                </form>
                              </details>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="efield-hint tg-legend">
          <span className="tg-dot" data-state="draft" /> utkast · <span className="tg-dot" data-state="submitted" /> väntar på godkännande · <span className="tg-dot" data-state="approved" /> godkänd · <span className="tg-dot" data-state="locked" /> låst. Timmarna är netto: en godkänd rättelse har ersatt raden den rättar.
        </p>

        {warnings.length > 0 && (
          <div className="hr-card tg-gap">
            <h2 className="lead-h2">Arbetstidslagen</h2>
            <p className="efield-hint">Varningar, inga stopp: kontrollera innan du godkänner.</p>
            <ul className="hr-clocks">
              {warnings.map((w, i) => (
                <li key={i} data-tone="alert">
                  <strong>{name.get(w.employeeId) ?? "Okänd"}</strong> <span>{w.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <details className="hr-details tg-gap" open={week.length > 0 && week.length <= 40}>
          <summary>Raderna i veckan ({week.length})</summary>
          <div className="hr-table-wrap">
            <table className="org-table">
              <thead>
                <tr>
                  <th>Dag</th>
                  <th>Person</th>
                  <th>Tid</th>
                  <th>Sort och projekt</th>
                  <th>Status</th>
                  <th aria-label="Åtgärder" />
                </tr>
              </thead>
              <tbody>
                {week.map((e) => (
                  <tr key={e.id} data-replaced={reversed.has(e.id) || isReversal(e) || undefined}>
                    <td>{e.workDate}</td>
                    <td>{name.get(e.employeeId) ?? "Okänd"}</td>
                    <td>
                      {e.start ? `${e.start}–${e.end ?? "…"}` : ""}
                      {e.breakMinutes ? <span className="hr-muted">rast {e.breakMinutes} min</span> : null}
                      <span className="hr-muted">{hoursLabel(e.hours)}</span>
                    </td>
                    <td>
                      {TIME_KIND_LABEL[e.kind]}
                      <span className="hr-muted">{e.projectId ? (projectName.get(e.projectId) ?? "") : "Utan projekt"}</span>
                      {e.note && <span className="hr-muted">{e.note}</span>}
                      {e.correctsId && <span className="hr-muted">{isReversal(e) ? "Vänder en godkänd rad" : "Ersätter en godkänd rad"}</span>}
                    </td>
                    <td>
                      <StatusPill status={e.status} />
                      {reversed.has(e.id) && <span className="hr-muted">rättad</span>}
                    </td>
                    <td>
                      <div className="tg-actions">
                        {canApprove && e.status === "submitted" && (
                          <form action={approveTimeAction}>
                            <Back to={here} />
                            <input type="hidden" name="ids" value={e.id} />
                            <button className="link-quiet" type="submit">
                              Godkänn
                            </button>
                          </form>
                        )}
                        {isAdmin && (e.status === "draft" || e.status === "submitted") && (
                          <form action={deleteTimeAction}>
                            <Back to={here} />
                            <input type="hidden" name="entryId" value={e.id} />
                            <button className="link-quiet" type="submit">
                              Ta bort
                            </button>
                          </form>
                        )}
                        {canApprove && e.status === "approved" && !reversed.has(e.id) && !isReversal(e) && !around.some((x) => x.correctsId === e.id) && (
                          <details>
                            <summary className="link-quiet">Rätta</summary>
                            <form action={correctTimeAction} className="tg-correct">
                              <Back to={here} />
                              <input type="hidden" name="entryId" value={e.id} />
                              <EntryFields projects={projects} date={e.workDate} fixedDate defaults={{ start: e.start ?? "", end: e.end ?? "", breakMinutes: e.breakMinutes, hours: e.start ? "" : String(e.hours).replace(".", ","), kind: e.kind, projectId: e.projectId ?? "", note: e.note }} />
                              <div className="efield">
                                <label>Skäl</label>
                                <input name="reason" maxLength={200} placeholder="t.ex. gick tidigare" />
                              </div>
                              <label className="etoggle">
                                <input type="checkbox" name="removeOnly" value="1" /> Ta bara bort raden (ingen ersättning)
                              </label>
                              <button className="btn btn-ghost hr-btn-small" type="submit">
                                Skicka rättelsen
                              </button>
                            </form>
                          </details>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <div className="hr-two tg-gap">
          <div className="hr-stack">
            <div className="hr-card">
              <h2 className="lead-h2">Inringning</h2>
              <p className="efield-hint">
                Erbjud ett pass till poolen av behovsanställda (de vars senaste avtal är en SÄVA med timlön{pool.length ? `: ${pool.map((p) => p.name).join(", ")}` : ""}). Den som tackar ja på Min tid får passet som en egen SÄVA, som LAS-klockan räknar.
              </p>
              {canApprove && (
                <details className="hr-details" open={upcoming.length === 0}>
                  <summary>Erbjud ett pass</summary>
                  <form action={offerShiftAction} className="tg-fields">
                    <Back to={here} />
                    <div className="efield">
                      <label>Datum</label>
                      <input type="date" name="date" min={today} defaultValue={addDays(today, 1)} required />
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
                    <div className="efield">
                      <label>Svara senast</label>
                      <input type="datetime-local" name="expiresAt" />
                    </div>
                    {pool.length > 0 && (
                      <fieldset className="efield tg-wide">
                        <label>Till (inget valt: hela poolen)</label>
                        <div className="hr-inline">
                          {pool.map((p) => (
                            <label key={p.id} className="etoggle" style={{ marginTop: 0 }}>
                              <input type="checkbox" name="employeeIds" value={p.id} /> {p.name}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    )}
                    <div className="efield tg-wide">
                      <label>Meddelande</label>
                      <input name="note" maxLength={500} placeholder="t.ex. rivning, ta med skyddsskor" />
                    </div>
                    <button className="btn btn-primary hr-btn-small" type="submit">
                      Erbjud passet
                    </button>
                  </form>
                </details>
              )}
              {upcoming.length === 0 ? (
                <p className="efield-hint">Inga erbjudna pass framåt.</p>
              ) : (
                <ul className="tg-offers">
                  {upcoming.map((s) => (
                    <li key={s.id}>
                      <div>
                        <strong>
                          {dayLabel(s.date)} {s.date} kl. {s.start}–{s.end}
                        </strong>
                        <span className="hr-muted">
                          {s.projectId ? (projectName.get(s.projectId) ?? "Projekt") : "Utan projekt"}
                          {s.note ? ` · ${s.note}` : ""}
                          {s.expiresAt ? ` · svar senast ${new Date(s.expiresAt).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "short", timeStyle: "short" })}` : ""}
                        </span>
                        <span className="hr-muted">
                          {s.offerStatus === "accepted"
                            ? `Tillsatt: ${name.get(s.employeeId ?? "") ?? "?"} (SÄVA registrerad)`
                            : s.offerStatus === "expired"
                              ? "Återkallat eller utgånget"
                              : openOffer(s)
                                ? "Öppet"
                                : s.offerStatus === "declined"
                                  ? "Alla tackade nej"
                                  : "Svarstiden har gått ut"}
                        </span>
                        <span className="tg-answers">
                          {s.offers.map((o) => (
                            <span key={o.employeeId} className="tg-status" data-status={o.status === "accepted" ? "approved" : o.status === "declined" ? "draft" : o.status === "expired" ? "locked" : "submitted"}>
                              {name.get(o.employeeId) ?? "?"}: {o.status === "accepted" ? "ja" : o.status === "declined" ? "nej" : o.status === "expired" ? "–" : "inget svar"}
                            </span>
                          ))}
                        </span>
                      </div>
                      {canApprove && (s.offerStatus === "offered" || s.offerStatus === "declined") && (
                        <form action={withdrawShiftAction}>
                          <Back to={here} />
                          <input type="hidden" name="shiftId" value={s.id} />
                          <button className="link-quiet" type="submit">
                            Återkalla
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <aside className="hr-stack">
            <div className="hr-card">
              <h2 className="lead-h2">Låsta perioder</h2>
              <p className="efield-hint">I en låst period går det inte att rapportera, ändra eller godkänna tid eller frånvaro. Lönekörningen låser sin period (fas 3); ett lås tas inte bort.</p>
              {locks.length === 0 ? (
                <p className="efield-hint">Inga lås än.</p>
              ) : (
                <ul className="hr-history">
                  {locks.map((l) => (
                    <li key={l.id}>
                      <span>
                        {l.from} – {l.to}
                      </span>
                      <small>
                        {l.note ? `${l.note} · ` : ""}låst {l.lockedAt.slice(0, 10)}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
              {isAdmin && (
                <details className="hr-details">
                  <summary>Lås en period</summary>
                  <form action={lockPeriodAction} className="tg-fields">
                    <Back to={here} />
                    <div className="efield">
                      <label>Från</label>
                      <input type="date" name="from" defaultValue={monday} required />
                    </div>
                    <div className="efield">
                      <label>Till</label>
                      <input type="date" name="to" defaultValue={sunday} required />
                    </div>
                    <div className="efield tg-wide">
                      <label>Anteckning</label>
                      <input name="note" maxLength={200} placeholder="t.ex. Lön oktober" />
                    </div>
                    <button className="btn btn-ghost hr-btn-small" type="submit">
                      Lås perioden
                    </button>
                  </form>
                </details>
              )}
            </div>
            {isAdmin && (
              <div className="hr-card">
                <h2 className="lead-h2">Projektledare</h2>
                <p className="efield-hint">Personal som leder ett projekt ser och godkänner dess tid, inget annat i personalen.</p>
                <ul className="tg-leaders">
                  {projects
                    .filter((p) => p.status === "active")
                    .map((p) => (
                      <li key={p.id}>
                        <form action={setProjectLeaderAction} className="hr-inline">
                          <Back to={here} />
                          <input type="hidden" name="projectId" value={p.id} />
                          <span>{p.title}</span>
                          <select name="userId" defaultValue={p.leaderUserId ?? ""} className="tg-select" aria-label={`Ledare för ${p.title}`}>
                            <option value="">Ingen</option>
                            {candidates.map((c) => (
                              <option key={c.userId} value={c.userId}>
                                {c.email}
                              </option>
                            ))}
                          </select>
                          <button className="link-quiet" type="submit">
                            Spara
                          </button>
                        </form>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
