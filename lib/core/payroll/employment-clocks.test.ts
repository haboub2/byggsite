import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays as addDaysIso } from "../rules/index";
import { payrollRulesAt } from "../rules/payroll";
import { addMonths, employmentClocks, windowStart, type EmploymentPeriod } from "./employment-clocks";

const rules = payrollRulesAt("2026-10-30");
const sava = (startsOn: string, endsOn: string | null): EmploymentPeriod => ({ form: "sava", startsOn, endsOn });
const vik = (startsOn: string, endsOn: string | null): EmploymentPeriod => ({ form: "vikariat", startsOn, endsOn });

test("calendar helpers: months clamp to month end, the window is five years back", () => {
  assert.equal(addMonths("2026-01-15", 6), "2026-07-15");
  assert.equal(addMonths("2026-08-31", 6), "2027-02-28");
  assert.equal(addMonths("2028-08-31", 6), "2029-02-28");
  assert.equal(addMonths("2027-08-31", 6), "2028-02-29");
  assert.equal(windowStart("2026-10-30", 5), "2021-10-31");
});

test("SÄVA: an unbroken stretch counts whole months as 30 days, overlaps once", () => {
  // 1 Jan–10 Feb in two overlapping periods: one month (30) + 10 days.
  const c = employmentClocks([sava("2026-01-01", "2026-01-31"), sava("2026-01-20", "2026-02-10")], "2026-10-30", rules);
  assert.equal(c.sava.daysInWindow, 40);
  assert.equal(c.sava.limitDays, 360);
  assert.equal(c.sava.daysLeft, 320);
  assert.equal(c.sava.converted, false);
});

test("360 or 365: twelve unbroken months are 360 and do not convert; one day more does", () => {
  // 2025-03-01 to 2026-02-28 is 365 calendar days but exactly twelve months.
  const twelve = employmentClocks([sava("2025-03-01", "2026-02-28")], "2026-10-30", rules);
  assert.equal(twelve.sava.daysInWindow, 360);
  assert.equal(twelve.sava.converted, false);
  assert.equal(twelve.sava.convertsOn, null);
  // Over a leap day too: 2027-03-01 to 2028-02-29.
  assert.equal(employmentClocks([sava("2027-03-01", "2028-02-29")], "2028-10-30", rules).sava.daysInWindow, 360);
  const more = employmentClocks([sava("2025-03-01", "2026-03-01")], "2026-10-30", rules);
  assert.equal(more.sava.daysInWindow, 361);
  assert.equal(more.sava.converted, true);
  assert.equal(more.sava.convertsOn, "2026-03-01");
});

test("scattered SÄVA days count one each: 30 months of two six-day jobs is 360, the 361st day converts", () => {
  // Two SÄVA a month (the gap rule needs three), days 1–6 and 15–20: twelve days a month.
  const jobs: EmploymentPeriod[] = [];
  for (let m = 0; m < 31; m++) {
    const first = addMonths("2024-01-01", m);
    jobs.push(sava(first, addDaysIso(first, 5)), sava(addDaysIso(first, 14), addDaysIso(first, 19)));
  }
  const thirty = employmentClocks(jobs.slice(0, 60), "2026-06-30", rules);
  assert.equal(thirty.sava.daysInWindow, 360);
  assert.equal(thirty.sava.converted, false);
  const booked = employmentClocks(jobs, "2026-06-30", rules);
  assert.equal(booked.sava.convertsOn, "2026-07-01");
});

test("three SÄVA in one calendar month: the days between them count", () => {
  const three = employmentClocks([sava("2026-03-03", "2026-03-04"), sava("2026-03-10", "2026-03-11"), sava("2026-03-20", "2026-03-21")], "2026-10-30", rules);
  assert.equal(three.sava.daysInWindow, 19); // 3–21 March
  const two = employmentClocks([sava("2026-03-03", "2026-03-04"), sava("2026-03-20", "2026-03-21")], "2026-10-30", rules);
  assert.equal(two.sava.daysInWindow, 4);
});

