import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceDocumentFromQuote, lineFromQuoteItem } from "./from-quote";
import { invoiceTotals } from "./totals";
import { validateForIssue } from "../documents/invoice";
import { rotPersonSchema, type Quote } from "../../quotes/schema";

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

const quote = {
  id: "q1",
  number: 1042,
  status: "accepted",
  created_at: "",
  updated_at: "",
  sent_at: null,
  created_by: null,
  data: {
    division: "bygg",
    title: "Badrumsrenovering",
    intro: "",
    customer: { type: "privat", name: "Anna Lindqvist", company: "", orgNr: "", email: "anna@example.se", phone: "", street: "Bräckevägen 12", postalCode: "417 03", city: "Göteborg", reference: "" },
    items: [
      { id: "a", description: "Rivning", qty: 12, unit: "tim", unitPrice: 625, vatRate: 25, kind: "labor", section: "Rivning" },
      { id: "b", description: "Kakel", qty: 1, unit: "kpl", unitPrice: 26150, vatRate: 25, kind: "material", section: "" },
    ],
    pricesInclVat: true,
    rot: true,
    rotPersons: [{ name: "Anna Lindqvist", personalNumber: "850412-1234" }],
    validDays: 30,
    paymentDays: 14,
    terms: { payment: "", start: "", warranty: "", excluded: "", notes: "" },
    date: "2026-09-01",
    leadId: null,
  },
} as unknown as Quote;

test("quote prices incl. VAT become net öre; the gross is unchanged", () => {
  const line = lineFromQuoteItem(quote.data.items[0], true);
  assert.equal(line.unitPriceOre, 50_000); // 625 kr incl. → 500 kr net
  assert.equal(line.kind, "labor");
  assert.equal(line.section, "Rivning");
  const excl = lineFromQuoteItem({ ...quote.data.items[0], unitPrice: 500 }, false);
  assert.equal(excl.unitPriceOre, 50_000);
});

test("a private ROT quote becomes a draft with ROT buyers and the quote reference", () => {
  const doc = invoiceDocumentFromQuote({ quote, seller, paymentMeans: { bankgiro: "5555-1234" }, issueDate: "2026-10-10", customerId: null });
  assert.equal(doc.number, null);
  assert.equal(doc.dueDate, "2026-10-24");
  assert.equal(doc.references.quoteNumber, 1042);
  assert.equal(doc.buyer.type, "privat");
  assert.equal(doc.se.reverseCharge, false);
  assert.equal(doc.se.rot?.buyers[0].personalNumber, "850412-1234");
  assert.equal(doc.se.rot?.property, null);
  const t = invoiceTotals(doc);
  assert.equal(t.gross, 750_000 + 2_615_000);
  assert.equal(t.rot?.deduction, 225_000);
  // Not issuable yet: the property is missing. That is the editor's job.
  assert.ok(validateForIssue(doc).some((e) => e.includes("fastighetsbeteckning")));
});

test("a sealed quote passes the masked number and its ciphertext on to the invoice (0024)", () => {
  const q = { ...quote, data: { ...quote.data, rotPersons: [{ name: "Anna Lindqvist", personalNumber: "19850412-XXXX", personalNumberSealed: "c2VhbGVk" }, { name: "Bo", personalNumber: "" }] } } as Quote;
  const doc = invoiceDocumentFromQuote({ quote: q, seller, paymentMeans: { bankgiro: "5555-1234" }, issueDate: "2026-10-10", customerId: null });
  assert.deepEqual(doc.se.rot?.buyers[0], { name: "Anna Lindqvist", personalNumber: "19850412-XXXX", personalNumberSealed: "c2VhbGVk", roomOre: null });
  assert.equal("personalNumberSealed" in doc.se.rot!.buyers[1], false);
});

test("the quote schema wants the ciphertext next to a masked number", () => {
  assert.ok(rotPersonSchema.safeParse({ name: "A", personalNumber: "19850412-XXXX", personalNumberSealed: "c2VhbGVk" }).success);
  assert.ok(rotPersonSchema.safeParse({ name: "A", personalNumber: "850412-1234" }).success);
  const bare = rotPersonSchema.safeParse({ name: "A", personalNumber: "19850412-XXXX" });
  assert.equal(bare.success, false);
  assert.deepEqual(bare.error?.issues[0].path, ["personalNumber"]);
  assert.equal(rotPersonSchema.safeParse({ name: "A", personalNumber: "8504-12" }).success, false);
});

test("a business quote becomes a business buyer without ROT", () => {
  const q = { ...quote, data: { ...quote.data, rot: false, customer: { ...quote.data.customer, type: "foretag", company: "Göteborgs Fastighets AB", orgNr: "556000-0000", reference: "Inköp" } } } as Quote;
  const doc = invoiceDocumentFromQuote({ quote: q, seller, paymentMeans: {}, issueDate: "2026-10-10", customerId: "11111111-1111-4111-8111-111111111111" });
  assert.equal(doc.buyer.name, "Göteborgs Fastighets AB");
  assert.equal(doc.buyer.reference, "Inköp");
  assert.equal(doc.buyer.customerId, "11111111-1111-4111-8111-111111111111");
  assert.equal(doc.se.rot, null);
});
