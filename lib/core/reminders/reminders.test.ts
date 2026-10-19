import { test } from "node:test";
import assert from "node:assert/strict";
import { daysOverdue, reminderDue, reminderText, type ReminderInput } from "./reminders";

const base: ReminderInput = {
  payableOre: 4_250_000,
  paidOre: 0,
  dueOn: "2026-10-12",
  issueDate: "2026-09-12",
  reminders: 0,
  remindedAt: null,
  customerType: "foretag",
  status: "sent",
  kind: "invoice",
};

test("not due before the grace period, due after it", () => {
  assert.equal(daysOverdue(base, "2026-10-12"), 0);
  assert.equal(daysOverdue(base, "2026-10-19"), 7);
  assert.equal(reminderDue(base, "2026-10-14"), null); // 2 days, grace is 3
  const plan = reminderDue(base, "2026-10-19")!;
  assert.equal(plan.level, 1);
  assert.equal(plan.daysOverdue, 7);
  assert.equal(plan.feeOre, 6_000);
  assert.equal(plan.interestPercent, 9.75);
  // 42 500 × 9,75 % × 7 / 365 = 79,47 kr
  assert.equal(plan.interestOre, 7_947);
  assert.equal(plan.interestFrom, "2026-10-12");
  assert.equal(plan.lastBeforeCollection, false);
});

test("private customers get no fee unless the terms say so, and no credit notes", () => {
  const privat = reminderDue({ ...base, customerType: "privat" }, "2026-10-19")!;
  assert.equal(privat.feeOre, 0);
  assert.ok(privat.interestOre > 0);
  const agreed = reminderDue({ ...base, customerType: "privat" }, "2026-10-19", { graceDays: 3, daysBetween: 10, feeToConsumers: true, chargeInterest: false, maxReminders: 2 })!;
  assert.equal(agreed.feeOre, 6_000);
  assert.equal(agreed.interestOre, 0);
  assert.equal(reminderDue({ ...base, kind: "credit" }, "2026-10-19"), null);
  assert.equal(reminderDue({ ...base, status: "paid" }, "2026-10-19"), null);
  assert.equal(reminderDue({ ...base, paidOre: 4_250_000 }, "2026-10-19"), null);
});

test("a second reminder waits for the interval and counts interest from the first", () => {
  const once = { ...base, reminders: 1, remindedAt: "2026-10-19T10:00:00Z" };
  assert.equal(reminderDue(once, "2026-10-25"), null);
  const plan = reminderDue(once, "2026-10-29")!;
  assert.equal(plan.level, 2);
  assert.equal(plan.interestFrom, "2026-10-19");
  assert.equal(plan.lastBeforeCollection, true);
  assert.ok(reminderText(plan, "10020", "2026-10-12").includes("inkasso"));
});

test("partial payments reduce the base", () => {
  const plan = reminderDue({ ...base, paidOre: 4_000_000, status: "partially_paid" }, "2026-10-19")!;
  assert.equal(plan.remainingOre, 250_000);
});
