import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduleFromRules, type Absence } from "./absence";
import { vacationBalances } from "./balances";
import type { EmploymentVersion } from "./schema";

const LAW = { startMonthDay: "04-01", earning: "previous-year" as const };
const MON_FRI = scheduleFromRules([1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "07:00", end: "16:00", breakMinutes: 60 })));
const version = (startsOn: string, over: Partial<EmploymentVersion> = {}) =>
  ({ id: "v", employeeId: "erik", contractId: "c", version: 1, form: "tillsvidare", startsOn, endsOn: null, validFrom: startsOn, validTo: null, vacationRule: "sammalon", vacationDays: 25, ...over }) as EmploymentVersion;
const semester = (id: string, from: string, to: string): Absence => ({
  id,
  employeeId: "erik",
  kind: "semester",
  from,
  to,
  extent: 1,
  certificateReceivedOn: null,
  sickPeriodId: null,
  note: "",
  approvedAt: null,
  createdAt: "",
});

test("hired 1 January 2025: 7 paid days for 2025/26 (90 of 365 days), 25 for 2026/27, 15 taken", () => {
  // 7 §: 25 × 90 / 365 = 6,16 → 7 (rounded up).
  const rows = vacationBalances({ model: LAW, versions: [version("2025-01-01")], absences: [semester("s", "2026-07-06", "2026-07-24")], schedule: MON_FRI, asOf: "2026-10-30" });
  assert.deepEqual(rows.map((r) => [r.yearFrom, r.earnedFrom, r.earnedDays, r.takenDays, r.remainingDays, r.current]), [
    ["2024-04-01", "2023-04-01", 0, 0, 0, false],
    ["2025-04-01", "2024-04-01", 7, 0, 7, false],
    ["2026-04-01", "2025-04-01", 25, 15, 10, true],
  ]);
  // Fewer than 20 days in a year: nothing to save.
  assert.equal(rows[1].savedDays, 0);
});

test("five days saved from a year with 20 taken, then used the year after", () => {
  const absences = [semester("a", "2024-07-01", "2024-07-26"), semester("b", "2025-07-07", "2025-08-08"), semester("c", "2025-12-29", "2025-12-30")];
  const rows = vacationBalances({ model: LAW, versions: [version("2023-01-01")], absences, schedule: MON_FRI, asOf: "2026-10-30" });
  const y2024 = rows.find((r) => r.yearFrom === "2024-04-01");
  const y2025 = rows.find((r) => r.yearFrom === "2025-04-01");
  assert.ok(y2024 && y2025);
  assert.deepEqual([y2024.earnedDays, y2024.takenDays, y2024.savedDays], [25, 20, 5]);
  // 27 taken against 25 earned: 2 from the saved, and a year with saved days taken saves none.
  assert.deepEqual([y2025.earnedDays, y2025.takenDays, y2025.savedInDays, y2025.takenFromSavedDays, y2025.savedDays, y2025.remainingDays], [25, 27, 5, 2, 0, 3]);
});

test("a calendar-year model earned the same year, and tjänstledighet that does not earn", () => {
  const tjl: Absence = { ...semester("t", "2026-02-01", "2026-03-02"), kind: "tjanstledig" };
  const rows = vacationBalances({ model: { startMonthDay: "01-01", earning: "same-year" }, versions: [version("2026-01-01")], absences: [tjl], schedule: MON_FRI, asOf: "2026-10-30" });
  // 365 − 30 days wholly absent = 335; 25 × 335 / 365 = 22,95 → 23.
  assert.deepEqual(rows.map((r) => [r.yearFrom, r.earnedDays]), [["2026-01-01", 23]]);
});

test("styrelseuppdrag gives no semester", () => {
  assert.deepEqual(vacationBalances({ model: LAW, versions: [version("2026-01-01", { form: "uppdrag", vacationRule: "none", vacationDays: 0 })], absences: [], schedule: null, asOf: "2026-10-30" }), []);
});
