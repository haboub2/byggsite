import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { isDemo } from "@/lib/leads";
import { todayIso } from "@/lib/quotes/schema";
import { addDays } from "@/lib/core/rules/index";
import { listDocuments, listEmployees } from "@/lib/core/hr/store";
import { ABSENCE_EXTENTS, ABSENCE_KIND_LABEL, EXTENT_LABEL, SELF_REPORTED_KINDS, dayLabel } from "@/lib/core/hr/absence";
import { DEMO_PICK_COOKIE, TIME_KIND_LABEL, TIME_KINDS, isOpenClock, isoWeek, stockholmClock, weekDates, weekStart, type TimeEntry } from "@/lib/core/hr/time";
import { listAbsences, listShifts, listTimeEntries, myEmployee, openOffer, timeProjects } from "@/lib/core/hr/time-store";
import { listEmployeePayslips } from "@/lib/core/payroll/run-store";
import { formatOre } from "@/lib/core/money";
import { monthLabel } from "@/lib/core/payroll/format";
import { signOut } from "@/app/admin/actions";
import {
  addOwnTimeAction,
  answerShiftAction,
  backFromSickAction,
  clockInAction,
  clockOutAction,
  deleteOwnTimeAction,
  demoPickAction,
  reportAbsenceAction,
  submitOwnAction,
} from "./actions";

export const metadata: Metadata = { title: { absolute: "Min tid | Binaafy" }, robots: { index: false, follow: false } };

const STATUS_SHORT: Record<TimeEntry["status"], string> = { draft: "utkast", submitted: "inskickad", approved: "godkänd", locked: "låst" };
const h = (n: number) => `${String(Math.round(n * 100) / 100).replace(".", ",")} h`;

/**
 * Min tid (docs/hr-lon.md, section 11): the employee's day on the phone.
 * One thing at a time: stamp in or out on a project, today's shift,
 * answer a call-in, the week to send in, report absence, the contract.
 * Payslips, once a run is approved (phase 3).
 */
