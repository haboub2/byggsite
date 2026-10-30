import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { isDemo } from "@/lib/leads";
import { hasAccess } from "@/lib/core/org/roles";
import { formatOre } from "@/lib/core/money";
import { todayIso } from "@/lib/quotes/schema";
import { addDays } from "@/lib/core/rules/index";
import { agiDueDate } from "@/lib/core/rules/payroll";
import { listEmployees } from "@/lib/core/hr/store";
import { getPayrollSettings, listRuns, RUN_STATUS_LABEL } from "@/lib/core/payroll/run-store";
import { payDateFor, runPeriods, unconfirmedDecisions } from "@/lib/core/payroll/settings";
import { monthLabel } from "@/lib/pdf/PayslipPdf";
import { Flash } from "@/components/admin/time/parts";
import { createRunAction, seedDemoPayrollAction } from "@/app/admin/payroll-actions";

export const metadata: Metadata = { title: "Lönekörning" };

/**
 * Lönekörning (docs/hr-lon.md, section 11): start a run for a month with
 * its pay day, then the run's own page walks the steps. Earlier runs below
 * with their status.
 */
export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ ok?: string; fel?: string }> }) {
  const check = await requireRole("payroll");
  if (!check.ok) redirect("/admin/login");
  const sp = await searchParams;
  const today = todayIso();
  const [runs, { settings, confirmed }, employees] = await Promise.all([listRuns(), getPayrollSettings(), listEmployees()]);
  const canApprove = hasAccess(check.role, "admin");
  // The next month without a run: this month if its pay day has not passed, otherwise next month.
  const thisMonth = today.slice(0, 7);
  const nextMonth = addDays(`${thisMonth}-28`, 7).slice(0, 7);
  const suggested = [thisMonth, nextMonth].find((m) => !runs.some((r) => r.periodStart.startsWith(m)) && payDateFor(m, settings) >= today) ?? nextMonth;
  const periods = runPeriods(suggested, settings);
  const open = unconfirmedDecisions(confirmed);

  return (
    <section className="sec sec--tight">
      <div className="container">
        <div className="inbox-head">
          <div>
            <span className="eyebrow">Personal</span>
            <h1>Lönekörning</h1>
            <p className="admin-intro">
              Månad och lönedag → kontrollista → beräkna → granska per person → godkänn (en annan person än den som räknade) → lönefil → bokför → stäng. Lönebeskeden fryses och numreras i serien L när de godkänns och ändras aldrig efteråt; ett fel rättas i nästa körning.
            </p>
          </div>
        </div>
        <Flash ok={sp.ok} error={sp.fel} />

        {open.length > 0 && (
          <p className="admin-flash" role="status">
            {open.length} lönebeslut är inte bekräftade och körs med standardvärdet.{" "}
            {canApprove ? <Link href="/admin/installningar/lon">Inställningar › Lön</Link> : "Ägaren bekräftar dem under Inställningar › Lön."}
          </p>
        )}

        <div className="hr-two hr-gap">
          <div className="hr-stack">
            <div className="hr-card">
              <h2 className="hr-h2">Ny körning</h2>
              <form action={createRunAction} className="tg-fields">
                <div className="efield">
                  <label htmlFor="f-month">Månad (månadslön)</label>
                  <input id="f-month" type="month" name="month" defaultValue={suggested} required />
                </div>
                <div className="efield">
                  <label htmlFor="f-pay">Lönedag</label>
                  <input id="f-pay" type="date" name="payDate" defaultValue={payDateFor(suggested, settings)} required />
                </div>
                <div className="efield">
                  <span className="hr-muted">
                    {settings.variablePeriod === "previous" ? `Tid, OB, övertid och frånvaro från ${monthLabel(periods.timeFrom)}.` : "Tid och frånvaro från samma månad."} AGI för{" "}
                    {monthLabel(payDateFor(suggested, settings))} lämnas senast {agiDueDate(payDateFor(suggested, settings).slice(0, 7)).declareBy}.
                  </span>
                </div>
                <button className="btn btn-primary" type="submit">
                  Skapa körningen
                </button>
              </form>
            </div>

            <div className="hr-card">
              <h2 className="hr-h2">Körningar</h2>
              {runs.length === 0 ? (
                <p className="hr-muted">Ingen lönekörning ännu.</p>
              ) : (
                <div className="hr-table-wrap">
                  <table className="org-table">
                    <thead>
                      <tr>
                        <th>Månad</th>
                        <th>Lönedag</th>
                        <th>Status</th>
                        <th>Lönebesked</th>
                        <th>Brutto</th>
                        <th>Netto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <Link href={`/admin/lon/${r.id}`}>{monthLabel(r.periodStart)}</Link>
                          </td>
                          <td>{r.payDate}</td>
                          <td>
                            <span className="tg-status" data-status={r.status === "closed" ? "approved" : r.status === "calculated" ? "submitted" : undefined}>
                              {RUN_STATUS_LABEL[r.status]}
                            </span>
                          </td>
                          <td>{r.totals.payslips ?? "–"}</td>
                          <td>{r.totals.grossOre !== undefined ? formatOre(r.totals.grossOre, { decimals: 0, currency: true }) : "–"}</td>
                          <td>{r.totals.netOre !== undefined ? formatOre(r.totals.netOre, { decimals: 0, currency: true }) : "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <aside className="hr-stack">
            <div className="hr-card">
              <h2 className="hr-h2">Inför körningen</h2>
              <ul className="hr-history">
                <li>
                  {employees.filter((e) => !e.endedAt).length} personer i personalregistret.{" "}
                  <Link href="/admin/personal" className="link-quiet">
                    Personal
                  </Link>
                </li>
                <li>
                  Tid i perioden ska vara godkänd.{" "}
                  <Link href={`/admin/tid?vecka=${periods.timeFrom}`} className="link-quiet">
                    Tid
                  </Link>
                </li>
                <li>
                  Rapporterna: semesterlöneskuld, lönekostnad per projekt, skattekonto.{" "}
                  <Link href="/admin/rapporter" className="link-quiet">
                    Rapporter
                  </Link>
                </li>
              </ul>
            </div>
            {isDemo() && canApprove && employees.length === 0 && (
              <div className="hr-card">
                <h2 className="hr-h2">Demoläget</h2>
                <p className="hr-muted">Lägg in fas 0:s tre personer (månadslön med semester, timlön med OB, övertid och sjukdom, styrelsearvode) med en månads godkänd tid, och kör lönen för {monthLabel(`${suggested}-01`)}.</p>
                <form action={seedDemoPayrollAction}>
                  <input type="hidden" name="month" value={suggested} />
                  <button className="btn btn-ghost hr-btn-small" type="submit">
                    Lägg in exempelpersonal
                  </button>
                </form>
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
