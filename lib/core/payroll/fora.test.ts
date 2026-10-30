import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PAY_ITEMS } from "./pay-items.default";
import type { PayslipDocument } from "./payslip";
import { foraBasis, foraDueDate, foraFile, parseForaFile, splitName, type ForaSlip } from "./fora";

const item = (code: string) => {
  const i = DEFAULT_PAY_ITEMS.find((x) => x.code === code);
  assert.ok(i, code);
  return { code: i.code, name: i.name, kind: i.kind, version: 1, flags: i.flags };
};
const slip = (id: string, name: string, scheme: "saf-lo" | "itp1" | "none", lines: [string, number][], payDate = "2026-11-25"): ForaSlip => ({
  payslipId: `p-${id}`,
  employeeId: id,
  document: {
    employeeName: name,
    payDate,
    lines: lines.map(([code, amountOre]) => ({ code, amountOre, item: item(code) })),
    context: { pension: { scheme, premiumOre: 0 } },
  } as unknown as PayslipDocument,
});

test("Fora pay: cash pay with a Fora category for SAF-LO people, without förmåner, ersättningar or tjänstemän", () => {
  const lines = foraBasis("2026-11", [
    // Timlön, OB, sjuklön, karens, semesterersättning, skattefri mil och traktamente, bilförmån.
    slip("bo", "Bo Berg", "saf-lo", [["1100", 3_024_000], ["1200", 120_050], ["1400", 115_200], ["1410", -23_040], ["1520", 400_000], ["1910", 50_000], ["1900", 30_000], ["1800", 250_000]]),
    slip("anna", "Anna Andersson", "itp1", [["1010", 3_952_000]]),
    slip("cecilia", "Cecilia Carlsson", "none", [["1600", 1_000_000]]),
  ]);
  // 30 240 + 1 200,50 + 1 152 − 230,40 + 4 000 = 36 362,10 → 36 362 kr.
  assert.deepEqual(lines, [{ employeeId: "bo", name: "Bo Berg", payslipIds: ["p-bo"], payOre: 3_636_200 }]);
});

test("the file has one row per arbetare as the manual entry asks, and reads back to the same total", () => {
  const lines = [
    { employeeId: "bo", name: "Bo Berg", payslipIds: ["p-bo"], payOre: 3_636_200 },
    { employeeId: "dan", name: "Dan Erik Dahl", payslipIds: ["p-dan"], payOre: 0 },
  ];
  const pnr: Record<string, string> = { bo: "19850312-1234", dan: "199001019876" };
  const file = foraFile({ period: "2026-11", fokId: "FOK306834", lines, pnr: (id) => pnr[id] });
  assert.equal(file, ["personnummer;fornamn;efternamn;fokId;manad;bruttolon", "198503121234;Bo;Berg;FOK306834;2026-11;36362", "199001019876;Dan Erik;Dahl;FOK306834;2026-11;0", ""].join("\r\n"));
  assert.equal(parseForaFile(file).totalOre, 3_636_200);
  assert.throws(() => foraFile({ period: "2026-11", fokId: "306834", lines, pnr: (id) => pnr[id] }), /FOK-ID/);
  assert.throws(() => foraFile({ period: "2026-11", fokId: "FOK306834", lines, pnr: () => "" }), /personnummer saknas/);
});

test("the deadline is the last day of the month after the pay month; names split on the last space", () => {
  assert.equal(foraDueDate("2026-11"), "2026-12-31");
  assert.equal(foraDueDate("2026-12"), "2027-01-31");
  assert.equal(foraDueDate("2027-01"), "2027-02-28");
  assert.deepEqual(splitName("Anna Maria Andersson"), { firstName: "Anna Maria", lastName: "Andersson" });
});
