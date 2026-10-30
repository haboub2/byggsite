import { test } from "node:test";
import assert from "node:assert/strict";
import { hrTodos } from "./today";
import { clocksForVersions } from "./clocks";
import { payrollRulesAt } from "../rules/payroll";
import type { Employee, EmploymentVersion } from "./schema";

const rules = payrollRulesAt("2026-10-30");
const person = (id: string, name: string) => ({ id, name, endedAt: null }) as Employee;
const v = (employeeId: string, contractId: string, x: Partial<EmploymentVersion>) =>
  ({ id: contractId, employeeId, contractId, version: 1, form: "sava", startsOn: "2026-01-01", endsOn: null, validFrom: x.startsOn ?? "2026-01-01", validTo: null, probationEndsOn: null, ...x }) as EmploymentVersion;

test("Idag: a SÄVA converting within 30 days, a provanställning ending within 14, a contract ending within 30", () => {
  const today = "2026-12-10";
  const versions = [
    v("s", "s1", { form: "sava", startsOn: "2026-01-01", endsOn: null }), // converts 2027-01-01
    v("p", "p1", { form: "provanstallning", startsOn: "2026-06-20", probationEndsOn: "2026-12-19" }),
    v("e", "e1", { form: "vikariat", startsOn: "2026-09-01", endsOn: "2026-12-31", substituteFor: "Gustav" }),
    v("q", "q1", { form: "sava", startsOn: "2026-11-01", endsOn: "2027-03-31" }), // far from the limit, ends later
  ];
  const employees = [person("s", "Sara"), person("p", "Per"), person("e", "Eva"), person("q", "Qasim")];
  const clocks = new Map(employees.map((e) => [e.id, clocksForVersions(versions.filter((x) => x.employeeId === e.id), today, rules)]));
  const todos = hrTodos({ employees, versions, clocks, today });
  assert.deepEqual(
    todos.map((t) => [t.kind, t.employeeId, t.days]),
    [
      ["probation", "p", 9],
      ["contract-end", "e", 21],
      ["clock", "s", 22],
    ]
  );
  assert.match(todos[0].meta, /Sista dag för besked var 2026-12-05; blir tillsvidare 2026-12-20/);
  assert.match(todos[2].title, /Sara: SÄVA blir tillsvidare 2027-01-01/);
});
