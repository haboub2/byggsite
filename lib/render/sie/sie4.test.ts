import { test } from "node:test";
import assert from "node:assert/strict";
import { encodePc8, renderSie4, sieAmount, sieString, type SieExport } from "./sie4";
import { DEFAULT_ACCOUNT_NAMES } from "../../core/ledger/posting";

const accounts = Object.entries(DEFAULT_ACCOUNT_NAMES).map(([number, name]) => ({ number, name }));

const sample: SieExport = {
  company: { name: 'Binaafy AB', orgNr: "559000-0000", fiscalYearStart: "2026-01-01", fiscalYearEnd: "2026-12-31" },
  accounts,
  generatedOn: "2026-11-01",
  entries: [
    {
      series: "V",
      number: 2,
      date: "2026-10-22",
      text: "Inbetalning faktura 10022",
      transactions: [
        { account: "1930", amount: 6_800_000 },
        { account: "1510", amount: -6_800_000 },
      ],
    },
    {
      series: "V",
      number: 1,
      date: "2026-10-10",
      registeredOn: "2026-10-10",
      text: 'Faktura 10022 Anna "Lindqvist" Göteborg',
      transactions: [
        { account: "1510", amount: 6_800_000 },
        { account: "1513", amount: 1_425_000, text: "ROT" },
        { account: "3001", amount: -6_580_000 },
        { account: "2611", amount: -1_645_000 },
      ],
    },
  ],
};

test("amounts and strings in SIE form", () => {
  assert.equal(sieAmount(6_800_000), "68000.00");
  assert.equal(sieAmount(-1_645_000), "-16450.00");
  assert.equal(sieAmount(5), "0.05");
  assert.equal(sieAmount(-5), "-0.05");
  assert.equal(sieString('Anna "L"'), '"Anna \\"L\\""');
  assert.equal(sieString("rad1\r\nrad2"), '"rad1 rad2"');
});

test("golden file: a month with one invoice and one payment", () => {
  const konto = accounts
    .sort((a, b) => a.number.localeCompare(b.number))
    .map((a) => `#KONTO ${a.number} "${a.name}"`)
    .join("\r\n");
  const expected =
    [
      "#FLAGGA 0",
      '#PROGRAM "Binaafy Faktura" 1.0',
      "#FORMAT PC8",
      "#GEN 20261101",
      "#SIETYP 4",
      '#FNAMN "Binaafy AB"',
      "#ORGNR 559000-0000",
      "#RAR 0 20260101 20261231",
      "#KPTYP EUBAS97",
      "#VALUTA SEK",
      konto,
      '#VER V 1 20261010 "Faktura 10022 Anna \\"Lindqvist\\" Göteborg"',
      "{",
      "   #TRANS 1510 {} 68000.00",
      '   #TRANS 1513 {} 14250.00 "ROT"',
      "   #TRANS 3001 {} -65800.00",
      "   #TRANS 2611 {} -16450.00",
      "}",
      '#VER V 2 20261022 "Inbetalning faktura 10022"',
      "{",
      "   #TRANS 1930 {} 68000.00",
      "   #TRANS 1510 {} -68000.00",
      "}",
    ].join("\r\n") + "\r\n";
  assert.equal(renderSie4(sample), expected);
});

test("an unbalanced entry or an unknown account is refused", () => {
  const bad = { ...sample, entries: [{ ...sample.entries[0], transactions: [{ account: "1930", amount: 100 }] }] };
  assert.throws(() => renderSie4(bad), /balanserar inte/);
  const unknown = { ...sample, entries: [{ ...sample.entries[0], transactions: [{ account: "9999", amount: 100 }, { account: "1510", amount: -100 }] }] };
  assert.throws(() => renderSie4(unknown), /saknas i kontoplanen/);
});

test("PC8 encoding keeps ASCII and maps Swedish letters", () => {
  const bytes = encodePc8("Faktura åäö ÅÄÖ é");
  assert.deepEqual([...bytes.slice(0, 7)], [...Buffer.from("Faktura", "ascii")]);
  assert.deepEqual([...bytes.slice(8, 11)], [0x86, 0x84, 0x94]);
  assert.deepEqual([...bytes.slice(12, 15)], [0x8f, 0x8e, 0x99]);
  assert.equal(bytes[16], 0x82);
  assert.equal(encodePc8("€")[0], 0x3f);
});
