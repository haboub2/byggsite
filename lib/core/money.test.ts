import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatKronor,
  formatOre,
  grossFromNet,
  kronorToOre,
  lineAmount,
  ore,
  parseKronor,
  percentOf,
  roundToKronor,
  splitEvenly,
  splitGross,
  sumOre,
  vatOnNet,
} from "./money";

test("ore() accepts whole numbers only", () => {
  assert.equal(ore(0), 0);
  assert.equal(ore(-12_300), -12_300);
  assert.throws(() => ore(1.5), RangeError);
  assert.throws(() => ore(Number.NaN), RangeError);
  assert.throws(() => ore(2 ** 53), RangeError);
});

test("kronor to öre rounds half away from zero", () => {
  assert.equal(kronorToOre(123.456), 12_346);
  assert.equal(kronorToOre(0.005), 1);
  assert.equal(kronorToOre(-0.005), -1);
  assert.equal(kronorToOre(650), 65_000);
});

test("öresavrundning: 50 öre rounds up, negatives mirror", () => {
  assert.equal(roundToKronor(12_349), 12_300);
  assert.equal(roundToKronor(12_350), 12_400);
  assert.equal(roundToKronor(-12_350), -12_400);
  assert.equal(roundToKronor(100), 100);
});

test("line amount with decimal quantity", () => {
  assert.equal(lineAmount(62_500, 12), 750_000);
  assert.equal(lineAmount(33_333, 1.5), 50_000); // 49 999,5 → 50 000
  assert.equal(lineAmount(10_000, 0), 0);
});

test("VAT on net and gross split agree", () => {
  const net = 6_580_000; // 65 800 kr
  const vat = vatOnNet(net, 25);
  assert.equal(vat, 1_645_000);
  assert.equal(grossFromNet(net, 25), 8_225_000);
  assert.deepEqual(splitGross(8_225_000, 25), { net, vat });
  assert.deepEqual(splitGross(1_120, 12), { net: 1_000, vat: 120 });
  assert.deepEqual(splitGross(500, 0), { net: 500, vat: 0 });
});

test("splitEvenly always sums to the amount and spreads the remainder", () => {
  assert.deepEqual(splitEvenly(1_000, 3), [334, 333, 333]);
  assert.deepEqual(splitEvenly(-1_000, 3), [-334, -333, -333]);
  assert.deepEqual(splitEvenly(1_425_000, 2), [712_500, 712_500]);
  for (let amount = 0; amount < 50; amount++) {
    for (let parts = 1; parts <= 7; parts++) {
      const shares = splitEvenly(amount, parts);
      assert.equal(sumOre(shares), amount);
      assert.ok(Math.max(...shares) - Math.min(...shares) <= 1);
    }
  }
  assert.throws(() => splitEvenly(100, 0), RangeError);
});

test("percentOf for ROT: 30 % of labour incl. VAT", () => {
  assert.equal(percentOf(4_750_000, 30), 1_425_000);
  assert.equal(percentOf(1, 30), 0);
  assert.equal(percentOf(5, 30), 2); // 1,5 → 2
});

test("Swedish formatting", () => {
  assert.equal(formatOre(8_225_000), "82 250,00");
  assert.equal(formatOre(-1_425_000, { currency: true }), "−14 250,00 kr");
  assert.equal(formatOre(6_800_000, { decimals: 0, currency: true }), "68 000 kr");
  assert.equal(formatKronor(6_799_950), "68 000 kr");
});

test("parsing what a user types", () => {
  assert.equal(parseKronor("12 345,50"), 1_234_550);
  assert.equal(parseKronor("12345.5"), 1_234_550);
  assert.equal(parseKronor("−1 200 kr"), -120_000);
  assert.equal(parseKronor("650"), 65_000);
  assert.throws(() => parseKronor("1,234.5"), RangeError);
  assert.throws(() => parseKronor("abc"), RangeError);
});
