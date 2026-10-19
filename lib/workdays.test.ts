import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  easterSunday,
  formatDays,
  holidayName,
  isIsoDate,
  isoWeekday,
  isWorkday,
  nextWorkday,
  previousWorkday,
  roundHalf,
  schedule,
  shiftWorkdays,
  slotDate,
  swedishHolidays,
  workdaysBetween,
} from "./workdays";

test("Easter Sunday for known years, including the earliest and latest possible", () => {
  assert.equal(easterSunday(2024), "2024-03-31");
  assert.equal(easterSunday(2025), "2025-04-20");
  assert.equal(easterSunday(2026), "2026-04-05");
  assert.equal(easterSunday(2027), "2027-03-28");
  assert.equal(easterSunday(2019), "2019-04-21");
  assert.equal(easterSunday(2038), "2038-04-25"); // latest possible
  assert.equal(easterSunday(2285), "2285-03-22"); // earliest possible
  assert.equal(easterSunday(2000), "2000-04-23");
});

test("2026 has every Swedish red day and trade eve in the right place", () => {
  const h = swedishHolidays(2026);
  const expected: Record<string, string> = {
    "2026-01-01": "Nyårsdagen",
    "2026-01-06": "Trettondedag jul",
    "2026-04-03": "Långfredagen",
    "2026-04-04": "Påskafton",
    "2026-04-05": "Påskdagen",
    "2026-04-06": "Annandag påsk",
    "2026-05-01": "Första maj",
    "2026-05-14": "Kristi himmelsfärdsdag",
    "2026-05-24": "Pingstdagen",
    "2026-06-06": "Sveriges nationaldag",
    "2026-06-19": "Midsommarafton",
    "2026-06-20": "Midsommardagen",
    "2026-10-31": "Alla helgons dag",
    "2026-12-24": "Julafton",
    "2026-12-25": "Juldagen",
    "2026-12-26": "Annandag jul",
    "2026-12-31": "Nyårsafton",
  };
  assert.deepEqual(Object.fromEntries(h), expected);
});

test("midsummer and All Saints move with the weekday", () => {
  // Midsommarafton is the Friday 19–25 June, Alla helgons dag the Saturday 31 Oct–6 Nov.
  assert.equal(holidayName("2027-06-25"), "Midsommarafton");
  assert.equal(holidayName("2027-06-26"), "Midsommardagen");
  assert.equal(holidayName("2027-11-06"), "Alla helgons dag");
  assert.equal(holidayName("2025-06-20"), "Midsommarafton");
  assert.equal(holidayName("2025-11-01"), "Alla helgons dag");
  for (let y = 2020; y <= 2040; y++) {
    const eve = [...swedishHolidays(y)].find(([, n]) => n === "Midsommarafton")![0];
    assert.equal(isoWeekday(eve), 5, `midsommarafton ${y}`);
    assert.ok(eve >= `${y}-06-19` && eve <= `${y}-06-25`, `midsommarafton ${y}`);
    const saints = [...swedishHolidays(y)].find(([, n]) => n === "Alla helgons dag")![0];
    assert.equal(isoWeekday(saints), 6, `alla helgons ${y}`);
    assert.ok(saints >= `${y}-10-31` && saints <= `${y}-11-06`, `alla helgons ${y}`);
  }
});

test("Ascension on 1 May (2008) keeps one name and is still a day off", () => {
  assert.equal(easterSunday(2008), "2008-03-23");
  assert.equal(holidayName("2008-05-01"), "Första maj");
  assert.equal(isWorkday("2008-05-01"), false);
});

test("weekends and holidays are not working days; Saturdays only when the project says so", () => {
  assert.equal(isWorkday("2026-10-19"), true); // Monday
  assert.equal(isWorkday("2026-10-24"), false); // Saturday
  assert.equal(isWorkday("2026-10-24", { saturdays: true }), true);
  assert.equal(isWorkday("2026-10-25", { saturdays: true }), false); // Sunday, always off
  assert.equal(isWorkday("2026-04-06"), false); // Annandag påsk, a Monday
  assert.equal(isWorkday("2026-05-14"), false); // Kristi himmelsfärd, a Thursday
  assert.equal(isWorkday("2026-12-24"), false); // Julafton, a Thursday
  // A holiday on a Saturday stays off even with Saturday work.
  assert.equal(isWorkday("2026-10-31", { saturdays: true }), false); // Alla helgons dag
  assert.equal(isWorkday("2026-06-20", { saturdays: true }), false); // Midsommardagen
  assert.equal(isWorkday("2026-04-04", { saturdays: true }), false); // Påskafton
});

