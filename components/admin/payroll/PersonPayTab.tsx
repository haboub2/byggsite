import Link from "next/link";
import { formatOre } from "@/lib/core/money";
import { formatWhen } from "@/lib/admin-format";
import { todayIso } from "@/lib/quotes/schema";
import { listEmployments } from "@/lib/core/hr/store";
import { listCorrections, listEmployeePayslips, listRuns } from "@/lib/core/payroll/run-store";
import { listCertificates, listRepayments, type EmployerCertificate } from "@/lib/core/payroll/authorities-store";
import { LEAVING_REASONS, LEAVING_REASON_LABEL } from "@/lib/core/payroll/certificate";
import { monthLabel } from "@/lib/core/payroll/format";
import { createCertificateAction } from "@/app/admin/authorities-actions";

const kr = (ore: number) => formatOre(ore, { currency: true });

/**
 * Person › Lön (docs/hr-lon.md, section 11): the person's approved
 * payslips with the frozen PDF, corrections made forward from earlier
 * payslips, salary paid back (which refiles that month's AGI), and the
 * arbetsgivarintyg (phase 4): made here, frozen, seen by the person on
 * /min-tid.
 */
export async function PersonPayTab({ employeeId, canApprove = false }: { employeeId: string; canApprove?: boolean }) {
  const [slips, corrections, runs, certificates, versions, repayments] = await Promise.all([
    listEmployeePayslips(employeeId),
    listCorrections({ employeeId }),
    listRuns(),
    listCertificates(employeeId).catch((): EmployerCertificate[] => []),
    listEmployments(employeeId),
    listRepayments().catch(() => []),
  ]);
  const today = todayIso();
  const ends = versions.filter((v) => v.payForm !== "fee").map((v) => v.endsOn);
  const lastDay = ends.length && ends.every((d) => d !== null) ? (ends as string[]).reduce((m, d) => (d > m ? d : m)) : null;
  const certTo = lastDay && lastDay < today ? lastDay : today;
  const mine = repayments.filter((r) => r.employeeId === employeeId);
  const runById = new Map(runs.map((r) => [r.id, r]));
  const numberOf = new Map(slips.map((s) => [s.id, s.number]));
  return (
    <div className="hr-stack">
      <div className="hr-card">
        <h2 className="hr-h2">Lönebesked</h2>
        {slips.length === 0 ? (
          <p className="hr-muted">
            Inga godkända lönebesked ännu. <Link href="/admin/lon">Lönekörning</Link>
          </p>
        ) : (
          <div className="hr-table-wrap">
            <table className="org-table">
              <thead>
                <tr>
                  <th>Nr</th>
                  <th>Månad</th>
                  <th>Utbetalt</th>
                  <th className="tg-num">Brutto</th>
                  <th className="tg-num">Skatt</th>
                  <th className="tg-num">Netto</th>
                  <th>PDF</th>
                </tr>
              </thead>
              <tbody>
                {slips.map((s) => (
                  <tr key={s.id}>
                    <td>L{s.number}</td>
                    <td>
                      <Link href={`/admin/lon/${s.runId}`}>{monthLabel(s.document.periodStart)}</Link>
                    </td>
                    <td>{s.document.payDate}</td>
                    <td className="tg-num">{kr(s.grossOre)}</td>
                    <td className="tg-num">{kr(-s.taxOre)}</td>
                    <td className="tg-num">{kr(s.netOre)}</td>
                    <td>
                      {s.pdfPath ? (
                        <a href={`/admin/lon/lonebesked/${s.id}`} target="_blank" rel="noreferrer">
                          Visa
                        </a>
                      ) : (
                        <span className="hr-muted">saknas</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {corrections.length > 0 && (
        <div className="hr-card">
          <h2 className="hr-h2">Rättelser</h2>
          <ul className="hr-history">
            {corrections.map((c) => (
              <li key={c.id}>
                {c.lines.map((l) => `${l.text} ${kr(l.amountOre)}`).join(", ")}
                <small>
                  Rättar L{numberOf.get(c.originalPayslipId) ?? "?"} · {c.reason} ·{" "}
                  {c.targetRunId ? `med i ${runById.get(c.targetRunId) ? monthLabel(runById.get(c.targetRunId)!.periodStart) : "en körning"}` : "väntar på nästa körning"} · redovisas i AGI för den månad rättelsen betalas

                </small>
              </li>
            ))}
          </ul>
        </div>
      )}
      {mine.length > 0 && (
        <div className="hr-card">
          <h2 className="hr-h2">Återbetald lön</h2>
          <ul className="hr-history">
            {mine.map((r) => (
              <li key={r.id}>
                {kr(r.amountOre)} betalt tillbaka {r.repaidOn}
                <small>
                  {r.reason} · AGI för {monthLabel(r.period)} omprövas: ruta 011 och avgifterna sänks, skatten står kvar · <Link href={`/admin/rapporter?agi=${r.period}#agi`}>Lönerapporter</Link>
                </small>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="hr-card" id="intyg">
        <h2 className="hr-h2">Arbetsgivarintyg</h2>
        {certificates.length === 0 ? (
          <p className="hr-muted">Inget arbetsgivarintyg ännu.</p>
        ) : (
          <ul className="hr-history">
            {certificates.map((c) => (
              <li key={c.id}>
                <span>
                  <a href={`/admin/personal/${employeeId}/intyg/${c.id}`} target="_blank" rel="noreferrer">
                    Arbetsgivarintyg {c.from} – {c.to}
                  </a>{" "}
                  · {LEAVING_REASON_LABEL[c.reason]}
                </span>
                <small>
                  Gjort {formatWhen(c.createdAt)} · {Math.round(c.content.totals.workedHours)} h arbetat, {kr(c.content.totals.payOre)} · SHA-256 {c.sha256.slice(0, 12)}…
                </small>
              </li>
            ))}
          </ul>
        )}
        {canApprove && (
          <form action={createCertificateAction} className="tg-fields">
            <input type="hidden" name="employeeId" value={employeeId} />
            <div className="efield">
              <label htmlFor="ci-to">Sista dagen intyget gäller</label>
              <input id="ci-to" name="to" type="date" defaultValue={certTo} max={today} required />
            </div>
            <div className="efield">
              <label htmlFor="ci-reason">Anställningen</label>
              <select id="ci-reason" name="reason" className="tg-select" defaultValue={lastDay && lastDay <= today ? "visstid-slut" : "pagar"}>
                {LEAVING_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {LEAVING_REASON_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="efield tg-wide">
              <label htmlFor="ci-text">Övriga upplysningar (t.ex. datum för uppsägningen, erbjudande om fortsatt arbete)</label>
              <input id="ci-text" name="reasonText" maxLength={600} />
            </div>
            <button className="btn btn-ghost hr-btn-small" type="submit">
              Skapa arbetsgivarintyg (PDF)
            </button>
          </form>
        )}
        <p className="hr-muted">Anställningen, arbetad tid, frånvaro och övertid per månad för de senaste tolv månaderna och lönen, ur avtalen, den godkända tiden och lönebeskeden, med det blankett SO 11 frågar efter. Personnumret läses fram (loggas). PDF:en fryses; personen ser den på /min-tid.</p>
      </div>
    </div>
  );
}
