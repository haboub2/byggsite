import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PAY_ITEMS } from "./pay-items.default";
import { PAY_ITEM_PRESETS, presetChanges, presetPayItems, presetRows, sameItem } from "./pay-item-presets";

const seeded = DEFAULT_PAY_ITEMS.map((i) => ({ ...i, validFrom: "2026-01-01" }));

test("every preset holds every default code, with unique codes and the register's invariants", () => {
  for (const p of PAY_ITEM_PRESETS) {
    const items = presetPayItems(p);
    const codes = items.map((i) => i.code);
    assert.equal(new Set(codes).size, codes.length, p);
    for (const d of DEFAULT_PAY_ITEMS) assert.ok(codes.includes(d.code), `${p} saknar ${d.code}`);
    for (const i of items) {
      if (!i.flags.taxable) assert.equal(i.flags.taxMode, "none", `${p} ${i.code}`);
      if (i.kind === "benefit") assert.equal(i.flags.counterAccount, "7399", `${p} ${i.code}`);
      assert.match(i.flags.account, /^\d{4}$/);
    }
  }
});

test("none: nothing to Fora or Collectum", () => {
  for (const i of presetPayItems("none")) {
    assert.equal(i.flags.foraCategory, null, i.code);
    assert.equal(i.flags.pensionReportable, false, i.code);
  }
});

test("byggavtalet: kollektiv pay to Fora, tjänstemän not to Collectum, helglön and ATF added", () => {
  const items = presetPayItems("byggavtalet");
  const by = (code: string) => items.find((i) => i.code === code)!;
  assert.equal(by("1100").flags.foraCategory, "lon");
  assert.equal(by("1100").flags.pensionReportable, true);
  assert.equal(by("1010").flags.pensionReportable, false);
  assert.equal(by("1120").name, "Helglön");
  assert.equal(by("1250").flags.account, "7010");
  assert.equal(by("1600").flags.pensionReportable, false, "the board fee is never pension pay");
});

test("tjänstemannaavtalet: tjänstemän to Collectum, nothing to Fora", () => {
  const items = presetPayItems("tjanstemannaavtalet");
  const by = (code: string) => items.find((i) => i.code === code)!;
  assert.equal(by("1010").flags.pensionReportable, true);
  assert.equal(by("1100").flags.pensionReportable, false);
  for (const i of items) assert.equal(i.flags.foraCategory, null, i.code);
  assert.equal(items.some((i) => i.code === "1120"), false);
});

test("both is the default register plus Byggavtalet's items", () => {
  const items = presetPayItems("both");
  for (const d of DEFAULT_PAY_ITEMS) assert.ok(sameItem(d, items.find((i) => i.code === d.code)!), d.code);
  assert.equal(items.length, DEFAULT_PAY_ITEMS.length + 2);
});

test("presetChanges: the default register under 'both' adds only the two Byggavtalet items; 'none' versions every reported item", () => {
  const both = presetChanges(seeded, "both", "2026-11-01");
  assert.deepEqual(both.map((c) => [c.code, c.change]), [["1120", "new"], ["1250", "new"]]);
  const none = presetChanges(seeded, "none", "2026-11-01");
  assert.ok(none.every((c) => c.change === "version"));
  assert.ok(none.some((c) => c.code === "1100" && c.from?.flags.foraCategory === "lon" && c.to.flags.foraCategory === null));
  assert.equal(none.some((c) => c.code === "1920"), false, "an unreported tax-free item is already as the preset wants it");
  // Applying the same preset again changes nothing.
  const after = [...seeded, ...none.map((c) => ({ ...c.to, version: 2, validFrom: "2026-11-01" }))];
  assert.deepEqual(presetChanges(after, "none", "2026-11-01"), []);
  // A version dated after `date` is not the one compared with.
  assert.equal(presetChanges(after, "none", "2026-10-01").length, none.length);
});

test("presetRows flattens the flags as the table's columns", () => {
  const row = presetRows("byggavtalet").find((r) => r.code === "1830")!;
  assert.deepEqual(row, {
    code: "1830",
    name: "Drivmedelsförmån",
    kind: "benefit",
    taxable: true,
    taxMode: "table",
    subjectToEmployerContribution: true,
    vacationPayBasis: false,
    pensionReportable: false,
    agiBox: "018",
    account: "7385",
    counterAccount: "7399",
    foraCategory: null,
  });
});
