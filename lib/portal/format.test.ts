import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDay } from "./format";

test("formatDay writes the month without the abbreviation dot", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  assert.equal(formatDay("2026-10-15", now), "15 okt");
  assert.equal(formatDay("2026-10-19T09:30:00.000Z", now), "19 okt");
  assert.equal(formatDay("2027-01-05", now), "5 jan 2027");
  assert.equal(formatDay(null, now), "");
});
