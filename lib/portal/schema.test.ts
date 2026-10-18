import { test } from "node:test";
import assert from "node:assert/strict";
import { changeOrderFormSchema, changeOrderRot, formatKr, pendingChangeOrders, type ChangeOrder } from "./schema";

const order = (patch: Partial<ChangeOrder>): ChangeOrder => ({
  id: "x",
  project_id: "p",
  number: 1,
  title: "T",
  description: "",
  amount: 0,
  labor_amount: 0,
  status: "pending",
  answered_by: null,
  answered_name: null,
  answered_at: null,
  created_at: "2026-10-18T10:00:00.000Z",
  ...patch,
});

test("ROT on a change order is 30 % of the labour part, whole kronor", () => {
  assert.deepEqual(changeOrderRot({ amount: 9800, labor_amount: 6500 }), { rot: 1950, pay: 7850 });
  assert.deepEqual(changeOrderRot({ amount: 5000, labor_amount: 0 }), { rot: 0, pay: 5000 });
  // 30 % of 1001 = 300.3 → 300
  assert.deepEqual(changeOrderRot({ amount: 1001, labor_amount: 1001 }), { rot: 300, pay: 701 });
});

test("a negative change order (less work) lowers the ROT deduction", () => {
  assert.deepEqual(changeOrderRot({ amount: -4000, labor_amount: -3000 }), { rot: -900, pay: -3100 });
});

test("only pending orders count towards the badge", () => {
  const list = [order({ status: "approved" }), order({ id: "y", status: "pending" }), order({ id: "z", status: "declined" })];
  assert.deepEqual(
    pendingChangeOrders(list).map((o) => o.id),
    ["y"]
  );
});

test("the admin form coerces amounts and rejects labour above the price", () => {
  const ok = changeOrderFormSchema.safeParse({ title: "Golvvärme i hallen", description: "", amount: "9800", labor_amount: "6500" });
  assert.equal(ok.success, true);
  if (ok.success) assert.deepEqual([ok.data.amount, ok.data.labor_amount], [9800, 6500]);

  const tooMuchLabor = changeOrderFormSchema.safeParse({ title: "X", description: "", amount: "1000", labor_amount: "2000" });
  assert.equal(tooMuchLabor.success, false);

  const noTitle = changeOrderFormSchema.safeParse({ title: "", description: "", amount: "1000", labor_amount: "0" });
  assert.equal(noTitle.success, false);

  const decimals = changeOrderFormSchema.safeParse({ title: "X", description: "", amount: "100.50", labor_amount: "0" });
  assert.equal(decimals.success, false);
});

test("formatKr uses Swedish grouping and an ASCII minus", () => {
  assert.equal(formatKr(12500).replace(/ /g, " "), "12 500 kr");
  assert.equal(formatKr(-900).replace(/ /g, " "), "-900 kr");
});
