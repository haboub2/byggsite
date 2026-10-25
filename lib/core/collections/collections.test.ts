import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTION_CSV_HEADER,
  collectionBlocker,
  collectionClaim,
  collectionCsv,
  collectionFileStem,
  csvAmount,
  defaultPayBy,
  demandBlocker,
  demandPlan,
  interestToDate,
  minimumPayBy,
  payByProblem,
  type CollectionInput,
} from "./collections";
import { reminderDue, reminderInput, reminderText } from "../reminders/reminders";
import { rulesAt } from "../rules";

const base: CollectionInput = {
  kind: "invoice",
  status: "sent",
  payableOre: 4_250_000,
  paidOre: 0,
  dueOn: "2026-10-01",
  reminders: 1,
  remindedAt: "2026-10-10T08:00:00Z",
  collectionCaseId: null,
  collectionDemandedOn: null,
  collectionDemandPayBy: null,
  document: { issueDate: "2026-09-01", buyer: { type: "foretag" } },
};

test("the amounts are the statute's: 180 kr demand, 60 kr reminder, 450 kr förseningsersättning", () => {
  const r = rulesAt("2026-10-25");
  assert.equal(r.collection.demandFeeOre, 18_000);
  assert.equal(r.reminderFee.businessOre, 6_000);
  assert.equal(r.collection.delayCompensationOre, 45_000);
  assert.equal(r.collection.minPayDays, 8);
  assert.equal(r.collection.minBankDays, 4);
});

test("interest to date: one period with one rate is the reminders' formula", () => {
  const i = interestToDate({ payableOre: 4_250_000, dueOn: "2026-10-12", payments: [], to: "2026-10-25" });
  // 42 500 × 9,75 % × 13 / 365 = 147,59 kr
  assert.equal(i.totalOre, 14_759);
  assert.equal(i.periods.length, 1);
  assert.deepEqual(i.periods[0], { from: "2026-10-12", to: "2026-10-25", days: 13, capitalOre: 4_250_000, percent: 9.75, referencePercent: 1.75, interestOre: 14_759 });
  assert.equal(i.percentToday, 9.75);
});

test("interest to date: each half-year's reference rate, and a payment lowers the capital from its date", () => {
  const i = interestToDate({ payableOre: 10_000_000, dueOn: "2025-12-01", payments: [{ paidOn: "2026-01-15", amountOre: 4_000_000 }], to: "2026-02-01" });
  assert.deepEqual(
    i.periods.map((p) => [p.from, p.to, p.days, p.capitalOre, p.percent, p.interestOre]),
    [
      // 100 000 × 10 % (2,0 + 8) × 31 / 365
      ["2025-12-01", "2026-01-01", 31, 10_000_000, 10, 84_932],
      // 100 000 × 9,75 % (1,75 + 8) × 14 / 365
      ["2026-01-01", "2026-01-15", 14, 10_000_000, 9.75, 37_397],
      // 60 000 × 9,75 % × 17 / 365
      ["2026-01-15", "2026-02-01", 17, 6_000_000, 9.75, 27_247],
    ]
  );
  assert.equal(i.totalOre, 149_576);
});

test("interest to date: nothing before the due date, nothing on what was paid before it", () => {
  assert.equal(interestToDate({ payableOre: 1_000_000, dueOn: "2026-10-25", payments: [], to: "2026-10-25" }).totalOre, 0);
  const prepaid = interestToDate({ payableOre: 1_000_000, dueOn: "2026-10-01", payments: [{ paidOn: "2026-09-20", amountOre: 1_000_000 }], to: "2026-10-25" });
  assert.equal(prepaid.totalOre, 0);
  assert.deepEqual(prepaid.periods, []);
});

test("the claim: capital, interest to date, reminder fees and the demand fee separately", () => {
  const claim = collectionClaim({
    payableOre: 10_000_000,
    paidOre: 4_000_000,
    dueOn: "2025-12-01",
    payments: [{ paidOn: "2026-01-15", amountOre: 4_000_000 }],
    reminders: [
      { kind: "reminder", level: 1, feeOre: 6_000, interestOre: 5_000, sentAt: "2025-12-10T09:00:00Z", sentTo: "x", payBy: null },
      { kind: "demand", level: 2, feeOre: 18_000, interestOre: 7_000, sentAt: "2026-01-05T09:00:00Z", sentTo: "x", payBy: "2026-01-15" },
    ],
    asOf: "2026-02-01",
  });
  assert.equal(claim.capitalOre, 6_000_000);
  assert.equal(claim.interest.totalOre, 149_576);
  assert.equal(claim.invoicedInterestOre, 12_000);
  assert.equal(claim.reminderFeesOre, 6_000);
  assert.equal(claim.demandFeeOre, 18_000);
  assert.equal(claim.totalOre, 6_000_000 + 149_576 + 6_000 + 18_000);
});

