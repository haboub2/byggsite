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

test("phase 5: Collectum two weeks before its cutoff until filed, and claims waiting for approval per person", () => {
  const c = authorityTodos({ ...base, collectumPeriods: ["2026-11"], filedCollectum: new Set(), today: "2026-11-30" });
  assert.deepEqual(c.map((r) => [r.kind, r.meta.slice(0, 40)]), [["collectum", "Före avstämningen kl. 22 den 2026-12-14 "]]);
  assert.equal(authorityTodos({ ...base, collectumPeriods: ["2026-11"], filedCollectum: new Set(), today: "2026-11-29" }).length, 0);
  assert.equal(authorityTodos({ ...base, collectumPeriods: ["2026-11"], filedCollectum: new Set(["2026-11"]), today: "2026-12-10" }).length, 0);
  const [w] = authorityTodos({ ...base, names: new Map([["e1", "Erik"]]), waitingClaims: [{ employeeId: "e1", count: 2, oldest: "2026-11-02" }], today: "2026-11-05" });
  assert.equal(w.title, "Erik: 2 utlägg väntar på godkännande");
  assert.equal(w.href, "/admin/personal/e1?flik=utlagg");
});