test("the gap rule is per calendar month, also for chains that cross months", () => {
  // Feb has three periods (one starting in January, one ending in March): Feb's gaps fill.
  // March has only one, January only one: their gaps do not.
  const chain = employmentClocks(
    [sava("2026-01-28", "2026-02-02"), sava("2026-02-10", "2026-02-10"), sava("2026-02-25", "2026-03-03"), sava("2026-03-20", "2026-03-20")],
    "2026-10-30",
    rules,
  );
  // 28 Jan–3 Mar unbroken: one month to 27 Feb (30) + 4 days; plus 20 Mar (1).
  assert.equal(chain.sava.daysInWindow, 35);
  // Gaps in a month with three periods but across the month boundary are not filled outside the month.
  const across = employmentClocks([sava("2026-01-05", "2026-01-05"), sava("2026-01-15", "2026-01-15"), sava("2026-01-30", "2026-01-30"), sava("2026-02-05", "2026-02-05")], "2026-10-30", rules);
  assert.equal(across.sava.daysInWindow, 26 + 1); // 5–30 Jan + 5 Feb
});

test("old days fall out of the five-year window", () => {
  const c = employmentClocks([sava("2021-01-01", "2021-12-31")], "2026-06-30", rules);
  // Window starts 2021-07-01: July–December 2021 = six months, 180.
  assert.equal(c.sava.daysInWindow, 180);
});

test("projection: an open SÄVA converts the day it passes the limit", () => {
  const c = employmentClocks([sava("2026-01-01", null)], "2026-06-30", rules);
  assert.equal(c.sava.daysInWindow, 180);
  // Twelve months to 31 December are 360; 1 January 2027 is the 361st.
  assert.equal(c.sava.convertsOn, "2027-01-01");
  const booked = employmentClocks([sava("2026-01-01", "2026-08-31")], "2026-06-30", rules);
  assert.equal(booked.sava.convertsOn, null);
});

test("vikariat counts separately with its own limit, all vikariat periods together", () => {
  const c = employmentClocks([vik("2024-01-01", "2024-12-31"), vik("2025-06-01", "2026-05-31"), sava("2026-06-01", "2026-06-30")], "2026-10-30", rules);
  assert.equal(c.vikariat.daysInWindow, 366 + 365);
  assert.equal(c.vikariat.limitDays, 730);
  assert.equal(c.vikariat.limitDays, rules.las.vikariatLimitDays);
  // AD 2019 nr 56: more than two years means at least 731 days.
  assert.equal(c.vikariat.converted, true);
  assert.equal(employmentClocks([vik("2024-06-01", "2026-05-31")], "2026-10-30", rules).vikariat.converted, false);
  assert.equal(c.sava.daysInWindow, 30);
});

test("provanställning: six months, notice two weeks before, converts the day after", () => {
  const c = employmentClocks([{ form: "provanstallning", startsOn: "2026-01-15", endsOn: null }], "2026-06-01", rules);
  assert.deepEqual(c.probation, { startsOn: "2026-01-15", endsOn: "2026-07-14", noticeBy: "2026-06-30", daysLeft: 43, convertsOn: "2026-07-15" });
  const endOfMonth = employmentClocks([{ form: "provanstallning", startsOn: "2026-08-31", endsOn: null }], "2026-09-01", rules);
  assert.equal(endOfMonth.probation?.endsOn, "2027-02-28");
  const agreedShorter = employmentClocks([{ form: "provanstallning", startsOn: "2026-01-15", endsOn: "2026-04-14" }], "2026-02-01", rules);
  assert.equal(agreedShorter.probation?.endsOn, "2026-04-14");
  assert.equal(employmentClocks([sava("2026-01-01", null)], "2026-06-01", rules).probation, null);
});