test("date helpers reject impossible dates and survive DST and leap years", () => {
  assert.equal(isIsoDate("2026-02-29"), false);
  assert.equal(isIsoDate("2028-02-29"), true);
  assert.equal(isIsoDate("2026-13-01"), false);
  assert.equal(isIsoDate("26-10-19"), false);
  assert.equal(isIsoDate(""), false);
  assert.equal(addDays("2026-03-28", 2), "2026-03-30"); // over the spring DST change
  assert.equal(addDays("2026-10-24", 2), "2026-10-26"); // over the autumn DST change
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
});

test("next and previous working day snap over weekends and holiday runs", () => {
  assert.equal(nextWorkday("2026-10-19"), "2026-10-19");
  assert.equal(nextWorkday("2026-10-24"), "2026-10-26");
  assert.equal(nextWorkday("2026-10-24", { saturdays: true }), "2026-10-24");
  // Easter: Långfredagen Fri 3 Apr → Annandag Mon 6 Apr → Tue 7 Apr.
  assert.equal(nextWorkday("2026-04-03"), "2026-04-07");
  // Christmas 2026: Thu 24 – Sat 26, Sun 27 → Mon 28.
  assert.equal(nextWorkday("2026-12-24"), "2026-12-28");
  // Nyårsafton Thu 31 + Nyårsdagen Fri 1 → Mon 4 Jan.
  assert.equal(nextWorkday("2026-12-31"), "2027-01-04");
  assert.equal(previousWorkday("2026-10-25"), "2026-10-23");
  assert.equal(previousWorkday("2026-04-06"), "2026-04-02");
});

test("shiftWorkdays moves whole working days in both directions", () => {
  assert.equal(shiftWorkdays("2026-10-19", 0), "2026-10-19");
  assert.equal(shiftWorkdays("2026-10-23", 1), "2026-10-26"); // Fri → Mon
  assert.equal(shiftWorkdays("2026-10-19", 5), "2026-10-26");
  assert.equal(shiftWorkdays("2026-10-24", 0), "2026-10-26"); // Saturday snaps forward
  assert.equal(shiftWorkdays("2026-10-26", -1), "2026-10-23");
  assert.equal(shiftWorkdays("2026-10-25", -1), "2026-10-22"); // Sunday snaps back to Fri, then one more
  assert.equal(shiftWorkdays("2026-10-23", 1, { saturdays: true }), "2026-10-24");
  // Over Easter 2026: Thu 2 Apr + 1 → Tue 7 Apr.
  assert.equal(shiftWorkdays("2026-04-02", 1), "2026-04-07");
  assert.equal(shiftWorkdays("2026-04-07", -1), "2026-04-02");
});

test("workdaysBetween counts from inclusive to exclusive and is signed", () => {
  assert.equal(workdaysBetween("2026-10-19", "2026-10-19"), 0);
  assert.equal(workdaysBetween("2026-10-19", "2026-10-26"), 5);
  assert.equal(workdaysBetween("2026-10-26", "2026-10-19"), -5);
  assert.equal(workdaysBetween("2026-10-19", "2026-10-26", { saturdays: true }), 6);
  assert.equal(workdaysBetween("2026-12-21", "2027-01-04"), 6); // 21,22,23,28,29,30
});

test("roundHalf and formatDays speak in half days", () => {
  assert.equal(roundHalf(1.24), 1);
  assert.equal(roundHalf(1.25), 1.5);
  assert.equal(roundHalf(-2), 0);
  assert.equal(roundHalf(Number.NaN), 0);
  assert.equal(formatDays(0.5), "0,5 dag");
  assert.equal(formatDays(1), "1 dag");
  assert.equal(formatDays(1.5), "1,5 dagar");
  assert.equal(formatDays(12), "12 dagar");
});

test("schedule lays whole days end to end, skipping the weekend", () => {
  // Mon 19 Oct 2026: 2 + 3 + 1 days.
  const { spans, ends_on } = schedule("2026-10-19", [2, 3, 1]);
  assert.deepEqual(
    spans.map((s) => [s.starts_on, s.ends_on]),
    [
      ["2026-10-19", "2026-10-20"],
      ["2026-10-21", "2026-10-23"],
      ["2026-10-26", "2026-10-26"],
    ]
  );
  assert.equal(ends_on, "2026-10-26");
});

