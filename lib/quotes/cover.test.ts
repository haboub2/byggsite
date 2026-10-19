import { test } from "node:test";
import assert from "node:assert/strict";
import { COVER_CHOICES, NO_COVER, coverForGroup, coverSlot } from "./cover";
import { builtInTemplates } from "./templates";

test("a chosen cover wins, and 'none' means no photo", () => {
  assert.equal(coverSlot({ cover: "kok-hero", title: "Badrum", division: "bygg" }), "kok-hero");
  assert.equal(coverSlot({ cover: NO_COVER, title: "Badrum", division: "bygg" }), null);
});

test("automatic cover follows the title, then falls back per side", () => {
  assert.equal(coverSlot({ cover: "", title: "Renovering av badrum", division: "bygg" }), "badrum-hero");
  assert.equal(coverSlot({ cover: "", title: "Takomläggning med plåt", division: "bygg" }), "tak-hero");
  assert.equal(coverSlot({ cover: "", title: "Altan i trä", division: "bygg" }), "tillbyggnad-hero");
  assert.equal(coverSlot({ cover: "", title: "Diverse arbeten", division: "bygg" }), "hero-bygg");
  assert.equal(coverSlot({ cover: "", title: "Ny webbplats", division: "01" }), "webb-hero");
  assert.equal(coverSlot({ cover: "", title: "", division: "01" }), "hero-software");
});

test("every template group with a photo maps to a slot the picker offers", () => {
  const offered = new Set(COVER_CHOICES.map((c) => c.slot));
  for (const t of builtInTemplates) {
    const slot = coverForGroup(t.group);
    if (slot) assert.ok(offered.has(slot), `${t.group} → ${slot}`);
    else assert.equal(t.group, "Fritt");
  }
});
