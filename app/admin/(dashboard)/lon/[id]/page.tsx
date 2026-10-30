import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { hasAccess } from "@/lib/core/org/roles";
import { formatOre } from "@/lib/core/money";
import { addDays } from "@/lib/core/rules/index";
import { agiDueDate } from "@/lib/core/rules/payroll";
import { formatWhen } from "@/lib/admin-format";
import {
  getPayrollSettings,
  getRun,
  listApprovedPayslips,
  listCorrections,
  listPayItems,
  listRunPayslips,
  reconcileRun,
  runJournalEntry,
  RUN_STATUS_LABEL,
  type PayRun,
  type StoredPayslip,
} from "@/lib/core/payroll/run-store";
import { payslipJournal, accrualLines } from "@/lib/core/payroll/ledger";
import { payItemsOn, type RunCheck } from "@/lib/core/payroll/run";
import type { JournalLine } from "@/lib/core/payroll/payslip";
import { monthLabel } from "@/lib/pdf/PayslipPdf";
import { Flash } from "@/components/admin/time/parts";
import {
  approveRunAction,
  bankFileAction,
  bookRunAction,
  checkRunAction,
  closeRunAction,
  computeRunAction,
  correctionAction,
  discardRunAction,
  payslipPdfAction,
} from "@/app/admin/payroll-actions";

export const metadata: Metadata = { title: "Lönekörning" };

const kr = (ore: number | null | undefined) => (ore === null || ore === undefined ? "–" : formatOre(ore, { currency: true }));
const STEPS = ["Period", "Kontrollista", "Beräkna", "Granska", "Godkänn", "Lönefil", "Bokför", "Stäng"] as const;
const LEVEL_LABEL: Record<RunCheck["level"], string> = { block: "Stoppar", warn: "Varning", info: "Info" };

/** Which step a run is at: the first one not done. */
function currentStep(run: PayRun): number {
  if (run.status === "draft") return run.checksAt ? 2 : 1;
  return { calculated: 4, approved: 5, paid: 6, booked: 7, closed: 8 }[run.status];
}

/**
 * One payroll run, step by step (docs/hr-lon.md, section 11): the
 * checklist with what stops and what warns, compute, review per person
 * with the lines and a diff against last month, approve (not by the one
 * who computed), the bank file, the journal entry, and the reconciliation
 * that closes the run. A closed run's payslips can be corrected forward.
 */
