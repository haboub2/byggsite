import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDashboard, isoWeek, weekStart, type DashInvoice } from "./dashboard";

const inv = (patch: Partial<DashInvoice>): DashInvoice => ({
  id: Math.random().toString(36).slice(2),
  number: "1",
  kind: "invoice",
  status: "sent",
  buyerName: "X",
  customerId: null,
  reverseCharge: false,
  issuedOn: "2026-10-10",
  dueOn: "2026-10-24",
  paidAt: null,
  totalOre: 8_225_000,
  vatOre: 1_645_000,
  rotOre: 1_425_000,
  payableOre: 6_800_000,
  paidOre: 0,
  reminders: 0,
  ...patch,
});

// Sunday 19 October 2026 is in ISO week 43 (Monday 12 Oct … Sunday 18 Oct is week 42).
test("week helpers", () => {
  assert.equal(weekStart("2026-10-19"), "2026-10-19"); // a Monday
  assert.equal(weekStart("2026-10-22"), "2026-10-19");
  assert.equal(isoWeek("2026-10-19"), 43);
  assert.equal(isoWeek("2026-01-01"), 1);
});

test("the prototype's figures", () => {
  const today = "2026-10-19";
  const invoices = [
    inv({ number: "10022", buyerName: "Anna Lindqvist", dueOn: "2026-10-24" }),
    inv({ number: "10023", buyerName: "Västkustens Bygg AB", reverseCharge: true, issuedOn: "2026-10-15", dueOn: "2026-11-14", totalOre: 14_800_000, vatOre: 0, rotOre: 0, payableOre: 14_800_000 }),
    inv({ number: "10020", buyerName: "Göteborgs Fastighets AB", issuedOn: "2026-09-12", dueOn: "2026-10-12", totalOre: 4_250_000, vatOre: 850_000, rotOre: 0, payableOre: 4_250_000 }),
    inv({ number: "10018", buyerName: "Erik & Sara Holm", status: "partially_paid", issuedOn: "2026-09-18", dueOn: "2026-10-02", totalOre: 8_430_000, vatOre: 1_686_000, payableOre: 8_430_000, paidOre: 6_000_000 }),
    inv({ number: "10019", status: "paid", issuedOn: "2026-09-22", dueOn: "2026-10-06", paidAt: "2026-10-04T10:00:00Z", totalOre: 6_630_000, vatOre: 1_326_000, payableOre: 5_100_000, paidOre: 5_100_000 }),
    inv({ number: "10017", kind: "credit", status: "issued", issuedOn: "2026-09-15", totalOre: -312_500, vatOre: -62_500, rotOre: 0, payableOre: -312_500 }),
    inv({ number: null, status: "draft", issuedOn: null, dueOn: null, payableOre: 9_625_000 }),
  ];
  const d = computeDashboard(invoices, [{ expectedOn: "2026-11-23", amountOre: 6_350_000, label: "Slutfaktura" }], today);
  assert.equal(d.kpis.openOre, 6_800_000 + 14_800_000 + 4_250_000 + 2_430_000);
  assert.equal(d.kpis.openCount, 4);
  assert.equal(d.kpis.overdueOre, 4_250_000 + 2_430_000);
  assert.equal(d.kpis.overdueCount, 2);
  assert.equal(d.kpis.oldestOverdueDays, 17);
  assert.equal(d.kpis.dueThisWeekOre, 6_800_000);
  assert.equal(d.kpis.invoicedThisMonthOre, 8_225_000 + 14_800_000);
  assert.equal(d.kpis.invoicedLastMonthOre, 4_250_000 + 8_430_000 + 6_630_000 - 312_500);
  assert.equal(d.forecast.length, 8);
  assert.equal(d.forecast[0].week, 43);
  assert.equal(d.forecast[0].issuedOre, 6_800_000);
  assert.equal(d.forecast[0].overdueOre, 6_680_000);
  assert.equal(d.forecast[3].issuedOre, 14_800_000); // 14 nov is in week 46
  assert.equal(d.forecast[5].plannedOre, 6_350_000); // 23 nov is week 48
  assert.deepEqual(d.aging, { notDue: 21_600_000, d1to30: 6_680_000, d31to60: 0, over60: 0 });
  assert.equal(d.byMonth.length, 6);
  assert.equal(d.byMonth[5].month, "2026-10");
  assert.equal(d.byMonth[5].current, true);
  assert.equal(d.byMonth[4].netOre, 4_250_000 - 850_000 + (8_430_000 - 1_686_000) + (6_630_000 - 1_326_000) + (-312_500 + 62_500));
  assert.equal(d.vat.vatOre, 1_645_000);
  assert.equal(d.vat.reverseChargeOre, 14_800_000);
  assert.equal(d.vat.taxableOre, 6_580_000);
  assert.equal(d.topCustomers[0].name, "Västkustens Bygg AB");
  assert.equal(d.topCustomers.find((c) => c.name === "Göteborgs Fastighets AB")?.overdue, true);
  assert.equal(d.avgDaysToPay, 12);
  assert.equal(d.paidOnTimePercent, 100);
  assert.deepEqual(d.todo, [
    { kind: "reminder", count: 2, amountOre: 6_680_000 },
    { kind: "draft", count: 1, amountOre: 9_625_000 },
  ]);
});

test("empty input gives zeros, not errors", () => {
  const d = computeDashboard([], [], "2026-10-19");
  assert.equal(d.kpis.openOre, 0);
  assert.equal(d.avgDaysToPay, null);
  assert.equal(d.topCustomers.length, 0);
  assert.equal(d.forecast.every((w) => w.issuedOre === 0 && w.plannedOre === 0), true);
});
