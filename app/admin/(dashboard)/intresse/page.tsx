import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { listInterest } from "@/lib/interest";
import { VOLUME_LABEL, interestStats, toolText } from "@/lib/interest-schema";
import { formatDateTime } from "@/lib/admin-format";
import { PRODUCT_NAME, PRODUCT_PATH } from "@/lib/product";
import DeleteInterest from "@/components/admin/interest/DeleteInterest";

export const metadata = { title: "Intresse" };

/** Interest registrations from /fakturering, newest first. */
export default async function InterestAdminPage() {
  const check = await requireRole("site");
  if (!check.ok) redirect("/admin");
  const rows = await listInterest();
  const { recent, large, fortnox } = interestStats(rows);

  return (
    <section className="sec sec--tight">
      <div className="container">
        <div className="inbox-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1>Intresse</h1>
          </div>
          {rows.length > 0 && (
            <a href="/admin/intresse/csv" className="btn btn-ghost">
              Ladda ner CSV
            </a>
          )}
        </div>
        <p className="admin-intro">
          Anmälningar från{" "}
          <Link href={PRODUCT_PATH} className="link-quiet" target="_blank">
            {PRODUCT_PATH}
          </Link>
          , där {PRODUCT_NAME} presenteras för andra byggföretag. Varje ny anmälan mejlas också till er.
        </p>

        <div className="kpi-row">
          <div className="kpi">
            <span>Anmälningar</span>
            <strong>{rows.length}</strong>
          </div>
          <div className="kpi">
            <span>Senaste 30 dagarna</span>
            <strong>{recent}</strong>
          </div>
          <div className="kpi">
            <span>Över 50 fakturor i månaden</span>
            <strong>{large}</strong>
          </div>
          <div className="kpi">
            <span>Använder Fortnox i dag</span>
            <strong>{fortnox}</strong>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="inbox-empty">
            <p>Inga anmälningar än. De dyker upp här så fort någon fyller i formuläret på {PRODUCT_PATH}.</p>
          </div>
        ) : (
          <div className="interest-table-wrap">
            <table className="org-table interest-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Företag</th>
                  <th>Kontakt</th>
                  <th>Fakturor/mån</th>
                  <th>I dag</th>
                  <th>Viktigast</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <time dateTime={r.created_at}>{formatDateTime(r.created_at)}</time>
                    </td>
                    <td>
                      <strong>{r.company}</strong>
                      <span className="interest-sub">{r.name}</span>
                    </td>
                    <td>
                      <a href={`mailto:${r.email}`}>{r.email}</a>
                      {r.phone && (
                        <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="interest-sub">
                          {r.phone}
                        </a>
                      )}
                    </td>
                    <td>{VOLUME_LABEL[r.volume] ?? r.volume}</td>
                    <td>{toolText(r.current_tool, r.current_tool_other)}</td>
                    <td className="interest-priority">{r.priority ?? "–"}</td>
                    <td>
                      <DeleteInterest id={r.id} company={r.company} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
