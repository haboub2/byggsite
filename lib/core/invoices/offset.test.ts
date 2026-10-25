import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceDocumentSchema, newInvoiceDocument, type InvoiceDocument } from "../documents/invoice";
import { balancesByAccount, postInvoice, postOffset, postPayment } from "../ledger/posting";
import { computeDashboard, type DashInvoice } from "../dashboard";
import { projectEconomy } from "../plans/billing";
import { invoicedNet } from "../projects/economy";
import { renderPeppolInvoice } from "../../render/ubl/peppol-bis-billing-3";
import { amountDue, customerSummary, invoiceTotals } from "./totals";
import { countInvoiceList, countsAsInvoiced, isOpen, refundDue } from "./store-types";

/*
 * Rätta belopp on a paid invoice (0028): faktura 10001 for 1 250 kr is paid,
 * credited in full with 10002 and replaced by 10003. The payment moves to
 * 10003 as an offset; these tests follow the amounts through the totals,
 * the ledger, the list, the dashboard, the project economy and Peppol.
 */

const seller = { name: "Binaafy AB", orgNr: "559000-0000", vatNr: "SE559000000001", street: "Uppstigen 130", postalCode: "412 80", city: "Göteborg", countryCode: "SE", email: "", phone: "", fSkatt: true };
const anna = { name: "Anna Andersson", orgNr: "", vatNr: "", street: "Bräckevägen 12", postalCode: "417 03", city: "Göteborg", countryCode: "SE", email: "anna@example.se", phone: "", type: "privat" as const, customerId: null, reference: "" };

/** `hours` hours at 100 kr + 25 % VAT: 125 kr an hour to pay. */
function doc(number: string, hours: number, kind: "invoice" | "credit" = "invoice", buyer: typeof anna | (Omit<typeof anna, "type"> & { type: "foretag" }) = anna): InvoiceDocument {
  const d = newInvoiceDocument({ issueDate: "2026-10-25", seller, buyer, paymentMeans: { bankgiro: "5555-1234", termsDays: 30 } });
  d.kind = kind;
  d.number = number;
  d.lines = [{ id: "l1", description: "Arbete", quantity: hours, unit: "tim", unitPriceOre: 10_000, vatCategory: "S", vatRate: 25, kind: "labor", section: "", changeOrderId: null }];
  return invoiceDocumentSchema.parse(d);
}

const withOffset = (d: InvoiceDocument, amountOre: number): InvoiceDocument => invoiceDocumentSchema.parse({ ...d, se: { ...d.se, offset: { invoiceNumber: "10001", creditNumber: "10002", amountOre } } });

/* ---------- what is left to pay ---------- */

test("amountDue: lower, higher and equal replacements", () => {
  assert.deepEqual(amountDue(100_000, 125_000), { offset: 125_000, due: 0, refund: 25_000 });
  assert.deepEqual(amountDue(150_000, 50_000), { offset: 50_000, due: 100_000, refund: 0 });
  assert.deepEqual(amountDue(125_000, 125_000), { offset: 125_000, due: 0, refund: 0 });
  assert.deepEqual(amountDue(125_000, 0), { offset: 0, due: 125_000, refund: 0 });
  assert.throws(() => amountDue(100_000, 0.5));
});

test("the customer summary prints the offset and what is left", () => {
  const lower = customerSummary(withOffset(doc("10003", 8), 125_000));
  assert.equal(lower.payable, 100_000);
  assert.equal(lower.offset, 125_000);
  assert.equal(lower.due, 0);
  assert.equal(lower.refund, 25_000);
  const higher = customerSummary(withOffset(doc("10003", 12), 50_000));
  assert.deepEqual([higher.payable, higher.offset, higher.due, higher.refund], [150_000, 50_000, 100_000, 0]);
  // Without an offset nothing changes: due is the amount to pay.
  const plain = customerSummary(doc("10001", 10));
  assert.deepEqual([plain.offset, plain.due, plain.refund], [0, 125_000, 0]);
});

test("the document keeps the offset frozen and refuses part öre", () => {
  assert.equal(withOffset(doc("10003", 8), 125_000).se.offset?.invoiceNumber, "10001");
  assert.throws(() => withOffset(doc("10003", 8), 1.5));
  assert.equal(doc("10001", 10).se.offset, undefined);
});

