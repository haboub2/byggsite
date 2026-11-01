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
  // The invoice carried the clause (document.se.reminderFeeOre).
  reminderFeeOre: 6_000,
};

test("not due before the grace period, due after it", () => {
  assert.equal(daysOverdue(base, "2026-10-12"), 0);
  assert.equal(daysOverdue(base, "2026-10-19"), 7);
  assert.equal(reminderDue(base, "2026-10-14"), null); // 2 days, grace is 3
  const plan = reminderDue(base, "2026-10-19")!;
  assert.equal(plan.level, 1);
  assert.equal(plan.daysOverdue, 7);
  assert.equal(plan.feeOre, 6_000);
  // Riksbanken: 2,00 % from 2026-07-01, plus 8.
  assert.equal(plan.interestPercent, 10);
  // 42 500 × 10 % × 7 / 365 = 81,51 kr
  assert.equal(plan.interestOre, 8_151);
  assert.equal(plan.interestFrom, "2026-10-12");
  assert.equal(plan.lastBeforeCollection, false);
  assert.equal(plan.rateAssumed, false);
  assert.equal(reminderDue(base, "2027-03-01")!.rateAssumed, true);
});

test("the fee is only what the invoice agreed, never above 60 kr, for businesses and consumers alike", () => {
  // No clause on the invoice: no fee, whoever the debtor is (lag 1981:739 2 §).
  assert.equal(reminderDue({ ...base, reminderFeeOre: 0 }, "2026-10-19")!.feeOre, 0);
  assert.equal(reminderDue({ ...base, reminderFeeOre: undefined }, "2026-10-19")!.feeOre, 0);
  assert.equal(reminderDue({ ...base, customerType: "privat", reminderFeeOre: 0 }, "2026-10-19")!.feeOre, 0);
  // A clause on a consumer invoice: the fee may be charged.
  assert.equal(reminderDue({ ...base, customerType: "privat", reminderFeeOre: 6_000 }, "2026-10-19")!.feeOre, 6_000);
  // Never above the statutory ceiling.
  assert.equal(reminderDue({ ...base, reminderFeeOre: 9_900 }, "2026-10-19")!.feeOre, 6_000);
  assert.ok(reminderText(reminderDue(base, "2026-10-19")!, "10020", "2026-10-12").includes("enligt fakturans villkor"));
  assert.ok(!reminderText(reminderDue(base, "2026-10-19")!, "10020", "2026-10-12").includes("enligt lag"));
});

test("against a consumer, interest runs at the earliest 30 days after the invoice (räntelagen 4 §)", () => {
  // Ten-day terms: due 2026-09-22, but interest from 2026-10-12.
  const short = { ...base, customerType: "privat" as const, dueOn: "2026-09-22" };
  const plan = reminderDue(short, "2026-10-19")!;
  assert.equal(plan.interestFrom, "2026-10-12");
  assert.equal(plan.interestOre, 8_151);
  // A reminder before that day charges no interest at all.
  assert.equal(reminderDue(short, "2026-10-05")!.interestOre, 0);
  // Thirty-day terms or more: from the due date, as for businesses.
  assert.equal(reminderDue({ ...base, customerType: "privat" }, "2026-10-19")!.interestFrom, "2026-10-12");
  assert.equal(reminderDue({ ...base, dueOn: "2026-09-22" }, "2026-10-19")!.interestFrom, "2026-09-22");
});

test("interest can be switched off, and no credit notes", () => {
  const privat = reminderDue({ ...base, customerType: "privat" }, "2026-10-19")!;
  assert.ok(privat.interestOre > 0);
  const off = reminderDue({ ...base, customerType: "privat" }, "2026-10-19", { graceDays: 3, daysBetween: 10, chargeInterest: false, maxReminders: 2 })!;
  assert.equal(off.interestOre, 0);
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
