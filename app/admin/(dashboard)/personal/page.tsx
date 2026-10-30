import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { hasAccess } from "@/lib/core/org/roles";
import { todayIso } from "@/lib/quotes/schema";
import { listDocuments, listEmployees, listEmployments, listTaxVersions, loadClocks } from "@/lib/core/hr/store";
import { CLOCK_ALERT_DAYS, clockAlerts, heldForms } from "@/lib/core/hr/clocks";
import { missingData } from "@/lib/core/hr/missing";
import { payLabel } from "@/lib/core/hr/format";
import { AGREEMENT_LABEL, FORM_SHORT, PAY_FORM_LABEL, inForce, latestVersions } from "@/lib/core/hr/schema";

export const metadata: Metadata = { title: "Personal" };

/**
 * The personnel register (docs/hr-lon.md, section 11): form, pay form and
 * agreement per person, the LAS clocks with days to conversion (counted by
 * the database), and what is missing before payroll. Owner, admin and
 * accountant; adding people is for owner and admin.
 */
export default async function PersonalPage() {
  const check = await requireRole("payroll");
  if (!check.ok) redirect("/admin/login");
  const canWrite = hasAccess(check.role, "admin");
  const today = todayIso();
  const [employees, versions, tax, documents, clocks] = await Promise.all([listEmployees(), listEmployments(), listTaxVersions(), listDocuments(), loadClocks(today)]);

  const rows = employees.map((e) => {
    const mine = versions.filter((v) => v.employeeId === e.id);
    const latest = latestVersions(mine);
    const current = latest.find((v) => inForce(v, today)) ?? latest.find((v) => v.startsOn > today) ?? null;
    const clock = clocks.get(e.id);
    const alerts = clock ? clockAlerts(clock, today, heldForms(mine, today)) : [];
    const badges = missingData({ employee: e, versions: mine, tax: tax.filter((t) => t.employeeId === e.id), documents: documents.filter((d) => d.employeeId === e.id), today });
    return { e, current, alerts, badges };
  });
  const active = rows.filter((r) => r.current && !r.e.endedAt).length;
  const soon = rows.filter((r) => r.alerts.some((a) => a.tone === "alert")).length;
  const incomplete = rows.filter((r) => r.badges.some((b) => b.tone === "alert")).length;

  return (
    <section className="sec sec--tight">
      <div className="container">
        <div className="inbox-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1>Personal</h1>
            <p className="admin-intro">
              Anställda, vikarier, behovsanställda och styrelsen: avtal i versioner, skatteuppgifter och LAS-klockorna. Klockorna räknas i databasen från avtalen, med fem års fönster.
            </p>
          </div>
          {canWrite && (
            <Link href="/admin/personal/ny" className="btn btn-primary">
              Lägg till person
            </Link>
          )}
        </div>

        <div className="kpi-row">
          <div className="kpi">
            <span>Med gällande avtal</span>
            <strong>{active}</strong>
            <small>av {employees.length} i registret</small>
          </div>
          <div className={soon ? "kpi kpi--alert" : "kpi"}>
            <span>LAS att hantera</span>
            <strong>{soon}</strong>
            <small>blir tillsvidare inom {CLOCK_ALERT_DAYS} dagar, har passerat gränsen eller provanställning slutar</small>
          </div>
          <div className={incomplete ? "kpi kpi--alert" : "kpi"}>
            <span>Saknar uppgifter</span>
            <strong>{incomplete}</strong>
            <small>personnummer, konto eller skatt</small>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="inbox-empty">
            <p>Inga personer än. {canWrite ? "Lägg till den första: anställd, vikarie, behovsanställd eller styrelseledamot." : ""}</p>
          </div>
        ) : (
          <div className="hr-table-wrap">
            <table className="org-table hr-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Form</th>
                  <th>Löneform</th>
                  <th>Kollektivavtal</th>
                  <th>LAS-klockor</th>
                  <th>Saknas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ e, current, alerts, badges }) => (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/admin/personal/${e.id}`} className="hr-name">
                        {e.name}
                      </Link>
                      <span className="hr-muted">{[e.isBoardMember ? "styrelse" : "", e.isOwner ? "ägare" : "", current?.title ?? ""].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td>{current ? FORM_SHORT[current.form] : <span className="hr-muted">Inget avtal</span>}</td>
                    <td>
                      {current ? (
                        <>
                          {PAY_FORM_LABEL[current.payForm]}
                          <span className="hr-muted">{payLabel(current)}</span>
                        </>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td>{AGREEMENT_LABEL[e.agreement]}</td>
                    <td>
                      {alerts.length === 0 ? (
                        <span className="hr-muted">–</span>
                      ) : (
                        <ul className="hr-clocks">
                          {alerts.map((a) => (
                            <li key={a.kind} data-tone={a.tone}>
                              <strong>{a.label}</strong> <span>{a.detail}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td>
                      {badges.length === 0 ? (
                        <span className="hr-muted">Komplett</span>
                      ) : (
                        <span className="hr-badges">
                          {badges.map((b) => (
                            <span key={b.key} className="hr-badge" data-tone={b.tone}>
                              {b.label}
                            </span>
                          ))}
                        </span>
                      )}
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
