import { formatOre } from "@/lib/core/money";
import { formatWhen } from "@/lib/admin-format";
import { ownerPlans } from "@/lib/core/payroll/planner-data";
import { payrollRulesAt } from "@/lib/core/rules/payroll";
import { saveOwnerPlanAction } from "@/app/admin/authorities-actions";

const kr = (ore: number) => formatOre(ore, { decimals: 0, currency: true });

/**
 * "Ägarnas löneuttag" (docs/hr-lon.md, section 6): for each person marked
 * as owner, this year's dividend room under the 2026 3:12 rules from last
 * year's pay on the approved payslips, and what this year's pay (so far
 * plus the rest of the year at the planned monthly salary) gives next
 * year. Informational: nothing here changes a payroll. The ownership share
 * and the planned salary are typed in and saved as a snapshot.
 */
export async function OwnerPlannerSection({ today, canApprove }: { today: string; canApprove: boolean }) {
  const year = Number(today.slice(0, 4));
  const plans = await ownerPlans(today);
  const rules = payrollRulesAt(today);
  return (
    <div className="hr-card" id="agare">
      <h2 className="hr-h2">Ägarnas löneuttag (3:12)</h2>
      <p className="hr-muted">
        Underlag för samtalet med redovisningskonsulten, inget beslut och ingen påverkan på lönen. Reglerna från 2026: gränsbeloppet är grundbeloppet ({rules.closeCompany.grundbeloppIbb} inkomstbasbelopp för året före, fördelat efter aktieinnehav) plus det
        lönebaserade utrymmet ({rules.closeCompany.wageBasedPercent} % av ägarens andel av förra årets löneunderlag minus {rules.closeCompany.wageSumDeductionIbb} inkomstbasbelopp, högst {rules.closeCompany.capMultipleOfOwnSalary} gånger den egna lönen). Inget lönekrav och ingen
        uppräkning av sparat utrymme. Löneunderlaget här är bruttolönen på de godkända lönebeskeden; lön från dotterbolag och närståendes lön är inte med. Källa:{" "}
        <a href={rules.closeCompany.source.url}>Skatteverket</a>.
      </p>
      {plans.length === 0 ? (
        <p className="hr-muted">Ingen i personalregistret är markerad som ägare (Person › Uppgifter).</p>
      ) : (
        plans.map(({ owner: o, input, result: r, plannedMonthlyOre: plannedMonthly, saved, wageYtdOre: wageYtd }) => {
          const share = input.ownershipPercent;
          return (
            <article key={o.id} className="hr-card" style={{ marginTop: 12 }}>
              <h3 className="hr-h2">
                {o.name} <span className="hr-muted">({share} % av aktierna)</span>
              </h3>
              <div className="hr-table-wrap">
                <table className="org-table">
                  <thead>
                    <tr>
                      <th />
                      <th className="tg-num">Utdelning {r.thisYear.year}</th>
                      <th className="tg-num">Utdelning {r.nextYear.year} (prognos)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Egen kontant lön året före</td>
                      <td className="tg-num">{kr(input.ownPayLastYearOre)}</td>
                      <td className="tg-num">
                        {kr(r.ownPayThisYearOre)} <small className="hr-muted">({kr(input.ownPayYearToDateOre)} hittills)</small>
                      </td>
                    </tr>
                    <tr>
                      <td>Löneunderlag året före (alla)</td>
                      <td className="tg-num">{kr(r.thisYear.wageSumOre)}</td>
                      <td className="tg-num">
                        {kr(r.nextYear.wageSumOre)} <small className="hr-muted">({kr(wageYtd)} hittills)</small>
                      </td>
                    </tr>
                    <tr>
                      <td>Inkomstbasbelopp året före</td>
                      <td className="tg-num">{kr(r.thisYear.ibbOre)}</td>
                      <td className="tg-num">{kr(r.nextYear.ibbOre)}</td>
                    </tr>
                    <tr>
                      <td>Grundbelopp</td>
                      <td className="tg-num">{kr(r.thisYear.grundbeloppOre)}</td>
                      <td className="tg-num">{kr(r.nextYear.grundbeloppOre)}</td>
                    </tr>
                    <tr>
                      <td>Lönebaserat utrymme före taket</td>
                      <td className="tg-num">{kr(r.thisYear.wageBasedBeforeCapOre)}</td>
                      <td className="tg-num">{kr(r.nextYear.wageBasedBeforeCapOre)}</td>
                    </tr>
                    <tr>
                      <td>Tak ({rules.closeCompany.capMultipleOfOwnSalary} × egen lön)</td>
                      <td className="tg-num">{kr(r.thisYear.capOre)}</td>
                      <td className="tg-num">{kr(r.nextYear.capOre)}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Gränsbelopp (utdelning beskattad som kapital)</th>
                      <th className="tg-num">{kr(r.thisYear.limitOre)}</th>
                      <th className="tg-num">{kr(r.nextYear.limitOre)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {r.notes.length > 0 && (
                <ul className="hr-history">
                  {r.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
              <p className="hr-muted">
                Lön ger pensionsrätt, sjukpenninggrundande inkomst och föräldrapenning och är underlag för taket ovan; utdelning inom gränsbeloppet beskattas lägre men ger inget av det. Sparat utdelningsutrymme från tidigare år ingår inte här.
              </p>
              {canApprove && (
                <form action={saveOwnerPlanAction} className="hr-inline">
                  <input type="hidden" name="employeeId" value={o.id} />
                  <input type="hidden" name="year" value={year} />
                  <label>
                    Ägarandel %{" "}
                    <input className="efield-input" name="ownershipPercent" inputMode="decimal" defaultValue={String(share)} style={{ width: 80 }} />
                  </label>
                  <label>
                    Planerad månadslön resten av året{" "}
                    <input className="efield-input" name="plannedMonthly" inputMode="decimal" defaultValue={String(plannedMonthly / 100)} style={{ width: 120 }} />
                  </label>
                  <button className="btn btn-ghost hr-btn-small" type="submit">
                    Spara planeringen
                  </button>
                </form>
              )}
              {saved && (
                <p className="hr-muted">
                  <small>Senast sparad {formatWhen(saved.createdAt)}.</small>
                </p>
              )}
            </article>
          );
        })
      )}
    </div>
  );
}
