import { test } from "node:test";
import assert from "node:assert/strict";
import { doneShare, hoursAmount, invoicedNet, projectMargin, type InvoicedLike, type PhaseShareLike } from "./economy";

const phase = (days: number, done: boolean, ata = false): PhaseShareLike => ({ duration_days: days, done_at: done ? "2026-10-01T10:00:00Z" : null, change_order_id: ata ? "c" : null });
const inv = (totalOre: number, vatOre: number, extra: Partial<InvoicedLike> = {}): InvoicedLike => ({ kind: "invoice", status: "issued", totalOre, vatOre, lines: [], ...extra });

test("hours rows: hours × rate", () => {
  assert.equal(hoursAmount(7.5, 45_000), 337_500);
  assert.equal(hoursAmount(0, 45_000), 0);
  assert.throws(() => hoursAmount(-1, 45_000));
});

test("done share weighs phases by days and leaves ÄTA phases out", () => {
  assert.equal(doneShare([]), 0);
  assert.equal(doneShare([phase(2, true), phase(6, false)]), 0.25);
  assert.equal(doneShare([phase(2, true), phase(6, false), phase(10, true, true)]), 0.25);
  assert.equal(doneShare([phase(0, true), phase(0, false)]), 0.5);
  assert.equal(doneShare([phase(3, true), phase(1, true)]), 1);
});

test("invoiced excl. VAT counts issued invoices and credit notes, not drafts", () => {
  assert.equal(invoicedNet([inv(125_000, 25_000), inv(-25_000, -5_000, { kind: "credit" }), inv(50_000, 10_000, { status: "draft" })]), 80_000);
});

test("margin: contribution, percent and earned but not invoiced", () => {
  const m = projectMargin({
    quoteNetOre: 10_000_000,
    phases: [phase(4, true), phase(4, true), phase(2, false)],
    invoices: [inv(3_750_000, 750_000)],
    costs: [
      { kind: "supplier", amountOre: 1_200_000 },
      { kind: "hours", amountOre: 600_000 },
      { kind: "material", amountOre: -100_000 },
    ],
  });
  assert.equal(m.costs, 1_700_000);
  assert.equal(m.costsByKind.supplier, 1_200_000);
  assert.equal(m.invoicedNet, 3_000_000);
  assert.equal(m.contribution, 1_300_000);
  assert.equal(m.marginPercent, 43.3);
  assert.equal(m.doneShare, 0.8);
  assert.equal(m.earned, 8_000_000);
  assert.equal(m.earnedNotInvoiced, 5_000_000);
});

test("invoiced ahead of the work is negative; ÄTA lines are not compared with the quote", () => {
  const ata = { unitPriceOre: 400_000, quantity: 1, changeOrderId: "11111111-1111-4111-8111-111111111111" };
  const m = projectMargin({
    quoteNetOre: 1_000_000,
    phases: [phase(1, true), phase(1, false)],
    invoices: [inv(875_000, 175_000, { lines: [{ unitPriceOre: 300_000, quantity: 1, changeOrderId: null }, ata] })],
    costs: [],
  });
  // 700 000 invoiced excl. VAT, of which 400 000 ÄTA: 300 000 of the quote against 500 000 earned.
  assert.equal(m.earnedNotInvoiced, 200_000);
  const ahead = projectMargin({ quoteNetOre: 1_000_000, phases: [phase(1, false)], invoices: [inv(375_000, 75_000)], costs: [] });
  assert.equal(ahead.earnedNotInvoiced, -300_000);
  assert.equal(ahead.marginPercent, 100);
  assert.equal(projectMargin({ quoteNetOre: null, phases: [], invoices: [], costs: [] }).marginPercent, null);
});
