import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { formatOre } from "@/lib/core/money";
import { addDays } from "@/lib/core/rules/index";
import { agiDueDate } from "@/lib/core/rules/payroll";
import { todayIso } from "@/lib/quotes/schema";
import { listEmployees } from "@/lib/core/hr/store";
import { timeProjects } from "@/lib/core/hr/time-store";
import { listLabourCosts } from "@/lib/core/projects/costs";
import { getPayrollSettings, latestPayslipPerPerson, listRuns, RUN_STATUS_LABEL } from "@/lib/core/payroll/run-store";
import { contributionOnLiability } from "@/lib/core/payroll/ledger";
import { monthLabel } from "@/lib/pdf/PayslipPdf";

export const metadata: Metadata = { title: "Lönerapporter" };

const kr = (ore: number | null | undefined) => (ore === null || ore === undefined ? "–" : formatOre(ore, { decimals: 0, currency: true }));

/**
 * Rapporter (docs/hr-lon.md, sections 8 and 11): semesterlöneskuld per
 * person after the last run, labour cost per project and month from
 * approved time, löneskuld and the skattekonto amount per run with the AGI
 * date, and every run's reconciliation. For the accountant as well.
 */
export default async function PayrollReportsPage() {
  const check = await requireRole("payroll");
  if (!check.ok) redirect("/admin/login");
  const today = todayIso();
  const from = addDays(today, -365);
  const [runs, latest, employees, costs, projects, { settings }] = await Promise.all([
    listRuns(),
    latestPayslipPerPerson({ from: addDays(today, -800), to: addDays(today, 60) }),
    listEmployees(),
    listLabourCosts({ from, to: today }).catch(() => []),
    timeProjects().catch(() => []),
    getPayrollSettings(),
  ]);
  // Closed runs carry the reconciliation they were closed with; open ones are not reconciled yet.
  const recons = runs.filter((r) => r.status !== "draft").slice(0, 12);

  // Semesterlöneskuld: each person's liability after their latest approved payslip.
  const name = new Map(employees.map((e) => [e.id, e.name]));
  const liabilities = [...latest.values()].filter((s) => s.vacationLiabilityOre > 0).sort((a, b) => (name.get(a.employeeId) ?? "").localeCompare(name.get(b.employeeId) ?? "", "sv"));
  const liabilityTotal = liabilities.reduce((s, x) => s + x.vacationLiabilityOre, 0);
  const contributionsOnLiability = liabilities.reduce((s, x) => s + contributionOnLiability(x.document, x.vacationLiabilityOre), 0);

  // Labour cost per project and month (project_costs from approved time).
  const projectName = new Map(projects.map((p) => [p.id, p.title]));
  const months = [...new Set(costs.map((c) => c.costDate.slice(0, 7)))].sort().reverse().slice(0, 6);
  const byProject = new Map<string, Map<string, number>>();
  for (const c of costs) {
    const m = byProject.get(c.projectId) ?? new Map<string, number>();
    m.set(c.costDate.slice(0, 7), (m.get(c.costDate.slice(0, 7)) ?? 0) + c.amountOre);
    byProject.set(c.projectId, m);
  }

  return (
    <section className="sec sec--tight">
      <div className="container">
        <div className="inbox-head">
          <div>
            <span className="eyebrow">Lön</span>
            <h1>Lönerapporter</h1>
            <p className="admin-intro">Semesterlöneskuld, lönekostnad per projekt, löneskuld och skattekonto, och avstämningen per körning. AGI-filen, Fora och Collectum kommer i fas 4.</p>
          </div>
        </div>

        <div className="hr-stack hr-gap">
          <div className="hr-card" id="semesterloneskuld">
            <h2 className="hr-h2">Semesterlöneskuld per person</h2>
            {liabilities.length === 0 ? (
              <p className="hr-muted">Ingen semesterlöneskuld ännu: den räknas av varje godkänd lönekörning.</p>
            ) : (
              <div className="hr-table-wrap">
                <table className="org-table">
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Efter körningen</th>
                      <th>Regel</th>
                      <th className="tg-num">Dagar kvar</th>
                      <th className="tg-num">Skuld</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liabilities.map((s) => (
                      <tr key={s.employeeId}>
                        <td>
                          <Link href={`/admin/personal/${s.employeeId}?flik=lon`}>{name.get(s.employeeId) ?? s.document.employeeName}</Link>
                        </td>
                        <td>{monthLabel(s.document.periodStart)}</td>
                        <td>{s.document.context?.vacation.rule === "procent" ? "Procentregeln" : "Sammalöneregeln"}</td>
                        <td className="tg-num">{s.document.context?.vacation.remainingDays ?? "–"}</td>
                        <td className="tg-num">{kr(s.vacationLiabilityOre)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={4}>Summa ({settings.accounts.vacationLiability}), plus avgifter {kr(contributionsOnLiability)} ({settings.accounts.vacationContributionLiability})</th>
                      <th className="tg-num">{kr(liabilityTotal)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div className="hr-card" id="lonekostnad">
            <h2 className="hr-h2">Lönekostnad per projekt och månad</h2>
            <p className="hr-muted">Godkänd tid × timkostnad (lön och arbetsgivaravgift), skriven när tiden godkänns. Övertid, OB, semester och pension ingår inte ännu.</p>
            {months.length === 0 ? (
              <p className="hr-muted">Ingen godkänd tid på projekt det senaste året.</p>
            ) : (
              <div className="hr-table-wrap">
                <table className="org-table">
                  <thead>
                    <tr>
                      <th>Projekt</th>
                      {months.map((m) => (
                        <th key={m} className="tg-num">
                          {monthLabel(`${m}-01`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...byProject].map(([projectId, m]) => (
                      <tr key={projectId}>
                        <td>
                          <Link href={`/admin/projekt/${projectId}`}>{projectName.get(projectId) ?? "Projekt"}</Link>
                        </td>
                        {months.map((mo) => (
                          <td key={mo} className="tg-num">
                            {m.get(mo) ? kr(m.get(mo)) : ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="hr-card" id="skattekonto">
            <h2 className="hr-h2">Löneskuld och skattekonto</h2>
            {runs.filter((r) => r.approvedAt).length === 0 ? (
              <p className="hr-muted">Ingen godkänd lönekörning ännu.</p>
            ) : (
              <div className="hr-table-wrap">
                <table className="org-table">
                  <thead>
                    <tr>
                      <th>Körning</th>
                      <th>Status</th>
                      <th className="tg-num">Nettolön ({settings.accounts.net})</th>
                      <th className="tg-num">Skatteavdrag</th>
                      <th className="tg-num">Arbetsgivaravgifter</th>
                      <th className="tg-num">Till skattekontot</th>
                      <th>AGI och betalning senast</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs
                      .filter((r) => r.approvedAt)
                      .map((r) => {
                        const due = agiDueDate(r.agiPeriod);
                        return (
                          <tr key={r.id}>
                            <td>
                              <Link href={`/admin/lon/${r.id}`}>{monthLabel(r.periodStart)}</Link>
                            </td>
                            <td>{RUN_STATUS_LABEL[r.status]}</td>
                            <td className="tg-num">{kr(r.totals.netOre)}</td>
                            <td className="tg-num">{kr(r.totals.taxOre)}</td>
                            <td className="tg-num">{kr(r.totals.employerContributionOre)}</td>
                            <td className="tg-num">
                              <strong>{kr((r.totals.taxOre ?? 0) + (r.totals.employerContributionOre ?? 0))}</strong>
                            </td>
                            <td>
                              {due.declareBy}
                              {due.payBy !== due.declareBy ? ` / ${due.payBy}` : ""}
                              {due.payBy < today && r.status !== "closed" ? " (passerat)" : ""}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="hr-muted">Löneskulden ({settings.accounts.net}) är nettolönen tills banken har betalat lönefilen. Arbetsgivaravgifterna i AGI räknas i hela kronor per person; beloppet här är lönebeskedens öresbelopp.</p>
          </div>

          <div className="hr-card" id="avstamning">
            <h2 className="hr-h2">Avstämning per körning</h2>
            {recons.length === 0 ? (
              <p className="hr-muted">Ingen beräknad körning ännu.</p>
            ) : (
              <div className="hr-table-wrap">
                <table className="org-table">
                  <thead>
                    <tr>
                      <th>Körning</th>
                      <th className="tg-num">Lönebesked</th>
                      <th className="tg-num">Rader</th>
                      <th className="tg-num">Verifikation</th>
                      <th className="tg-num">Lönefil</th>
                      <th>Går ihop</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recons.map((run) => {
                      const rec = run.totals.reconciliation;
                      return (
                        <tr key={run.id}>
                          <td>
                            <Link href={`/admin/lon/${run.id}`}>{monthLabel(run.periodStart)}</Link>
                          </td>
                          <td className="tg-num">{kr(rec?.payslipsOre ?? run.totals.netOre)}</td>
                          <td className="tg-num">{rec ? kr(rec.linesOre) : "–"}</td>
                          <td className="tg-num">{rec?.journalOre === null || !rec ? "–" : kr(rec.journalOre)}</td>
                          <td className="tg-num">{rec?.bankOre === null || !rec ? "–" : kr(rec.bankOre)}</td>
                          <td>{rec ? (rec.ok ? "Ja" : "Nej") : `Inte stängd (${RUN_STATUS_LABEL[run.status].toLowerCase()})`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
