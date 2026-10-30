import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { hasAccess } from "@/lib/core/org/roles";
import { todayIso } from "@/lib/quotes/schema";
import { formatOre } from "@/lib/core/money";
import { formatWhen } from "@/lib/admin-format";
import { eventLabel } from "@/lib/core/events";
import { getEmployee, listDocuments, listEmployeeEvents, listEmployments, listTaxVersions, loadClocks } from "@/lib/core/hr/store";
import { clockAlerts, heldForms } from "@/lib/core/hr/clocks";
import { missingData } from "@/lib/core/hr/missing";
import { newEmploymentDraft, versionDraft } from "@/lib/core/hr/draft";
import { CONTRACT_STATE_LABEL, contractState, payLabel, periodLabel, validityLabel } from "@/lib/core/hr/format";
import {
  AGREEMENT_LABEL,
  FORM_LABEL,
  FORM_SHORT,
  PENSION_LABEL,
  TAX_SOURCE_LABEL,
  VACATION_RULE_LABEL,
  latestVersions,
  supersededTaxRows,
  taxOn,
  type EmploymentDocument,
  type EmploymentVersion,
  type TaxVersion,
} from "@/lib/core/hr/schema";
import { PnrReveal } from "@/components/admin/hr/PnrReveal";
import { EmploymentForm } from "@/components/admin/hr/EmploymentForm";
import { TaxForm } from "@/components/admin/hr/TaxForm";
import { ContactForm } from "@/components/admin/hr/EmployeeForm";
import { SecretsForm } from "@/components/admin/hr/SecretsForm";
import { GenerateContractButton, SignDocumentForm } from "@/components/admin/hr/DocumentActions";
import { PersonTimeTab } from "@/components/admin/hr/PersonTimeTab";
import { PersonAbsenceTab } from "@/components/admin/hr/PersonAbsenceTab";
import { Flash } from "@/components/admin/time/parts";

export const metadata: Metadata = { title: "Person" };

