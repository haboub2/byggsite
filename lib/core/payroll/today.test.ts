import { test } from "node:test";
import assert from "node:assert/strict";
import { payrollTodos } from "./today";

const settings = { payDay: 25 };

test("a run is due from five workdays before pay day until something is computed", () => {
  assert.equal(payrollTodos({ runs: [], settings, today: "2026-11-17", canApprove: true, hasPeople: true }).length, 0);
  const due = payrollTodos({ runs: [], settings, today: "2026-11-18", canApprove: true, hasPeople: true });
  assert.deepEqual(due.map((t) => t.kind), ["run-due"]);
  assert.match(due[0].title, /november 2026/);
  const draft = { id: "r", periodStart: "2026-11-01", payDate: "2026-11-25", agiPeriod: "2026-11", status: "draft", totals: {} };
  assert.equal(payrollTodos({ runs: [draft], settings, today: "2026-11-20", canApprove: true, hasPeople: true })[0].href, "/admin/lon/r");
  assert.equal(payrollTodos({ runs: [{ ...draft, status: "approved" }], settings, today: "2026-11-20", canApprove: true, hasPeople: true }).filter((t) => t.kind === "run-due").length, 0);
  assert.equal(payrollTodos({ runs: [], settings, today: "2026-11-20", canApprove: true, hasPeople: false }).length, 0);
});

test("a computed run waits for an approver; the skattekonto payment shows three weeks ahead", () => {
  const calc = { id: "r", periodStart: "2026-11-01", payDate: "2026-11-25", agiPeriod: "2026-11", status: "calculated", totals: { taxOre: 1_185_000, employerContributionOre: 1_571_000 } };
  assert.deepEqual(payrollTodos({ runs: [calc], settings, today: "2026-11-20", canApprove: true, hasPeople: true }).map((t) => t.kind), ["approve"]);
  assert.equal(payrollTodos({ runs: [calc], settings, today: "2026-11-20", canApprove: false, hasPeople: true }).length, 0);
  // December 2026's AGI is due 18 January 2027 (agiDueDate); November's on 14 December.
  const tax = payrollTodos({ runs: [{ ...calc, status: "closed" }], settings, today: "2026-12-01", canApprove: true, hasPeople: false });
  assert.equal(tax.length, 1);
  assert.match(tax[0].title, /27 560 kr/);
  assert.match(tax[0].meta, /2026-12-14/);
});
