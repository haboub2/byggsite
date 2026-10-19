import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_INVOICE_SERIES, DEFAULT_JOURNAL_SERIES, formatDocumentNumber, ocrReferenceFor, parseDocumentNumber } from "./numbering";

test("running series prints the counter as is", () => {
  assert.equal(formatDocumentNumber(DEFAULT_INVOICE_SERIES, 10022), "10022");
  assert.deepEqual(parseDocumentNumber(DEFAULT_INVOICE_SERIES, "10022"), { counter: 10022, year: null });
  assert.equal(parseDocumentNumber(DEFAULT_INVOICE_SERIES, "2026-0001"), null);
});

test("per-year series prints the year and pads", () => {
  const cfg = { series: "F", perYear: true, start: 1, pad: 4 };
  assert.equal(formatDocumentNumber(cfg, 7, 2026), "2026-0007");
  assert.deepEqual(parseDocumentNumber(cfg, "2026-0007"), { counter: 7, year: 2026 });
  assert.equal(ocrReferenceFor(cfg, 7, 2026), "20260007");
  assert.throws(() => formatDocumentNumber(cfg, 7), RangeError);
});

test("journal series restarts per year without padding", () => {
  assert.equal(formatDocumentNumber(DEFAULT_JOURNAL_SERIES, 1, 2026), "2026-1");
});

test("counters must be positive integers", () => {
  assert.throws(() => formatDocumentNumber(DEFAULT_INVOICE_SERIES, 0), RangeError);
  assert.throws(() => formatDocumentNumber(DEFAULT_INVOICE_SERIES, 1.5), RangeError);
});
