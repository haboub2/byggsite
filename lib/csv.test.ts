import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, toCsv } from "./csv";

test("plain values pass through, empty for null", () => {
  assert.equal(csvCell("Anna"), "Anna");
  assert.equal(csvCell(42), "42");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
});

test("separators, quotes and newlines are quoted", () => {
  assert.equal(csvCell("a;b"), '"a;b"');
  assert.equal(csvCell('säger "hej"'), '"säger ""hej"""');
  assert.equal(csvCell("rad 1\nrad 2"), '"rad 1\nrad 2"');
});

test("formula-looking text is neutralised", () => {
  assert.equal(csvCell("=HYPERLINK(\"http://x\")"), "\"'=HYPERLINK(\"\"http://x\"\")\"");
  assert.equal(csvCell("+46701234567"), "'+46701234567");
  assert.equal(csvCell("-5"), "'-5");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
});

test("document has BOM, semicolons and CRLF", () => {
  const out = toCsv(["Namn", "Ort"], [["Åsa", "Halmstad"]]);
  assert.equal(out, "﻿Namn;Ort\r\nÅsa;Halmstad\r\n");
});
