import { test } from "node:test";
import assert from "node:assert/strict";
import { consumerPriceProblem, nonAtaGrossOre } from "./price-guard";
import type { QuoteData } from "../../quotes/schema";
import { emptyCustomer, emptyTerms } from "../../quotes/schema";

const quoteData = (patch: Partial<QuoteData>): QuoteData => ({
  division: "bygg",
  title: "Badrum",
  intro: "",
  customer: { ...emptyCustomer, type: "privat", name: "Anna" },
  items: [{ id: "a", description: "Arbete", qty: 1, unit: "kpl", unitPrice: 100_000, vatRate: 25, kind: "labor", section: "" }],
  pricesInclVat: true,
  rot: false,
  deductionType: "rot",
  show: { process: true, band: true },
  rotPersons: [],
  validDays: 30,
  paymentDays: 30,
  priceType: "fast",
  standardTerms: "none",
  terms: { ...emptyTerms },
  date: "2026-10-15",
  leadId: null,
  cover: "",
  ...patch,
});

const line = (unitPriceOre: number, changeOrderId: string | null = null) => ({ id: "l", description: "", quantity: 1, unit: "st", unitPriceOre, vatCategory: "S" as const, vatRate: 25, kind: "labor" as const, section: "", changeOrderId });
const inv = (id: string, grossKronor: number, over: Partial<{ kind: string; status: string; ata: boolean }> = {}) => ({
  id,
  kind: over.kind ?? "invoice",
  status: over.status ?? "issued",
  document: { buyer: { type: "privat" as const }, lines: [line(Math.round((grossKronor * 100) / 1.25), over.ata ? "co-1" : null)] },
});

test("a fast pris may not be exceeded; an ungefärligt pris by at most 15 %; löpande räkning has no ceiling", () => {
  const fast = { number: 1001, data: quoteData({}) };
  assert.equal(consumerPriceProblem({ quote: fast, invoices: [inv("x", 100_000)], issuingId: "x", ataApproved: false }), null);
  assert.match(consumerPriceProblem({ quote: fast, invoices: [inv("x", 100_001)], issuingId: "x", ataApproved: false })!, /fasta pris \(100 000 kr\)/);
  const approx = { number: 1002, data: quoteData({ priceType: "ungefarlig" }) };
  assert.equal(consumerPriceProblem({ quote: approx, invoices: [inv("x", 115_000)], issuingId: "x", ataApproved: false }), null);
  assert.match(consumerPriceProblem({ quote: approx, invoices: [inv("x", 116_000)], issuingId: "x", ataApproved: false })!, /plus 15 % \(115 000 kr/);
  const hourly = { number: 1003, data: quoteData({ priceType: "lopande" }) };
  assert.equal(consumerPriceProblem({ quote: hourly, invoices: [inv("x", 300_000)], issuingId: "x", ataApproved: false }), null);
});

test("earlier issued invoices count, drafts and voided ones do not, credit notes lower the sum, ÄTA lines and the issuer's confirmation pass", () => {
  const fast = { number: 1001, data: quoteData({}) };
  const earlier = [inv("a", 60_000), inv("draft", 90_000, { status: "draft" }), inv("void", 90_000, { status: "void" })];
  assert.equal(consumerPriceProblem({ quote: fast, invoices: [...earlier, inv("x", 40_000)], issuingId: "x", ataApproved: false }), null);
  assert.ok(consumerPriceProblem({ quote: fast, invoices: [...earlier, inv("x", 40_001)], issuingId: "x", ataApproved: false }));
  assert.equal(consumerPriceProblem({ quote: fast, invoices: [...earlier, inv("c", 10_000, { kind: "credit" }), inv("x", 50_000)], issuingId: "x", ataApproved: false }), null);
  assert.equal(consumerPriceProblem({ quote: fast, invoices: [...earlier, inv("x", 40_000), inv("y", 20_000, { ata: true })], issuingId: "y", ataApproved: false }), null);
  assert.equal(consumerPriceProblem({ quote: fast, invoices: [...earlier, inv("x", 70_000)], issuingId: "x", ataApproved: true }), null);
  // Business customers are outside konsumenttjänstlagen.
  assert.equal(consumerPriceProblem({ quote: { number: 1, data: quoteData({ customer: { ...emptyCustomer, type: "foretag", name: "AB" } }) }, invoices: [inv("x", 900_000)], issuingId: "x", ataApproved: false }), null);
  assert.equal(nonAtaGrossOre({ lines: [line(8_000_000), line(1_000, "co")] }), 10_000_000);
});
