import { test } from "node:test";
import assert from "node:assert/strict";
import { guessPhaseTemplate, resolvePhaseTemplate, BUILT_IN_PHASE_TEMPLATES } from "./phase-templates";
import { changeOrderFormSchema, delayFormSchema, timelineFormSchema, updateFormSchema } from "./schema";
import { changeOrderPhaseName, changeOrdersToSchedule, computeTimeline, movePlannedEnd, overduePhases, phaseForDay, shiftLine } from "./timeline";

const phase = (id: string, duration_days: number, change_order_id: string | null = null) => ({ id, duration_days, change_order_id });

test("dates follow the start and durations; the original end follows the plan while nothing moved it", () => {
  const t = computeTimeline({
    starts_on: "2026-10-19",
    works_saturdays: false,
    planned_ends_on: "",
    phases: [phase("a", 2), phase("b", 3), phase("c", 1)],
    shifts: [],
  });
  assert.deepEqual(t.phases, [
    { id: "a", starts_on: "2026-10-19", ends_on: "2026-10-20" },
    { id: "b", starts_on: "2026-10-21", ends_on: "2026-10-23" },
    { id: "c", starts_on: "2026-10-26", ends_on: "2026-10-26" },
  ]);
  assert.equal(t.ends_on, "2026-10-26");
  assert.equal(t.planned_ends_on, "2026-10-26");
});

test("a delay lengthens its phase, moves every later phase, and keeps the original end", () => {
  const t = computeTimeline({
    starts_on: "2026-10-19",
    works_saturdays: false,
    planned_ends_on: "2026-10-26",
    phases: [phase("a", 2), phase("b", 3), phase("c", 1)],
    shifts: [{ kind: "delay", phase_id: "a", days: 1 }],
  });
  assert.equal(t.phases[0].ends_on, "2026-10-21");
  assert.equal(t.phases[1].starts_on, "2026-10-22");
  assert.equal(t.ends_on, "2026-10-27");
  assert.equal(t.planned_ends_on, "2026-10-26");
});

test("a half-day delay moves later phases by half a day", () => {
  const t = computeTimeline({
    starts_on: "2026-10-19",
    works_saturdays: false,
    planned_ends_on: "",
    phases: [phase("a", 1), phase("b", 1)],
    shifts: [{ kind: "delay", phase_id: "a", days: 0.5 }],
  });
  assert.deepEqual([t.phases[1].starts_on, t.phases[1].ends_on], ["2026-10-20", "2026-10-21"]);
});

test("ÄTA time lives in its own phase; the shift line does not count twice", () => {
  const t = computeTimeline({
    starts_on: "2026-10-19",
    works_saturdays: false,
    planned_ends_on: "2026-10-23",
    phases: [phase("a", 2), phase("ata", 2, "co1"), phase("b", 3)],
    shifts: [{ kind: "change_order", phase_id: "ata", days: 2 }],
  });
  assert.equal(t.ends_on, "2026-10-27");
  assert.equal(t.planned_ends_on, "2026-10-23");
});

test("a project from before Tidplan 2.0 with shifts but no original end gets the plan without them", () => {
  const t = computeTimeline({
    starts_on: "2026-10-19",
    works_saturdays: false,
    planned_ends_on: "",
    phases: [phase("a", 2), phase("ata", 2, "co1"), phase("b", 3)],
    shifts: [
      { kind: "change_order", phase_id: "ata", days: 2 },
      { kind: "delay", phase_id: "b", days: 1 },
    ],
  });
  assert.equal(t.planned_ends_on, "2026-10-23");
  assert.equal(t.ends_on, "2026-10-28");
});

test("without a start date nothing has a date", () => {
  const t = computeTimeline({ starts_on: "", works_saturdays: false, planned_ends_on: "", phases: [phase("a", 2)], shifts: [] });
  assert.deepEqual(t.phases, [{ id: "a", starts_on: null, ends_on: null }]);
  assert.equal(t.ends_on, null);
});

test("Saturdays shorten the calendar", () => {
  const t = computeTimeline({ starts_on: "2026-10-19", works_saturdays: true, planned_ends_on: "", phases: [phase("a", 6)], shifts: [] });
  assert.equal(t.ends_on, "2026-10-24");
});

const dated = (id: string, starts_on: string, ends_on: string, done_at: string | null = null) => ({ id, starts_on, ends_on, done_at });

test("the composer's phase: the one running today, or the first not done when behind or ahead", () => {
  const phases = [dated("a", "2026-10-12", "2026-10-14", "x"), dated("b", "2026-10-15", "2026-10-20"), dated("c", "2026-10-21", "2026-10-23")];
  assert.equal(phaseForDay(phases, "2026-10-19")?.id, "b");
  assert.equal(phaseForDay(phases.map((p) => (p.id === "b" ? { ...p, done_at: "x" } : p)), "2026-10-22")?.id, "c");
  // Ahead of the calendar (a ticked early, today still in a's dates): the first not done.
  assert.equal(phaseForDay(phases, "2026-10-13")?.id, "b");
  // After the end with nothing ticked: the first not done.
  assert.equal(phaseForDay(phases, "2026-11-30")?.id, "b");
  // All done: the last.
  assert.equal(phaseForDay(phases.map((p) => ({ ...p, done_at: "x" })), "2026-10-19")?.id, "c");
  assert.equal(phaseForDay([], "2026-10-19"), null);
  // Behind: b should have ended on the 16th but isn't ticked, so b, not c that the calendar has running.
  const behind = [dated("a", "2026-10-12", "2026-10-14", "x"), dated("b", "2026-10-15", "2026-10-16"), dated("c", "2026-10-19", "2026-10-20")];
  assert.equal(phaseForDay(behind, "2026-10-19")?.id, "b");
});

