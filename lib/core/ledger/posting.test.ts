import { test } from "node:test";
import assert from "node:assert/strict";
import { assertBalanced, balancesByAccount, postInvoice, postPayment, postReminder, reversal, UnbalancedPostingError } from "./posting";
import { invoiceTotals } from "../invoices/totals";
import { invoiceDocumentSchema, lineForBuyer, newInvoiceDocument, type InvoiceDocument } from "../documents/invoice";

const seller = {
  name: "Binaafy AB",
  orgNr: "559000-0000",
  vatNr: "SE559000000001",
  street: "Uppstigen 130",
  postalCode: "412 80",
  city: "Göteborg",
  countryCode: "SE",
  email: "",
  phone: "",
  fSkatt: true,
};
const anna = {
  name: "Anna Lindqvist",
  orgNr: "",
  vatNr: "",
  street: "Bräckevägen 12",
  postalCode: "417 03",
  city: "Göteborg",
  countryCode: "SE",
  email: "",
  phone: "",
  type: "privat" as const,
  customerId: "11111111-1111-4111-8111-111111111111",
  reference: "",
};

function badrum(): InvoiceDocument {
  const doc = newInvoiceDocument({ issueDate: "2026-10-10", seller, buyer: anna, paymentMeans: { bankgiro: "5555-1234", termsDays: 14 } });
  doc.number = "10022";
  doc.references.projectId = "22222222-2222-4222-8222-222222222222";
  doc.lines = [
    { id: "a", description: "Rivning", quantity: 12, unit: "tim", unitPriceOre: 50_000, vatCategory: "S", vatRate: 25, kind: "labor", section: "", changeOrderId: null },
    { id: "b", description: "Tätskikt", quantity: 1, unit: "st", unitPriceOre: 3_200_000, vatCategory: "S", vatRate: 25, kind: "labor", section: "", changeOrderId: null },
    { id: "c", description: "Kakel", quantity: 1, unit: "st", unitPriceOre: 2_092_000, vatCategory: "S", vatRate: 25, kind: "material", section: "", changeOrderId: null },
    { id: "d", description: "Fog", quantity: 1, unit: "st", unitPriceOre: 688_000, vatCategory: "S", vatRate: 25, kind: "material", section: "", changeOrderId: null },
  ];
  doc.se.rot = { buyers: [{ name: "Anna Lindqvist", personalNumber: "850412-1234", roomOre: null }], property: { kind: "fastighet", designation: "Göteborg Tolered 1:23" }, deductionOre: null };
  return invoiceDocumentSchema.parse(doc);
}

const byAccount = (p: { lines: { account: string; debit: number; credit: number }[] }) =>
  Object.fromEntries(p.lines.map((l) => [l.account, l.debit - l.credit]));

test("invoice with ROT: receivable split between the customer and Skatteverket", () => {
  const doc = badrum();
  const p = postInvoice(doc, invoiceTotals(doc), "inv-1");
  assert.equal(p.date, "2026-10-10");
  assert.equal(p.text, "Faktura 10022 Anna Lindqvist");
  assert.deepEqual(p.source, { type: "invoice", id: "inv-1" });
  assert.deepEqual(byAccount(p), { "1510": 6_800_000, "1513": 1_425_000, "3001": -6_580_000, "2611": -1_645_000 });
  assert.equal(p.lines[0].dimensions?.projectId, doc.references.projectId);
  assert.equal(p.lines[0].dimensions?.customerId, anna.customerId);
});

test("reverse charge: sales on 3231 and no VAT line", () => {
  const doc = badrum();
  doc.buyer = { ...anna, type: "byggforetag", vatNr: "SE556111111101" };
  doc.se.reverseCharge = true;
  doc.se.rot = null;
  doc.lines = doc.lines.map((l) => lineForBuyer(l, doc.buyer));
  const p = postInvoice(doc, invoiceTotals(doc), "inv-2");
  assert.deepEqual(byAccount(p), { "1510": 6_580_000, "3231": -6_580_000 });
});

test("mixed rates land on their own sales and VAT accounts", () => {
  const doc = badrum();
  doc.se.rot = null;
  doc.lines = [
    { id: "a", description: "Bok", quantity: 1, unit: "st", unitPriceOre: 10_000, vatCategory: "S", vatRate: 6, kind: "other", section: "", changeOrderId: null },
    { id: "b", description: "Mat", quantity: 1, unit: "st", unitPriceOre: 10_000, vatCategory: "S", vatRate: 12, kind: "other", section: "", changeOrderId: null },
    { id: "c", description: "Avgift", quantity: 1, unit: "st", unitPriceOre: 10_000, vatCategory: "E", vatRate: 0, kind: "other", section: "", changeOrderId: null },
  ];
  const p = postInvoice(doc, invoiceTotals(doc), "inv-3");
  assert.deepEqual(byAccount(p), { "1510": 31_800, "3003": -10_000, "3002": -10_000, "3004": -10_000, "2631": -600, "2621": -1_200 });
});

