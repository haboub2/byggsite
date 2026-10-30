import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { formatOre } from "@/lib/core/money";
import { addDays } from "@/lib/core/rules/index";
import { todayIso } from "@/lib/quotes/schema";
import { listEmployees } from "@/lib/core/hr/store";
import { timeProjects } from "@/lib/core/hr/time-store";
import { listLabourCosts } from "@/lib/core/projects/costs";
import { hasAccess } from "@/lib/core/org/roles";
import { getPayrollSettings, latestPayslipPerPerson, listRuns, RUN_STATUS_LABEL } from "@/lib/core/payroll/run-store";
import { contributionOnLiability } from "@/lib/core/payroll/ledger";
import { monthLabel } from "@/lib/core/payroll/format";
import { agiDueFor } from "@/lib/core/payroll/settings";
import { isAgiPeriod } from "@/lib/core/payroll/agi";
import { listAgiDeclarationSummaries, type AgiDeclarationSummary } from "@/lib/core/payroll/authorities-store";
import { markAgiPaidAction } from "@/app/admin/authorities-actions";
import { Flash } from "@/components/admin/time/parts";
import { AgiSection, CollectumSection, ForaSection, VaxaSection, YearEndSection } from "@/components/admin/payroll/AuthoritySections";
import { OwnerPlannerSection } from "@/components/admin/payroll/OwnerPlanner";

export const metadata: Metadata = { title: "Lönerapporter" };

const kr = (ore: number | null | undefined) => (ore === null || ore === undefined ? "–" : formatOre(ore, { decimals: 0, currency: true }));

/**
 * Rapporter (docs/hr-lon.md, sections 8 and 11): the AGI per month with
 * its versions and the diff before a refile, löneskuld and the skattekonto
 * amount per run with the AGI date and a "betalt" mark, Fora, Collectum,
 * växa-stöd, the year-end, the owners' löneuttag planner, semesterlöneskuld per person after the last run, labour
 * cost per project and month from approved time, and every run's
 * reconciliation. For the accountant as well, without the buttons.
 */
export default async function PayrollReportsPage({ searchParams }: { searchParams: Promise<{ ok?: string; fel?: string; agi?: string; fora?: string; collectum?: string; vaxa?: string; ar?: string }> }) {
  const check = await requireRole("payroll");
  if (!check.ok) redirect("/admin/login");
  const sp = await searchParams;
  const canApprove = hasAccess(check.role, "admin");
  const today = todayIso();
  const from = addDays(today, -365);
  const [runs, latest, employees, costs, projects, { settings }, declarations] = await Promise.all([
    listRuns(),
    latestPayslipPerPerson({ from: addDays(today, -800), to: addDays(today, 60) }),
    listEmployees(),
    listLabourCosts({ from, to: today }).catch(() => []),
    timeProjects().catch(() => []),
    getPayrollSettings(),
    listAgiDeclarationSummaries().catch((): AgiDeclarationSummary[] => []),
  ]);
  // The months the reports offer: every pay month with an approved run; the latest closed one first.
  const payMonths = [...new Set(runs.filter((r) => r.approvedAt).map((r) => r.agiPeriod))].sort().reverse();
  const defaultMonth = runs.find((r) => r.status === "closed")?.agiPeriod ?? payMonths[0] ?? addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
  const pick = (v: string | undefined) => (v && isAgiPeriod(v) ? v : defaultMonth);
  const year = Number(sp.ar) >= 2020 && Number(sp.ar) <= 2100 ? Number(sp.ar) : Number(today.slice(5, 7)) <= 3 ? Number(today.slice(0, 4)) - 1 : Number(today.slice(0, 4));
  const keep = Object.fromEntries(Object.entries({ agi: sp.agi, fora: sp.fora, collectum: sp.collectum, vaxa: sp.vaxa, ar: sp.ar }).filter((e): e is [string, string] => !!e[1]));
  const declared = (period: string) => declarations.find((d) => d.period === period && d.status !== "corrected");
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
            <p className="admin-intro">Arbetsgivardeklarationen, skattekontot, Fora, växa-stöd och årsskiftet; semesterlöneskuld, lönekostnad per projekt och avstämningen per körning. Filerna skickas aldrig härifrån: du laddar upp dem hos Skatteverket och Fora.</p>
          </div>
        </div>
        <Flash ok={sp.ok} error={sp.fel} />

        <div className="hr-stack hr-gap">
          <AgiSection period={pick(sp.agi)} months={payMonths} settings={settings} canApprove={canApprove} keep={keep} />

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
                      <th>Betalt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs
                      .filter((r) => r.approvedAt)
                      .map((r) => {
                        const due = agiDueFor(r.agiPeriod, settings);
                        const d = declared(r.agiPeriod);
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
                              <strong>{kr(d ? d.taxOre + d.contributionsOre : (r.totals.taxOre ?? 0) + (r.totals.employerContributionOre ?? 0))}</strong>
                              <small className="hr-muted">{d ? ` AGI v${d.version}` : " ungefär"}</small>
                            </td>
                            <td>
                              {due.declareBy}
                              {due.payBy !== due.declareBy ? ` / betala ${due.payBy}` : ""}
                              {due.payBy < today && !d?.paidAt ? " (passerat)" : ""}
                            </td>
                            <td>
                              {d && d.status !== "filed" && !d.paidAt ? (
                                <span className="hr-muted">lämna AGI v{d.version} först</span>
                              ) : d ? (
                                canApprove ? (
                                  <form action={markAgiPaidAction}>
                                    <input type="hidden" name="id" value={d.id} />
                                    <input type="hidden" name="paid" value={d.paidAt ? "no" : "yes"} />
                                    <button className="btn btn-ghost hr-btn-small" type="submit" aria-pressed={!!d.paidAt}>
                                      {d.paidAt ? "☑ Betalt" : "☐ Markera betalt"}
                                    </button>
                                  </form>
                                ) : d.paidAt ? (
                                  "Ja"
                                ) : (
                                  "Nej"
                                )
                              ) : (
                                <span className="hr-muted">skapa AGI först</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="hr-muted">Löneskulden ({settings.accounts.net}) är nettolönen tills banken har betalat lönefilen. Till skattekontot: den senaste AGI-versionens 487 + 497 (hela kronor per person och sats, som Skatteverket räknar); innan AGI är skapad lönebeskedens öresbelopp. {settings.agi.largeEmployer ? "Omsättning över 40 miljoner kr: AGI den 26:e, betalningen den 12:e." : ""}</p>
          </div>

          <ForaSection period={pick(sp.fora)} months={payMonths} settings={settings} canApprove={canApprove} keep={keep} />
          <CollectumSection period={pick(sp.collectum)} months={payMonths} settings={settings} canApprove={canApprove} keep={keep} />
          <VaxaSection period={pick(sp.vaxa)} months={payMonths} canApprove={canApprove} keep={keep} />
          <YearEndSection year={year} today={today} canApprove={canApprove} keep={keep} />
          <OwnerPlannerSection today={today} canApprove={canApprove} />

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
