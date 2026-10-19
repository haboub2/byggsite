import { test } from "node:test";
import assert from "node:assert/strict";
import { grossTotal, kindTotals, projectEconomy, stepGross, stepInvoiceLines, stepIsBillable } from "./billing";
import type { PaymentPlanStep } from "./schema";
import type { InvoiceLine } from "../documents/invoice";
import { invoiceTotals } from "../invoices/totals";
import { newInvoiceDocument } from "../documents/invoice";

const L = (id: string, kind: InvoiceLine["kind"], net: number, quantity = 1): InvoiceLine => ({
  id,
  description: id,
  quantity,
  unit: "st",
  unitPriceOre: net,
  vatCategory: "S",
  vatRate: 25,
  kind,
  section: "",
  changeOrderId: null,
});

// Offert 1042: 170 000 kr incl. VAT = 136 000 net: labour 80 000, material 56 000.
const quoteLines = [L("a", "labor", 8_000_000), L("b", "material", 5_600_000)];

const step = (patch: Partial<PaymentPlanStep>): PaymentPlanStep => ({
  id: "s",
  planId: "p",
  sort: 0,
  label: "",
  percent: null,
  amountOre: null,
  phaseId: null,
  dueRule: "on_start",
  dueOn: null,
  laborShare: null,
  invoiceId: null,
  createdAt: "",
  ...patch,
});

test("quote totals per kind and gross", () => {
  assert.deepEqual(kindTotals(quoteLines), { labor: 8_000_000, material: 5_600_000, other: 0 });
  assert.equal(grossTotal(quoteLines), 17_000_000);
});

test("billability follows the rule", () => {
  const phases = [{ id: "ph1", done_at: null }, { id: "ph2", done_at: "2026-10-10" }];
  const active = { status: "active" as const };
  assert.equal(stepIsBillable(step({ dueRule: "on_start" }), phases, active, "2026-10-19").ok, true);
  assert.equal(stepIsBillable(step({ dueRule: "on_phase_done", phaseId: "ph1" }), phases, active, "2026-10-19").ok, false);
  assert.equal(stepIsBillable(step({ dueRule: "on_phase_done", phaseId: "ph2" }), phases, active, "2026-10-19").ok, true);
  assert.equal(stepIsBillable(step({ dueRule: "on_date", dueOn: "2026-10-20" }), phases, active, "2026-10-19").ok, false);
  assert.equal(stepIsBillable(step({ dueRule: "on_date", dueOn: "2026-10-19" }), phases, active, "2026-10-19").ok, true);
  assert.equal(stepIsBillable(step({ dueRule: "on_completion" }), phases, active, "2026-10-19").ok, false);
  assert.equal(stepIsBillable(step({ dueRule: "on_completion" }), phases, { status: "done" }, "2026-10-19").ok, true);
  assert.equal(stepIsBillable(step({ dueRule: "on_start", invoiceId: "x" }), phases, active, "2026-10-19").reason, "Fakturerad");
});

test("a 30 % step takes 30 % of each kind, so ROT stays proportional", () => {
  const lines = stepInvoiceLines({ step: step({ percent: 30 }), stepIndex: 0, stepCount: 3, quoteLines, quoteNumber: 1042, invoicedByKind: { labor: 0, material: 0, other: 0 }, changeOrders: [] });
  assert.equal(lines.length, 2);
  assert.equal(lines[0].kind, "labor");
  assert.equal(lines[0].unitPriceOre, 2_400_000);
  assert.equal(lines[1].unitPriceOre, 1_680_000);
  assert.ok(lines[0].description.includes("30 %"));
  assert.ok(lines[0].description.includes("steg 1 av 3"));
  // Gross of the step = 30 % of 170 000 = 51 000
  const doc = newInvoiceDocument({ issueDate: "2026-10-01", seller: sellerStub(), buyer: buyerStub() });
  doc.lines = lines;
  assert.equal(invoiceTotals(doc).gross, 5_100_000);
  assert.equal(stepGross(step({ percent: 30 }), quoteLines, 0, 0), 5_100_000);
});

