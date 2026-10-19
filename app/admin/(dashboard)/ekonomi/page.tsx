import Link from "next/link";
import { formatDateTime } from "@/lib/admin-format";
import { computeDashboard, type DashInvoice, type PlannedInflow } from "@/lib/core/dashboard";
import { EVENT_LABEL, type CoreEvent } from "@/lib/core/events";
import { formatOre } from "@/lib/core/money";
import { listInvoices } from "@/lib/core/invoices/store";
import { listDueReminders } from "@/lib/core/reminders/store";
import { rotSummary } from "@/lib/core/rot/store";
import { listBankTransactions } from "@/lib/core/payments/store";
import { listRecentEvents } from "@/lib/core/events-store";
import { getProjectBundle, listProjects } from "@/lib/portal/store";
import { changeOrderInvoiceIds, getPlanForProject } from "@/lib/core/plans/store";
import { stepGross } from "@/lib/core/plans/billing";
import { quoteInvoiceLines } from "@/lib/core/invoices/from-plan";
import { getQuote } from "@/lib/quotes/store";
import { addDays } from "@/lib/core/rules";
import { todayIso } from "@/lib/quotes/schema";

const kr = (ore: number) => formatOre(ore, { decimals: 0, currency: true });
const MONTH = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const monthName = (m: string) => MONTH[Number(m.slice(5, 7)) - 1];

/**
 * Ekonomi: money out, money coming in, and what needs doing. Every figure
 * is computed in lib/core/dashboard.ts from the invoices, payments and
 * payment plans; the page only draws.
 */