export default async function PayRunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; fel?: string }> }) {
  const check = await requireRole("payroll");
  if (!check.ok) redirect("/admin/login");
  const { id } = await params;
  const sp = await searchParams;
  const run = await getRun(id);
  if (!run) notFound();
  const canApprove = hasAccess(check.role, "admin");
  const [slips, earlier, { settings }, journal, corrections, items] = await Promise.all([
    listRunPayslips(id),
    listApprovedPayslips({ from: addDays(run.payDate, -400), to: addDays(run.payDate, -1) }),
    getPayrollSettings(),
    runJournalEntry(run),
    listCorrections(),
    listPayItems(),
  ]);
  const reconciliation = run.status === "draft" ? null : await reconcileRun(run);
  const step = currentStep(run);
  const due = agiDueDate(run.agiPeriod);
  const isComputer = !!run.computedBy && run.computedBy === check.userId;
  const previous = new Map<string, StoredPayslip>();
  for (const p of earlier.filter((x) => x.runId !== run.id).sort((a, b) => a.run.payDate.localeCompare(b.run.payDate))) previous.set(p.employeeId, p);
  const blocks = run.checks.filter((c) => c.level === "block");
  const preview =
    run.status === "paid" || run.status === "approved"
      ? (() => {
          const ledger = slips.map((s) => ({ document: s.document, group: s.document.context?.group ?? ("salaried" as const), vacationLiabilityChangeOre: s.document.context?.vacation.liabilityChangeOre ?? 0, pensionPremiumOre: s.pensionPremiumOre }));
          return [...payslipJournal(slips.map((s) => s.document), settings.accounts), ...accrualLines(ledger, settings.accounts)];
        })()
      : null;
  const retroItems = payItemsOn(items, run.payDate).filter((i) => i.kind === "retro" || i.kind === "gross_adjustment" || i.kind === "net_adjustment");
  const totals = run.totals;

  return (
    <section className="sec sec--tight">
      <div className="container">
        <Link href="/admin/lon" className="link-quiet">
          ← Lönekörning
        </Link>
        <div className="inbox-head" style={{ marginTop: 16 }}>
          <div>
            <span className="eyebrow">Lönekörning</span>
            <h1 className="admin-h1">Lön {monthLabel(run.periodStart)}</h1>
            <p className="hr-facts">
              <span className="tg-status" data-status={run.status === "closed" ? "approved" : run.status === "calculated" ? "submitted" : undefined}>
                {RUN_STATUS_LABEL[run.status]}
              </span>
              <span>Lönedag {run.payDate}</span>
              <span>
                Tid och frånvaro {run.timeFrom} – {run.timeTo}
              </span>
              <span>
                AGI {run.agiPeriod}: lämnas och betalas senast {due.declareBy}
              </span>
            </p>
          </div>
        </div>
        <Flash ok={sp.ok} error={sp.fel} />

        <ol className="lon-steps" aria-label="Steg">
          {STEPS.map((label, i) => (
            <li key={label} data-state={i + 1 < step ? "done" : i + 1 === step ? "current" : undefined}>
              <span>{i + 1}</span> {label}
            </li>
          ))}
        </ol>

        <div className="hr-two hr-gap">
          <div className="hr-stack">
            {/* 2. Kontrollista */}
            <div className="hr-card">
              <div className="hr-card-head">
                <h2 className="hr-h2">Kontrollista</h2>
                {(run.status === "draft" || run.status === "calculated") && (
                  <form action={checkRunAction}>
                    <input type="hidden" name="runId" value={run.id} />
                    <button className="btn btn-ghost hr-btn-small" type="submit">
                      {run.checksAt ? "Kör kontrollistan igen" : "Kör kontrollistan"}
                    </button>
                  </form>
                )}
              </div>
              {!run.checksAt ? (
                <p className="hr-muted">Kontrollistan (regel 4) läser tid, frånvaro, skatteuppgifter, konton, avtal och lönebesluten och sparas på körningen med sitt utfall.</p>
              ) : run.checks.length === 0 ? (
                <p>Inget att anmärka. Sparad {formatWhen(run.checksAt)}.</p>
              ) : (
                <>
                  <ul className="lon-checks">
                    {run.checks.map((c, i) => (
                      <li key={i} data-level={c.level}>
                        <strong>{LEVEL_LABEL[c.level]}</strong> {c.text}
                        {c.employeeId && (
                          <>
                            {" "}
                            <Link className="link-quiet" href={`/admin/personal/${c.employeeId}`}>
                              Öppna
                            </Link>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="hr-muted">Sparad {formatWhen(run.checksAt)}. {blocks.length ? `${blocks.length} punkter stoppar beräkningen.` : "Inget stoppar beräkningen."}</p>
                </>
              )}
            </div>

            {/* 3. Beräkna */}
            {(run.status === "draft" || run.status === "calculated") && (
              <div className="hr-card">
                <h2 className="hr-h2">Beräkna</h2>
                <p className="hr-muted">
                  Lönen räknas med regelboken för {run.payDate}, de importerade skattetabellerna och godkänd tid. {run.status === "calculated" ? "Räkna om om något har ändrats; de gamla beräknade lönebeskeden ersätts." : ""}
                </p>
                <div className="hr-inline">
                  <form action={computeRunAction}>
                    <input type="hidden" name="runId" value={run.id} />
                    <button className="btn btn-primary hr-btn-small" type="submit">
                      {run.status === "calculated" ? "Räkna om" : "Beräkna lönen"}
                    </button>
                  </form>
                  <form action={discardRunAction}>
                    <input type="hidden" name="runId" value={run.id} />
                    <button className="btn btn-ghost hr-btn-small" type="submit">
                      Ta bort körningen
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* 4. Granska */}
            {slips.length > 0 && (
              <div className="hr-card">
                <h2 className="hr-h2">{run.approvedAt ? "Lönebesked" : "Granska per person"}</h2>
                <div className="hr-table-wrap">
                  <table className="org-table">
                    <thead>
                      <tr>
                        <th>Person</th>
                        <th className="tg-num">Brutto</th>
                        <th className="tg-num">Skatt</th>
                        <th className="tg-num">Netto</th>
                        <th className="tg-num">Avgifter</th>
                        <th className="tg-num">Mot förra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slips.map((s) => {
                        const prev = previous.get(s.employeeId);
                        return (
                          <tr key={s.id}>
                            <td>
                              <span className="hr-name">
                                {s.document.employeeName}
                                {s.number !== null ? ` · L${s.number}` : ""}
                              </span>
                              {s.document.context?.correctionIds.length ? <span className="hr-muted">med rättelse</span> : null}
                            </td>
                            <td className="tg-num">{kr(s.grossOre)}</td>
                            <td className="tg-num">{kr(-s.taxOre)}</td>
                            <td className="tg-num">
                              <strong>{kr(s.netOre)}</strong>
                            </td>
                            <td className="tg-num">{kr(s.employerContributionOre)}</td>
                            <td className="tg-num">{prev ? kr(s.netOre - prev.netOre) : <span className="hr-muted">första</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th>Summa</th>
                        <th className="tg-num">{kr(totals.grossOre)}</th>
                        <th className="tg-num">{kr(totals.taxOre === undefined ? undefined : -totals.taxOre)}</th>
                        <th className="tg-num">{kr(totals.netOre)}</th>
                        <th className="tg-num">{kr(totals.employerContributionOre)}</th>
                        <th />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {slips.map((s) => (
                  <PayslipDetails key={s.id} slip={s} previous={previous.get(s.employeeId) ?? null} run={run} canApprove={canApprove} retroItems={retroItems.map((i) => ({ code: i.code, name: i.name }))} corrections={corrections.filter((c) => c.originalPayslipId === s.id).length} />
                ))}
              </div>
            )}

            {/* 7. Bokför */}
            {(preview || journal) && (
              <div className="hr-card">
                <h2 className="hr-h2">{journal ? `Verifikation ${journal.entry}` : "Verifikationen som bokförs"}</h2>
                <JournalTable lines={journal?.lines ?? preview ?? []} />
                {!journal && <p className="hr-muted">En verifikation i serien V daterad {run.payDate}. Semesterlöneskulden och tjänstepensionen periodiseras; Foras och Collectums fakturor bokför den verkliga kostnaden.</p>}
              </div>
            )}

            {/* 8. Stäng */}
            {reconciliation && (
              <div className="hr-card">
                <h2 className="hr-h2">Avstämning</h2>
                <table className="org-table">
                  <tbody>
                    <tr>
                      <td>Nettolön enligt lönebeskeden</td>
                      <td className="tg-num">{kr(reconciliation.payslipsOre)}</td>
                    </tr>
                    <tr>
                      <td>Raderna (summa − förmåner − skatt)</td>
                      <td className="tg-num">{kr(reconciliation.linesOre)}</td>
                    </tr>
                    <tr>
                      <td>Verifikationen, konto {settings.accounts.net}</td>
                      <td className="tg-num">{reconciliation.journalOre === null ? "inte bokförd" : kr(reconciliation.journalOre)}</td>
                    </tr>
                    <tr>
                      <td>Lönefilen (CtrlSum)</td>
                      <td className="tg-num">{reconciliation.bankOre === null ? "ingen fil" : kr(reconciliation.bankOre)}</td>
                    </tr>
                    <tr>
                      <td>Skatt: lönebesked mot konto {settings.accounts.tax}</td>
                      <td className="tg-num">
                        {kr(reconciliation.taxOre)} / {reconciliation.journalTaxOre === null ? "–" : kr(reconciliation.journalTaxOre)}
                      </td>
                    </tr>
                    <tr>
                      <td>Avgifter: lönebesked mot konto {settings.accounts.contributionLiability}</td>
                      <td className="tg-num">
                        {kr(reconciliation.contributionsOre)} / {reconciliation.journalContributionsOre === null ? "–" : kr(reconciliation.journalContributionsOre)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p>{reconciliation.ok ? <strong>Går ihop.</strong> : run.status === "booked" ? <strong>Går inte ihop: körningen kan inte stängas.</strong> : <span className="hr-muted">Går ihop när lönefilen är skapad och lönen bokförd.</span>}</p>
              </div>
            )}
          </div>

          <aside className="hr-stack">
            <div className="hr-card">
              <h2 className="hr-h2">Nästa steg</h2>
              <dl className="hr-dl hr-dl--inline">
                <dt>Beräknad</dt>
                <dd>{run.computedAt ? `${formatWhen(run.computedAt)} av ${run.computedByName || "–"}` : "–"}</dd>
                <dt>Godkänd</dt>
                <dd>{run.approvedAt ? `${formatWhen(run.approvedAt)} av ${run.approvedByName || "–"}` : "–"}</dd>
                {run.ruleSetValidFrom && (
                  <>
                    <dt>Regler från</dt>
                    <dd>{run.ruleSetValidFrom}</dd>
                  </>
                )}
              </dl>

              {run.status === "calculated" &&
                (canApprove ? (
                  <form action={approveRunAction} className="hr-stack">
                    <input type="hidden" name="runId" value={run.id} />
                    <button className="btn btn-primary" type="submit" disabled={isComputer}>
                      Godkänn lönen
                    </button>
                    <span className="hr-muted">
                      {isComputer ? "Du räknade lönen; en annan ägare eller administratör godkänner (fyra ögon)." : `Godkännandet låser tiden ${run.timeFrom} – ${run.timeTo}, fryser lönebeskeden, numrerar dem i serien L och gör PDF:erna. Det går inte att ändra efteråt; har tid, frånvaro, avtal eller skatt ändrats sedan beräkningen vägras det tills lönen räknas om.`}
                    </span>
                  </form>
                ) : (
                  <p className="hr-muted">Ägaren eller en administratör godkänner; redovisningskonsulten godkänner inte.</p>
                ))}

              {run.status === "approved" &&
                (canApprove ? (
                  <form action={bankFileAction} className="hr-stack">
                    <input type="hidden" name="runId" value={run.id} />
                    <button className="btn btn-primary" type="submit">
                      Skapa lönefilen
                    </button>
                    <span className="hr-muted">pain.001 från {settings.bank.iban || "lönekontot (saknas under Inställningar › Lön)"} till varje persons konto, betalningsdag {run.payDate}. Kontonumren läses i klartext och loggas.</span>
                  </form>
                ) : (
                  <p className="hr-muted">Ägaren eller en administratör skapar lönefilen.</p>
                ))}

              {run.bankFileId && (
                <p>
                  <a className="btn btn-ghost hr-btn-small" href={`/admin/lon/${run.id}/bankfil`}>
                    Ladda ner lönefilen (XML)
                  </a>
                </p>
              )}

              {run.status === "paid" && canApprove && (
                <form action={bookRunAction} className="hr-stack">
                  <input type="hidden" name="runId" value={run.id} />
                  <button className="btn btn-primary" type="submit">
                    Bokför
                  </button>
                  <span className="hr-muted">Verifikationen i serien V på lönedagen.</span>
                </form>
              )}

              {run.status === "booked" && canApprove && (
                <form action={closeRunAction} className="hr-stack">
                  <input type="hidden" name="runId" value={run.id} />
                  <button className="btn btn-primary" type="submit" disabled={!reconciliation?.ok}>
                    Stäng körningen
                  </button>
                  <span className="hr-muted">Stängs bara om lönebesked, rader, verifikation och lönefil visar samma nettolön.</span>
                </form>
              )}

              {run.status === "closed" && <p>Stängd {run.closedAt ? formatWhen(run.closedAt) : ""}. Ett fel rättas med Rätta på lönebeskedet; raderna kommer med i nästa körning.</p>}
            </div>
            <div className="hr-card">
              <h2 className="hr-h2">Skattekontot</h2>
              <dl className="hr-dl hr-dl--inline">
                <dt>Skatteavdrag</dt>
                <dd>{kr(totals.taxOre)}</dd>
                <dt>Arbetsgivaravgifter</dt>
                <dd>{kr(totals.employerContributionOre)}</dd>
                <dt>Betalas senast</dt>
                <dd>{due.payBy}</dd>
              </dl>
              <span className="hr-muted">Avgifterna i AGI räknas per person i hela kronor (fas 4); öresavrundningen kan skilja några kronor.</span>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function JournalTable({ lines }: { lines: readonly JournalLine[] }) {
  const debit = lines.reduce((s, l) => s + l.debitOre, 0);
  const credit = lines.reduce((s, l) => s + l.creditOre, 0);
  return (
    <div className="hr-table-wrap">
      <table className="org-table">
        <thead>
          <tr>
            <th>Konto</th>
            <th>Text</th>
            <th className="tg-num">Debet</th>
            <th className="tg-num">Kredit</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{l.account}</td>
              <td>{l.text}</td>
              <td className="tg-num">{l.debitOre ? kr(l.debitOre) : ""}</td>
              <td className="tg-num">{l.creditOre ? kr(l.creditOre) : ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={2}>Summa</th>
            <th className="tg-num">{kr(debit)}</th>
            <th className="tg-num">{kr(credit)}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** One person's lines, the diff against their last approved payslip, the PDF and Rätta. */
function PayslipDetails({ slip, previous, run, canApprove, retroItems, corrections }: { slip: StoredPayslip; previous: StoredPayslip | null; run: PayRun; canApprove: boolean; retroItems: { code: string; name: string }[]; corrections: number }) {
  const doc = slip.document;
  const byCode = (s: StoredPayslip | null) => {
    const m = new Map<string, number>();
    for (const l of s?.document.lines ?? []) m.set(l.code, (m.get(l.code) ?? 0) + l.amountOre);
    return m;
  };
  const now = byCode(slip);
  const before = byCode(previous);
  const codes = [...new Set([...now.keys(), ...before.keys()])].sort();
  const names = new Map([...(previous?.document.lines ?? []), ...doc.lines].map((l) => [l.code, l.item.name]));
  const changed = codes.filter((c) => (now.get(c) ?? 0) !== (before.get(c) ?? 0));
  return (
    <details className="hr-details">
      <summary>
        {doc.employeeName}: {kr(slip.netOre)} netto
      </summary>
      <div className="hr-table-wrap">
        <table className="org-table">
          <thead>
            <tr>
              <th>Art</th>
              <th>Text</th>
              <th className="tg-num">Antal</th>
              <th className="tg-num">À-pris</th>
              <th className="tg-num">Belopp</th>
              <th>Konto</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.code}</td>
                <td>
                  {l.text}
                  {l.ratePercent !== null && <span className="hr-muted">{`${String(l.ratePercent).replace(".", ",")} %${l.basisOre !== null ? ` av ${kr(l.basisOre)}` : ""}`}</span>}
                </td>
                <td className="tg-num">{l.quantity === null ? "" : `${String(l.quantity).replace(".", ",")} ${l.unit ?? ""}`}</td>
                <td className="tg-num">{l.unitPriceOre === null ? "" : kr(l.unitPriceOre)}</td>
                <td className="tg-num">{kr(l.amountOre)}</td>
                <td>{l.item.flags.account}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="hr-dl hr-gap">
        <dt>Skatt</dt>
        <dd>
          {kr(doc.totals.taxOre)} ({doc.tax.method === "table" ? `tabell ${doc.tax.tableNo} kolumn ${doc.tax.columnNo}` : doc.tax.method}
          {doc.tax.lumpSumOre ? `, varav engångsskatt ${doc.tax.lumpSumPercent} %` : ""})
        </dd>
        <dt>Arbetsgivaravgifter</dt>
        <dd>
          {kr(doc.totals.employerContributionOre)} ({String(doc.contributions.ratePercent).replace(".", ",")} %, {doc.contributions.category})
        </dd>
        {doc.context && (
          <>
            <dt>Semesterlöneskuld</dt>
            <dd>
              {kr(doc.context.vacation.liabilityOre)} ({doc.context.vacation.liabilityChangeOre >= 0 ? "+" : ""}
              {kr(doc.context.vacation.liabilityChangeOre)})
            </dd>
            <dt>Tjänstepension</dt>
            <dd>{doc.context.pension.scheme === "none" ? "ingen" : `${kr(doc.context.pension.premiumOre)} (${doc.context.pension.scheme === "itp1" ? "ITP 1" : "SAF-LO"}, beräknad)`}</dd>
          </>
        )}
        <dt>Mot förra lönebeskedet</dt>
        <dd>
          {!previous
            ? "Första lönebeskedet."
            : changed.length === 0
              ? `Samma rader som ${monthLabel(previous.document.periodStart)}.`
              : changed.map((c) => `${names.get(c) ?? c} ${kr((now.get(c) ?? 0) - (before.get(c) ?? 0))}`).join(" · ")}
        </dd>
      </dl>
      {slip.approvedAt && (
        <p className="hr-inline hr-gap">
          {slip.pdfPath ? (
            <a className="btn btn-ghost hr-btn-small" href={`/admin/lon/lonebesked/${slip.id}`} target="_blank" rel="noreferrer">
              Lönebesked L{slip.number} (PDF)
            </a>
          ) : (
            canApprove && (
              <form action={payslipPdfAction}>
                <input type="hidden" name="payslipId" value={slip.id} />
                <button className="btn btn-ghost hr-btn-small" type="submit">
                  Skapa PDF:en
                </button>
              </form>
            )
          )}
          {corrections > 0 && <span className="hr-muted">{corrections} rättelser</span>}
        </p>
      )}
      {run.status === "closed" && canApprove && (
        <form action={correctionAction} className="tg-fields hr-gap">
          <input type="hidden" name="payslipId" value={slip.id} />
          <div className="efield">
            <label>Löneart</label>
            <select name="code" className="tg-select" defaultValue={doc.context?.group === "collective" ? "1711" : "1710"}>
              {retroItems.map((i) => (
                <option key={i.code} value={i.code}>
                  {i.code} {i.name}
                </option>
              ))}
            </select>
          </div>
          <div className="efield">
            <label>Belopp (kr)</label>
            <input name="amount" inputMode="decimal" placeholder="1 200 eller −500" required />
          </div>
          <div className="efield tg-wide">
            <label>Text på lönebeskedet</label>
            <input name="text" placeholder={`Rättelse lönebesked L${slip.number}`} />
          </div>
          <div className="efield tg-wide">
            <label>Varför</label>
            <input name="reason" required minLength={3} />
          </div>
          <button className="btn btn-ghost hr-btn-small" type="submit">
            Rätta i nästa körning
          </button>
        </form>
      )}
    </details>
  );
}
