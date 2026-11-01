import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { todayIso } from "@/lib/quotes/schema";
import { listEmployments } from "@/lib/core/hr/store";
import { listSchedules, listTimeEntries, timePeople } from "@/lib/core/hr/time-store";
import { overtimeJournal, workingTimeAssumed, type JournalYear } from "@/lib/core/hr/time";
import { personWorkingTimes } from "@/lib/core/hr/working-time";
import { hoursLabel } from "@/components/admin/time/parts";

export const metadata: Metadata = { title: "Övertidsjournal" };

const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const h = (n: number) => (n ? hoursLabel(n) : "–");

/**
 * The record arbetstidslagen 11 § requires the employer to keep of jourtid,
 * övertid and mertid per employee, available to the employee, the union and
 * Arbetsmiljöverket: per month and the calendar year against the limits
 * (lib/core/hr/time.ts overtimeJournal). Approved and locked rows; hours
 * above the contract that were not labelled övertid or mertid count too.
 */
export default async function OvertimeJournalPage({ searchParams }: { searchParams: Promise<{ ar?: string }> }) {
  const check = await requireRole("payroll");
  if (!check.ok) redirect("/admin/login");
  const today = todayIso();
  const sp = await searchParams;
  const year = Number(sp.ar) >= 2020 && Number(sp.ar) <= 2100 ? Number(sp.ar) : Number(today.slice(0, 4));
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const [entries, people, versions, schedules] = await Promise.all([listTimeEntries({ from, to }), timePeople(), listEmployments(), listSchedules()]);
  const name = new Map(people.map((p) => [p.id, p.name]));
  const journal = overtimeJournal(entries, { year, people: personWorkingTimes(versions, schedules, to < today ? to : today) }).sort((a, b) => (name.get(a.employeeId) ?? "").localeCompare(name.get(b.employeeId) ?? "", "sv"));
  const assumed = workingTimeAssumed(from);

  return (
    <section className="sec sec--tight">
      <div className="container">
        <Link href="/admin/rapporter" className="link-quiet">
          ← Lönerapporter
        </Link>
        <div className="inbox-head" style={{ marginTop: 16 }}>
          <div>
            <span className="eyebrow">Tid</span>
            <h1>Övertidsjournal {year}</h1>
            <p className="admin-intro">
              Arbetstidslagen 11 §: arbetsgivaren ska föra anteckningar om jourtid, övertid och mertid, och de anställda, facket och Arbetsmiljöverket har rätt att se dem. Här per person och månad från godkänd tid; timmar över avtalets arbetstid räknas som övertid eller mertid även när raden är märkt Arbete.
            </p>
          </div>
          <div className="lead-quick">
            <a href={`/admin/rapporter/overtid/${year}`} className="btn btn-ghost">
              Ladda ner CSV
            </a>
          </div>
        </div>
        <nav className="mt-row mt-row--between efield-hint" style={{ margin: "12px 0" }}>
          <Link href={`/admin/rapporter/overtid?ar=${year - 1}`}>← {year - 1}</Link>
          <Link href={`/admin/rapporter/overtid?ar=${year + 1}`}>{year + 1} →</Link>
        </nav>
        {assumed && <p className="form-feedback error">Reglerna för {year} är inte inlagda i regelboken; de senaste kända gränserna används.</p>}
        {journal.length === 0 ? (
          <p className="hr-muted">Ingen godkänd tid {year}.</p>
        ) : (
          journal.map((j) => <PersonJournal key={j.employeeId} j={j} name={name.get(j.employeeId) ?? "Okänd"} />)
        )}
      </div>
    </section>
  );
}

function PersonJournal({ j, name }: { j: JournalYear; name: string }) {
  const over = j.overtimeHours > j.overtimeLimit;
  return (
    <div className="hr-card hr-gap">
      <h2 className="hr-h2">{name}</h2>
      <div className="kpi-row">
        <div className={over ? "kpi kpi--alert" : "kpi"}>
          <span>Övertid {j.year}</span>
          <strong>{hoursLabel(j.overtimeHours)}</strong>
          <small>
            av {j.overtimeLimit} h allmän (ATL 8 §), {j.extraOvertimeLimit} h med extra övertid
            {j.nodfallHours ? `; nödfallsövertid ${hoursLabel(j.nodfallHours)} utanför taket` : ""}
          </small>
        </div>
        <div className={j.mertidHours > j.mertidLimit ? "kpi kpi--alert" : "kpi"}>
          <span>Mertid {j.year}</span>
          <strong>{hoursLabel(j.mertidHours)}</strong>
          <small>av {j.mertidLimit} h (ATL 10 §)</small>
        </div>
        <div className="kpi">
          <span>Jourtid {j.year}</span>
          <strong>{hoursLabel(j.jourHours)}</strong>
          <small>högst 48 h per fyra veckor (ATL 6 §)</small>
        </div>
      </div>
      <div className="hr-table-wrap">
        <table className="org-table">
          <thead>
            <tr>
              <th>Månad</th>
              <th>Ordinarie</th>
              <th>Allmän övertid</th>
              <th>Extra övertid</th>
              <th>Nödfall</th>
              <th>Övertid utan märkning</th>
              <th>Mertid</th>
              <th>Mertid utan märkning</th>
              <th>Jourtid</th>
            </tr>
          </thead>
          <tbody>
            {j.months.map((m) => (
              <tr key={m.month}>
                <td>{MONTHS[Number(m.month.slice(5, 7)) - 1]}</td>
                <td>{h(m.ordinaryHours)}</td>
                <td>{h(m.overtime.allman)}</td>
                <td>{h(m.overtime.extra)}</td>
                <td>{h(m.overtime.nodfall)}</td>
                <td>{h(m.overtime.derived)}</td>
                <td>{h(m.mertid.labelled)}</td>
                <td>{h(m.mertid.derived)}</td>
                <td>{h(m.jourHours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
