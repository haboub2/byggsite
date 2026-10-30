/**
 * The time rows on Idag (docs/hr-lon.md, section 11): sick periods past day
 * 8 without a läkarintyg, call-ins nobody has answered, and time waiting
 * for approval. Pure; lib/admin/today.ts reads the data (RLS decides whose:
 * a project leader sees their projects' time, only payroll readers see
 * absence) and turns these into to-do rows.
 */

import { daysBetween, type IsoDate } from "../rules/index";
import type { CertificateDue } from "./absence";
import type { TimeEntry } from "./time";

export type TimeTodo = {
  id: string;
  kind: "certificate" | "call-in" | "approval";
  tag: string;
  title: string;
  meta: string;
  href: string;
  /** Sorts the rows: lower first. */
  weight: number;
};

type ShiftLike = { id: string; date: IsoDate; start: string; end: string; offers: { status: string }[] };

const fmtHours = (h: number) => `${String(Math.round(h * 100) / 100).replace(".", ",")} h`;

export function timeTodos(input: {
  names: ReadonlyMap<string, string>;
  certificates: readonly CertificateDue[];
  /** Open offers (offered, not taken, deadline not passed). */
  openShifts: readonly ShiftLike[];
  waiting: readonly TimeEntry[];
  today: IsoDate;
}): TimeTodo[] {
  const name = (id: string) => input.names.get(id) ?? "Okänd person";
  const out: TimeTodo[] = [];
  for (const c of input.certificates) {
    const late = daysBetween(c.dueFrom, input.today);
    out.push({
      id: `cert-${c.employeeId}-${c.firstDay}`,
      kind: "certificate",
      tag: "Läkarintyg",
      title: `${name(c.employeeId)}: läkarintyg saknas`,
      meta: `Sjuk sedan ${c.firstDay}; intyg krävs från dag 8 (${c.dueFrom}${late > 0 ? `, ${late} dagar sedan` : ", i dag"}).`,
      href: `/admin/personal/${c.employeeId}?flik=franvaro`,
      weight: 4,
    });
  }
  for (const s of input.openShifts) {
    const answered = s.offers.filter((o) => o.status !== "offered").length;
    const until = daysBetween(input.today, s.date);
    out.push({
      id: `callin-${s.id}`,
      kind: "call-in",
      tag: "Inringning",
      title: `Pass ${s.date} kl. ${s.start}–${s.end} är inte tillsatt`,
      meta: `${answered} av ${s.offers.length} har svarat, ingen har tackat ja${until <= 1 ? " · passet är " + (until <= 0 ? "i dag" : "i morgon") : ""}.`,
      href: `/admin/tid?vecka=${s.date}`,
      weight: until <= 1 ? 3 : 8,
    });
  }
  const byPerson = new Map<string, TimeEntry[]>();
  for (const e of input.waiting) byPerson.set(e.employeeId, [...(byPerson.get(e.employeeId) ?? []), e]);
  for (const [employeeId, rows] of byPerson) {
    const first = rows.reduce((m, e) => (e.workDate < m ? e.workDate : m), rows[0].workDate);
    const hours = rows.reduce((a, e) => a + e.hours, 0);
    out.push({
      id: `approve-${employeeId}`,
      kind: "approval",
      tag: "Tid",
      title: `${name(employeeId)}: ${rows.length === 1 ? "1 tidrad" : `${rows.length} tidrader`} väntar på godkännande`,
      meta: `${fmtHours(hours)} sedan ${first}.`,
      href: `/admin/tid?vecka=${first}`,
      weight: daysBetween(first, input.today) > 7 ? 5 : 9,
    });
  }
  return out.sort((a, b) => a.weight - b.weight || a.id.localeCompare(b.id));
}
