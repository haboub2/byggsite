import { formatOre } from "@/lib/core/money";
import { ABSENCE_EXTENTS, ABSENCE_KINDS, ABSENCE_KIND_LABEL, EXTENT_LABEL, certificatesDue, dayLabel } from "@/lib/core/hr/absence";
import { loadPersonAbsence } from "@/lib/core/hr/person-time";
import { addAbsenceAction, saveBalancesAction, updateAbsenceAction } from "@/app/admin/time-actions";
import { Back, hoursLabel } from "@/components/admin/time/parts";

const kr = (ore: number) => formatOre(ore, { decimals: 2, currency: true });
const SOURCE_LABEL = { schedule: "veckoschemat", shifts: "bokade pass", standard: "avtalets timmar, måndag–fredag (inget schema)" } as const;

/**
 * Frånvaro (docs/hr-lon.md, section 11): the person's absences with their
 * actions, each sick period day by day from sickPay() (day numbers through
 * återinsjuknande, karensavdrag, sjuklön days 1–14, läkarintyg from day 8),
 * and the semester balances per semesterår.
 */
export async function PersonAbsenceTab({ employeeId, today, canWrite }: { employeeId: string; today: string; canWrite: boolean }) {
  const p = await loadPersonAbsence(employeeId, today);
  const here = `/admin/personal/${employeeId}?flik=franvaro`;
  const due = new Set(certificatesDue(p.absences, today).flatMap((c) => c.absenceIds));
  const stored = new Map(p.stored.map((s) => [s.vacationYearStart, s]));
  const latestStored = p.stored.reduce<string | null>((m, s) => (!m || s.updatedAt > m ? s.updatedAt : m), null);

  return (
    <div className="hr-stack">
      <div className="hr-card">
        <h2 className="lead-h2">Frånvaro</h2>
        {p.absences.length === 0 ? (
          <p className="efield-hint">Ingen frånvaro registrerad.</p>
        ) : (
          <div className="hr-table-wrap">
            <table className="org-table">
              <thead>
                <tr>
                  <th>Sort</th>
                  <th>Period</th>
                  <th>Läkarintyg</th>
                  <th>Status</th>
                  {canWrite && <th aria-label="Åtgärder" />}
                </tr>
              </thead>
              <tbody>
                {[...p.absences].reverse().map((a) => (
                  <tr key={a.id}>
                    <td>
                      {ABSENCE_KIND_LABEL[a.kind]}
                      {a.extent < 1 && <span className="hr-muted">{EXTENT_LABEL[a.extent]}</span>}
                      {a.note && <span className="hr-muted">{a.note}</span>}
                    </td>
                    <td>
                      {a.from} – {a.to ?? "pågår"}
                    </td>
                    <td>{a.kind !== "sjuk" ? "–" : a.certificateReceivedOn ? `Mottaget ${a.certificateReceivedOn}` : due.has(a.id) ? <span className="hr-badge" data-tone="alert">Saknas (dag 8 passerad)</span> : "Behövs inte än"}</td>
                    <td>{a.approvedAt ? <span className="inv-status" data-status="paid">Godkänd</span> : <span className="inv-status" data-status="issued">Anmäld</span>}</td>
                    {canWrite && (
                      <td>
                        <div className="tg-actions">
                          {!a.approvedAt && (
                            <form action={updateAbsenceAction}>
                              <Back to={here} />
                              <input type="hidden" name="employeeId" value={employeeId} />
                              <input type="hidden" name="absenceId" value={a.id} />
                              <input type="hidden" name="op" value="approve" />
                              <button className="link-quiet" type="submit">
                                Godkänn
                              </button>
                            </form>
                          )}
                          {a.kind === "sjuk" && !a.certificateReceivedOn && (
                            <form action={updateAbsenceAction} className="hr-inline">
                              <Back to={here} />
                              <input type="hidden" name="employeeId" value={employeeId} />
                              <input type="hidden" name="absenceId" value={a.id} />
                              <input type="hidden" name="op" value="certificate" />
                              <input type="date" name="date" defaultValue={today} max={today} className="hr-date" aria-label="Intyget mottaget" />
                              <button className="link-quiet" type="submit">
                                Intyg mottaget
                              </button>
                            </form>
                          )}
                          {a.kind === "sjuk" && !a.to && (
                            <form action={updateAbsenceAction} className="hr-inline">
                              <Back to={here} />
                              <input type="hidden" name="employeeId" value={employeeId} />
                              <input type="hidden" name="absenceId" value={a.id} />
                              <input type="hidden" name="op" value="end" />
                              <input type="date" name="date" defaultValue={today} min={a.from} className="hr-date" aria-label="Sista sjukdagen" />
                              <button className="link-quiet" type="submit">
                                Sista sjukdag
                              </button>
                            </form>
                          )}
                          <form action={updateAbsenceAction}>
                            <Back to={here} />
                            <input type="hidden" name="employeeId" value={employeeId} />
                            <input type="hidden" name="absenceId" value={a.id} />
                            <input type="hidden" name="op" value="delete" />
                            <button className="link-quiet" type="submit">
                              Ta bort
                            </button>
                          </form>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canWrite && (
          <details className="hr-details">
            <summary>Registrera frånvaro</summary>
            <form action={addAbsenceAction} className="tg-fields">
              <Back to={here} />
              <input type="hidden" name="employeeId" value={employeeId} />
              <div className="efield">
                <label>Sort</label>
                <select name="kind" className="tg-select" defaultValue="sjuk">
                  {ABSENCE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ABSENCE_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="efield">
                <label>Från</label>
                <input type="date" name="from" defaultValue={today} required />
              </div>
              <div className="efield">
                <label>Till (tomt: sjuk och pågår)</label>
                <input type="date" name="to" />
              </div>
              <div className="efield">
                <label>Omfattning</label>
                <select name="extent" className="tg-select" defaultValue="1">
                  {ABSENCE_EXTENTS.map((x) => (
                    <option key={x} value={x}>
                      {EXTENT_LABEL[x]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="efield tg-wide">
                <label>Anteckning</label>
                <input name="note" maxLength={500} />
              </div>
              <button className="btn btn-ghost hr-btn-small" type="submit">
                Registrera
              </button>
            </form>
          </details>
        )}
      </div>

      <div className="hr-card">
        <h2 className="lead-h2">Sjuklön dag för dag</h2>
        {p.sickNote && <p className="efield-error">{p.sickNote}</p>}
        {!p.sick ? (
          !p.sickNote && <p className="efield-hint">Inga sjukdagar.</p>
        ) : (
          <>
            <p className="efield-hint">
              Räknat med {SOURCE_LABEL[p.scheduleSource]}, {p.version?.payForm === "hourly" ? "timlönen" : "månadslönen omräknad till timlön (× 12 / (52 × veckotimmar))"}. Karensavdrag 20 % av en genomsnittlig veckas sjuklön, en gång per sjukperiod; återinsjuknande inom fem dagar fortsätter perioden. {p.sick.waitingDeductionsLast12Months} karensavdrag de senaste tolv månaderna (högst tio).
            </p>
            {p.sick.spells.map((s, i, all) => (
              <details key={s.absenceId} className="hr-details" open={i >= all.length - 2}>
                <summary>
                  {s.days[0].date} – {s.days[s.days.length - 1].date}
                  {s.continuesPrevious ? ` · fortsätter perioden från ${s.firstDay}` : " · ny sjukperiod"} · sjuklön {kr(s.sickPayOre)}
                  {s.waitingDeductionOre ? ` · karensavdrag −${kr(s.waitingDeductionOre)}` : s.noWaitingDeduction === "continuation" ? " · ingen ny karens" : s.noWaitingDeduction === "ten-in-twelve-months" ? " · ingen karens (tio på tolv månader)" : ""}
                </summary>
                <table className="org-table tg-sick">
                  <thead>
                    <tr>
                      <th>Dag</th>
                      <th>Dag i perioden</th>
                      <th>Förlorade timmar</th>
                      <th>Betalas av</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.days.map((d) => (
                      <tr key={d.date} data-flag={d.date === s.certificateFrom ? "cert" : undefined}>
                        <td>{dayLabel(d.date)} {d.date}</td>
                        <td>
                          {d.dayNo}
                          {d.date === s.certificateFrom && " · läkarintyg från i dag"}
                        </td>
                        <td>{hoursLabel(d.lostHours)}</td>
                        <td>{d.employerDay ? "Arbetsgivaren, sjuklön 80 %" : "Försäkringskassan"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ))}
            <p className="efield-hint">Sjuklönekostnad efter karensavdrag: {kr(p.sick.result.sickPayCostOre)}. Beloppen blir lönerader i lönekörningen (fas 3).</p>
          </>
        )}
      </div>

      <div className="hr-card">
        <div className="hr-card-head">
          <h2 className="lead-h2">Semester</h2>
          {canWrite && (
            <form action={saveBalancesAction}>
              <Back to={here} />
              <input type="hidden" name="employeeId" value={employeeId} />
              <button className="btn btn-ghost hr-btn-small" type="submit">
                Spara saldona
              </button>
            </form>
          )}
        </div>
        <p className="efield-hint">
          Semesteråret börjar {p.model.startMonthDay.split("-").reverse().join("/")}, dagarna tjänas in {p.model.earning === "previous-year" ? "året före (semesterlagen)" : "samma år"}. Betalda dagar enligt 7 § (anställningsdagar utan frånvaro som inte är semesterlönegrundande), sparade dagar enligt 18 §. {latestStored ? `Sparat ${latestStored.slice(0, 10)}.` : "Inte sparat än."}
        </p>
        {p.balances.length === 0 ? (
          <p className="efield-hint">Inget avtal med semester.</p>
        ) : (
          <div className="hr-table-wrap">
            <table className="org-table">
              <thead>
                <tr>
                  <th>Semesterår</th>
                  <th>Intjänat</th>
                  <th>Uttaget</th>
                  <th>Sparat in</th>
                  <th>Sparat till senare</th>
                  <th>Kvar</th>
                </tr>
              </thead>
              <tbody>
                {[...p.balances].reverse().map((b) => {
                  const s = stored.get(b.yearFrom);
                  const differs = s && (s.earnedDays !== b.earnedDays || s.paidDays !== b.takenDays || s.savedDays !== b.savedDays);
                  return (
                    <tr key={b.yearFrom}>
                      <td>
                        {b.yearFrom} – {b.yearTo}
                        <span className="hr-muted">
                          intjänandeår {b.earnedFrom} – {b.earnedTo}
                          {b.current ? " · pågår" : ""}
                          {differs ? " · ändrat sedan det sparades" : ""}
                        </span>
                      </td>
                      <td>{b.earnedDays}</td>
                      <td>{String(b.takenDays).replace(".", ",")}</td>
                      <td>{b.savedInDays ? `${b.savedInDays}${b.takenFromSavedDays ? ` (${b.takenFromSavedDays} uttagna)` : ""}` : "–"}</td>
                      <td>{b.savedDays || "–"}</td>
                      <td>{String(b.remainingDays).replace(".", ",")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {p.absences.some((a) => a.kind === "sjuk" && !a.to) && <p className="efield-hint">Pågående sjukdom räknas till och med i dag ({today}).</p>}
    </div>
  );
}