test("two half-day phases share one day, and the next starts the day after", () => {
  const { spans, ends_on } = schedule("2026-10-19", [0.5, 0.5, 1]);
  assert.deepEqual(spans.map((s) => [s.starts_on, s.ends_on, s.startsAfternoon, s.endsAtNoon]), [
    ["2026-10-19", "2026-10-19", false, true],
    ["2026-10-19", "2026-10-19", true, false],
    ["2026-10-20", "2026-10-20", false, false],
  ]);
  assert.equal(ends_on, "2026-10-20");
});

test("1,5 days ends at noon and the next phase continues that afternoon", () => {
  const { spans, ends_on } = schedule("2026-10-22", [1.5, 1]); // Thursday
  assert.deepEqual(spans.map((s) => [s.starts_on, s.ends_on]), [
    ["2026-10-22", "2026-10-23"],
    ["2026-10-23", "2026-10-26"], // Fri afternoon + Mon morning
  ]);
  assert.equal(spans[1].startsAfternoon, true);
  assert.equal(ends_on, "2026-10-26");
});

test("a start on a weekend or holiday begins on the next working day", () => {
  assert.equal(schedule("2026-10-24", [1]).spans[0].starts_on, "2026-10-26");
  assert.equal(schedule("2026-10-24", [1], { saturdays: true }).spans[0].starts_on, "2026-10-24");
  assert.equal(schedule("2026-04-03", [1]).spans[0].starts_on, "2026-04-07");
});

test("a phase running over Christmas and New Year skips every day off", () => {
  // Mon 21 Dec 2026, 6 days: 21, 22, 23, 28, 29, 30.
  const { ends_on } = schedule("2026-12-21", [6]);
  assert.equal(ends_on, "2026-12-30");
  // 7 days: … 30 Dec, then Mon 4 Jan (31 Dec and 1 Jan off).
  assert.equal(schedule("2026-12-21", [7]).ends_on, "2027-01-04");
});

test("Saturday work shortens the calendar", () => {
  // 6 days from Mon 19 Oct: Mon–Sat.
  assert.equal(schedule("2026-10-19", [6], { saturdays: true }).ends_on, "2026-10-24");
  assert.equal(schedule("2026-10-19", [6]).ends_on, "2026-10-26");
});

test("a 0-day phase is a milestone on the next free slot and takes no time", () => {
  const { spans, ends_on } = schedule("2026-10-19", [1, 0, 1]);
  assert.equal(spans[1].starts_on, "2026-10-20");
  assert.equal(spans[1].ends_on, "2026-10-20");
  assert.equal(spans[1].halves, 0);
  assert.equal(spans[2].starts_on, "2026-10-20");
  assert.equal(ends_on, "2026-10-20");
});

test("odd durations are rounded to half days", () => {
  const { spans } = schedule("2026-10-19", [0.3, 0.7]);
  assert.deepEqual(spans.map((s) => s.halves), [1, 1]);
});

test("an empty schedule ends on its first working day", () => {
  assert.equal(schedule("2026-10-24", []).ends_on, "2026-10-26");
});

test("an invalid start date is refused", () => {
  assert.throws(() => schedule("", [1]));
  assert.throws(() => schedule("2026-02-30", [1]));
});

test("slotDate matches schedule", () => {
  assert.equal(slotDate("2026-10-23", 0), "2026-10-23");
  assert.equal(slotDate("2026-10-23", 1), "2026-10-23");
  assert.equal(slotDate("2026-10-23", 2), "2026-10-26");
});

test("a long schedule is consistent with shiftWorkdays", () => {
  const durations = Array.from({ length: 40 }, (_, i) => (i % 3) * 0.5 + 0.5);
  const { spans, ends_on } = schedule("2026-11-02", durations);
  const totalHalves = spans.reduce((n, s) => n + s.halves, 0);
  assert.equal(ends_on, shiftWorkdays("2026-11-02", Math.ceil(totalHalves / 2) - 1));
  for (let i = 1; i < spans.length; i++) assert.ok(spans[i].starts_on >= spans[i - 1].ends_on);
});
