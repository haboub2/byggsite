import Link from "next/link";
import { addStepAction, createPlanAction, createStepInvoiceAction, removePlanAction, removeStepAction } from "@/app/admin/plan-actions";
import { addCostAction, removeCostAction } from "@/app/admin/cost-actions";
import { formatOre, lineAmount } from "@/lib/core/money";
import { CostsTableMissingError, listProjectCosts, type ProjectCost } from "@/lib/core/projects/costs";
import { COST_KINDS, COST_KIND_LABEL, projectMargin } from "@/lib/core/projects/economy";
import { quoteInvoiceLines } from "@/lib/core/invoices/from-plan";
import { INVOICE_STATUS_LABEL, invoiceLabel, isOverdue, listInvoices } from "@/lib/core/invoices/store";
import { projectEconomy, stepGross, stepIsBillable } from "@/lib/core/plans/billing";
import { DUE_RULES, DUE_RULE_LABEL, PLAN_TEMPLATES } from "@/lib/core/plans/schema";
import { changeOrderInvoiceIds, getPlanForProject } from "@/lib/core/plans/store";
import type { ProjectBundle } from "@/lib/portal/schema";
import { getQuote } from "@/lib/quotes/store";
import { todayIso } from "@/lib/quotes/schema";

const kr = (ore: number) => formatOre(ore, { decimals: 0, currency: true });

/**
 * The project's money: quote plus approved ÄTA, what is invoiced and paid,
 * the costs and the margin, and the payment plan with a "Skapa faktura"
 * button on the step that is billable now. Server component; the forms post
 * to plan-actions and cost-actions.
 */
