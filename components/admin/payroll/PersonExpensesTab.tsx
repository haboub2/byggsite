import { formatOre } from "@/lib/core/money";
import { formatWhen } from "@/lib/admin-format";
import { CLAIM_STATUS_LABEL, expensePolicy, listClaims, type ExpenseClaim } from "@/lib/core/payroll/benefits-store";
import { CAR_TYPE_LABEL, EXPENSE_KIND_LABEL, LONG_STAY_LABEL } from "@/lib/core/payroll/expenses";
import { approveClaimAction, rejectClaimAction } from "@/app/admin/benefit-actions";

const kr = (ore: number) => formatOre(ore, { currency: true });
const STATUS_TONE: Record<ExpenseClaim["status"], string> = { draft: "", submitted: "issued", approved: "issued", rejected: "credited", paid: "paid" };

/** What a claim is, in one line. */
export function claimSummary(c: ExpenseClaim): string {
  const when = c.dateFrom === c.dateTo ? c.dateFrom : `${c.dateFrom}–${c.dateTo}`;
  if (c.kind === "utlagg") return `${when} · ${c.description || "Utlägg"}${c.vatOre ? ` (varav moms ${kr(c.vatOre)})` : ""}`;
  if (c.kind === "milersattning") return `${when} · ${String(c.distanceKm ?? 0).replace(".", ",")} km, ${CAR_TYPE_LABEL[c.carType ?? "egen"].toLowerCase()}${c.description ? ` · ${c.description}` : ""}`;
  return `${when} · ${c.destination}, avresa ${c.departureTime ?? "–"}, hemkomst ${c.returnTime ?? "–"}${c.longStay !== "none" ? ` · ${LONG_STAY_LABEL[c.longStay].toLowerCase()}` : ""}${c.farFromHome ? "" : " · inom 50 km"}`;
}

/**
 * Person › Utlägg (docs/hr-lon.md, section 11): the person's claims from
 * /min-tid with the receipts (served only when their hash matches), the
 * tax-free and taxable split, approve (the amounts are computed again on
 * the server from the rule book and the policy) or reject with a reason,
 * and the payslip that paid each.
 */
export async function PersonExpensesTab({ employeeId, canApprove }: { employeeId: string; canApprove: boolean }) {
  const [claims, policy] = await Promise.all([listClaims({ employeeId }), expensePolicy()]);
  const waiting = claims.filter((c) => c.status === "submitted");
  return (
    <div className="hr-stack">
      <div className="hr-card">
        <h2 className="hr-h2">Utlägg, milersättning och traktamente</h2>
        <p className="hr-muted">
          Personen lämnar dem på Min tid med kvitto. Godkända betalas med nästa lönekörning: utlägg och schablonen skattefritt (milersättning {kr(policy.ownCarPerMilOre)}/mil med egen bil i er policy), det över schablonen som lön. Den som äger utlägget godkänner inte sitt eget.
        </p>
        {waiting.length > 0 && <p className="hr-badge" data-tone="warn">{waiting.length === 1 ? "1 utlägg väntar på godkännande" : `${waiting.length} utlägg väntar på godkännande`}</p>}
        {claims.length === 0 ? (
          <p className="hr-muted">Inga utlägg ännu.</p>
        ) : (
          <div className="hr-table-wrap">
            <table className="org-table">
              <thead>
                <tr>
                  <th>Slag</th>
                  <th>Vad</th>
                  <th className="tg-num">Skattefritt</th>
                  <th className="tg-num">Skattepliktigt</th>
                  <th>Kvitton</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id}>
                    <td>{EXPENSE_KIND_LABEL[c.kind]}</td>
                    <td>
                      {claimSummary(c)}
                      {c.note && <span className="hr-muted">{c.note}</span>}
                      {c.status === "rejected" && c.rejectedReason && <span className="hr-muted">Avslaget: {c.rejectedReason}</span>}
                    </td>
                    <td className="tg-num">{kr(c.taxFreeOre)}</td>
                    <td className="tg-num">{c.taxableOre ? kr(c.taxableOre) : "–"}</td>
                    <td>
                      {c.receipts.length === 0 ? (
                        <span className="hr-muted">{c.kind === "utlagg" ? "saknas" : "–"}</span>
                      ) : (
                        c.receipts.map((r, i) => (
                          <a key={r.path} href={`/admin/personal/${employeeId}/kvitto/${c.id}/${i}`} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                            {r.name || `Kvitto ${i + 1}`}
                          </a>
                        ))
                      )}
                    </td>
                    <td>
                      <span className="inv-status" data-status={STATUS_TONE[c.status] || undefined}>
                        {CLAIM_STATUS_LABEL[c.status]}
                      </span>
                      {c.approvedAt && <small className="hr-muted">Godkänt {formatWhen(c.approvedAt)}{c.approvedByName ? ` av ${c.approvedByName}` : ""}</small>}
                      {c.paidAt && <small className="hr-muted">Betalt {formatWhen(c.paidAt)}</small>}
                      {canApprove && c.status === "submitted" && (
                        <div className="hr-stack" style={{ marginTop: 8 }}>
                          <form action={approveClaimAction}>
                            <input type="hidden" name="employeeId" value={employeeId} />
                            <input type="hidden" name="claimId" value={c.id} />
                            <button className="btn btn-primary hr-btn-small" type="submit">
                              Godkänn
                            </button>
                          </form>
                          <form action={rejectClaimAction} className="hr-inline">
                            <input type="hidden" name="employeeId" value={employeeId} />
                            <input type="hidden" name="claimId" value={c.id} />
                            <input className="efield-input" name="reason" placeholder="Varför avslås det?" required minLength={3} />
                            <button className="btn btn-ghost hr-btn-small" type="submit">
                              Avslå
                            </button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
