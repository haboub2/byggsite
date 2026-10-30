import { test } from "node:test";
import assert from "node:assert/strict";
import type { EmploymentVersion } from "../hr/schema";
import { vaxaStodBasis, type VaxaStodPerson } from "./vaxa-stod";

const version = (over: Partial<EmploymentVersion>) =>
  ({ id: "v", employeeId: "x", contractId: "c", version: 1, form: "tillsvidare", payForm: "monthly", startsOn: "2026-03-01", endsOn: null, validFrom: "2026-03-01", validTo: null, weeklyHours: 40, workingTimePercent: 100, ...over }) as EmploymentVersion;
const person = (over: Partial<VaxaStodPerson>): VaxaStodPerson => ({
  employeeId: "erik",
  name: "Erik",
  isOwner: false,
  chosen: true,
  versions: [version({})],
  payslips: [{ contributionBaseOre: 4_000_050, category: "full" }],
  ...over,
});

test("a chosen first employee: base capped at 35 000 kr, refund 21,21 % of it with the öre dropped", () => {
  const b = vaxaStodBasis("2026-11", [person({})]);
  const [r] = b.rows;
  assert.equal(r.eligible, true);
  assert.equal(r.monthNo, 9);
  assert.equal(r.capOre, 3_500_000);
  assert.equal(r.cappedBaseOre, 3_500_000);
  // 35 000 × (31,42 − 10,21) % = 7 423,50 → 7 423 kr.
  assert.equal(r.refundOre, 742_300);
  assert.equal(b.applyBy, "2027-11-30");
  // Below the cap the öre of the underlag are dropped first: 30 000,99 kr → 30 000 kr × 21,21 % = 6 363 kr.
  assert.equal(vaxaStodBasis("2026-11", [person({ payslips: [{ contributionBaseOre: 3_000_099, category: "full" }] })]).rows[0].refundOre, 636_300);
});

test("hired before May 2024: the 25 000 kr cap; month 25 is past the 24 months", () => {
  const early = person({ versions: [version({ startsOn: "2024-03-01", validFrom: "2024-03-01" })] });
  const [r] = vaxaStodBasis("2026-02", [early]).rows;
  assert.equal(r.capOre, 2_500_000);
  assert.equal(r.monthNo, 24);
  assert.equal(r.eligible, true);
  const [late] = vaxaStodBasis("2026-03", [early]).rows;
  assert.equal(late.eligible, false);
  assert.match(late.reasons.join(), /månad 25/);
});

test("not chosen, an owner, part time, a short contract, or already reduced: no basis and the reason", () => {
  const rows = vaxaStodBasis("2026-11", [
    person({ employeeId: "a", name: "A", chosen: false }),
    person({ employeeId: "b", name: "B", isOwner: true }),
    person({ employeeId: "c", name: "C", versions: [version({ weeklyHours: 16 })] }),
    person({ employeeId: "d", name: "D", versions: [version({ startsOn: "2026-11-01", validFrom: "2026-11-01", endsOn: "2026-12-15" })] }),
    person({ employeeId: "e", name: "E", payslips: [{ contributionBaseOre: 2_000_000, category: "young" }] }),
  ]).rows;
  assert.deepEqual(rows.map((r) => [r.name, r.eligible, r.refundOre]), [
    ["A", false, 0],
    ["B", false, 0],
    ["C", false, 0],
    ["D", false, 0],
    ["E", false, 0],
  ]);
  assert.match(rows[2].reasons.join(), /16 timmar/);
  assert.match(rows[3].reasons.join(), /kortare än 3 månader/);
  assert.match(rows[4].reasons.join(), /ungdomsnedsättningen/);
});