test("rounding goes to 3740 and keeps the entry balanced", () => {
  const doc = badrum();
  doc.se.rot = null;
  doc.lines = [{ id: "a", description: "Timmar", quantity: 3, unit: "tim", unitPriceOre: 33_333, vatCategory: "S", vatRate: 25, kind: "labor", section: "", changeOrderId: null }];
  const t = invoiceTotals(doc);
  assert.equal(t.rounding, 1);
  const p = postInvoice(doc, t, "inv-4");
  assert.equal(byAccount(p)["3740"], -1);
  assert.equal(byAccount(p)["1510"], 125_000);
});

test("a credit note mirrors the invoice exactly", () => {
  const doc = badrum();
  doc.kind = "credit";
  doc.number = "10025";
  doc.references.precedingInvoiceNumber = "10022";
  const p = postInvoice(doc, invoiceTotals(doc), "inv-5");
  assert.equal(p.source.type, "credit");
  assert.equal(p.text, "Kreditfaktura 10025 Anna Lindqvist");
  assert.deepEqual(byAccount(p), { "1510": -6_800_000, "1513": -1_425_000, "3001": 6_580_000, "2611": 1_645_000 });
});

test("payments: customer settles 1510, Skatteverket settles 1513", () => {
  const pay = postPayment({ paymentId: "p1", amount: 6_800_000, method: "bankgiro", date: "2026-10-22" });
  assert.deepEqual(byAccount(pay), { "1930": 6_800_000, "1510": -6_800_000 });
  const rot = postPayment({ paymentId: "p2", amount: 1_425_000, method: "rot", date: "2026-11-30" });
  assert.deepEqual(byAccount(rot), { "1930": 1_425_000, "1513": -1_425_000 });
  assert.equal(rot.text, "Utbetalning ROT från Skatteverket");
  const refund = postPayment({ paymentId: "p3", amount: -50_000, method: "manual", date: "2026-11-02", text: "Återbetalning" });
  assert.deepEqual(byAccount(refund), { "1930": -50_000, "1510": 50_000 });
});

test("reminder fee and interest increase the receivable", () => {
  const p = postReminder({ reminderId: "r1", fee: 6_000, interest: 34_058, date: "2026-10-19" });
  assert.deepEqual(byAccount(p), { "1510": 40_058, "3591": -6_000, "8313": -34_058 });
  const feeOnly = postReminder({ reminderId: "r2", fee: 6_000, interest: 0, date: "2026-10-19" });
  assert.deepEqual(byAccount(feeOnly), { "1510": 6_000, "3591": -6_000 });
});

test("a reversal swaps debit and credit and the pair nets to zero", () => {
  const doc = badrum();
  const original = { id: "je-1", ...postInvoice(doc, invoiceTotals(doc), "inv-1") };
  const rev = reversal(original, "2026-10-11", "fel kund");
  assert.deepEqual(rev.source, { type: "reversal", id: "je-1", reverses: "je-1" });
  assert.ok(rev.text.startsWith("Vändning av Faktura 10022"));
  const net = balancesByAccount([original, rev]);
  for (const v of Object.values(net)) assert.equal(v, 0);
});

test("the whole life of an invoice nets receivables to zero", () => {
  const doc = badrum();
  const t = invoiceTotals(doc);
  const postings = [
    postInvoice(doc, t, "inv-1"),
    postPayment({ paymentId: "p1", amount: 6_800_000, method: "swish", date: "2026-10-22" }),
    postPayment({ paymentId: "p2", amount: 1_425_000, method: "rot", date: "2026-12-05" }),
  ];
  const b = balancesByAccount(postings);
  assert.equal(b["1510"], 0);
  assert.equal(b["1513"], 0);
  assert.equal(b["1930"], 8_225_000);
  assert.equal(b["3001"] + b["2611"], -8_225_000);
});

test("assertBalanced refuses unbalanced or malformed lines", () => {
  assert.throws(() => assertBalanced([]), UnbalancedPostingError);
  assert.throws(() => assertBalanced([{ account: "1510", debit: 100, credit: 0 }]), UnbalancedPostingError);
  assert.throws(() => assertBalanced([{ account: "1510", debit: 100, credit: 100 }]), RangeError);
  assert.throws(
    () =>
      assertBalanced([
        { account: "1510", debit: -100, credit: 0 },
        { account: "3001", debit: 0, credit: -100 },
      ]),
    RangeError
  );
  assert.doesNotThrow(() =>
    assertBalanced([
      { account: "1510", debit: 100, credit: 0 },
      { account: "3001", debit: 0, credit: 100 },
    ])
  );
});
