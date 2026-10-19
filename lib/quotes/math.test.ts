import { test } from "node:test";
import assert from "node:assert/strict";
import { displayUnitPrice, groupItems, lineTotals, priceSummary, quoteTotals, showsInclVat, validUntil, kr, sek } from "./math";
import { emptyCustomer, emptyTerms, type QuoteData, type QuoteItem } from "./schema";

const item = (patch: Partial<QuoteItem>): QuoteItem => ({
  id: "x",
  description: "Rad",
  qty: 1,
  unit: "st",
  unitPrice: 0,
  vatRate: 25,
  kind: "other",
  section: "",
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
  cover: "",
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

test("display mode follows the customer type, not how prices were typed", () => {
  assert.equal(showsInclVat(quote({ customer: { ...emptyCustomer, type: "privat" } })), true);
  assert.equal(showsInclVat(quote({ customer: { ...emptyCustomer, type: "foretag" } })), false);
});

test("unit prices convert to the display mode", () => {
  const it = item({ unitPrice: 800, vatRate: 25 });
  assert.equal(displayUnitPrice(it, false, false), 800);
  assert.equal(displayUnitPrice(it, false, true), 1000);
  assert.equal(displayUnitPrice(item({ unitPrice: 1000, vatRate: 25 }), true, false), 800);
  assert.equal(displayUnitPrice(item({ unitPrice: 500, vatRate: 0 }), true, false), 500);
});

test("price summary, private customer with ROT: rows add up to what they pay", () => {
  const q = quote({
    pricesInclVat: true,
    rot: true,
    items: [
      item({ id: "l", qty: 1, unitPrice: 110_000, kind: "labor" }),
      item({ id: "m", qty: 1, unitPrice: 58_000, kind: "material" }),
    ],
  });
  const s = priceSummary(q);
  assert.equal(s.inclVat, true);
  assert.deepEqual(s.byKind, [
    { kind: "labor", amount: 110_000 },
    { kind: "material", amount: 58_000 },
  ]);
  assert.equal(s.rounding, 0);
  assert.equal(s.rot, 33_000);
  assert.equal(s.total, 135_000);
  assert.equal(s.grossBeforeRot, 168_000);
});

test("price summary, business: amounts excl. VAT and no ROT, whatever the entry mode", () => {
  const q = quote({
    pricesInclVat: true,
    rot: true,
    customer: { ...emptyCustomer, type: "foretag" },
    items: [
      item({ id: "l", qty: 1, unitPrice: 12_500, kind: "labor" }),
      item({ id: "o", qty: 1, unitPrice: 1_250, kind: "other" }),
    ],
  });
  const s = priceSummary(q);
  assert.equal(s.inclVat, false);
  assert.deepEqual(s.byKind, [
    { kind: "labor", amount: 10_000 },
    { kind: "other", amount: 1_000 },
  ]);
  assert.equal(s.rot, 0);
  assert.equal(s.total, 11_000);
  assert.equal(s.gross, 13_750);
});

test("price summary: the rounding row brings öre to the whole-krona total", () => {
  const q = quote({
    pricesInclVat: false,
    customer: { ...emptyCustomer, type: "privat" },
    items: [item({ id: "a", qty: 1, unitPrice: 99.9, vatRate: 25, kind: "material" })],
  });
  const s = priceSummary(q);
  const rows = s.byKind.reduce((sum, r) => sum + r.amount, 0);
  assert.equal(s.byKind[0].amount, 124.88);
  assert.equal(s.total, 125);
  assert.equal(Math.round((rows + s.rounding) * 100) / 100, s.total);
});

test("rows group by work step when any row has one, in first-seen order", () => {
  const q = quote({
    pricesInclVat: true,
    customer: { ...emptyCustomer, type: "privat" },
    items: [
      item({ id: "a", unitPrice: 1000, section: "Rivning", kind: "labor" }),
      item({ id: "b", unitPrice: 2000, section: "Tätskikt", kind: "labor" }),
      item({ id: "c", unitPrice: 500, section: "Rivning", kind: "material" }),
      item({ id: "d", unitPrice: 100, section: "" }),
    ],
  });
  const g = groupItems(q);
  assert.deepEqual(g.map((x) => [x.title, x.items.map((i) => i.id), x.subtotal]), [
    ["Rivning", ["a", "c"], 1500],
    ["Tätskikt", ["b"], 2000],
    ["Övrigt", ["d"], 100],
  ]);
});

test("without work steps, Bygg rows group by kind and a lone group has no heading", () => {
  const kinds = groupItems(quote({ items: [item({ id: "m", kind: "material", unitPrice: 100 }), item({ id: "l", kind: "labor", unitPrice: 200 })] }));
  assert.deepEqual(kinds.map((x) => x.title), ["Arbete", "Material"]);
  const one = groupItems(quote({ items: [item({ id: "l", kind: "labor" }), item({ id: "k", kind: "labor" })] }));
  assert.deepEqual(one.map((x) => x.title), [""]);
  const software = groupItems(quote({ division: "01", items: [item({ id: "x", kind: "labor" }), item({ id: "y", kind: "material" })] }));
  assert.deepEqual(software.map((x) => x.title), [""]);
});
