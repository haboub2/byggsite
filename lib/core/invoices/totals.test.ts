import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceTotals, customerSummary } from "./totals";
import { invoiceDocumentSchema, lineForBuyer, newInvoiceDocument, validateForIssue, type InvoiceDocument, type InvoiceLine } from "../documents/invoice";

const seller = {
  name: "Binaafy AB",
  orgNr: "559000-0000",
  vatNr: "SE559000000001",
  street: "Uppstigen 130",
  postalCode: "412 80",
  city: "Göteborg",
  countryCode: "SE",
  email: "faktura@example.se",
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
  email: "anna@example.se",
  phone: "",
  type: "privat" as const,
  customerId: null,
  reference: "",
};

const line = (patch: Partial<InvoiceLine>): InvoiceLine => ({
  id: Math.random().toString(36).slice(2, 8),
  description: "Rad",
  quantity: 1,
  unit: "st",
  unitPriceOre: 0,
  vatCategory: "S",
  vatRate: 25,
  kind: "other",
  section: "",
  changeOrderId: null,
  ...patch,
});

/** Faktura 10022 from the prototype: 47 500 labour and 34 750 material incl. VAT. */
function badrum(): InvoiceDocument {
  const doc = newInvoiceDocument({ issueDate: "2026-10-10", seller, buyer: anna, paymentMeans: { bankgiro: "5555-1234", termsDays: 14 } });
  doc.lines = [
    line({ id: "a", description: "Rivning och bortforsling", quantity: 12, unit: "tim", unitPriceOre: 50_000, kind: "labor" }),
    line({ id: "b", description: "Tätskikt och kakelsättning, 40 %", unitPriceOre: 3_200_000, kind: "labor" }),
    line({ id: "c", description: "Kakel och klinker", unitPriceOre: 2_092_000, kind: "material" }),
    line({ id: "d", description: "Tätskiktsduk, fog och fästmassa", unitPriceOre: 688_000, kind: "material" }),
  ];
  doc.se.rot = {
    buyers: [{ name: "Anna Lindqvist", personalNumber: "850412-1234", roomOre: null }],
    property: { kind: "fastighet", designation: "Göteborg Tolered 1:23" },
    deductionOre: null,
  };
  return invoiceDocumentSchema.parse(doc);
}

test("new document derives due date from terms and reverse charge from buyer type", () => {
  const doc = newInvoiceDocument({ issueDate: "2026-10-10", seller, buyer: anna, paymentMeans: { termsDays: 14 } });
  assert.equal(doc.dueDate, "2026-10-24");
  assert.equal(doc.se.reverseCharge, false);
  assert.equal(doc.paymentMeans.termsText, "14 dagar netto");
  assert.equal(doc.number, null);
  const bygg = newInvoiceDocument({ issueDate: "2026-10-15", seller, buyer: { ...anna, type: "byggforetag" } });
  assert.equal(bygg.se.reverseCharge, true);
});

test("private customer with ROT: the prototype's figures", () => {
  const t = invoiceTotals(badrum());
  assert.equal(t.net, 6_580_000);
  assert.equal(t.vat, 1_645_000);
  assert.equal(t.gross, 8_225_000);
  assert.equal(t.laborGross, 4_750_000);
  assert.deepEqual(t.vatBreakdown, [{ category: "S", rate: 25, taxable: 6_580_000, vat: 1_645_000 }]);
  assert.ok(t.rot);
  assert.equal(t.rot.rate, 0.3);
  assert.equal(t.rot.deduction, 1_425_000);
  assert.deepEqual(t.rot.perBuyer, [1_425_000]);
  assert.equal(t.rot.capped, false);
  assert.equal(t.rounding, 0);
  assert.equal(t.payable, 6_800_000);
  assert.deepEqual(
    t.byKind.map((k) => [k.kind, k.gross]),
    [
      ["labor", 4_750_000],
      ["material", 3_475_000],
    ]
  );
  const s = customerSummary(badrum(), t);
  assert.equal(s.inclVat, true);
  assert.equal(s.subtotal, 8_225_000);
  assert.equal(s.rot, 1_425_000);
});

