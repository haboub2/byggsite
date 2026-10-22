import { test } from "node:test";
import assert from "node:assert/strict";
import { newInvoiceDocument, paymentReference, type InvoiceDocument } from "../documents/invoice";
import { computeDashboard, type DashInvoice } from "../dashboard";
import { projectEconomy } from "../plans/billing";
import { invoicedNet } from "../projects/economy";
import { amountBasis, applyCorrectionEdits, correctionChanges, correctionDocument, correctionEditsOf, correctionNoteText } from "./correction";
import { countInvoiceList, inTab, isBooked, isOpen } from "./store-types";
import { invoicesCsv } from "../export/csv";

const seller = { name: "Binaafy AB", orgNr: "559000-0000", vatNr: "SE559000000001", street: "Uppstigen 130", postalCode: "412 80", city: "Göteborg", countryCode: "SE", email: "", phone: "", fSkatt: true };
const buyer = { name: "Anna Andersson", orgNr: "", vatNr: "", street: "Bräckevägen 12", postalCode: "417 03", city: "Göteborg", countryCode: "SE", email: "anna@example.se", phone: "", type: "privat" as const, customerId: null, reference: "" };

function issued(): InvoiceDocument {
  const doc = newInvoiceDocument({ issueDate: "2026-10-20", seller, buyer, paymentMeans: { bankgiro: "5555-1234", termsDays: 30 } });
  doc.number = "10007";
  doc.title = "Badrumsrenovering";
  doc.paymentMeans.ocr = "1000704";
  doc.lines = [
    { id: "l1", description: "Rivning", quantity: 8, unit: "tim", unitPriceOre: 65_000, vatCategory: "S", vatRate: 25, kind: "labor", section: "", changeOrderId: null },
    { id: "l2", description: "Kakel", quantity: 12, unit: "m²", unitPriceOre: 45_000, vatCategory: "S", vatRate: 25, kind: "material", section: "", changeOrderId: null },
  ];
  return doc;
}

/* ---------- the change text ---------- */

test("a misspelled name gives the text the law asks for", () => {
  const base = issued();
  const edits = correctionEditsOf(base);
  edits.buyer.name = "Anna Anderson";
  const after = applyCorrectionEdits(base, edits);
  const changes = correctionChanges(base, after);
  assert.deepEqual(changes, ["kundens namn från 'Anna Andersson' till 'Anna Anderson'"]);
  assert.equal(
    correctionNoteText("10007", changes),
    "Ändringsfaktura. Ersätter faktura 10007. Ändrade uppgifter: kundens namn från 'Anna Andersson' till 'Anna Anderson'."
  );
});

test("several changes in reading order, empty values and line descriptions", () => {
  const base = issued();
  const edits = correctionEditsOf(base);
  edits.buyer.street = "Bräckevägen 14";
  edits.buyer.reference = "Anna";
  edits.orderReference = "PO-77";
  edits.lines[1].description = "Kakel, vägg";
  const changes = correctionChanges(base, applyCorrectionEdits(base, edits));
  assert.deepEqual(changes, [
    "kundens gatuadress från 'Bräckevägen 12' till 'Bräckevägen 14'",
    "er referens från (tomt) till 'Anna'",
    "ert ordernummer från (tomt) till 'PO-77'",
    "benämningen på rad 2 från 'Kakel' till 'Kakel, vägg'",
  ]);
  assert.match(correctionNoteText("10007", changes, "10009"), /^Ändringsfaktura\. Ersätter faktura 10007 och ändringsfaktura 10009\. Ändrade uppgifter: kundens gatuadress/);
});

test("long values are shortened and a very long text stays within 2000 characters", () => {
  const base = issued();
  const edits = correctionEditsOf(base);
  edits.note = "x".repeat(500);
  const [change] = correctionChanges(base, applyCorrectionEdits(base, edits));
  assert.ok(change.length < 120, change);
  const many = Array.from({ length: 200 }, (_, i) => `benämningen på rad ${i + 1} från '${"a".repeat(60)}' till '${"b".repeat(60)}'`);
  const text = correctionNoteText("10007", many);
  assert.ok(text.length <= 2000, String(text.length));
  assert.match(text, /ändringar till\.$/);
});

/* ---------- the change invoice keeps every amount ---------- */

test("edits never touch amounts, VAT, ROT or dates; unknown lines are ignored", () => {
  const base = issued();
  const edits = correctionEditsOf(base);
  edits.buyer.name = "Anna Anderson";
  edits.lines.push({ id: "påhittad", description: "Ny rad" });
  const after = applyCorrectionEdits(base, edits);
  assert.equal(after.lines.length, 2);
  assert.equal(amountBasis(after), amountBasis(base));
  assert.notEqual(amountBasis({ ...base, lines: [{ ...base.lines[0], quantity: 9 }, base.lines[1]] }), amountBasis(base));
  assert.notEqual(amountBasis({ ...base, dueDate: "2026-12-01" }), amountBasis(base));
});

test("the change invoice document refers to the original and carries the text", () => {
  const base = issued();
  const edits = correctionEditsOf(base);
  edits.buyer.name = "Anna Anderson";
  const { document, changes } = correctionDocument(base, edits, { originalNumber: "10007", issueDate: "2026-10-22" });
  assert.equal(changes.length, 1);
  assert.equal(document.kind, "correction");
  assert.equal(document.number, null);
  assert.equal(document.issueDate, "2026-10-22");
  assert.equal(document.dueDate, base.dueDate);
  assert.equal(document.references.precedingInvoiceNumber, "10007");
  assert.equal(document.paymentMeans.ocr, "1000704");
  assert.match(document.correctionNote ?? "", /^Ändringsfaktura\. Ersätter faktura 10007\./);
  // The original is untouched.
  assert.equal(base.buyer.name, "Anna Andersson");
  assert.equal(base.kind, "invoice");
  assert.throws(() => correctionDocument(base, correctionEditsOf(base), { originalNumber: "10007", issueDate: "2026-10-22" }), /Inga uppgifter är ändrade/);
});

