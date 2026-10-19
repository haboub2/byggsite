import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { answerChangeOrderAction } from "@/app/(portal)/portal-actions";
import { formatDay, formatLongDay } from "@/lib/portal/format";
import { CHANGE_ORDER_STATUS_LABEL, changeOrderRot, formatKr, pendingChangeOrders } from "@/lib/portal/schema";
import { getProjectBundle } from "@/lib/portal/store";
import { formatDays } from "@/lib/workdays";

export const metadata: Metadata = { title: "Ändringar" };

const FLASH: Record<string, string> = {
  godkand: "Tack! Ändringen är godkänd. Vi planerar in arbetet och tidplanen visar när det görs.",
  avbojd: "Ändringen är avböjd. Vi fortsätter enligt offerten.",
};

/** ÄTA: tilläggs- och ändringsarbeten the customer approves or declines. */
export default async function PortalChangeOrders({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const bundle = await getProjectBundle(id);
  if (!bundle) notFound();
  const { project, changeOrders } = bundle;
  const pending = pendingChangeOrders(changeOrders);
  const flash = typeof q.svar === "string" ? FLASH[q.svar] : undefined;
  const error = typeof q.fel === "string" ? q.fel : undefined;
  const approvedTotal = changeOrders.filter((o) => o.status === "approved").reduce((sum, o) => sum + o.amount, 0);

  return (
    <div className="portal-stack">
      {flash && <p className="portal-flash">{flash}</p>}
      {error && (
        <p className="form-feedback error" role="alert">
          {error}
        </p>
      )}

      {pending.length > 0 && (
        <p className="portal-alert">
          <strong>{pending.length === 1 ? "En ändring väntar på ditt svar." : `${pending.length} ändringar väntar på ditt svar.`}</strong> Läs igenom och tryck Godkänn eller
          Avböj. Svaret sparas med ditt namn och blir underlag för fakturan.
        </p>
      )}

      <section className="portal-card">
        <h2>Ändringar och tillägg (ÄTA)</h2>
        {changeOrders.length === 0 ? (
          <p>Inga ändringar än. Om något utöver offerten behöver göras lägger vi upp det här med pris, så att du kan godkänna innan vi börjar.</p>
        ) : (
          <ul className="portal-ata">
            {changeOrders.map((o) => {
              const { rot, pay } = changeOrderRot(o);
              const isPending = o.status === "pending";
              return (
                <li key={o.id} data-status={o.status} id={`ata-${o.number}`}>
                  <div className="portal-ata-head">
                    <span className="portal-when">
                      ÄTA {o.number} · {formatDay(o.created_at)}
                    </span>
                    <span className="etag" data-status={o.status}>
                      {CHANGE_ORDER_STATUS_LABEL[o.status]}
                    </span>
                  </div>
                  <h3>{o.title}</h3>
                  {o.description && <p className="portal-ata-desc">{o.description}</p>}
                  <dl className="portal-ata-sums">
                    <div>
                      <dt>Pris inkl. moms</dt>
                      <dd>{formatKr(o.amount)}</dd>
                    </div>
                    <div>
                      <dt>Varav arbete</dt>
                      <dd>{formatKr(o.labor_amount)}</dd>
                    </div>
                    <div>
                      <dt>{rot < 0 ? "ROT-avdraget minskar" : "ROT-avdraget ökar"}</dt>
                      <dd>{rot === 0 ? "Påverkas inte" : formatKr(Math.abs(rot))}</dd>
                    </div>
                    <div className="portal-ata-pay">
                      <dt>Att betala efter ROT</dt>
                      <dd>{formatKr(pay)}</dd>
                    </div>
                    <div className="portal-ata-time">
                      <dt>Tid</dt>
                      <dd>{o.duration_days > 0 ? `Förlänger projektet med ca ${formatDays(o.duration_days)}` : "Påverkar inte slutdatumet"}</dd>
                    </div>
                  </dl>
                  {isPending ? (
                    <div className="portal-ata-actions">
                      <form action={answerChangeOrderAction}>
                        <input type="hidden" name="project" value={project.id} />
                        <input type="hidden" name="order" value={o.id} />
                        <input type="hidden" name="answer" value="approved" />
                        <button type="submit" className="btn btn-primary">
                          Godkänn
                        </button>
                      </form>
                      <form action={answerChangeOrderAction}>
                        <input type="hidden" name="project" value={project.id} />
                        <input type="hidden" name="order" value={o.id} />
                        <input type="hidden" name="answer" value="declined" />
                        <button type="submit" className="btn btn-ghost">
                          Avböj
                        </button>
                      </form>
                    </div>
                  ) : (
                    <p className="portal-ata-answer">
                      {o.status === "approved" ? "Godkänd" : "Avböjd"} av <strong>{o.answered_name || "kunden"}</strong>
                      {o.answered_at ? `, ${formatLongDay(o.answered_at).toLowerCase()} ${new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" }).format(new Date(o.answered_at))}` : ""}.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {approvedTotal !== 0 && (
          <p className="portal-ata-total">
            Godkända ändringar hittills: <strong>{formatKr(approvedTotal)}</strong> utöver offerten.
          </p>
        )}
        <p className="portal-note">
          ROT är 30 % av arbetskostnaden och dras på fakturan, upp till 50 000 kr per person och år. Material ger inget avdrag. Ditt svar här gäller som skriftligt
          godkännande.
        </p>
      </section>
    </div>
  );
}