test("overdue: not ticked and ended before today", () => {
  const phases = [dated("a", "2026-10-12", "2026-10-14", "x"), dated("b", "2026-10-15", "2026-10-16"), dated("c", "2026-10-19", "2026-10-20")];
  assert.deepEqual(overduePhases(phases, "2026-10-19").map((p) => p.id), ["b"]);
  assert.deepEqual(overduePhases(phases, "2026-10-16").map((p) => p.id), []);
});

test("shift lines read as the customer sees them", () => {
  assert.equal(shiftLine({ days: 2, reason: "ÄTA 2: Extra eluttag, godkänd av kunden 21 okt" }), "+2 dagar, ÄTA 2: Extra eluttag, godkänd av kunden 21 okt");
  assert.equal(shiftLine({ days: 1, reason: "kakelleverans försenad" }), "+1 dag, kakelleverans försenad");
  assert.equal(shiftLine({ days: 0.5, reason: "" }), "+0,5 dag");
});

test("approved ÄTA with time and no phase yet are the ones to schedule", () => {
  const orders = [
    { id: "1", status: "approved", duration_days: 2 },
    { id: "2", status: "approved", duration_days: 0 },
    { id: "3", status: "pending", duration_days: 1 },
    { id: "4", status: "approved", duration_days: 1 },
    { id: "5", status: "declined", duration_days: 3 },
  ];
  assert.deepEqual(changeOrdersToSchedule(orders, [{ change_order_id: "4" }, { change_order_id: null }]).map((o) => o.id), ["1"]);
  assert.equal(changeOrderPhaseName({ number: 12, title: "x".repeat(100) }).length, 80);
});

test("templates: every built-in has phases in half days; quote titles suggest one", () => {
  for (const t of BUILT_IN_PHASE_TEMPLATES) {
    assert.ok(t.phases.length > 0, t.key);
    for (const p of t.phases) assert.ok(Number.isInteger(p.days * 2) && p.days > 0, `${t.key}: ${p.name}`);
  }
  assert.equal(guessPhaseTemplate("Badrumsrenovering"), "builtin:badrum");
  assert.equal(guessPhaseTemplate("Nytt kök i villan"), "builtin:kok");
  assert.equal(guessPhaseTemplate("Takbyte, tegel"), "builtin:tak");
  assert.equal(guessPhaseTemplate("Attefallshus"), "builtin:tillbyggnad");
  assert.equal(guessPhaseTemplate("Något helt annat"), "builtin:fritt");
  assert.equal(resolvePhaseTemplate("builtin:kok", [])[0].name, "Uppstart och skydd");
  assert.equal(resolvePhaseTemplate("saved:x", [{ id: "x", name: "Egen", job_type: "", phases: [{ name: "Ett", days: 1 }], created_at: "" }])[0].name, "Ett");
  assert.equal(resolvePhaseTemplate("saved:gone", []).length, 3); // falls back to the empty plan
});

test("durations accept Swedish decimals in half-day steps", () => {
  const ok = timelineFormSchema.safeParse({ starts_on: "2026-10-19", works_saturdays: false, phases: [{ id: null, name: "Rivning", duration_days: "1,5" }] });
  assert.equal(ok.success, true);
  if (ok.success) assert.equal(ok.data.phases[0].duration_days, 1.5);
  assert.equal(timelineFormSchema.safeParse({ starts_on: "", works_saturdays: false, phases: [{ id: null, name: "X", duration_days: "1,3" }] }).success, false);
  assert.equal(timelineFormSchema.safeParse({ starts_on: "2026-02-30", works_saturdays: false, phases: [] }).success, false);
  assert.equal(timelineFormSchema.safeParse({ starts_on: "", works_saturdays: false, phases: [{ id: null, name: "", duration_days: 1 }] }).success, false);
});

test("a delay needs at least half a day and a reason", () => {
  assert.equal(delayFormSchema.safeParse({ days: "1", reason: "Kakelleveransen är försenad." }).success, true);
  assert.equal(delayFormSchema.safeParse({ days: "0", reason: "x" }).success, false);
  assert.equal(delayFormSchema.safeParse({ days: "1", reason: " " }).success, false);
});

test("ÄTA time defaults to 0 and takes half days", () => {
  const base = { title: "X", description: "", amount: "1000", labor_amount: "0" };
  const none = changeOrderFormSchema.safeParse(base);
  assert.equal(none.success && none.data.duration_days, 0);
  const two = changeOrderFormSchema.safeParse({ ...base, duration_days: "2" });
  assert.equal(two.success && two.data.duration_days, 2);
  assert.equal(changeOrderFormSchema.safeParse({ ...base, duration_days: "0,7" }).success, false);
});

test("an update needs a valid day", () => {
  assert.equal(updateFormSchema.safeParse({ body: "Klart", photos: [], phase_id: null, day: "2026-10-19" }).success, true);
  assert.equal(updateFormSchema.safeParse({ body: "Klart", photos: [], phase_id: "p", day: "" }).success, false);
});

test("moving the start moves the original end by the same working days", () => {
  // Start Wed 7 Oct → Fri 2 Oct is 3 working days earlier.
  assert.equal(movePlannedEnd("2026-10-26", "2026-10-07", "2026-10-02"), "2026-10-21");
  assert.equal(movePlannedEnd("2026-10-21", "2026-10-02", "2026-10-07"), "2026-10-26");
  // A weekend start counts from the Monday it really starts.
  assert.equal(movePlannedEnd("2026-10-30", "2026-10-19", "2026-10-24"), "2026-11-06");
  assert.equal(movePlannedEnd("2026-10-30", "", "2026-10-24"), "2026-10-30");
  assert.equal(movePlannedEnd("", "2026-10-19", "2026-10-24"), "");
});
