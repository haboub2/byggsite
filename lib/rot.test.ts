import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateRot, rotRoom, LABOR_FOR_FULL_ROT } from "./rot";

test("30 % of labour only; material never qualifies", () => {
  const r = calculateRot({ labor: 90_000, material: 60_000 });
  assert.equal(r.deduction, 27_000);
  assert.equal(r.total, 150_000);
  assert.equal(r.pay, 123_000);
  assert.equal(r.capped, false);
});

test("one owner is capped at 50 000 kr", () => {
  const r = calculateRot({ labor: 320_000, material: 260_000 });
  assert.equal(r.uncapped, 96_000);
  assert.equal(r.deduction, 50_000);
  assert.equal(r.pay, 530_000);
  assert.equal(r.capped, true);
});

test("two owners double the cap and split evenly", () => {
  const r = calculateRot({ labor: 320_000, owners: [{}, {}] });
  assert.equal(r.deduction, 96_000);
  assert.deepEqual(r.perOwner, [48_000, 48_000]);
  assert.equal(r.capped, false);

  const big = calculateRot({ labor: 500_000, owners: [{}, {}] });
  assert.equal(big.deduction, 100_000);
  assert.deepEqual(big.perOwner, [50_000, 50_000]);
});

test("ROT already used this year reduces the room", () => {
  assert.equal(rotRoom({ usedRot: 20_000 }), 30_000);
  assert.equal(rotRoom({ usedRot: 60_000 }), 0);
});

test("RUT counts against the shared 75 000 kr cap", () => {
  // 40 000 RUT leaves 35 000 of the shared cap, below the 50 000 ROT cap.
  assert.equal(rotRoom({ usedRut: 40_000 }), 35_000);
  // 20 000 RUT still leaves the full 50 000 for ROT.
  assert.equal(rotRoom({ usedRut: 20_000 }), 50_000);
  // 10 000 ROT + 50 000 RUT: 40 000 left of ROT, 15 000 of the shared cap.
  assert.equal(rotRoom({ usedRot: 10_000, usedRut: 50_000 }), 15_000);
  assert.equal(rotRoom({ usedRut: 75_000 }), 0);
});

test("uneven room: the owner with more room takes the rest", () => {
  const r = calculateRot({ labor: 200_000, owners: [{ usedRut: 65_000 }, {}] });
  // 60 000 wanted; owner 1 has 10 000 left, owner 2 has 50 000.
  assert.deepEqual(r.room, [10_000, 50_000]);
  assert.equal(r.deduction, 60_000);
  assert.deepEqual(r.perOwner, [10_000, 50_000]);
});

test("split always sums to the deduction, in whole kronor", () => {
  const r = calculateRot({ labor: 12_345, owners: [{}, {}] });
  assert.equal(r.deduction, 3_703);
  assert.equal(r.perOwner[0] + r.perOwner[1], 3_703);
});

test("bad input is treated as zero", () => {
  const r = calculateRot({ labor: Number.NaN, material: -5 });
  assert.equal(r.deduction, 0);
  assert.equal(r.pay, 0);
});

test("labour needed to reach the cap", () => {
  assert.equal(LABOR_FOR_FULL_ROT, 166_667);
  assert.equal(calculateRot({ labor: LABOR_FOR_FULL_ROT }).deduction, 50_000);
  assert.equal(calculateRot({ labor: LABOR_FOR_FULL_ROT - 1 }).deduction, 49_999);
});