export default async function EkonomiPage() {
  const today = todayIso();
  const [invoices, due, rot, unmatched, events, projects] = await Promise.all([
    listInvoices(),
    listDueReminders(today),
    rotSummary(),
    listBankTransactions("unmatched"),
    listRecentEvents(8),
    listProjects(),
  ]);
  // Planned inflows: unbilled plan steps, placed on the project's end date (or in four weeks).
  // Step amounts are worked out as in ProjectEconomy: percent of the quote, or what the completion step has left.
  const planned: PlannedInflow[] = [];
  for (const p of projects) {
    const plan = await getPlanForProject(p.id).catch(() => null);
    if (!plan || plan.steps.every((s) => s.invoiceId)) continue;
    const [quote, bundle, invoicedOn] = await Promise.all([p.quote_id ? getQuote(p.quote_id) : null, getProjectBundle(p.id), changeOrderInvoiceIds(p.id)]);
    const quoteLines = quote ? quoteInvoiceLines(quote) : [];
    const issuedGross = invoices
      .filter((i) => i.projectId === p.id && i.status !== "draft" && i.status !== "void" && i.kind === "invoice" && !i.document.lines.some((l) => l.changeOrderId))
      .reduce((s, i) => s + i.totalOre, 0);
    const approvedNotInvoicedKr = (bundle?.changeOrders ?? []).filter((c) => c.status === "approved" && !invoicedOn[c.id]).reduce((s, c) => s + c.amount, 0);
    for (const step of plan.steps) {
      if (step.invoiceId) continue;
      const amountOre = stepGross(step, quoteLines, issuedGross, step.dueRule === "on_completion" ? approvedNotInvoicedKr : 0);
      if (amountOre <= 0) continue;
      const expectedOn = step.dueRule === "on_date" && step.dueOn ? step.dueOn : p.ends_on || addDays(today, 28);
      planned.push({ expectedOn: addDays(expectedOn, 14), amountOre, label: `${p.title}: ${step.label}` });
    }
  }
  const dash = computeDashboard(
    invoices.map<DashInvoice>((i) => ({
      id: i.id,
      number: i.number,
      kind: i.kind,
      status: i.status,
      buyerName: i.document.buyer.name,
      customerId: i.customerId,
      reverseCharge: i.document.se.reverseCharge,
      issuedOn: i.issuedOn,
      dueOn: i.dueOn,
      paidAt: i.paidAt,
      totalOre: i.totalOre,
      vatOre: i.vatOre,
      rotOre: i.rotOre,
      payableOre: i.payableOre,
      paidOre: i.paidOre,
      reminders: i.reminders,
    })),
    planned,
    today
  );
  const maxWeek = Math.max(1, ...dash.forecast.map((w) => w.issuedOre + w.overdueOre + w.plannedOre));
  const maxMonth = Math.max(1, ...dash.byMonth.map((m) => m.netOre));
  const agingTotal = dash.aging.notDue + dash.aging.d1to30 + dash.aging.d31to60 + dash.aging.over60;
  const monthLabel = `${monthName(today.slice(0, 7))} ${today.slice(0, 4)}`;

  return (
    <section className="sec sec--tight">
      <div className="container">
        <div className="inbox-head">
          <div>
            <span className="eyebrow">{new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Stockholm" }).format(new Date())}</span>
            <h1>Ekonomi</h1>
            <p className="admin-intro">Pengar ute, pengar på väg in och det som behöver göras. Allt räknas ur fakturorna, betalningarna och betalplanerna; inget skrivs in här.</p>
          </div>
          <div className="lead-quick">
            <Link href="/admin/fakturor/bank" className="btn btn-ghost">
              Läs in bankfil
            </Link>
            <Link href="/admin/fakturor/ny" className="btn btn-primary">
              Ny faktura
            </Link>
          </div>
        </div>

        <div className="kpi-row kpi-row--five">
          <div className="kpi">
            <span>Att få in</span>
            <strong>{kr(dash.kpis.openOre)}</strong>
            <small>{dash.kpis.openCount} fakturor</small>
          </div>
          <div className={`kpi${dash.kpis.overdueCount ? " kpi--alert" : ""}`}>
            <span>Förfallet</span>
            <strong>{kr(dash.kpis.overdueOre)}</strong>
            <small>{dash.kpis.overdueCount ? `${dash.kpis.overdueCount} fakturor · äldst ${dash.kpis.oldestOverdueDays} dagar` : "inget"}</small>
          </div>
          <div className="kpi">
            <span>Väntas in denna vecka</span>
            <strong>{kr(dash.kpis.dueThisWeekOre)}</strong>
            <small>{dash.kpis.dueThisWeekCount} fakturor förfaller</small>
          </div>
          <div className="kpi">
            <span>ROT hos Skatteverket</span>
            <strong>{kr(rot.sentOre)}</strong>
            <small>
              {rot.claimableCount ? (
                <Link href="/admin/rot" className="link-quiet">
                  {kr(rot.claimableOre)} klart att begära
                </Link>
              ) : (
                "inget att begära"
              )}
            </small>
          </div>
          <div className="kpi">
            <span>Fakturerat i {monthName(today.slice(0, 7))}</span>
            <strong>{kr(dash.kpis.invoicedThisMonthOre)}</strong>
            <small>
              {dash.kpis.invoicedLastMonthOre > 0
                ? `${Math.round((100 * (dash.kpis.invoicedThisMonthOre - dash.kpis.invoicedLastMonthOre)) / dash.kpis.invoicedLastMonthOre)} % mot förra månaden`
                : "inkl. moms"}
            </small>
          </div>
        </div>

        <div className="dash-grid">
          <section className="dash-card dash-card--wide">
            <div className="dash-head">
              <h2 className="admin-h2">Kassaprognos, 8 veckor</h2>
              <span className="inbox-meta">Förfallodatum på utfärdade fakturor och planerade steg i betalplaner</span>
            </div>
            <figure className="dash-bars" role="img" aria-label={`Väntade inbetalningar per vecka: ${dash.forecast.map((w) => `vecka ${w.week} ${kr(w.issuedOre + w.overdueOre + w.plannedOre)}`).join(", ")}`}>
              <div className="dash-bars-plot" aria-hidden="true">
                {dash.forecast.map((w, i) => {
                  const total = w.issuedOre + w.overdueOre + w.plannedOre;
                  return (
                    <div key={w.weekStart} className="dash-bar">
                      {total > 0 && <span className="dash-bar-label">{kr(total)}</span>}
                      <div className="dash-bar-stack" style={{ height: `${Math.max(2, (100 * total) / maxWeek)}%` }}>
                        {w.overdueOre > 0 && <div className="dash-seg dash-seg--overdue" style={{ flex: w.overdueOre }} />}
                        {w.issuedOre > 0 && <div className="dash-seg dash-seg--issued" style={{ flex: w.issuedOre }} />}
                        {w.plannedOre > 0 && <div className="dash-seg dash-seg--planned" style={{ flex: w.plannedOre }} />}
                      </div>
                      <span className="dash-bar-x">
                        v{w.week}
                        {i === 0 ? <b> nu</b> : null}
                      </span>
                    </div>
                  );
                })}
              </div>
              <figcaption className="dash-legend">
                <span>
                  <i className="dash-seg--issued" /> Utfärdade fakturor
                </span>
                <span>
                  <i className="dash-seg--overdue" /> Förfallet, räknas till nu
                </span>
                <span>
                  <i className="dash-seg--planned" /> Planerat, inte fakturerat än
                </span>
              </figcaption>
            </figure>
          </section>

          <section className="dash-card">
            <h2 className="admin-h2">Obetalt per ålder</h2>
            <div className="dash-aging" role="img" aria-label={`Ej förfallet ${kr(dash.aging.notDue)}, 1 till 30 dagar ${kr(dash.aging.d1to30)}, 31 till 60 dagar ${kr(dash.aging.d31to60)}, över 60 dagar ${kr(dash.aging.over60)}`}>
              {(
                [
                  ["Ej förfallet", dash.aging.notDue, "a0"],
                  ["1–30 dagar", dash.aging.d1to30, "a1"],
                  ["31–60 dagar", dash.aging.d31to60, "a2"],
                  ["Över 60 dagar", dash.aging.over60, "a3"],
                ] as const
              ).map(([label, value, cls]) => (
                <div key={label}>
                  <div className="dash-aging-row">
                    <span>{label}</span>
                    <strong>{kr(value)}</strong>
                  </div>
                  <div className="dash-track">
                    <div className={`dash-fill dash-fill--${cls}`} style={{ width: `${agingTotal ? (100 * value) / agingTotal : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <dl className="dash-facts">
              <div>
                <dt>Snitt dagar till betalning</dt>
                <dd>{dash.avgDaysToPay === null ? "–" : `${dash.avgDaysToPay} dagar`}</dd>
              </div>
              <div>
                <dt>Betalt i tid</dt>
                <dd>{dash.paidOnTimePercent === null ? "–" : `${dash.paidOnTimePercent} %`}</dd>
              </div>
            </dl>
          </section>

          <section className="dash-card">
            <div className="dash-head">
              <h2 className="admin-h2">Att göra</h2>
              <span className="inbox-meta">{due.length + (unmatched.length ? 1 : 0) + (rot.claimableCount ? 1 : 0) + (dash.todo.find((t) => t.kind === "draft")?.count ?? 0)} saker</span>
            </div>
            <ul className="dash-todo">
              {due.map(({ invoice, plan }) => (
                <li key={invoice.id} data-alert="1">
                  <div>
                    <strong>Påminn {invoice.document.buyer.name}</strong>
                    <span className="inbox-meta">
                      Faktura {invoice.number}, {kr(plan.remainingOre)}, förfallen {plan.daysOverdue} dagar
                      {plan.level > 1 ? ` · påminnelse ${plan.level}` : ""}
                    </span>
                  </div>
                  <Link href={`/admin/fakturor/${invoice.id}`} className="btn btn-primary dash-btn">
                    Påminn
                  </Link>
                </li>
              ))}
              {unmatched.length > 0 && (
                <li>
                  <div>
                    <strong>{unmatched.length} inbetalningar att matcha</strong>
                    <span className="inbox-meta">{kr(unmatched.reduce((s, t) => s + t.amountOre, 0))} från banken väntar på bekräftelse.</span>
                  </div>
                  <Link href="/admin/fakturor/bank" className="btn btn-ghost dash-btn">
                    Matcha
                  </Link>
                </li>
              )}
              {rot.claimableCount > 0 && (
                <li>
                  <div>
                    <strong>{rot.claimableCount} ROT-fakturor klara för begäran</strong>
                    <span className="inbox-meta">
                      {kr(rot.claimableOre)}. Senast {rot.nextDeadline}.
                    </span>
                  </div>
                  <Link href="/admin/rot" className="btn btn-ghost dash-btn">
                    Öppna ROT
                  </Link>
                </li>
              )}
              {dash.todo
                .filter((t) => t.kind === "draft")
                .map((t) => (
                  <li key="drafts">
                    <div>
                      <strong>
                        {t.count} utkast att utfärda
                      </strong>
                      <span className="inbox-meta">{kr(t.amountOre)} väntar på nummer.</span>
                    </div>
                    <Link href="/admin/fakturor?flik=draft" className="btn btn-ghost dash-btn">
                      Visa
                    </Link>
                  </li>
                ))}
              {due.length === 0 && unmatched.length === 0 && rot.claimableCount === 0 && !dash.todo.some((t) => t.kind === "draft") && <li className="inbox-meta">Inget att göra just nu.</li>}
            </ul>
          </section>

          <section className="dash-card">
            <div className="dash-head">
              <h2 className="admin-h2">Fakturerat per månad</h2>
              <span className="inbox-meta">exkl. moms, 6 månader</span>
            </div>
            <figure className="dash-bars dash-bars--small" role="img" aria-label={`Fakturerat per månad: ${dash.byMonth.map((m) => `${monthName(m.month)} ${kr(m.netOre)}`).join(", ")}`}>
              <div className="dash-bars-plot" aria-hidden="true">
                {dash.byMonth.map((m) => (
                  <div key={m.month} className="dash-bar">
                    {m.current && m.netOre > 0 && <span className="dash-bar-label">{kr(m.netOre)}</span>}
                    <div className={`dash-bar-stack${m.current ? " is-current" : ""}`} style={{ height: `${Math.max(2, (100 * m.netOre) / maxMonth)}%` }}>
                      <div className="dash-seg dash-seg--month" style={{ flex: 1 }} />
                    </div>
                    <span className="dash-bar-x">{monthName(m.month)}</span>
                  </div>
                ))}
              </div>
            </figure>
            <dl className="dash-facts">
              <div>
                <dt>Utgående moms {monthLabel}</dt>
                <dd>{kr(dash.vat.vatOre)}</dd>
              </div>
              <div>
                <dt>Omvänd betalningsskyldighet</dt>
                <dd>{kr(dash.vat.reverseChargeOre)}</dd>
              </div>
              <div>
                <dt>ROT på månadens fakturor</dt>
                <dd>{kr(dash.vat.rotOre)}</dd>
              </div>
            </dl>
          </section>

          <section className="dash-card">
            <h2 className="admin-h2">Störst obetalt per kund</h2>
            {dash.topCustomers.length === 0 ? (
              <p className="inbox-meta">Inget obetalt.</p>
            ) : (
              <ul className="inv-list">
                {dash.topCustomers.map((c) => (
                  <li key={c.name}>
                    <span>
                      {c.name} <span className="inbox-meta">· {c.count} {c.count === 1 ? "faktura" : "fakturor"}</span>
                      {c.overdue ? <span className="inv-status" data-status="overdue" style={{ marginLeft: 8 }}>förfallen</span> : null}
                    </span>
                    <strong>{kr(c.remainingOre)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="dash-card">
            <h2 className="admin-h2">Senaste händelser</h2>
            {events.length === 0 ? (
              <p className="inbox-meta">Inga händelser än.</p>
            ) : (
              <ol className="inv-timeline">
                {events.map((e: CoreEvent, i) => (
                  <li key={i}>
                    <span>
                      {EVENT_LABEL[e.type]?.text ?? e.type}
                      {typeof e.data.number === "string" ? ` · ${e.data.number}` : ""}
                      {typeof e.data.amount === "number" ? ` · ${kr(e.data.amount)}` : ""}
                      {typeof e.data.to === "string" ? ` · ${e.data.to}` : ""}
                    </span>
                    <small>
                      {formatDateTime(e.at)}
                      {e.actor.kind === "user" ? ` · ${e.actor.name}` : e.actor.kind === "system" ? " · automatiskt" : ""}
                    </small>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
