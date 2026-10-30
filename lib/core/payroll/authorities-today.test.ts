import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePayrollSettings } from "./settings";
import { authorityTodos } from "./authorities-today";

const base = { agiPeriods: [], filedAgi: new Set<string>(), foraPeriods: [], filedFora: new Set<string>(), fk: [], names: new Map([["erik", "Erik"]]), settings: parsePayrollSettings({}) };

test("the AGI shows ten days before the declaration day until it is filed; the 26th for a large employer", () => {
  assert.equal(authorityTodos({ ...base, agiPeriods: ["2026-11"], today: "2026-12-03" }).length, 0);
  const [r] = authorityTodos({ ...base, agiPeriods: ["2026-11"], today: "2026-12-04" });
  assert.match(r.title, /november 2026/);
  assert.match(r.meta, /2026-12-14 \(om 10 dagar\)/);
  assert.equal(authorityTodos({ ...base, agiPeriods: ["2026-11"], filedAgi: new Set(["2026-11"]), today: "2026-12-10" }).length, 0);
  assert.equal(authorityTodos({ ...base, agiPeriods: ["2026-11"], settings: parsePayrollSettings({ agi: { largeEmployer: true } }), today: "2026-12-10" }).length, 0);
});

test("Fora two weeks before the last day of the month after; Försäkringskassan's sjukanmälan with its deadline", () => {
  assert.deepEqual(authorityTodos({ ...base, foraPeriods: ["2026-11"], today: "2026-12-17" }).map((t) => t.id), ["fora-2026-11"]);
  assert.equal(authorityTodos({ ...base, foraPeriods: ["2026-11"], today: "2026-12-16" }).length, 0);
  const fk = authorityTodos({
    ...base,
    fk: [{ id: "fk-sick-erik", kind: "sick-report", employeeId: "erik", from: "2026-10-01", dueFrom: "2026-10-15", dueBy: "2026-10-21", absenceIds: [] }],
    today: "2026-10-20",
  });
  assert.match(fk[0].title, /Erik: anmäl sjukfallet/);
  assert.match(fk[0].meta, /senast 2026-10-21 \(i morgon\)/);
});
