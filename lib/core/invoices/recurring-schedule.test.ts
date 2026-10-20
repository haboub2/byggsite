import { test } from "node:test";
import assert from "node:assert/strict";
import { nextOccurrence, recurringDocument, templateFromInvoice } from "./recurring-schedule";
import { newInvoiceDocument } from "../documents/invoice";

test("monthly, quarterly and yearly steps", () => {
  assert.equal(nextOccurrence("2026-10-01", "monthly"), "2026-11-01");
  assert.equal(nextOccurrence("2026-12-15", "monthly"), "2027-01-15");
  assert.equal(nextOccurrence("2026-10-01", "quarterly"), "2027-01-01");
  assert.equal(nextOccurrence("2026-11-30", "quarterly"), "2027-02-28");
  assert.equal(nextOccurrence("2026-10-20", "yearly"), "2027-10-20");
  assert.throws(() => nextOccurrence("2026-10", "monthly"));
});

test("month ends: a missing day becomes the last, and the last day stays the last", () => {
  assert.equal(nextOccurrence("2026-01-31", "monthly"), "2026-02-28");
  assert.equal(nextOccurrence("2026-02-28", "monthly"), "2026-03-31");
  assert.equal(nextOccurrence("2026-03-31", "monthly"), "2026-04-30");
  assert.equal(nextOccurrence("2026-04-30", "monthly"), "2026-05-31");
  assert.equal(nextOccurrence("2028-01-31", "monthly"), "2028-02-29");
  assert.equal(nextOccurrence("2028-02-29", "yearly"), "2029-02-28");
  assert.equal(nextOccurrence("2026-01-29", "monthly"), "2026-02-28");
  // 29 feb is the last day in a leap year, so the next year keeps month end.
  assert.equal(nextOccurrence("2028-02-29", "monthly"), "2028-03-31");
});

test("a template becomes a dated draft for one period", () => {
  const seller = { name: "Binaafy AB", orgNr: "559000-0000", vatNr: "SE559000000001", street: "", postalCode: "", city: "", countryCode: "SE", email: "", phone: "", fSkatt: true };
  const buyer = { name: "Kund AB", orgNr: "556677-8899", vatNr: "", street: "", postalCode: "", city: "", countryCode: "SE", email: "", phone: "", type: "foretag" as const, customerId: null, reference: "" };
  const issued = { ...newInvoiceDocument({ issueDate: "2026-09-01", seller, buyer, paymentMeans: { termsDays: 20 } }), number: "10007" };
  issued.paymentMeans.ocr = "100074";
  const template = templateFromInvoice(issued);
  assert.equal(template.number, null);
  assert.equal(template.paymentMeans.ocr, null);
  const doc = recurringDocument(template, "2026-10-01", "monthly", "2026-10-02");
  assert.equal(doc.issueDate, "2026-10-02");
  assert.equal(doc.dueDate, "2026-10-22");
  assert.deepEqual(doc.period, { start: "2026-10-01", end: "2026-10-31" });
  assert.deepEqual(recurringDocument(template, "2026-10-01", "quarterly", "2026-10-01").period, { start: "2026-10-01", end: "2026-12-31" });
});
