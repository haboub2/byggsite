import { test } from "node:test";
import assert from "node:assert/strict";
import type { Absence } from "../hr/absence";
import { fkReminders } from "./fk";

let n = 0;
const absence = (a: Partial<Absence> & Pick<Absence, "kind" | "from" | "to">): Absence => ({
  id: `a${++n}`,
  employeeId: "erik",
  extent: 1,
  certificateReceivedOn: null,
  sickPeriodId: null,
  note: "",
  approvedAt: null,
  createdAt: "2026-10-01T00:00:00Z",
  ...a,
});

test("a sick period past day 14 must be reported to Försäkringskassan within seven days (sjuklönelagen 12 §)", () => {
  const open = [absence({ kind: "sjuk", from: "2026-10-01", to: null })];
  assert.deepEqual(fkReminders(open, "2026-10-14"), [], "day 14 is still the employer's");
  const [r] = fkReminders(open, "2026-10-15");
  assert.equal(r.kind, "sick-report");
  assert.equal(r.dueFrom, "2026-10-15");
  assert.equal(r.dueBy, "2026-10-21");
  // Ended on day 10: never reaches the report.
  assert.deepEqual(fkReminders([absence({ kind: "sjuk", from: "2026-10-01", to: "2026-10-10" })], "2026-10-30"), []);
});

test("återinsjuknande continues the count; the gap days are not sick days", () => {
  const spells = [absence({ kind: "sjuk", from: "2026-10-01", to: "2026-10-05" }), absence({ kind: "sjuk", from: "2026-10-08", to: null })];
  const [r] = fkReminders(spells, "2026-10-30");
  // Days 1–5, then 8 October is day 6: day 15 is 17 October.
  assert.equal(r.dueFrom, "2026-10-17");
  assert.equal(r.dueBy, "2026-10-23");
  assert.equal(r.from, "2026-10-01");
  assert.equal(r.absenceIds.length, 2);
});

test("a long-gone deadline drops off Idag; VAB and föräldraledighet are reminded while recent", () => {
  assert.deepEqual(fkReminders([absence({ kind: "sjuk", from: "2026-06-01", to: null })], "2026-10-30"), []);
  const rows = fkReminders(
    [absence({ kind: "vab", from: "2026-10-20", to: "2026-10-21" }), absence({ kind: "foraldraledig", from: "2026-09-01", to: "2026-12-31" }), absence({ kind: "semester", from: "2026-10-26", to: "2026-10-30" })],
    "2026-10-25",
  );
  assert.deepEqual(rows.map((r) => r.kind), ["vab"]);
  assert.equal(rows[0].dueBy, null);
});
