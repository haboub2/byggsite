import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accountTotals,
  entriesIn,
  fiscalYearChangeProblem,
  isLocked,
  isPeriod,
  isPeriodLocked,
  lockProblem,
  monthRange,
  periodTodos,
  periodsBetween,
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

test("period todos: unexported ended months, and the lock reminder after the 10th", () => {
  const entries = [
    { period: "2026-07", count: 4 },
    { period: "2026-08", count: 0 },
    { period: "2026-09", count: 6 },
    { period: "2026-10", count: 2 },
    { period: "2026-06", count: 3 },
  ];
  const locks = [{ periodStart: "2026-06-01", periodEnd: "2026-06-30" }];
  // Before the 10th: July and September not exported; June locked, August empty, October running.
  assert.deepEqual(periodTodos({ entries, exported: [], locks, today: "2026-10-10" }), [
    { kind: "export", period: "2026-07", entries: 4, lockDue: false },
    { kind: "export", period: "2026-09", entries: 6, lockDue: false },
  ]);
  // After the 10th, September (last month) is due for locking as well.
  assert.deepEqual(periodTodos({ entries, exported: ["2026-07"], locks, today: "2026-10-11" }), [{ kind: "export", period: "2026-09", entries: 6, lockDue: true }]);
  // Exported but still open: the soft reminder.
  assert.deepEqual(periodTodos({ entries, exported: ["2026-07", "2026-09"], locks, today: "2026-10-25" }), [{ kind: "lock", period: "2026-09", entries: 6 }]);
  // Locked: nothing left.
  assert.deepEqual(periodTodos({ entries, exported: ["2026-07"], locks: [...locks, { periodStart: "2026-09-01", periodEnd: "2026-09-30" }], today: "2026-10-25" }), []);
  // January looks back at December of the year before.
  assert.deepEqual(periodTodos({ entries: [{ period: "2026-12", count: 1 }], exported: ["2026-12"], locks: [], today: "2027-01-15" }), [{ kind: "lock", period: "2026-12", entries: 1 }]);
});

test("the months of a fiscal year, across new year", () => {
  assert.deepEqual(periodsBetween("2026-07-01", "2027-06-30"), ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06"]);
  assert.deepEqual(periodsBetween("2026-01-01", "2026-12-31").length, 12);
  assert.deepEqual(periodsBetween("2026-10", "2026-10"), ["2026-10"]);
});

test("moving the fiscal year waits for open months numbered in another year", () => {
  const v = (date: string, fiscalYear: number, number: number) => ({ series: "V", date, fiscalYear, number });
  // Calendar year so far: September and October 2026 are V 2026-5 and 2026-6.
  const entries = [v("2026-05-10", 2026, 1), v("2026-09-15", 2026, 5), v("2026-10-02", 2026, 6)];
  const problem = fiscalYearChangeProblem(entries, [], "07-01");
  assert.match(problem ?? "", /2 verifikationer i olåsta månader \(först V5 den 2026-09-15\)/);
  // With July–December locked, May stays in the year ending 2026 either way: nothing is in the way.
  const locks = [{ periodStart: "2026-07-01", periodEnd: "2026-12-31" }];
  assert.equal(fiscalYearChangeProblem(entries, locks, "07-01"), null);
  // Back to the calendar year, and entries already numbered per fiscal year.
  assert.equal(fiscalYearChangeProblem(entries, [], "01-01"), null);
  assert.equal(fiscalYearChangeProblem([v("2026-09-15", 2027, 1)], [], "07-01"), null);
  assert.match(fiscalYearChangeProblem([v("2026-09-15", 2027, 1)], [], "01-01") ?? "", /1 verifikation i olåsta/);
});