export default async function MinTidPage({ searchParams }: { searchParams: Promise<{ ok?: string; fel?: string; vecka?: string }> }) {
  const check = await requireRole("self");
  if (!check.ok) redirect("/admin/login?next=/min-tid");
  const sp = await searchParams;
  const pick = isDemo() ? ((await cookies()).get(DEMO_PICK_COOKIE)?.value ?? null) : null;
  const me = await myEmployee(check.userId, pick);
  const today = todayIso();

  if (!me) {
    const people = isDemo() ? await listEmployees() : [];
    return (
      <main className="mt">
        <header className="mt-head">
          <span className="eyebrow eyebrow--accent">Min tid</span>
          <h1>{check.orgName}</h1>
        </header>
        <section className="mt-card">
          {isDemo() ? (
            <>
              <h2>Demoläge: vem är du?</h2>
              <p className="mt-muted">Utan inloggning visar sidan den person du väljer.</p>
              {people.length === 0 ? (
                <p>Lägg först till personal under Admin › Personal.</p>
              ) : (
                <form action={demoPickAction} className="mt-stack">
                  <select name="employeeId" className="mt-input">
                    {people.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-primary mt-big" type="submit">
                    Visa
                  </button>
                </form>
              )}
            </>
          ) : (
            <>
              <h2>Ingen person kopplad</h2>
              <p>
                {check.email} är inloggad men inte kopplad till någon person i personalregistret i {check.orgName}. Be arbetsgivaren skicka en inbjudan med rollen Anställd till samma e-postadress som står i personalregistret.
              </p>
            </>
          )}
        </section>
      </main>
    );
  }

  const monday = weekStart(/^\d{4}-\d{2}-\d{2}$/.test(sp.vecka ?? "") ? (sp.vecka as string) : today);
  const sunday = addDays(monday, 6);
  const [entries, projects, shifts, absences, documents, payslips] = await Promise.all([
    listTimeEntries({ employeeId: me.id, from: addDays(monday < today ? monday : today, -7), to: sunday > today ? sunday : today }),
    timeProjects(),
    listShifts({ from: addDays(today, -1), to: addDays(today, 28) }),
    listAbsences({ employeeId: me.id, from: addDays(today, -60) }),
    listDocuments(me.id),
    listEmployeePayslips(me.id),
  ]);
  const active = projects.filter((p) => p.status === "active");
  const projectName = new Map(projects.map((p) => [p.id, p.title]));
  const open = entries.find(isOpenClock) ?? null;
  const mine = shifts.filter((s) => s.employeeId === me.id && (s.offerStatus === null || s.offerStatus === "accepted"));
  const todays = mine.filter((s) => s.date === today);
  const upcoming = mine.filter((s) => s.date > today).slice(0, 5);
  const offers = shifts.filter((s) => openOffer(s) && s.offers.some((o) => o.employeeId === me.id && o.status === "offered"));
  const sick = absences.find((a) => a.kind === "sjuk" && a.to === null) ?? null;
  const week = entries.filter((e) => e.workDate >= monday && e.workDate <= sunday);
  const drafts = week.filter((e) => e.status === "draft" && !isOpenClock(e));
  const { week: weekNo } = isoWeek(monday);
  const weekHours = week.reduce((a, e) => a + e.hours, 0);
  const now = stockholmClock();

  return (
    <main className="mt">
      <header className="mt-head">
        <div>
          <span className="eyebrow eyebrow--accent">Min tid</span>
          <h1>{me.name.split(" ")[0]}</h1>
          <p className="mt-muted">
            {new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${today}T12:00:00Z`))} · {check.orgName}
          </p>
        </div>
        <form action={signOut}>
          <button type="submit" className="link-quiet">
            Logga ut
          </button>
        </form>
      </header>

      {sp.fel && (
        <p className="mt-flash mt-flash--error" role="alert">
          {sp.fel}
        </p>
      )}
      {sp.ok && (
        <p className="mt-flash" role="status">
          {sp.ok}
        </p>
      )}

      {/* Today: one action. */}
      <section className="mt-card mt-card--today">
        {sick ? (
          <>
            <h2>Sjukanmäld sedan {sick.from}</h2>
            <p className="mt-muted">Krya på dig. Läkarintyg behövs från dag 8.</p>
            <form action={backFromSickAction} className="mt-stack">
              <input type="hidden" name="absenceId" value={sick.id} />
              <input type="hidden" name="date" value={today} />
              <button className="btn btn-primary mt-big" type="submit">
                Jag är frisk i dag
              </button>
            </form>
          </>
        ) : open ? (
          <>
            <h2>Instämplad sedan {open.start}</h2>
            <p className="mt-muted">
              {open.workDate !== today ? `${open.workDate} · ` : ""}
              {open.projectId ? (projectName.get(open.projectId) ?? "Projekt") : "Utan projekt"} · nu {now}
            </p>
            <form action={clockOutAction} className="mt-stack">
              <input type="hidden" name="entryId" value={open.id} />
              <label className="mt-label">
                Rast i minuter
                <input type="number" name="breakMinutes" min={0} max={600} step={5} defaultValue={30} className="mt-input" inputMode="numeric" />
              </label>
              <button className="btn btn-primary mt-big" type="submit">
                Stämpla ut
              </button>
            </form>
          </>
        ) : (
          <>
            <h2>{todays.length ? `Dagens pass ${todays.map((s) => `${s.start}–${s.end}`).join(", ")}` : "Stämpla in"}</h2>
            {todays.map((s) => (
              <p key={s.id} className="mt-muted">
                {s.projectId ? projectName.get(s.projectId) : "Utan projekt"}
                {s.note ? ` · ${s.note}` : ""}
              </p>
            ))}
            <form action={clockInAction} className="mt-stack">
              {todays[0] && <input type="hidden" name="shiftId" value={todays[0].id} />}
              <select name="projectId" className="mt-input" defaultValue={todays[0]?.projectId ?? ""} aria-label="Projekt">
                <option value="">Utan projekt</option>
                {active.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              <button className="btn btn-primary mt-big" type="submit">
                Stämpla in nu ({now})
              </button>
            </form>
          </>
        )}
      </section>

      {offers.length > 0 && (
        <section className="mt-card">
          <h2>Erbjudna pass</h2>
          <ul className="mt-list">
            {offers.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>
                    {dayLabel(s.date)} {s.date}, {s.start}–{s.end}
                  </strong>
                  <span className="mt-muted">
                    {s.projectId ? projectName.get(s.projectId) : "Utan projekt"}
                    {s.note ? ` · ${s.note}` : ""}
                    {s.expiresAt ? ` · svara senast ${new Date(s.expiresAt).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "short", timeStyle: "short" })}` : ""}
                  </span>
                </div>
                <div className="mt-row">
                  <form action={answerShiftAction}>
                    <input type="hidden" name="shiftId" value={s.id} />
                    <input type="hidden" name="answer" value="ja" />
                    <button className="btn btn-primary" type="submit">
                      Ja, jag tar det
                    </button>
                  </form>
                  <form action={answerShiftAction}>
                    <input type="hidden" name="shiftId" value={s.id} />
                    <input type="hidden" name="answer" value="nej" />
                    <button className="btn btn-ghost" type="submit">
                      Nej
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-muted">Tackar du ja blir passet en egen visstidsanställning (SÄVA) för den dagen.</p>
        </section>
      )}

      <section className="mt-card">
        <div className="mt-row mt-row--between">
          <h2>Vecka {weekNo}</h2>
          <span className="mt-muted">{h(weekHours)}</span>
        </div>
        <nav className="mt-row mt-row--between mt-muted">
          <a href={`/min-tid?vecka=${addDays(monday, -7)}`}>← Förra</a>
          {monday !== weekStart(today) && <a href="/min-tid">Den här veckan</a>}
          <a href={`/min-tid?vecka=${addDays(monday, 7)}`}>Nästa →</a>
        </nav>
        <ul className="mt-days">
          {weekDates(monday).map((d) => {
            const rows = week.filter((e) => e.workDate === d);
            return (
              <li key={d} data-today={d === today || undefined}>
                <span className="mt-day">{dayLabel(d)}</span>
                {rows.length === 0 ? (
                  <span className="mt-muted">–</span>
                ) : (
                  <ul>
                    {rows.map((e) => (
                      <li key={e.id} data-status={e.status}>
                        <span>
                          {e.start ? `${e.start}–${e.end ?? "…"}` : h(e.hours)} {e.kind !== "work" ? TIME_KIND_LABEL[e.kind].toLowerCase() : ""}
                          {e.projectId ? ` · ${projectName.get(e.projectId) ?? ""}` : ""}
                        </span>
                        <span className="mt-muted">
                          {e.start && e.end ? `${h(e.hours)} · ` : ""}
                          {STATUS_SHORT[e.status]}
                          {e.status === "draft" && !isOpenClock(e) && (
                            <form action={deleteOwnTimeAction} style={{ display: "inline" }}>
                              <input type="hidden" name="entryId" value={e.id} />{" "}
                              <button className="link-quiet" type="submit">
                                ta bort
                              </button>
                            </form>
                          )}
                        </span>
                        {e.note && <span className="mt-muted">{e.note}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {drafts.length > 0 && (
          <form action={submitOwnAction} className="mt-stack">
            <input type="hidden" name="from" value={monday} />
            <input type="hidden" name="to" value={sunday} />
            <button className="btn btn-primary mt-big" type="submit">
              Skicka in veckan ({drafts.length} {drafts.length === 1 ? "rad" : "rader"})
            </button>
          </form>
        )}
        <details className="mt-details">
          <summary>Lägg till tid i efterhand</summary>
          <form action={addOwnTimeAction} className="mt-stack">
            <label className="mt-label">
              Dag
              <input type="date" name="date" defaultValue={today} max={today} className="mt-input" required />
            </label>
            <div className="mt-row">
              <label className="mt-label">
                Start
                <input type="time" name="start" className="mt-input" />
              </label>
              <label className="mt-label">
                Slut
                <input type="time" name="end" className="mt-input" />
              </label>
              <label className="mt-label">
                Rast
                <input type="number" name="breakMinutes" min={0} max={600} step={5} defaultValue={0} className="mt-input" inputMode="numeric" />
              </label>
            </div>
            <label className="mt-label">
              eller timmar
              <input type="text" name="hours" inputMode="decimal" placeholder="t.ex. 7,5" className="mt-input" />
            </label>
            <label className="mt-label">
              Sort
              <select name="kind" className="mt-input" defaultValue="work">
                {TIME_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {TIME_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-label">
              Projekt
              <select name="projectId" className="mt-input" defaultValue="">
                <option value="">Utan projekt</option>
                {active.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-label">
              Anteckning
              <input name="note" maxLength={500} className="mt-input" />
            </label>
            <button className="btn btn-ghost mt-big" type="submit">
              Spara som utkast
            </button>
          </form>
        </details>
      </section>

      {upcoming.length > 0 && (
        <section className="mt-card">
          <h2>Kommande pass</h2>
          <ul className="mt-list">
            {upcoming.map((s) => (
              <li key={s.id}>
                <span>
                  {dayLabel(s.date)} {s.date}, {s.start}–{s.end}
                </span>
                <span className="mt-muted">{s.projectId ? projectName.get(s.projectId) : "Utan projekt"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!sick && (
        <section className="mt-card">
          <details className="mt-details">
            <summary>Anmäl frånvaro</summary>
            <form action={reportAbsenceAction} className="mt-stack">
              <label className="mt-label">
                Vad
                <select name="kind" className="mt-input" defaultValue="sjuk">
                  {SELF_REPORTED_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ABSENCE_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-row">
                <label className="mt-label">
                  Från
                  <input type="date" name="from" defaultValue={today} className="mt-input" required />
                </label>
                <label className="mt-label">
                  Till
                  <input type="date" name="to" className="mt-input" />
                </label>
              </div>
              <label className="mt-label">
                Omfattning
                <select name="extent" className="mt-input" defaultValue="1">
                  {ABSENCE_EXTENTS.map((x) => (
                    <option key={x} value={x}>
                      {EXTENT_LABEL[x]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-label">
                Meddelande
                <input name="note" maxLength={500} className="mt-input" />
              </label>
              <button className="btn btn-primary mt-big" type="submit">
                Skicka
              </button>
              <p className="mt-muted">Sjuk: lämna Till tomt tills du är frisk. Semester och ledighet godkänns av arbetsgivaren.</p>
            </form>
          </details>
          {absences.length > 0 && (
            <ul className="mt-list">
              {[...absences].reverse().slice(0, 6).map((a) => (
                <li key={a.id}>
                  <span>
                    {ABSENCE_KIND_LABEL[a.kind]} {a.from}
                    {a.to && a.to !== a.from ? `–${a.to}` : ""}
                    {a.extent < 1 ? ` (${EXTENT_LABEL[a.extent]})` : ""}
                  </span>
                  <span className="mt-muted">{a.approvedAt ? "godkänd" : "anmäld"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mt-card">
        <h2>Mina lönebesked</h2>
        {payslips.length === 0 ? (
          <p className="mt-muted">Inga lönebesked här än; de kommer när lönen är godkänd.</p>
        ) : (
          <ul className="mt-list">
            {payslips.slice(0, 24).map((p) => (
              <li key={p.id}>
                {p.pdfPath ? (
                  <a href={`/min-tid/lonebesked/${p.id}`} target="_blank" rel="noopener">
                    {monthLabel(p.document.periodStart)}
                  </a>
                ) : (
                  <span>{monthLabel(p.document.periodStart)}</span>
                )}
                <span className="mt-muted">
                  {formatOre(p.netOre, { currency: true })} utbetalt {p.document.payDate}
                  {p.pdfPath ? "" : " (PDF:en görs)"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-card">
        <h2>Mina avtal</h2>
        {documents.length === 0 ? (
          <p className="mt-muted">Inga avtal här än.</p>
        ) : (
          <ul className="mt-list">
            {documents.map((d) => (
              <li key={d.id}>
                <a href={`/min-tid/dokument/${d.id}`} target="_blank" rel="noopener">
                  {d.title} ({d.createdAt.slice(0, 10)})
                </a>
                <span className="mt-muted">{d.signedAt ? `signerat ${d.signedAt}` : "inte signerat"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isDemo() && (
        <form action={demoPickAction} className="mt-row mt-demo">
          <input type="hidden" name="employeeId" value="" />
          <button className="link-quiet" type="submit">
            Demoläge: byt person
          </button>
        </form>
      )}
    </main>
  );
}
