import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accountTotals,
  entriesIn,
  isLocked,
  isPeriod,
  isPeriodLocked,
  lockProblem,
  monthRange,
  previousMonth,
  recentPeriods,
  sieFileName,
  vatSummary,
  type LedgerEntry,
} from "./period";
import { postInvoice, postPayment } from "./posting";
import { invoiceTotals } from "../invoices/totals";
import { newInvoiceDocument, type InvoiceDocument } from "../documents/invoice";

let n = 0;
const toEntry = (p: { date: string; text: string; source: { type: string }; lines: { account: string; debit: number; credit: number }[] }): LedgerEntry => ({
  id: `e${++n}`,
  series: "V",
  fiscalYear: Number(p.date.slice(0, 4)),
  number: n,
  date: p.date,
  text: p.text,
  sourceType: p.source.type,
  lines: p.lines.map((l) => ({ account: l.account, debit: l.debit, credit: l.credit })),
});

const seller = { name: "Binaafy AB", orgNr: "559000-0000", vatNr: "SE559000000001", street: "", postalCode: "", city: "Göteborg", countryCode: "SE", email: "", phone: "", fSkatt: true };

function invoice(type: InvoiceDocument["buyer"]["type"], date: string, lines: { net: number; rate: number; kind?: "labor" | "material" }[]): LedgerEntry {
  const buyer = { name: "Kund", orgNr: "", vatNr: type === "byggforetag" ? "SE556677889901" : "", street: "", postalCode: "", city: "", countryCode: "SE", email: "", phone: "", type, customerId: null, reference: "" };
  const base = newInvoiceDocument({ issueDate: date, seller, buyer });
  const doc: InvoiceDocument = {
    ...base,
    se: {
      ...base.se,
      rot: type === "privat" ? { buyers: [{ name: "Kund", personalNumber: "850412-1234", roomOre: null }], property: { kind: "fastighet", designation: "Göteborg Tolered 1:23" }, deductionOre: null } : null,
    },
    lines: lines.map((l, i) => ({
      id: `l${i}`,
      description: "Rad",
      quantity: 1,
      unit: "st",
      unitPriceOre: l.net,
      vatCategory: type === "byggforetag" ? "AE" : "S",
      vatRate: type === "byggforetag" ? 0 : l.rate,
      kind: l.kind ?? "material",
      section: "",
      changeOrderId: null,
    })),
  };
  return toEntry(postInvoice(doc, invoiceTotals(doc), crypto.randomUUID()));
}

test("months: range, previous, recent, validation", () => {
  assert.deepEqual(monthRange("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(monthRange("2028-02"), { from: "2028-02-01", to: "2028-02-29" });
  assert.deepEqual(monthRange("2026-10"), { from: "2026-10-01", to: "2026-10-31" });
  assert.equal(previousMonth("2026-01"), "2025-12");
  assert.equal(previousMonth("2026-10"), "2026-09");
  assert.deepEqual(recentPeriods("2026-02", 4), ["2026-02", "2026-01", "2025-12", "2025-11"]);
  assert.equal(isPeriod("2026-13"), false);
  assert.equal(isPeriod("2026-1"), false);
  assert.equal(isPeriod("2026-08"), true);
  assert.throws(() => monthRange("2026-00"));
});

test("locks: a date inside, a whole month, and which months can be locked", () => {
  const locks = [{ periodStart: "2026-08-01", periodEnd: "2026-08-31" }];
  assert.equal(isLocked(locks, "2026-08-01"), true);
  assert.equal(isLocked(locks, "2026-08-31"), true);
  assert.equal(isLocked(locks, "2026-09-01"), false);
  assert.equal(isPeriodLocked(locks, "2026-08"), true);
  assert.equal(isPeriodLocked(locks, "2026-09"), false);
  assert.equal(isPeriodLocked([{ periodStart: "2026-01-01", periodEnd: "2026-12-31" }], "2026-05"), true);
  assert.match(lockProblem(locks, "2026-08", "2026-10-20")!, /redan låst/);
  assert.match(lockProblem(locks, "2026-10", "2026-10-20")!, /inte slut/);
  assert.match(lockProblem(locks, "2026-09", "2026-09-30")!, /inte slut/);
  assert.equal(lockProblem(locks, "2026-09", "2026-10-01"), null);
});

test("account totals and entries in a range", () => {
  const a = invoice("foretag", "2026-10-05", [{ net: 100_000, rate: 25 }]);
  const b = toEntry(postPayment({ paymentId: "p", amount: 125_000, method: "bankgiro", date: "2026-10-20" }));
  const c = invoice("foretag", "2026-11-02", [{ net: 50_000, rate: 25 }]);
  const oct = entriesIn([c, b, a], "2026-10-01", "2026-10-31");
  assert.deepEqual(oct.map((e) => e.id), [a.id, b.id]);
  assert.deepEqual(accountTotals(oct), [
    { account: "1510", debit: 125_000, credit: 125_000, net: 0 },
    { account: "1930", debit: 125_000, credit: 0, net: 125_000 },
    { account: "2611", debit: 0, credit: 25_000, net: -25_000 },
    { account: "3001", debit: 0, credit: 100_000, net: -100_000 },
  ]);
});

test("VAT summary: rates, reverse charge, ROT receivable, credit notes net out", () => {
  const entries = [
    invoice("foretag", "2026-10-01", [{ net: 100_000, rate: 25 }, { net: 40_000, rate: 12 }, { net: 10_000, rate: 6 }, { net: 5_000, rate: 0 }]),
    invoice("byggforetag", "2026-10-02", [{ net: 300_000, rate: 0 }]),
    invoice("privat", "2026-10-03", [{ net: 80_000, rate: 25, kind: "labor" }]),
  ];
  const credit = invoice("foretag", "2026-10-04", [{ net: 100_000, rate: 25 }]);
  // A credit note is the same posting mirrored.
  credit.lines = credit.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
  const v = vatSummary([...entries, credit]);
  assert.deepEqual(v.sales, { 25: 80_000, 12: 40_000, 6: 10_000, 0: 5_000 });
  assert.deepEqual(v.outputVat, { 25: 20_000, 12: 4_800, 6: 600 });
  assert.equal(v.outputVatTotal, 25_400);
  assert.equal(v.reverseCharge, 300_000);
  // Private customer: 100 000 incl. VAT, 30 % ROT on labour = 30 000 to Skatteverket.
  assert.equal(v.movement.rotReceivable, 30_000);
  assert.equal(v.movement.bank, 0);
  assert.deepEqual(v.boxes, { "05": 130_000, "06": 0, "07": 0, "10": 20_000, "11": 4_800, "12": 600, "41": 300_000, "42": 5_000 });
  // An empty month is zero, never −0 (which formats as "−0 kr").
  assert.ok(Object.is(vatSummary([]).boxes["41"], 0));
});

test("SIE file name", () => {
  assert.equal(sieFileName("Binaafy AB", "2026-10"), "binaafy-ab-2026-10.se");
  assert.equal(sieFileName("Åkesson & Söner Bygg", "2026-08"), "akesson-soner-bygg-2026-08.se");
  assert.equal(sieFileName("", "2026-08"), "bokforing-2026-08.se");
});