/* ---------- the ledger ---------- */

test("the offset is 1510 against 1510, each line naming its invoice", () => {
  const p = postOffset({ invoiceId: "inv-3", amount: 125_000, date: "2026-10-25", fromNumber: "10001", toNumber: "{number}", creditNumber: "10002" });
  assert.deepEqual(p.source, { type: "offset", id: "inv-3" });
  assert.equal(p.text, "Kvittning faktura 10001 mot faktura {number} (kreditfaktura 10002)");
  assert.deepEqual(
    p.lines.map((l) => [l.account, l.debit, l.credit, l.text]),
    [
      ["1510", 125_000, 0, "Faktura 10001, betalning flyttad"],
      ["1510", 0, 125_000, "Faktura {number}, kvittad betalning"],
    ]
  );
  assert.deepEqual(balancesByAccount([p]), { "1510": 0 });
  // A negative balance on the original (more refunded than paid) mirrors.
  const back = postOffset({ invoiceId: "inv-3", amount: -1_000, date: "2026-10-25", fromNumber: "10001", toNumber: "10003", creditNumber: "10002" });
  assert.deepEqual(back.lines.map((l) => [l.debit, l.credit]), [[0, 1_000], [1_000, 0]]);
});

/** The whole story in the ledger: issue, pay, credit, replace with `hours`, offset. */
function story(paid: number, hours: number) {
  const o = doc("10001", 10);
  const c = doc("10002", 10, "credit");
  const n = withOffset(doc("10003", hours), paid);
  return [
    postInvoice(o, invoiceTotals(o), "inv-1"),
    postPayment({ paymentId: "p1", amount: paid, method: "bankgiro", date: "2026-10-25" }),
    postInvoice(c, invoiceTotals(c), "inv-2"),
    postInvoice(n, invoiceTotals(n), "inv-3"),
    postOffset({ invoiceId: "inv-3", amount: paid, date: "2026-10-25", fromNumber: "10001", toNumber: "10003", creditNumber: "10002" }),
  ];
}

test("lower: 250 kr to refund on 1510, sales are the new invoice's", () => {
  const b = balancesByAccount(story(125_000, 8));
  assert.equal(b["1510"], -25_000);
  assert.equal(b["1930"], 125_000);
  assert.equal(b["3001"], -80_000);
  assert.equal(b["2611"], -20_000);
  // The refund settles it: 1510 to zero, the bank keeps what the new invoice asks for.
  const after = balancesByAccount([...story(125_000, 8), postPayment({ paymentId: "p2", amount: -25_000, method: "bankgiro", date: "2026-10-26", text: "Återbetalning" })]);
  assert.equal(after["1510"], 0);
  assert.equal(after["1930"], 100_000);
});

test("higher: what is left on 1510 is what is left to pay", () => {
  const b = balancesByAccount(story(50_000, 12));
  assert.equal(b["1510"], 100_000);
  assert.equal(b["3001"], -120_000);
  assert.equal(b["1930"], 50_000);
});

/* ---------- lists ---------- */

// After the offset: the original credited with nothing left on it, the credit note, the replacement.
const original = { kind: "invoice", status: "credited", dueOn: "2026-10-01", payableOre: 125_000, paidOre: 0 };
const creditNote = { kind: "credit", status: "issued", dueOn: "2026-10-25", payableOre: -125_000, paidOre: 0 };
const lower = { kind: "invoice", status: "paid", dueOn: "2026-11-24", payableOre: 100_000, paidOre: 125_000 };
const higher = { kind: "invoice", status: "partially_paid", dueOn: "2026-11-24", payableOre: 150_000, paidOre: 50_000 };

test("a lower replacement is paid with the excess to refund, in the list too", () => {
  assert.equal(refundDue(lower), 25_000);
  assert.equal(isOpen(lower), false);
  const counts = countInvoiceList([original, creditNote, lower], "2026-10-25");
  assert.equal(counts.refundCount, 1);
  assert.equal(counts.refundOre, 25_000);
  assert.equal(counts.open + counts.openOre, 0);
  assert.equal(counts.paid, 1);
  // Once refunded there is nothing left either way.
  assert.equal(refundDue({ ...lower, paidOre: 100_000 }), 0);
});

