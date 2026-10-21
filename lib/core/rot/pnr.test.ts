import { test } from "node:test";
import assert from "node:assert/strict";
import { rotBuyerSchema } from "../documents/invoice";
import { renderRotClaimXml, validateRotClaim, type RotClaimXml } from "./claim-xml";
import { formatPersonalNumber, maskPersonalNumber, withPlaceholderPersonalNumbers } from "./pnr";

test("maskPersonalNumber: twelve-digit birth date, last four hidden", () => {
  assert.equal(maskPersonalNumber("850412-1234", "2026-10-20"), "19850412-XXXX");
  assert.equal(maskPersonalNumber("8504121234", "2026-10-20"), "19850412-XXXX");
  assert.equal(maskPersonalNumber("198504121234", "2026-10-20"), "19850412-XXXX");
  assert.equal(maskPersonalNumber("19850412-XXXX", "2026-10-20"), "19850412-XXXX");
  assert.equal(maskPersonalNumber("", "2026-10-20"), "");
  assert.equal(maskPersonalNumber("123", "2026-10-20"), "");
});

test("formatPersonalNumber", () => {
  assert.equal(formatPersonalNumber("198504121234"), "19850412-1234");
});

test("the document schema accepts the masked form and keeps the ciphertext", () => {
  const b = rotBuyerSchema.parse({ name: "Anna", personalNumber: "19850412-XXXX", personalNumberSealed: "ww0ECQMC", roomOre: null });
  assert.equal(b.personalNumberSealed, "ww0ECQMC");
  assert.ok(!rotBuyerSchema.safeParse({ name: "Anna", personalNumber: "1985-XXXX", roomOre: null }).success);
});

test("masked numbers never reach the file; placeholders only for checking", () => {
  const claim: RotClaimXml = {
    name: "Prov",
    items: [
      {
        personalNumber: "19850412-XXXX",
        paidOn: "2026-10-22",
        workPriceKr: 47_500,
        paidKr: 33_250,
        requestedKr: 14_250,
        invoiceNumber: "10005",
        property: { kind: "fastighet", designation: "Göteborg Tolered 1:23" },
        work: [{ category: "Bygg", hours: null, materialKr: 0 }],
        otherCostKr: 0,
      },
    ],
  };
  assert.ok(validateRotClaim(claim).some((e) => e.includes("12 siffror")));
  assert.throws(() => renderRotClaimXml(claim), /12 siffror/);
  assert.deepEqual(validateRotClaim(withPlaceholderPersonalNumbers(claim)), []);
});