export default async function ProjectEconomy({ bundle, notice }: { bundle: ProjectBundle; notice?: { flash?: string; error?: string } }) {
  const { project, phases, changeOrders } = bundle;
  const [quote, plan, invoices, invoicedOn, costsResult] = await Promise.all([
    project.quote_id ? getQuote(project.quote_id) : null,
    getPlanForProject(project.id),
    listInvoices({ projectId: project.id }),
    changeOrderInvoiceIds(project.id),
    listProjectCosts(project.id).then(
      (costs) => ({ costs, missing: false }),
      (err) => {
        // Before 0020 is run: show the box without costs and say what to do.
        if (err instanceof CostsTableMissingError) return { costs: [] as ProjectCost[], missing: true };
        throw err;
      }
    ),
  ]);
  const { costs, missing: costsMissing } = costsResult;
  const today = todayIso();
  const quoteLines = quote ? quoteInvoiceLines(quote) : [];
  const economy = projectEconomy(quoteLines, changeOrders, invoices);
  const margin = projectMargin({
    quoteNetOre: quote ? quoteLines.reduce((s, l) => s + lineAmount(l.unitPriceOre, l.quantity), 0) : null,
    phases,
    invoices: invoices.map((i) => ({ kind: i.kind, status: i.status, totalOre: i.totalOre, vatOre: i.vatOre, lines: i.document.lines })),
    costs,
  });
  const hidden = <input type="hidden" name="project" value={project.id} />;
  const issuedGross = invoices.filter((i) => i.status !== "draft" && i.status !== "void" && i.kind === "invoice" && !i.document.lines.some((l) => l.changeOrderId)).reduce((s, i) => s + i.totalOre, 0);
  const approvedNotInvoicedKr = changeOrders.filter((c) => c.status === "approved" && !invoicedOn[c.id]).reduce((s, c) => s + c.amount, 0);

  return (
    <>
      <h2 className="admin-h2" id="ekonomi" style={{ marginTop: 44 }}>
        Ekonomi
      </h2>
      {!quote ? (
        <p className="admin-shown">Projektet är inte kopplat till en offert, så det finns inget att räkna andelar av. Fakturor kan ändå skapas under Fakturor och kopplas hit senare.</p>
      ) : (
        <>
          <p className="admin-shown">
            Offert {quote.number} plus godkända ÄTA, minus det som är fakturerat. Siffrorna räknas ur fakturorna; inget skrivs in här.
          </p>
          <div className="kpi-row" style={{ marginTop: 14 }}>
            <div className="kpi">
              <span>Offert {quote.number}</span>
              <strong>{kr(economy.quoteGross)}</strong>
              <small>inkl. moms</small>
            </div>
            <div className="kpi">
              <span>Godkända ÄTA</span>
              <strong>{economy.changeOrdersApproved >= 0 ? "+" : ""}{kr(economy.changeOrdersApproved)}</strong>
              <small>{economy.changeOrdersPending ? `${kr(economy.changeOrdersPending)} väntar på svar` : `${changeOrders.filter((c) => c.status === "approved").length} godkända`}</small>
            </div>
            <div className="kpi">
              <span>Fakturerat</span>
              <strong>{kr(economy.invoiced)}</strong>
              <small>
                {economy.invoiceCount} {economy.invoiceCount === 1 ? "faktura" : "fakturor"} · betalt {kr(economy.paid)}
              </small>
            </div>
            <div className={`kpi${economy.outstanding > 0 ? "" : ""}`}>
              <span>Kvar att fakturera</span>
              <strong>{kr(economy.leftToInvoice)}</strong>
              <small>{economy.outstanding > 0 ? `${kr(economy.outstanding)} obetalt` : economy.rotOnInvoices ? `ROT ${kr(economy.rotOnInvoices)} på fakturorna` : "inget obetalt"}</small>
            </div>
          </div>
        </>
      )}

      <h3 className="lead-h2" id="kostnader" style={{ marginTop: 28 }}>
        Kostnader och marginal
      </h3>
      {notice?.flash && <p className="admin-flash">{notice.flash}</p>}
      {notice?.error && (
        <p className="form-feedback error" role="alert" style={{ marginTop: 10 }}>
          {notice.error}
        </p>
      )}
      {costsMissing ? (
        <p className="form-feedback error" role="alert" style={{ marginTop: 10 }}>
          Tabellen för kostnader finns inte i databasen än. Kör <code>supabase/migrations/0020_project_costs.sql</code> i Supabase SQL-editorn.
        </p>
      ) : (
        <>
          <div className="kpi-row" style={{ marginTop: 14 }}>
            <div className="kpi">
              <span>Kostnader</span>
              <strong>{kr(margin.costs)}</strong>
              <small>
                {costs.length} {costs.length === 1 ? "post" : "poster"} · exkl. moms
              </small>
            </div>
            <div className={`kpi${margin.contribution < 0 ? " kpi--alert" : ""}`}>
              <span>Täckningsbidrag</span>
              <strong>{kr(margin.contribution)}</strong>
              <small>fakturerat {kr(margin.invoicedNet)} exkl. moms minus kostnader</small>
            </div>
            <div className={`kpi${margin.marginPercent !== null && margin.marginPercent < 0 ? " kpi--alert" : ""}`}>
              <span>Marginal</span>
              <strong>{margin.marginPercent === null ? "–" : `${margin.marginPercent.toLocaleString("sv-SE")} %`}</strong>
              <small>{margin.marginPercent === null ? "inget fakturerat än" : "av fakturerat exkl. moms"}</small>
            </div>
            {quote && (
              <div className="kpi">
                <span>Upparbetat ej fakturerat</span>
                <strong>{kr(margin.earnedNotInvoiced)}</strong>
                <small>{margin.earnedNotInvoiced < 0 ? "fakturerat före arbetet" : `${Math.round(margin.doneShare * 100)} % av offertens arbete klart`}</small>
              </div>
            )}
          </div>
          {quote && (
            <p className="efield-hint" style={{ marginTop: 8 }}>
              Upparbetat är klara faser i tidplanen, vägda efter sina dagar, som andel av offerten exkl. moms ({kr(margin.earned)} av {kr(margin.quoteNet ?? 0)}), minus det som är fakturerat av offerten exkl. moms. ÄTA räknas inte på någon sida. Ett negativt tal betyder att mer är fakturerat än utfört, som en betalplan med förskott ger.
            </p>
          )}
          {costs.length > 0 && (
            <ul className="inv-list" style={{ marginTop: 12 }}>
              {costs.map((c) => (
                <li key={c.id}>
                  <span>
                    {c.costDate} · {COST_KIND_LABEL[c.kind]}
                    {c.supplier ? ` · ${c.supplier}` : ""}
                    {c.description ? ` · ${c.description}` : ""}
                    {c.kind === "hours" && c.hours !== null && c.hourlyRateOre !== null ? (
                      <span className="inbox-meta">
                        {" "}
                        ({c.hours.toLocaleString("sv-SE")} tim × {kr(c.hourlyRateOre)})
                      </span>
                    ) : null}
                  </span>
                  <span>
                    <strong>{kr(c.amountOre)}</strong>{" "}
                    <form action={removeCostAction} style={{ display: "inline" }}>
                      {hidden}
                      <input type="hidden" name="cost" value={c.id} />
                      <button type="submit" className="link-quiet" aria-label={`Ta bort kostnaden ${c.description || c.supplier}`}>
                        Ta bort
                      </button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <details className="plan-add" open={costs.length === 0 || Boolean(notice?.error)}>
            <summary>Lägg till kostnad</summary>
            <form action={addCostAction} className="egrid" style={{ marginTop: 12 }}>
              {hidden}
              <div className="efield">
                <label htmlFor="cost-kind">Typ</label>
                <select id="cost-kind" name="kind" defaultValue="supplier">
                  {COST_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {COST_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="efield">
                <label htmlFor="cost-date">Datum</label>
                <input id="cost-date" name="costDate" type="date" defaultValue={today} required />
              </div>
              <div className="efield">
                <label htmlFor="cost-supplier">Leverantör</label>
                <input id="cost-supplier" name="supplier" maxLength={120} placeholder="Byggmax, Ahlsell …" />
              </div>
              <div className="efield">
                <label htmlFor="cost-description">Vad</label>
                <input id="cost-description" name="description" maxLength={400} placeholder="Kakel och fix, faktura 88123" />
              </div>
              <div className="efield">
                <label htmlFor="cost-amount">Belopp exkl. moms, kr</label>
                <input id="cost-amount" name="amount" inputMode="decimal" placeholder="12 400" />
                <p className="efield-hint">Minus för en kreditnota.</p>
              </div>
              <div className="efield">
                <label htmlFor="cost-hours">eller timmar (vid Timmar)</label>
                <input id="cost-hours" name="hours" inputMode="decimal" placeholder="7,5" />
              </div>
              <div className="efield">
                <label htmlFor="cost-rate">Internt timpris, kr</label>
                <input id="cost-rate" name="rate" inputMode="decimal" placeholder="450" />
                <p className="efield-hint">Vad en timme kostar företaget, inte vad kunden betalar.</p>
              </div>
              <div className="efield efield--wide">
                <button type="submit" className="btn btn-ghost">
                  Spara kostnaden
                </button>
              </div>
            </form>
          </details>
        </>
      )}

      <h3 className="lead-h2" id="betalplan" style={{ marginTop: 28 }}>
        Betalplan
      </h3>
      {!plan ? (
        quote ? (
          <div className="tpl-grid">
            {PLAN_TEMPLATES.map((t) => (
              <form key={t.key} action={createPlanAction} className="tpl-card">
                {hidden}
                <input type="hidden" name="template" value={t.key} />
                <strong>{t.name}</strong>
                <span>{t.description}</span>
                {t.steps.some((s) => s.dueRule === "on_phase_done") && (
                  <div className="efield" style={{ marginTop: 6 }}>
                    <label htmlFor={`phase-${t.key}`}>Mittsteget faktureras när fasen är klar</label>
                    <select id={`phase-${t.key}`} name="phase" defaultValue={phases[Math.floor(phases.length / 2)]?.id ?? ""} required>
                      {phases.map((ph) => (
                        <option key={ph.id} value={ph.id}>
                          {ph.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button type="submit" className="btn btn-dark">
                  Använd planen
                </button>
              </form>
            ))}
          </div>
        ) : null
      ) : (
        <>
          <ol className="plan-steps">
            {plan.steps.map((step, i) => {
              const inv = step.invoiceId ? invoices.find((x) => x.id === step.invoiceId) : null;
              const billable = stepIsBillable(step, phases, project, today);
              const phase = phases.find((p) => p.id === step.phaseId);
              const gross = stepGross(step, quoteLines, issuedGross, step.dueRule === "on_completion" ? approvedNotInvoicedKr : 0);
              const rule = step.dueRule === "on_phase_done" ? `när ${phase?.name ?? "fasen"} är klar` : step.dueRule === "on_date" ? `den ${step.dueOn}` : DUE_RULE_LABEL[step.dueRule].toLowerCase();
              return (
                <li key={step.id} data-state={inv ? "invoiced" : billable.ok ? "billable" : "waiting"}>
                  <span className="plan-step-no" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="plan-step-main">
                    <strong>{step.label}</strong>
                    <span className="inbox-meta">
                      {step.percent !== null ? `${step.percent} % av offerten` : step.dueRule === "on_completion" ? "resten av offerten plus godkända ÄTA" : "fast belopp"} · {rule}
                      {inv ? "" : ` · ca ${kr(gross)}`}
                    </span>
                    {inv && (
                      <span className="inbox-meta">
                        <Link href={`/admin/fakturor/${inv.id}`} className="link-quiet">
                          {invoiceLabel(inv)}
                        </Link>{" "}
                        · {kr(inv.payableOre)} ·{" "}
                        <span className="inv-status" data-status={isOverdue(inv, today) ? "overdue" : inv.status}>
                          {isOverdue(inv, today) ? "Förfallen" : INVOICE_STATUS_LABEL[inv.status]}
                        </span>
                      </span>
                    )}
                  </div>
                  <div className="plan-step-side">
                    {inv ? null : billable.ok ? (
                      <form action={createStepInvoiceAction}>
                        {hidden}
                        <input type="hidden" name="step" value={step.id} />
                        <button type="submit" className="btn btn-primary" style={{ minHeight: 40, fontSize: 14 }}>
                          Skapa faktura
                        </button>
                      </form>
                    ) : (
                      <span className="inbox-meta">{billable.reason}</span>
                    )}
                    {!inv && (
                      <form action={removeStepAction}>
                        {hidden}
                        <input type="hidden" name="step" value={step.id} />
                        <button type="submit" className="link-quiet" aria-label={`Ta bort steget ${step.label}`}>
                          Ta bort
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <details className="plan-add">
            <summary>Lägg till steg</summary>
            <form action={addStepAction} className="egrid" style={{ marginTop: 12 }}>
              {hidden}
              <div className="efield">
                <label htmlFor="step-label">Rubrik</label>
                <input id="step-label" name="label" maxLength={80} placeholder="40 % när tätskiktet är klart" />
              </div>
              <div className="efield">
                <label htmlFor="step-rule">Faktureras</label>
                <select id="step-rule" name="dueRule" defaultValue="on_phase_done">
                  {DUE_RULES.map((r) => (
                    <option key={r} value={r}>
                      {DUE_RULE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="efield">
                <label htmlFor="step-percent">Andel av offerten, %</label>
                <input id="step-percent" name="percent" inputMode="decimal" placeholder="40" />
              </div>
              <div className="efield">
                <label htmlFor="step-amount">eller fast belopp, kr</label>
                <input id="step-amount" name="amount" inputMode="decimal" placeholder="25 000" />
              </div>
              <div className="efield">
                <label htmlFor="step-phase">Fas (vid ”när fasen är klar”)</label>
                <select id="step-phase" name="phase" defaultValue="">
                  <option value="">—</option>
                  {phases.map((ph) => (
                    <option key={ph.id} value={ph.id}>
                      {ph.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="efield">
                <label htmlFor="step-date">Datum (vid ”på datum”)</label>
                <input id="step-date" name="dueOn" type="date" />
              </div>
              <div className="efield efield--wide">
                <button type="submit" className="btn btn-ghost">
                  Lägg till steget
                </button>
              </div>
            </form>
          </details>
          {!plan.steps.some((s) => s.invoiceId) && (
            <form action={removePlanAction} style={{ marginTop: 10 }}>
              {hidden}
              <input type="hidden" name="plan" value={plan.id} />
              <button type="submit" className="link-quiet">
                Ta bort betalplanen
              </button>
            </form>
          )}
          <p className="efield-hint" style={{ marginTop: 10 }}>
            Inget skapas av sig självt. När ett steg kan faktureras visas knappen här; du granskar utkastet och utfärdar under Fakturor. Slutfakturan tar resten av offerten och godkända ÄTA som egna rader.
          </p>
        </>
      )}

      {invoices.length > 0 && (
        <>
          <h3 className="lead-h2" style={{ marginTop: 24 }}>
            Fakturor på projektet
          </h3>
          <ul className="inv-list">
            {invoices.map((inv) => (
              <li key={inv.id}>
                <span>
                  <Link href={`/admin/fakturor/${inv.id}`} className="link-quiet">
                    {invoiceLabel(inv)}
                  </Link>
                  {inv.document.title ? ` · ${inv.document.title}` : ""}
                </span>
                <span>
                  <span className="inv-status" data-status={isOverdue(inv, today) ? "overdue" : inv.status}>
                    {isOverdue(inv, today) ? "Förfallen" : INVOICE_STATUS_LABEL[inv.status]}
                  </span>{" "}
                  <strong>{kr(inv.payableOre)}</strong>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
