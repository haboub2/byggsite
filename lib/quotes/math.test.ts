import { test } from "node:test";
import assert from "node:assert/strict";
import { lineTotals, quoteTotals, validUntil, kr, sek } from "./math";
import { emptyCustomer, emptyTerms, type QuoteData, type QuoteItem } from "./schema";

const item = (patch: Partial<QuoteItem>): QuoteItem => ({
  id: "x",
  description: "Rad",
  qty: 1,
  unit: "st",
  unitPrice: 0,
  vatRate: 25,
  kind: "other",
  ...patch,
});

const quote = (patch: Partial<QuoteData>): QuoteData => ({
  division: "bygg",
  title: "Badrum",
  intro: "",
  customer: { ...emptyCustomer },
  items: [],
  pricesInclVat: false,
  rot: false,
  rotPersons: [],
  validDays: 30,
  paymentDays: 30,
  terms: { ...emptyTerms },
  date: "2026-10-15",
  leadId: null,
  ...patch,
});

test("line totals, prices ex VAT", () => {
  const t = lineTotals(item({ qty: 10, unitPrice: 650 }), false);
  assert.deepEqual(t, { net: 6500, vat: 1625, gross: 8125 });
});

test("line totals, prices incl VAT", () => {
  const t = lineTotals(item({ qty: 1, unitPrice: 12500 }), true);
  assert.equal(t.gross, 12500);
  assert.equal(t.net, 10000);
  assert.equal(t.vat, 2500);
});

test("totals add up and VAT is grouped by rate", () => {
  const q = quote({
    items: [
      item({ id: "a", qty: 2, unitPrice: 1000, vatRate: 25 }),
      item({ id: "b", qty: 1, unitPrice: 1000, vatRate: 12 }),
      item({ id: "c", qty: 1, unitPrice: 500, vatRate: 0 }),
    ],
  });
  const t = quoteTotals(q);
  assert.equal(t.net, 3500);
  assert.equal(t.gross, 2500 + 1120 + 500);
  assert.equal(t.vat, t.gross - t.net);
  assert.deepEqual(t.vatByRate, [
    { rate: 25, amount: 500 },
    { rate: 12, amount: 120 },
  ]);
  assert.equal(t.rot, null);
  assert.equal(t.pay, t.gross);
});

test("ROT: 30 % of labour incl. VAT, for private customers on the Bygg side", () => {
  const items = [
    item({ id: "l", qty: 1, unitPrice: 100_000, kind: "labor" }),
    item({ id: "m", qty: 1, unitPrice: 50_000, kind: "material" }),
  ];
  const t = quoteTotals(quote({ items, rot: true, pricesInclVat: true }));
  assert.equal(t.laborGross, 100_000);
  assert.equal(t.rot?.deduction, 30_000);
  assert.equal(t.pay, 120_000);

  const business = quoteTotals(quote({ items, rot: true, pricesInclVat: true, customer: { ...emptyCustomer, type: "foretag" } }));
  assert.equal(business.rot, null);
  const software = quoteTotals(quote({ items, rot: true, pricesInclVat: true, division: "01" }));
  assert.equal(software.rot, null);
});

test("ROT is capped per owner", () => {
  const items = [item({ id: "l", qty: 1, unitPrice: 400_000, kind: "labor" })];
  const one = quoteTotals(quote({ items, rot: true, pricesInclVat: true, rotPersons: [] }));
  assert.equal(one.rot?.deduction, 50_000);
  const p = { name: "", personalNumber: "" };
  const two = quoteTotals(quote({ items, rot: true, pricesInclVat: true, rotPersons: [p, p] }));
  assert.equal(two.rot?.deduction, 100_000);
  assert.deepEqual(two.rot?.perOwner, [50_000, 50_000]);
});

test("valid-until and money formatting", () => {
  assert.equal(validUntil("2026-10-15", 30), "2026-11-14");
  assert.equal(validUntil("2026-12-20", 15), "2027-01-04");
  assert.equal(kr(1234567), "1 234 567 kr");
  assert.equal(kr(0), "0 kr");
  assert.equal(sek(268250), "268 250,00");
  assert.equal(sek(1234.5), "1 234,50");
});