test("pay-by: at least eight days and four bank days from receipt, later around Christmas", () => {
  assert.equal(minimumPayBy("2026-10-25"), "2026-11-02");
  // Friday 18 December: the 26th is a Saturday, and Christmas leaves three bank days by then.
  assert.equal(minimumPayBy("2026-12-18"), "2026-12-28");
  assert.equal(defaultPayBy("2026-10-25"), "2026-11-04");
  assert.equal(payByProblem("2026-11-02", "2026-10-25"), null);
  assert.match(payByProblem("2026-10-30", "2026-10-25")!, /2026-11-02 eller senare/);
  assert.match(payByProblem("2027-01-30", "2026-10-25")!, /60 dagar/);
  assert.match(payByProblem("30/10", "2026-10-25")!, /ÅÅÅÅ-MM-DD/);
});

test("demand plan: 180 kr, interest since the last reminder, earlier fees still owed", () => {
  const plan = demandPlan(base, "2026-10-25", { payBy: "2026-11-04", earlier: { feesOre: 6_000, interestOre: 5_000 } });
  assert.equal(plan.feeOre, 18_000);
  assert.equal(plan.interestFrom, "2026-10-10");
  // 42 500 × 9,75 % × 15 / 365 = 170,29 kr
  assert.equal(plan.interestOre, 17_029);
  assert.equal(plan.totalOre, 4_250_000 + 6_000 + 5_000 + 18_000 + 17_029);
  assert.equal(plan.daysOverdue, 24);
  // Private customers pay the demand fee too (lag 1981:739 3 §, no agreement needed).
  assert.equal(demandPlan({ ...base, document: { ...base.document, buyer: { type: "privat" } } }, "2026-10-25", { payBy: "2026-11-04", earlier: { feesOre: 0, interestOre: 0 } }).feeOre, 18_000);
  assert.throws(() => demandPlan(base, "2026-10-25", { payBy: "2026-10-28", earlier: { feesOre: 0, interestOre: 0 } }), /eller senare/);
});

test("demand: only on an overdue, unpaid invoice, once, and not inside the last reminder's ten days", () => {
  assert.equal(demandBlocker(base, "2026-10-25"), null);
  assert.equal(demandBlocker({ ...base, reminders: 0, remindedAt: null }, "2026-10-25"), null);
  assert.match(demandBlocker({ ...base, dueOn: "2026-10-25" }, "2026-10-25")!, /inte förfallit/);
  assert.match(demandBlocker({ ...base, status: "paid" }, "2026-10-25")!, /inte obetald/);
  assert.match(demandBlocker({ ...base, kind: "credit" }, "2026-10-25")!, /vanlig faktura/);
  assert.match(demandBlocker({ ...base, collectionCaseId: "c1" }, "2026-10-25")!, /redan hos inkasso/);
  assert.match(demandBlocker({ ...base, collectionDemandedOn: "2026-10-20", collectionDemandPayBy: "2026-10-30" }, "2026-10-25")!, /skickades 2026-10-20/);
  // Reminder 2 is the last before collection and says "inom tio dagar".
  const last = { ...base, reminders: 2, remindedAt: "2026-10-20T08:00:00Z" };
  assert.match(demandBlocker(last, "2026-10-25")!, /till och med 2026-10-30/);
  assert.equal(demandBlocker(last, "2026-10-31"), null);
});

test("collection: after at least one reminder or a demand, and not before the demand's last day", () => {
  assert.equal(collectionBlocker(base, "2026-10-25"), null);
  assert.match(collectionBlocker({ ...base, reminders: 0, remindedAt: null }, "2026-10-25")!, /minst en påminnelse/);
  const demanded = { ...base, reminders: 2, collectionDemandedOn: "2026-10-25", collectionDemandPayBy: "2026-11-04" };
  assert.match(collectionBlocker(demanded, "2026-11-04")!, /till och med 2026-11-04/);
  assert.equal(collectionBlocker(demanded, "2026-11-05"), null);
  assert.match(collectionBlocker({ ...base, collectionCaseId: "c1" }, "2026-10-25")!, /redan hos inkasso/);
  assert.match(collectionBlocker({ ...base, reminders: 2, remindedAt: "2026-10-20T08:00:00Z" }, "2026-10-25")!, /2026-10-30/);
});