test("the completion step takes the remainder and the approved ÄTA as tagged lines", () => {
  const changeOrders = [
    { id: "c1", number: 1, title: "Extra eluttag", amount: 4500, labor_amount: 3000, status: "approved" as const, invoiceId: null },
    { id: "c2", number: 2, title: "Golvbrunn", amount: 8000, labor_amount: 5500, status: "approved" as const, invoiceId: "already" },
    { id: "c3", number: 3, title: "Avböjd", amount: 1000, labor_amount: 0, status: "declined" as const, invoiceId: null },
  ];
  const lines = stepInvoiceLines({
    step: step({ dueRule: "on_completion" }),
    stepIndex: 2,
    stepCount: 3,
    quoteLines,
    quoteNumber: 1042,
    invoicedByKind: { labor: 5_600_000, material: 3_920_000, other: 0 }, // 70 % already invoiced
    changeOrders,
  });
  assert.deepEqual(
    lines.map((l) => [l.id, l.unitPriceOre, l.kind, l.changeOrderId]),
    [
      ["rest-labor", 2_400_000, "labor", null],
      ["rest-material", 1_680_000, "material", null],
      ["ata-1-a", 240_000, "labor", "c1"],
      ["ata-1-m", 120_000, "material", "c1"],
    ]
  );
  assert.equal(stepGross(step({ dueRule: "on_completion" }), quoteLines, 11_900_000, 4500), 5_100_000 + 450_000);
});

test("a labour share override moves the step between labour and material", () => {
  const lines = stepInvoiceLines({ step: step({ percent: 50, laborShare: 1 }), stepIndex: 0, stepCount: 2, quoteLines, quoteNumber: null, invoicedByKind: { labor: 0, material: 0, other: 0 }, changeOrders: [] });
  assert.equal(lines.find((l) => l.kind === "labor")!.unitPriceOre, 6_800_000);
  assert.equal(lines.find((l) => l.kind === "material")!.unitPriceOre, 0);
});

test("project economy adds quote and approved ÄTA, subtracts invoiced and credits", () => {
  const e = projectEconomy(
    quoteLines,
    [
      { id: "c1", number: 1, title: "", amount: 4500, labor_amount: 3000, status: "approved" },
      { id: "c2", number: 2, title: "", amount: 8000, labor_amount: 0, status: "pending" },
    ],
    [
      { kind: "invoice", status: "paid", payableOre: 5_100_000, paidOre: 5_100_000, rotOre: 720_000, totalOre: 5_100_000 },
      { kind: "invoice", status: "sent", payableOre: 6_800_000, paidOre: 0, rotOre: 960_000, totalOre: 6_800_000 },
      { kind: "credit", status: "issued", payableOre: -1_000_000, paidOre: 0, rotOre: 0, totalOre: -1_000_000 },
      { kind: "invoice", status: "draft", payableOre: 9_999, paidOre: 0, rotOre: 0, totalOre: 9_999 },
    ]
  );
  assert.equal(e.quoteGross, 17_000_000);
  assert.equal(e.changeOrdersApproved, 450_000);
  assert.equal(e.changeOrdersPending, 800_000);
  assert.equal(e.total, 17_450_000);
  assert.equal(e.invoiced, 10_900_000);
  assert.equal(e.paid, 5_100_000);
  assert.equal(e.outstanding, 6_800_000);
  assert.equal(e.leftToInvoice, 6_550_000);
  assert.equal(e.rotOnInvoices, 1_680_000);
  assert.equal(e.invoiceCount, 3);
});

function sellerStub() {
  return { name: "S", orgNr: "", vatNr: "", street: "", postalCode: "", city: "", countryCode: "SE", email: "", phone: "", fSkatt: true };
}
function buyerStub() {
  return { type: "privat" as const, customerId: null, name: "B", orgNr: "", vatNr: "", street: "", postalCode: "", city: "", countryCode: "SE", email: "", phone: "", reference: "" };
}