test("ROT is capped by the buyers' room and split least-room-first", () => {
  const doc = badrum();
  doc.lines = [line({ id: "a", description: "Arbete", unitPriceOre: 20_000_000, kind: "labor" })]; // 250 000 incl. VAT → 75 000 uncapped
  doc.se.rot!.buyers = [
    { name: "A", personalNumber: "850412-1234", roomOre: 1_000_000 },
    { name: "B", personalNumber: "830101-1234", roomOre: null },
  ];
  const t = invoiceTotals(doc);
  assert.equal(t.rot!.uncapped, 7_500_000);
  assert.equal(t.rot!.deduction, 6_000_000); // 10 000 + 50 000 cap
  assert.deepEqual(t.rot!.perBuyer, [1_000_000, 5_000_000]);
  assert.equal(t.rot!.capped, true);
  assert.equal(t.payable, 25_000_000 - 6_000_000);
});

test("an explicit ROT override wins when lower", () => {
  const doc = badrum();
  doc.se.rot!.deductionOre = 1_000_000;
  const t = invoiceTotals(doc);
  assert.equal(t.rot!.deduction, 1_000_000);
  assert.equal(t.rot!.capped, true);
  assert.equal(t.payable, 7_225_000);
});

test("ROT uses the rules at the invoice date: 50 % in 2025", () => {
  const doc = badrum();
  doc.issueDate = "2025-06-01";
  doc.dueDate = "2025-06-15";
  const t = invoiceTotals(doc);
  assert.equal(t.rot!.rate, 0.5);
  assert.equal(t.rot!.deduction, 2_375_000);
});

test("business customer: no ROT, summary excl. VAT", () => {
  const doc = badrum();
  doc.buyer = { ...anna, type: "foretag", name: "Göteborgs Fastighets AB", orgNr: "556000-0000", vatNr: "SE556000000001" };
  const t = invoiceTotals(doc);
  assert.equal(t.rot, null);
  assert.equal(t.payable, 8_225_000);
  const s = customerSummary(doc, t);
  assert.equal(s.inclVat, false);
  assert.equal(s.subtotal, 6_580_000);
});

test("builder under reverse charge: no VAT at all, not even on material", () => {
  const doc = badrum();
  doc.buyer = { ...anna, type: "byggforetag", name: "Västkustens Bygg AB", orgNr: "556111-1111", vatNr: "SE556111111101" };
  doc.se.reverseCharge = true;
  doc.se.rot = null;
  doc.lines = doc.lines.map((l) => lineForBuyer(l, doc.buyer));
  const t = invoiceTotals(doc);
  assert.equal(t.vat, 0);
  assert.equal(t.gross, t.net);
  assert.deepEqual(t.vatBreakdown, [{ category: "AE", rate: 0, taxable: 6_580_000, vat: 0 }]);
  assert.equal(t.reverseCharge, true);
  assert.deepEqual(validateForIssue(doc), []);
});

test("plain goods to a builder may keep VAT", () => {
  const doc = badrum();
  doc.buyer = { ...anna, type: "byggforetag", vatNr: "SE556111111101" };
  doc.se.reverseCharge = true;
  doc.se.rot = null;
  doc.lines = doc.lines.map((l) => lineForBuyer(l, doc.buyer, true));
  const t = invoiceTotals(doc);
  assert.equal(t.vatBreakdown.length, 2);
  assert.equal(t.vat, 695_000); // 25 % on 27 800 material
  assert.deepEqual(validateForIssue(doc), []);
});

test("credit note mirrors every amount including ROT and rounding", () => {
  const doc = badrum();
  doc.kind = "credit";
  doc.references.precedingInvoiceNumber = "10022";
  const t = invoiceTotals(doc);
  assert.equal(t.net, -6_580_000);
  assert.equal(t.gross, -8_225_000);
  assert.equal(t.rot!.deduction, -1_425_000);
  assert.equal(t.payable, -6_800_000);
  assert.deepEqual(validateForIssue(doc), []);
});