test("a change invoice is paid as its original", () => {
  const base = issued();
  const edits = correctionEditsOf(base);
  edits.buyer.name = "Anna Anderson";
  const doc = { ...correctionDocument(base, edits, { originalNumber: "10007", issueDate: "2026-10-22" }).document, number: "10012" };
  assert.equal(paymentReference(doc).value, "1000704");
  const noOcr = { ...doc, paymentMeans: { ...doc.paymentMeans, ocrAgreement: false } };
  assert.equal(paymentReference(noOcr).value, "10007");
});

/* ---------- lists and the dashboard count the original once ---------- */

const original = { kind: "invoice", status: "sent", dueOn: "2026-10-01", payableOre: 1_000_000, paidOre: 0 };
const change = { kind: "correction", status: "sent", dueOn: "2026-10-01", payableOre: 1_000_000, paidOre: 0 };

test("the invoice list counts a change invoice neither as open nor overdue", () => {
  assert.equal(isOpen(change), false);
  assert.equal(isBooked(change), false);
  assert.equal(isBooked(original), true);
  assert.equal(inTab(change, "overdue", "2026-10-22"), false);
  const counts = countInvoiceList([original, change], "2026-10-22");
  assert.equal(counts.all, 2);
  assert.equal(counts.open, 1);
  assert.equal(counts.overdue, 1);
  assert.equal(counts.openOre, 1_000_000);
  assert.equal(counts.overdueOre, 1_000_000);
  const voided = countInvoiceList([{ ...original, status: "void" }], "2026-10-22");
  assert.equal(voided.open + voided.openOre, 0);
  assert.equal(voided.credited, 1);
});

test("the dashboard counts the original's amounts once", () => {
  const dash = (patch: Partial<DashInvoice>): DashInvoice => ({
    id: Math.random().toString(36).slice(2),
    number: "10007",
    kind: "invoice",
    status: "sent",
    buyerName: "Anna Andersson",
    customerId: "c1",
    reverseCharge: false,
    issuedOn: "2026-10-20",
    dueOn: "2026-11-19",
    paidAt: null,
    totalOre: 1_250_000,
    vatOre: 250_000,
    rotOre: 0,
    payableOre: 1_250_000,
    paidOre: 0,
    reminders: 0,
    ...patch,
  });
  const alone = computeDashboard([dash({})], [], "2026-10-22");
  const corrected = computeDashboard([dash({}), dash({ number: "10012", kind: "correction", issuedOn: "2026-10-22", buyerName: "Anna Anderson" })], [], "2026-10-22");
  assert.deepEqual(corrected.kpis, alone.kpis);
  assert.deepEqual(corrected.vat, alone.vat);
  assert.deepEqual(corrected.byMonth, alone.byMonth);
  assert.deepEqual(corrected.topCustomers, alone.topCustomers);
  // A voided invoice is not turnover either.
  assert.equal(computeDashboard([dash({ status: "void" })], [], "2026-10-22").kpis.invoicedThisMonthOre, 0);
});

test("project economy and payment plans count the original once", () => {
  const inv = { kind: "invoice" as const, status: "sent", totalOre: 1_250_000, vatOre: 250_000, payableOre: 1_250_000, paidOre: 0, rotOre: 0, lines: [] };
  const corr = { ...inv, kind: "correction" as const };
  assert.equal(invoicedNet([inv, corr]), 1_000_000);
  const economy = projectEconomy([], [], [inv, corr]);
  assert.equal(economy.invoiced, 1_250_000);
  assert.equal(economy.outstanding, 1_250_000);
  assert.equal(economy.invoiceCount, 1);
});

test("the invoice CSV gives a change invoice and a voided invoice no amounts of their own", () => {
  const doc = issued();
  const row = (patch: Record<string, unknown>) =>
    ({ id: "x", series: "F", number: "10007", kind: "invoice", status: "sent", customerId: null, document: doc, totalOre: 1_250_000, vatOre: 250_000, rotOre: 0, payableOre: 1_250_000, paidOre: 0, issuedOn: "2026-10-20", dueOn: "2026-11-19", ocr: "1000704", createdAt: "2026-10-20T08:00:00Z", ...patch }) as Parameters<typeof invoicesCsv>[0][number];
  const csv = invoicesCsv([
    row({}),
    row({ id: "y", number: "10012", kind: "correction", document: { ...doc, kind: "correction", number: "10012", references: { ...doc.references, precedingInvoiceNumber: "10007" } } }),
    row({ id: "z", number: "10013", status: "void" }),
  ]);
  const lines = csv.trim().split("\r\n").slice(1).map((l) => l.split(";"));
  assert.equal(lines.length, 3);
  const [orig, corr, voided] = lines;
  assert.equal(orig[8], "12500,00");
  assert.equal(corr[1], "Ändringsfaktura till 10007");
  assert.deepEqual(corr.slice(6, 13), Array(7).fill("0,00"));
  assert.deepEqual(voided.slice(6, 13), Array(7).fill("0,00"));
});