test("reminders stop at collection and after a demand, in the cron's list and the button", () => {
  const inv = { payableOre: 4_250_000, paidOre: 0, dueOn: "2026-10-01", reminders: 1, remindedAt: "2026-10-05T08:00:00Z", status: "sent", kind: "invoice" as const, document: { issueDate: "2026-09-01", buyer: { type: "foretag" as const } } };
  assert.ok(reminderDue(reminderInput(inv), "2026-10-25"));
  assert.equal(reminderDue(reminderInput({ ...inv, collectionCaseId: "c1" }), "2026-10-25"), null);
  assert.equal(reminderDue(reminderInput({ ...inv, collectionDemandedOn: "2026-10-20" }), "2026-10-25"), null);
  // Leaving collection (case closed) lets the chain continue.
  assert.ok(reminderDue(reminderInput({ ...inv, collectionCaseId: null, collectionDemandedOn: null }), "2026-10-25"));
  assert.match(reminderText(reminderDue(reminderInput({ ...inv, reminders: 1 }), "2026-10-25")!, "1", "2026-10-01"), /inom tio dagar/);
});

test("CSV: the generic columns first, amounts with decimal comma, the personal number when given", () => {
  const claim = collectionClaim({ payableOre: 4_250_000, paidOre: 0, dueOn: "2026-10-12", payments: [], reminders: [{ kind: "reminder", level: 1, feeOre: 6_000, interestOre: 1_000, sentAt: "2026-10-16T08:00:00Z", sentTo: "", payBy: null }], asOf: "2026-10-25" });
  const csv = collectionCsv([
    {
      reference: "10001-1",
      debtor: { name: "Anna Andersson", type: "privat", id: "19850412-1234", street: "Vägen 2", postalCode: "123 45", city: "Täby", countryCode: "SE", email: "anna@exempel.se", phone: "+46 70 123 45 67" },
      invoice: { number: "10001", issueDate: "2026-09-12", dueDate: "2026-10-12", ocr: "1000108", bankgiro: "123-4567", currency: "SEK", description: "Badrumsrenovering; kakel" },
      claim,
    },
  ]);
  assert.ok(csv.startsWith("﻿"));
  const [header, row] = csv.slice(1).trimEnd().split("\r\n");
  assert.deepEqual(header.split(";").slice(0, 14), ["Ärendenr", "Gäldenär", "Orgnr/personnr", "Adress", "E-post", "Telefon", "Fakturanr", "Fakturadatum", "Förfallodatum", "Kapital", "Ränta", "Påminnelseavgift", "OCR", "Bankgiro"]);
  assert.equal(header.split(";").length, COLLECTION_CSV_HEADER.length);
  assert.equal(
    row,
    // A leading + would be guarded as a formula ('+46…), so the phone is written 0046….
    "10001-1;Anna Andersson;19850412-1234;Vägen 2;anna@exempel.se;0046 70 123 45 67;10001;2026-09-12;2026-10-12;42500,00;147,59;60,00;1000108;123-4567;123 45;Täby;SE;Privatperson;0,00;2026-10-12;2026-10-25;9,75;SEK;\"Badrumsrenovering; kakel\""
  );
});

test("amounts and file names", () => {
  assert.equal(csvAmount(149_576), "1495,76");
  assert.equal(csvAmount(5), "0,05");
  assert.equal(csvAmount(-1_200), "-12,00");
  assert.equal(collectionFileStem("10001-1", "Åsa Öberg AB"), "Inkassounderlag-10001-1-Asa-Oberg-AB");
});

test("demand plan: interest across a half-year uses each half-year's rate, as the letter says", () => {
  const inv: CollectionInput = { ...base, dueOn: "2025-12-01", reminders: 0, remindedAt: null };
  const plan = demandPlan(inv, "2026-01-15", { payBy: "2026-01-26", earlier: { feesOre: 0, interestOre: 0 } });
  // 42 500 × 10 % × 31 / 365 + 42 500 × 9,75 % × 14 / 365
  assert.equal(plan.interestOre, 36_096 + 15_894);
  assert.equal(plan.interestPercent, 9.75);
});