test("öresavrundning shows as its own row and the payable is whole kronor", () => {
  const doc = badrum();
  doc.se.rot = null;
  doc.lines = [line({ id: "a", description: "Timmar", quantity: 3, unit: "tim", unitPriceOre: 33_333, kind: "labor" })]; // 999,99 net → 1 249,99 gross
  const t = invoiceTotals(doc);
  assert.equal(t.gross, 124_999);
  assert.equal(t.rounding, 1);
  assert.equal(t.payable, 125_000);
});

test("validateForIssue catches what momslagen and Skatteverket require", () => {
  const ok = badrum();
  assert.deepEqual(validateForIssue(ok), []);

  const noLines = { ...ok, lines: [] };
  assert.ok(validateForIssue(noLines).some((e) => e.includes("minst en rad")));

  const numbered = { ...ok, number: "10022" };
  assert.ok(validateForIssue(numbered).some((e) => e.includes("redan ett nummer")));

  const noVat = { ...ok, seller: { ...seller, vatNr: "" } };
  assert.ok(validateForIssue(noVat).some((e) => e.includes("momsregistreringsnummer")));

  const builderNoVat = { ...ok, buyer: { ...anna, type: "byggforetag" as const }, se: { ...ok.se, reverseCharge: true, rot: null } };
  assert.ok(validateForIssue(builderNoVat).some((e) => e.includes("köparens momsregistreringsnummer")));

  const builderForgotReverse = { ...ok, buyer: { ...anna, type: "byggforetag" as const, vatNr: "SE556111111101" }, se: { ...ok.se, rot: null } };
  assert.ok(validateForIssue(builderForgotReverse).some((e) => e.includes("omvänd betalningsskyldighet")));

  const rotOnBusiness = { ...ok, buyer: { ...anna, type: "foretag" as const } };
  assert.ok(validateForIssue(rotOnBusiness).some((e) => e.includes("bara privatpersoner")));

  const badPnr = { ...ok, se: { ...ok.se, rot: { ...ok.se.rot!, buyers: [{ name: "X", personalNumber: "123", roomOre: null }] } } };
  assert.ok(validateForIssue(badPnr).some((e) => e.includes("Personnummer")));

  // As the database stores it after 0023: masked, with the ciphertext next to it.
  const sealed = { ...ok, se: { ...ok.se, rot: { ...ok.se.rot!, buyers: [{ name: "Anna", personalNumber: "19850412-XXXX", personalNumberSealed: "ww0ECQMC", roomOre: null }] } } };
  assert.deepEqual(validateForIssue(sealed), []);
  const maskedWithoutCipher = { ...ok, se: { ...ok.se, rot: { ...ok.se.rot!, buyers: [{ name: "Anna", personalNumber: "19850412-XXXX", roomOre: null }] } } };
  assert.ok(validateForIssue(maskedWithoutCipher).some((e) => e.includes("Personnummer")));

  const creditNoRef = { ...ok, kind: "credit" as const };
  assert.ok(validateForIssue(creditNoRef).some((e) => e.includes("kreditfaktura")));

  const dueBefore = { ...ok, dueDate: "2026-10-01" };
  assert.ok(validateForIssue(dueBefore).some((e) => e.includes("Förfallodatum")));
});

test("the schema fills defaults so older documents keep parsing", () => {
  const minimal = invoiceDocumentSchema.parse({ issueDate: "2026-10-10", dueDate: "2026-10-24", seller, buyer: anna, lines: [] });
  assert.equal(minimal.currency, "SEK");
  assert.equal(minimal.kind, "invoice");
  assert.equal(minimal.se.reverseCharge, false);
  assert.equal(minimal.paymentMeans.termsDays, 30);
});
