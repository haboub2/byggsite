import { requireRole } from "@/lib/admin";
import { todayIso } from "@/lib/quotes/schema";
import { toCsv } from "@/lib/csv";
import { listEmployments } from "@/lib/core/hr/store";
import { listSchedules, listTimeEntries, timePeople } from "@/lib/core/hr/time-store";
import { overtimeJournal } from "@/lib/core/hr/time";
import { personWorkingTimes } from "@/lib/core/hr/working-time";

/** The övertidsjournal (ATL 11 §) for a year as CSV, one row per person and month. For those who read payroll. */
export async function GET(_request: Request, { params }: { params: Promise<{ year: string }> }) {
  const check = await requireRole("payroll");
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });
  const year = Number((await params).year);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return new Response("Okänt år.", { status: 404 });
  const today = todayIso();
  const to = `${year}-12-31`;
  const [entries, people, versions, schedules] = await Promise.all([listTimeEntries({ from: `${year}-01-01`, to }), timePeople(), listEmployments(), listSchedules()]);
  const name = new Map(people.map((p) => [p.id, p.name]));
  const journal = overtimeJournal(entries, { year, people: personWorkingTimes(versions, schedules, to < today ? to : today) });
  const hours = (n: number) => String(n).replace(".", ",");
  const rows = journal.flatMap((j) =>
    j.months.map((m) => [name.get(j.employeeId) ?? j.employeeId, m.month, hours(m.ordinaryHours), hours(m.overtime.allman), hours(m.overtime.extra), hours(m.overtime.nodfall), hours(m.overtime.derived), hours(m.mertid.labelled), hours(m.mertid.derived), hours(m.jourHours), hours(j.overtimeHours), j.overtimeLimit, hours(j.mertidHours), j.mertidLimit, hours(j.jourHours)])
  );
  const csv = toCsv(["Person", "Månad", "Ordinarie h", "Allmän övertid h", "Extra övertid h", "Nödfallsövertid h", "Övertid utan märkning h", "Mertid h", "Mertid utan märkning h", "Jourtid h", "Övertid året h", "Tak övertid h", "Mertid året h", "Tak mertid h", "Jourtid året h"], rows);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="Overtidsjournal-${year}.csv"`, "Cache-Control": "private, no-store" } });
}
