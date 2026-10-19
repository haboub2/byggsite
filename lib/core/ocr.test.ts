import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidOcr, luhnCheckDigit, luhnValid, ocrFor, referenceFromOcr } from "./ocr";

test("Luhn check digit on a known number", () => {
  // 7992739871 → check digit 3 (the classic Luhn example)
  assert.equal(luhnCheckDigit("7992739871"), 3);
  assert.equal(luhnValid("79927398713"), true);
  assert.equal(luhnValid("79927398710"), false);
});

test("OCR for invoice 10022 carries length digit and check digit", () => {
  const ocr = ocrFor(10022);
  assert.equal(ocr.length, 7);
  assert.equal(ocr.slice(0, 5), "10022");
  assert.equal(Number(ocr[5]), 7); // 7 digits in total
  assert.equal(isValidOcr(ocr), true);
  assert.equal(referenceFromOcr(ocr), "10022");
});

test("every reference round-trips and a single wrong digit is caught", () => {
  for (const n of [1, 42, 10001, 10022, 99999, 2026_0001, 123456789012]) {
    const ocr = ocrFor(n);
    assert.equal(isValidOcr(ocr), true, ocr);
    assert.equal(referenceFromOcr(ocr), String(n));
    for (let i = 0; i < ocr.length; i++) {
      const wrong = ocr.slice(0, i) + ((Number(ocr[i]) + 1) % 10) + ocr.slice(i + 1);
      assert.equal(isValidOcr(wrong), false, `${ocr} → ${wrong}`);
    }
  }
});

test("transposed neighbours are caught too", () => {
  const ocr = ocrFor(10022);
  for (let i = 0; i < ocr.length - 1; i++) {
    if (ocr[i] === ocr[i + 1]) continue;
    const swapped = ocr.slice(0, i) + ocr[i + 1] + ocr[i] + ocr.slice(i + 2);
    assert.equal(isValidOcr(swapped), false, swapped);
  }
});

test("bad input", () => {
  assert.throws(() => ocrFor(""), RangeError);
  assert.throws(() => ocrFor("abc"), RangeError);
  assert.equal(isValidOcr("12"), false);
  assert.equal(isValidOcr("12a4"), false);
  assert.equal(referenceFromOcr("0000"), null);
});
