import { test } from "node:test";
import assert from "node:assert/strict";
import { renderRotClaimXml, rotClaimFileName, toTwelveDigitPersonalNumber, validateRotClaim, type RotClaimXml } from "./claim-xml";

const claim: RotClaimXml = {
  name: "Binaafy okt 2026",
  items: [
    {
      personalNumber: "198504121234",
      paidOn: "2026-10-22",
      workPriceKr: 47_500,
      paidKr: 33_250,
      requestedKr: 14_250,
      invoiceNumber: "10022",
      property: { kind: "fastighet", designation: "Göteborg Tolered 1:23" },
      work: [{ category: "Bygg", hours: 12, materialKr: 34_750 }],
      otherCostKr: 0,
    },
    {
      personalNumber: "196807221234",
      paidOn: "2026-10-09",
      workPriceKr: 38_000,
      paidKr: 26_600,
      requestedKr: 11_400,
      invoiceNumber: "10016",
      property: { kind: "brf", orgNr: "769612-3456", apartmentNumber: "1203" },
      work: [
        { category: "Vvs", hours: null, materialKr: 0 },
        { category: "Bygg", hours: 20, materialKr: 12_000 },
      ],
      otherCostKr: 1_500,
    },
  ],
};

test("personal numbers become twelve digits with the right century", () => {
  assert.equal(toTwelveDigitPersonalNumber("850412-1234", "2026-10-19"), "198504121234");
  assert.equal(toTwelveDigitPersonalNumber("8504121234", "2026-10-19"), "198504121234");
  assert.equal(toTwelveDigitPersonalNumber("198504121234", "2026-10-19"), "198504121234");
  assert.equal(toTwelveDigitPersonalNumber("050101-1234", "2026-10-19"), "200501011234"); // 21 years old
  assert.equal(toTwelveDigitPersonalNumber("100101-1234", "2026-10-19"), "191001011234"); // 16 would be too young, so 1910
  assert.throws(() => toTwelveDigitPersonalNumber("123", "2026-10-19"), RangeError);
});

test("golden file: two cases, one house and one flat", () => {
  const expected =
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Begaran xmlns="http://xmls.skatteverket.se/se/skatteverket/ht/begaran/6.0" xmlns:htko="http://xmls.skatteverket.se/se/skatteverket/ht/komponent/begaran/6.0">',
      "  <NamnPaBegaran>Binaafy okt 2026</NamnPaBegaran>",
      "  <RotBegaran>",
      "    <Arenden>",
      "      <Kopare>198504121234</Kopare>",
      "      <BetalningsDatum>2026-10-22</BetalningsDatum>",
      "      <PrisForArbete>47500</PrisForArbete>",
      "      <BetaltBelopp>33250</BetaltBelopp>",
      "      <BegartBelopp>14250</BegartBelopp>",
      "      <FakturaNr>10022</FakturaNr>",
      "      <Ovrigkostnad>0</Ovrigkostnad>",
      "      <Fastighetsbeteckning>Göteborg Tolered 1:23</Fastighetsbeteckning>",
      "      <UtfortArbete>",
      "        <Bygg>",
      "          <AntalTimmar>12</AntalTimmar>",
      "          <Materialkostnad>34750</Materialkostnad>",
      "        </Bygg>",
      "      </UtfortArbete>",
      "    </Arenden>",
      "    <Arenden>",
      "      <Kopare>196807221234</Kopare>",
      "      <BetalningsDatum>2026-10-09</BetalningsDatum>",
      "      <PrisForArbete>38000</PrisForArbete>",
      "      <BetaltBelopp>26600</BetaltBelopp>",
      "      <BegartBelopp>11400</BegartBelopp>",
      "      <FakturaNr>10016</FakturaNr>",
      "      <Ovrigkostnad>1500</Ovrigkostnad>",
      "      <LagenhetsNr>1203</LagenhetsNr>",
      "      <BrfOrgNr>769612-3456</BrfOrgNr>",
      "      <UtfortArbete>",
      "        <Bygg>",
      "          <AntalTimmar>20</AntalTimmar>",
      "          <Materialkostnad>12000</Materialkostnad>",
      "        </Bygg>",
      "        <Vvs>",
      "          <Materialkostnad>0</Materialkostnad>",
      "        </Vvs>",
      "      </UtfortArbete>",
      "    </Arenden>",
      "  </RotBegaran>",
      "</Begaran>",
    ].join("\n") + "\n";
  assert.equal(renderRotClaimXml(claim), expected);
});

test("validation mirrors the schema's limits", () => {
  assert.deepEqual(validateRotClaim(claim), []);
  const bad: RotClaimXml = {
    name: "Ett alldeles för långt namn",
    items: [{ ...claim.items[0], personalNumber: "850412-1234", workPriceKr: 1, requestedKr: 50_000, property: { kind: "fastighet", designation: "" } }],
  };
  const errors = validateRotClaim(bad);
  assert.ok(errors.some((e) => e.includes("1–16 tecken")));
  assert.ok(errors.some((e) => e.includes("12 siffror")));
  assert.ok(errors.some((e) => e.includes("minst 2 kr")));
  assert.ok(errors.some((e) => e.includes("överstiger")));
  assert.ok(errors.some((e) => e.includes("fastighetsbeteckning")));
  assert.throws(() => renderRotClaimXml(bad));
  assert.ok(validateRotClaim({ name: "x", items: [] }).some((e) => e.includes("minst ett")));
});

test("special characters are escaped", () => {
  const xml = renderRotClaimXml({ ...claim, name: "A & B <C>" });
  assert.ok(xml.includes("<NamnPaBegaran>A &amp; B &lt;C&gt;</NamnPaBegaran>"));
});

test("file name", () => {
  assert.equal(rotClaimFileName("Binaafy okt 2026", "2026-10-19"), "rot-begaran-Binaafy-okt-2026-2026-10-19.xml");
});