/** The tabs of section 11; Lön, Utlägg and Förmåner say which phase fills them. */
const TABS = [
  { key: "anstallning", label: "Anställning" },
  { key: "skatt", label: "Skatt" },
  { key: "lon", label: "Lön", phase: "Lönebesked kommer med lönekörningen i fas 3." },
  { key: "tid", label: "Tid" },
  { key: "franvaro", label: "Frånvaro" },
  { key: "utlagg", label: "Utlägg", phase: "Utlägg, milersättning och traktamente kommer i fas 5." },
  { key: "formaner", label: "Förmåner", phase: "Bilförmån och andra förmåner kommer i fas 5." },
  { key: "uppgifter", label: "Uppgifter" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function PersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ flik?: string; skapad?: string; manad?: string; ok?: string; fel?: string }> }) {
  const check = await requireRole("payroll");
  if (!check.ok) redirect("/admin/login");
  const canWrite = hasAccess(check.role, "admin");
  const { id } = await params;
  const { flik, skapad, manad, ok, fel } = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === flik) ? (flik as TabKey) : "anstallning";
  const today = todayIso();

  const employee = await getEmployee(id);
  if (!employee) notFound();
  const [versions, tax, documents, clocks, events] = await Promise.all([listEmployments(id), listTaxVersions(id), listDocuments(id), loadClocks(today), listEmployeeEvents(id)]);
  const badges = missingData({ employee, versions, tax, documents, today });
  const clock = clocks.get(id) ?? null;
  const current = taxOn(tax, today);
  const placeholder = TABS.find((t) => t.key === tab && "phase" in t);

  return (
    <section className="sec sec--tight">
      <div className="container">
        <Link href="/admin/personal" className="link-quiet">
          ← Personal
        </Link>
        <div className="inbox-head" style={{ marginTop: 16 }}>
          <div>
            <span className="eyebrow">Person</span>
            <h1 className="admin-h1">{employee.name}</h1>
            <p className="hr-facts">
              <span>
                Personnummer <PnrReveal employeeId={employee.id} masked={employee.pnrMasked} canReveal={canWrite} />
              </span>
              <span>Konto {employee.bankAccountMasked ? `${employee.bankClearing} ${employee.bankAccountMasked}` : <em className="hr-muted">saknas</em>}</span>
              <span>{AGREEMENT_LABEL[employee.agreement]}</span>
              {employee.isOwner && <span>Ägare</span>}
              {employee.isBoardMember && <span>Styrelseledamot</span>}
              {employee.userId && <span>Har inloggning</span>}
            </p>
            {badges.length > 0 && (
              <p className="hr-badges" style={{ marginTop: 10 }}>
                {badges.map((b) => (
                  <span key={b.key} className="hr-badge" data-tone={b.tone}>
                    {b.label}
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
        {skapad && <p className="admin-flash">Personen är tillagd. Lägg in avtalet nedan, och skatteuppgifterna under Skatt.</p>}
        <Flash ok={ok} error={fel} />

        <nav className="inbox-tabs" aria-label="Flik">
          {TABS.map((t) => (
            <Link key={t.key} href={`/admin/personal/${id}${t.key === "anstallning" ? "" : `?flik=${t.key}`}`} aria-current={tab === t.key ? "page" : undefined}>
              {t.label}
            </Link>
          ))}
        </nav>

        <div className="hr-tab">
          {tab === "anstallning" && (
            <EmploymentTab employeeId={id} agreement={employee.agreement} versions={versions} documents={documents} clock={clock} today={today} canWrite={canWrite} />
          )}
          {tab === "skatt" && <TaxTab employeeId={id} rows={tax} current={current} today={today} canWrite={canWrite} />}
          {tab === "tid" && <PersonTimeTab employeeId={id} month={/^\d{4}-\d{2}$/.test(manad ?? "") ? (manad as string) : today.slice(0, 7)} today={today} canWrite={canWrite} />}
          {tab === "franvaro" && <PersonAbsenceTab employeeId={id} today={today} canWrite={canWrite} />}
          {placeholder && "phase" in placeholder && (
            <div className="inbox-empty">
              <p>{placeholder.phase}</p>
            </div>
          )}
          {tab === "uppgifter" && (
            <div className="hr-two">
              <div className="hr-stack">
                {canWrite ? (
                  <>
                    <ContactForm
                      id={employee.id}
                      initial={{
                        name: employee.name,
                        email: employee.email,
                        phone: employee.phone,
                        street: employee.street,
                        postalCode: employee.postalCode,
                        city: employee.city,
                        isOwner: employee.isOwner,
                        isBoardMember: employee.isBoardMember,
                        agreement: employee.agreement,
                        emergencyContact: employee.emergencyContact,
                        notes: employee.notes,
                      }}
                    />
                    <SecretsForm id={employee.id} pnrMasked={employee.pnrMasked} bankMasked={employee.bankAccountMasked} />
                  </>
                ) : (
                  <dl className="hr-dl">
                    <dt>E-post</dt>
                    <dd>{employee.email || "–"}</dd>
                    <dt>Telefon</dt>
                    <dd>{employee.phone || "–"}</dd>
                    <dt>Adress</dt>
                    <dd>{[employee.street, [employee.postalCode, employee.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "–"}</dd>
                    <dt>Född</dt>
                    <dd>{employee.birthDate ?? "–"}</dd>
                    <dt>Närmast anhörig</dt>
                    <dd>{employee.emergencyContact || "–"}</dd>
                  </dl>
                )}
              </div>
              <aside className="lead-aside">
                <h2 className="lead-h2">Historik</h2>
                {events.length === 0 ? (
                  <p className="efield-hint">Inga händelser än.</p>
                ) : (
                  <ul className="hr-history">
                    {events.map((e, i) => (
                      <li key={i}>
                        <span>{eventLabel(e.type).text}</span>
                        <small>
                          {formatWhen(e.at)} · {e.actor.name}
                        </small>
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ClockCard({ clock, today, versions }: { clock: Parameters<typeof clockAlerts>[0] | null; today: string; versions: EmploymentVersion[] }) {
  const alerts = clock ? clockAlerts(clock, today, heldForms(versions, today)) : [];
  return (
    <div className="hr-card">
      <h2 className="lead-h2">LAS-klockor</h2>
      {alerts.length === 0 ? (
        <p className="efield-hint">Inga SÄVA-, vikariat- eller provanställningsdagar räknas för personen.</p>
      ) : (
        <ul className="hr-clocks">
          {alerts.map((a) => (
            <li key={a.kind} data-tone={a.tone}>
              <strong>{a.label}</strong> <span>{a.detail}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="efield-hint">SÄVA räknas i dagsekvivalenter (hel månad = 30 dagar), tre SÄVA i samma månad räknar dagarna emellan; vikariat i dagar. Fem års fönster.</p>
    </div>
  );
}

function EmploymentTab({
  employeeId,
  agreement,
  versions,
  documents,
  clock,
  today,
  canWrite,
}: {
  employeeId: string;
  agreement: Parameters<typeof newEmploymentDraft>[0];
  versions: EmploymentVersion[];
  documents: EmploymentDocument[];
  clock: Parameters<typeof clockAlerts>[0] | null;
  today: string;
  canWrite: boolean;
}) {
  const contracts = latestVersions(versions);
  return (
    <div className="hr-stack">
      <ClockCard clock={clock} today={today} versions={versions} />
      {contracts.length === 0 && <div className="inbox-empty">Inget avtal än.</div>}
      {contracts.map((latest) => {
        const list = versions.filter((v) => v.contractId === latest.contractId).sort((a, b) => b.version - a.version);
        const contractStart = list.reduce((min, v) => (v.startsOn < min ? v.startsOn : min), latest.startsOn);
        const state = contractState(latest, today);
        return (
          <article key={latest.contractId} className="hr-card">
            <div className="hr-card-head">
              <div>
                <h2 className="hr-h2">{FORM_LABEL[latest.form]}</h2>
                <p className="hr-muted">
                  {periodLabel(latest)} · {payLabel(latest)}
                  {latest.title ? ` · ${latest.title}` : ""}
                </p>
              </div>
              <span className="inv-status" data-status={state === "current" ? "paid" : state === "upcoming" ? "issued" : "credited"}>
                {CONTRACT_STATE_LABEL[state]}
              </span>
            </div>
            <dl className="hr-dl hr-dl--inline">
              {latest.form === "vikariat" && (
                <>
                  <dt>Vikarierar för</dt>
                  <dd>{latest.substituteFor}</dd>
                </>
              )}
              {latest.form === "uppdrag" ? (
                <>
                  <dt>Stämmans beslut</dt>
                  <dd>{latest.decisionReference || "–"}</dd>
                </>
              ) : (
                <>
                  <dt>Omfattning</dt>
                  <dd>
                    {latest.workingTimePercent} %{latest.weeklyHours ? `, ${latest.weeklyHours} tim/vecka` : ""}
                  </dd>
                  <dt>Semester</dt>
                  <dd>
                    {VACATION_RULE_LABEL[latest.vacationRule]}, {latest.vacationDays} dagar{latest.vacationPercent !== null ? `, ${latest.vacationPercent} %` : ""}
                  </dd>
                  <dt>Pension</dt>
                  <dd>{PENSION_LABEL[latest.pensionScheme]}</dd>
                </>
              )}
            </dl>
            <div className="hr-table-wrap">
              <table className="org-table hr-versions">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Gäller</th>
                    <th>Form och lön</th>
                    <th>Avtal</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((v) => {
                    const docs = documents.filter((d) => d.employmentId === v.id);
                    const replaced = v.validTo !== null && v.validTo < v.validFrom;
                    return (
                      <tr key={v.id} data-replaced={replaced || undefined}>
                        <td>
                          {v.version}
                          {v.changeReason && <span className="hr-muted">{v.changeReason}</span>}
                        </td>
                        <td>{replaced ? <span className="hr-muted">Ersatt före start</span> : validityLabel(v)}</td>
                        <td>
                          {FORM_SHORT[v.form]}
                          <span className="hr-muted">{payLabel(v)}</span>
                        </td>
                        <td>
                          <ul className="hr-docs">
                            {docs.map((d) => (
                              <li key={d.id}>
                                <a href={`/admin/personal/${employeeId}/dokument/${d.id}`} target="_blank" rel="noopener">
                                  {d.title} ({d.createdAt.slice(0, 10)})
                                </a>{" "}
                                <a href={`/admin/personal/${employeeId}/dokument/${d.id}?ladda-ner=1`} className="link-quiet">
                                  Ladda ner
                                </a>{" "}
                                {d.signedAt ? (
                                  <span className="inv-status" data-status="paid">
                                    Signerat {d.signedAt}
                                  </span>
                                ) : canWrite ? (
                                  <SignDocumentForm documentId={d.id} today={today} min={contractStart} />
                                ) : (
                                  <span className="inv-status">Inte signerat</span>
                                )}
                              </li>
                            ))}
                          </ul>
                          {canWrite && !replaced && <GenerateContractButton employeeId={employeeId} employmentId={v.id} label={docs.length ? "Skapa nytt avtal" : "Skapa avtal (PDF)"} />}
                          {!canWrite && docs.length === 0 && <span className="hr-muted">Inget avtal</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {canWrite && latest.validTo === null && (
              <details className="hr-details">
                <summary>Ny version (lön, förlängning, ny form)</summary>
                <EmploymentForm employeeId={employeeId} agreement={agreement} initial={versionDraft(latest, today)} />
              </details>
            )}
          </article>
        );
      })}
      {canWrite && (
        <details className="hr-details" open={contracts.length === 0}>
          <summary>Ny anställning eller nytt uppdrag</summary>
          <EmploymentForm employeeId={employeeId} agreement={agreement} initial={newEmploymentDraft(agreement, today)} />
        </details>
      )}
    </div>
  );
}

function TaxTab({ employeeId, rows, current, today, canWrite }: { employeeId: string; rows: TaxVersion[]; current: TaxVersion | null; today: string; canWrite: boolean }) {
  const describe = (t: TaxVersion) =>
    t.kind === "none"
      ? "Inget skatteavdrag (beslut)"
      : t.mainEmployer
        ? `Tabell ${t.tableNo}, kolumn ${t.columnNo}`
        : `Sidoinkomst${t.tableNo ? ` (tabell ${t.tableNo}, kolumn ${t.columnNo})` : ""}, 30 %`;
  const jamkning = (t: TaxVersion) =>
    t.adjustmentValidTo
      ? t.adjustmentPercent !== null
        ? `${t.adjustmentPercent} % till ${t.adjustmentValidTo}`
        : `${formatOre(t.adjustmentMonthlyChangeOre ?? 0, { decimals: 0, currency: true })}/mån till ${t.adjustmentValidTo}`
      : "–";
  const superseded = supersededTaxRows(rows);
  return (
    <div className="hr-stack">
      <div className="hr-card">
        <h2 className="lead-h2">Gäller i dag</h2>
        {current ? (
          <dl className="hr-dl hr-dl--inline">
            <dt>Skatteavdrag</dt>
            <dd>{describe(current)}</dd>
            <dt>Jämkning</dt>
            <dd>{jamkning(current)}</dd>
            <dt>Källa</dt>
            <dd>{TAX_SOURCE_LABEL[current.source]}</dd>
            <dt>Från</dt>
            <dd>{current.validFrom}</dd>
          </dl>
        ) : (
          <p className="efield-hint">Inga skatteuppgifter gäller i dag. Lägg in tabell och kolumn från A-skattsedeln innan första lönen; utan dem räknas ingen lön.</p>
        )}
      </div>
      {rows.length > 0 && (
        <div className="hr-card">
          <h2 className="lead-h2">Historik</h2>
          <div className="hr-table-wrap">
            <table className="org-table">
              <thead>
                <tr>
                  <th>Från</th>
                  <th>Skatteavdrag</th>
                  <th>Jämkning</th>
                  <th>Källa</th>
                  <th>Anteckning</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} data-replaced={superseded.has(t.id) || undefined}>
                    <td>
                      {t.validFrom}
                      {superseded.has(t.id) && <span className="hr-muted">Rättad av en senare rad</span>}
                    </td>
                    <td>{describe(t)}</td>
                    <td>{jamkning(t)}</td>
                    <td>{TAX_SOURCE_LABEL[t.source]}</td>
                    <td>{t.note || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {canWrite && (
        <details className="hr-details" open={rows.length === 0}>
          <summary>Nya skatteuppgifter</summary>
          <TaxForm
            employeeId={employeeId}
            today={today}
            previous={
              current
                ? { kind: current.kind, tableNo: current.tableNo ? String(current.tableNo) : "", columnNo: current.columnNo ? String(current.columnNo) : "1", mainEmployer: current.mainEmployer, source: current.source }
                : null
            }
          />
        </details>
      )}
    </div>
  );
}
