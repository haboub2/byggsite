import Link from "next/link";
import { formatOre } from "@/lib/core/money";
import { listCorrections, listEmployeePayslips, listRuns } from "@/lib/core/payroll/run-store";
import { monthLabel } from "@/lib/core/payroll/format";

const kr = (ore: number) => formatOre(ore, { currency: true });

/**
 * Person › Lön (docs/hr-lon.md, section 11): the person's approved
 * payslips with the frozen PDF, a computed one waiting for approval, and
 * corrections made forward from earlier payslips.
 */
export async function PersonPayTab({ employeeId }: { employeeId: string }) {
  const [slips, corrections, runs] = await Promise.all([listEmployeePayslips(employeeId), listCorrections({ employeeId }), listRuns()]);
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
                  Rättar L{numberOf.get(c.originalPayslipId) ?? "?"} · {c.reason} · AGI {c.agiPeriod} omprövas ·{" "}
                  {c.targetRunId ? `med i ${runById.get(c.targetRunId) ? monthLabel(runById.get(c.targetRunId)!.periodStart) : "en körning"}` : "väntar på nästa körning"}
                </small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
