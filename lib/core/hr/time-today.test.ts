import { test } from "node:test";
import assert from "node:assert/strict";
import { timeTodos } from "./time-today";
import type { TimeEntry } from "./time";

const entry = (employeeId: string, workDate: string, hours: number) => ({ id: `${employeeId}-${workDate}`, employeeId, workDate, hours, status: "submitted" }) as TimeEntry;

test("Idag: a missing läkarintyg first, then a call-in tomorrow, then time waiting per person", () => {
  const todos = timeTodos({
    names: new Map([["erik", "Erik"], ["fatima", "Fatima"]]),
    certificates: [{ employeeId: "erik", firstDay: "2026-10-20", dueFrom: "2026-10-27", absenceIds: ["a"] }],
    openShifts: [{ id: "s1", date: "2026-10-31", start: "07:00", end: "16:00", offers: [{ status: "declined" }, { status: "offered" }] }],
    waiting: [entry("erik", "2026-10-19", 8), entry("erik", "2026-10-20", 7.5), entry("fatima", "2026-10-28", 4)],
    today: "2026-10-30",
  });
  assert.deepEqual(todos.map((t) => [t.kind, t.title]), [
    ["call-in", "Pass 2026-10-31 kl. 07:00–16:00 är inte tillsatt"],
    ["certificate", "Erik: läkarintyg saknas"],
    ["approval", "Erik: 2 tidrader väntar på godkännande"],
    ["approval", "Fatima: 1 tidrad väntar på godkännande"],
  ]);
  assert.equal(todos[0].meta, "1 av 2 har svarat, ingen har tackat ja · passet är i morgon.");
  assert.equal(todos[1].meta, "Sjuk sedan 2026-10-20; intyg krävs från dag 8 (2026-10-27, 3 dagar sedan).");
  assert.equal(todos[2].meta, "15,5 h sedan 2026-10-19.");
  assert.equal(todos[2].href, "/admin/tid?vecka=2026-10-19");
});