test("a higher replacement is open with the rest", () => {
  assert.equal(refundDue(higher), 0);
  const counts = countInvoiceList([original, creditNote, higher], "2026-10-25");
  assert.equal(counts.open, 1);
  assert.equal(counts.openOre, 100_000);
  assert.equal(counts.refundOre, 0);
});

test("a credited original waiting for its replacement is not counted as a refund", () => {
  assert.equal(refundDue({ ...original, paidOre: 125_000 }), 0);
  assert.equal(refundDue({ ...lower, status: "draft" }), 0);
  assert.equal(refundDue({ ...creditNote, paidOre: 10 }), 0);
});

test("only the replacement counts as invoiced on a payment plan", () => {
  assert.equal(countsAsInvoiced(original), false);
  assert.equal(countsAsInvoiced(creditNote), false);
  assert.equal(countsAsInvoiced(lower), true);
  assert.equal(countsAsInvoiced({ ...lower, status: "draft" }), false);
  assert.equal(countsAsInvoiced({ kind: "correction", status: "sent" }), false);
});

/* ---------- dashboard and project economy count the money once ---------- */

const full = (patch: Partial<DashInvoice> & { totalOre: number; payableOre: number }): DashInvoice => ({
  id: Math.random().toString(36).slice(2),
  number: "10001",
  kind: "invoice",
  status: "sent",
  buyerName: "Anna Andersson",
  customerId: "c1",
  reverseCharge: false,
  issuedOn: "2026-10-25",
  dueOn: "2026-11-24",
  paidAt: null,
  vatOre: patch.totalOre / 5,
  rotOre: 0,
  paidOre: 0,
  reminders: 0,
  ...patch,
});

test("the dashboard sees the replacement's amount and what is left of it", () => {
  const invoices = [
    full({ number: "10001", status: "credited", totalOre: 125_000, payableOre: 125_000, paidOre: 0 }),
    full({ number: "10002", kind: "credit", status: "issued", totalOre: -125_000, payableOre: -125_000 }),
    full({ number: "10003", status: "partially_paid", totalOre: 150_000, payableOre: 150_000, paidOre: 50_000 }),
  ];
  const d = computeDashboard(invoices, [], "2026-10-25");
  assert.equal(d.kpis.invoicedThisMonthOre, 150_000);
  assert.equal(d.kpis.openOre, 100_000);
  assert.equal(d.kpis.openCount, 1);
});

test("project economy: invoiced and paid once, the excess shows as negative outstanding", () => {
  const inv = (kind: "invoice" | "credit", status: string, totalOre: number, paidOre: number) => ({ kind, status, totalOre, vatOre: totalOre / 5, payableOre: totalOre, paidOre, rotOre: 0, lines: [] });
  const list = [inv("invoice", "credited", 125_000, 0), inv("credit", "issued", -125_000, 0), inv("invoice", "paid", 100_000, 125_000)];
  const e = projectEconomy([], [], list);
  assert.equal(e.invoiced, 100_000);
  assert.equal(e.paid, 125_000);
  assert.equal(e.outstanding, -25_000);
  assert.equal(invoicedNet(list), 80_000);
});

/* ---------- Peppol ---------- */

test("Peppol states the offset as PrepaidAmount and the rest as PayableAmount", () => {
  const vast = { ...anna, name: "Väst AB", orgNr: "556677-8899", vatNr: "SE556677889901", type: "foretag" as const };
  const xml = renderPeppolInvoice(withOffset(doc("10003", 12, "invoice", vast), 50_000));
  assert.ok(xml.includes('<cbc:PrepaidAmount currencyID="SEK">500.00</cbc:PrepaidAmount>'));
  assert.ok(xml.includes('<cbc:PayableAmount currencyID="SEK">1000.00</cbc:PayableAmount>'));
  const lowerXml = renderPeppolInvoice(withOffset(doc("10003", 8, "invoice", vast), 125_000));
  assert.ok(lowerXml.includes('<cbc:PayableAmount currencyID="SEK">-250.00</cbc:PayableAmount>'));
  assert.ok(!renderPeppolInvoice(doc("10001", 10, "invoice", vast)).includes("PrepaidAmount"));
});
