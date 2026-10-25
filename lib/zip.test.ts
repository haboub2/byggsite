import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32, createZip, readStoredZip } from "./zip";

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
});

test("a zip reads back with its UTF-8 names, contents and checksums", () => {
  const photo = Buffer.alloc(70_000, 7);
  const zip = createZip([
    { name: "Projektdokumentation Badrum.pdf", data: Buffer.from("%PDF-1.7 test") },
    { name: "02 Tätskikt/2026-10-20/01 Duschhörnan.jpg", data: photo, date: new Date(2026, 9, 20, 15, 30) },
  ]);
  const entries = readStoredZip(zip);
  assert.deepEqual(entries.map((e) => e.name), ["Projektdokumentation Badrum.pdf", "02 Tätskikt/2026-10-20/01 Duschhörnan.jpg"]);
  assert.ok(entries.every((e) => e.crcOk));
  assert.equal(entries[0].data.toString(), "%PDF-1.7 test");
  assert.ok(entries[1].data.equals(photo));
  assert.equal(entries[1].date.getTime(), new Date(2026, 9, 20, 15, 30).getTime());
  // UTF-8 flag set on the entry with å/ö.
  assert.equal(zip.readUInt16LE(6) & 0x0800, 0x0800);
});

test("duplicate or empty names are refused", () => {
  assert.throws(() => createZip([{ name: "a.jpg", data: Buffer.from("1") }, { name: "a.jpg", data: Buffer.from("2") }]));
  assert.throws(() => createZip([{ name: "/", data: Buffer.from("1") }]));
});
