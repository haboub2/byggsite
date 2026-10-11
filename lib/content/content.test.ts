import { test } from "node:test";
import assert from "node:assert/strict";
import { companySchema, contentSchemas, fillWarranty, teamSchema, telHref, CONTENT_KEYS } from "./schema";
import { defaultContent } from "./defaults";
import { services } from "../placeholder";
import { softwareAreas } from "../software-content";

test("the built-in defaults pass their own validation", () => {
  for (const key of CONTENT_KEYS) {
    const r = contentSchemas[key].safeParse(defaultContent[key]);
    assert.ok(r.success, `${key}: ${r.success ? "" : JSON.stringify(r.error.issues[0])}`);
  }
});

test("every service on both sides has a warranty, every Bygg service a price", () => {
  for (const s of services) {
    assert.ok(defaultContent.warranty.services[s.slug], `warranty for ${s.slug}`);
    assert.ok(defaultContent.pricing.services[s.slug], `price for ${s.slug}`);
  }
  for (const a of softwareAreas) assert.ok(defaultContent.warranty.services[a.slug], `warranty for ${a.slug}`);
});

test("landing stats are three per side (the warranty is the fourth)", () => {
  assert.equal(defaultContent.company.byggStats.length, 3);
  assert.equal(defaultContent.company.softwareStats.length, 3);
  assert.ok(!defaultContent.company.byggStats.some((s) => s.label.includes("garanti")));
});

test("{garanti} is replaced with the warranty sentence", () => {
  const w = { short: "10 år", sentence: "10 års garanti på tätskiktet" };
  assert.equal(fillWarranty("Fast pris och {garanti}.", w), "Fast pris och 10 års garanti på tätskiktet.");
  assert.equal(fillWarranty("Utan token.", w), "Utan token.");
});

test("company validation catches the mistakes people actually make", () => {
  const ok = defaultContent.company;
  const bad = (patch: Partial<typeof ok>) => !companySchema.safeParse({ ...ok, ...patch }).success;
  assert.ok(bad({ phone: "079-304 97 37" }), "phone link needs +46 format");
  assert.ok(bad({ email: "info@" }), "email");
  assert.ok(bad({ postalCode: "30262x" }), "postal code");
  assert.ok(bad({ orgNr: "5591234567" }), "org.nr needs the dash");
  assert.ok(!bad({ orgNr: "" }), "org.nr may be empty until registered");
  assert.ok(!bad({ orgNr: "559123-4567" }), "valid org.nr");
});

test("team rows saved before email/phone existed still load, and bad contacts are caught", () => {
  const old = { members: [{ name: "Anna Andersson", role: "Snickare", side: "bygg", photo: null }] };
  const r = teamSchema.safeParse(old);
  assert.ok(r.success, "old row parses");
  assert.equal(r.data.members[0].email, "");
  assert.equal(r.data.members[0].phone, "");
  const member = (patch: object) => teamSchema.safeParse({ members: [{ ...old.members[0], ...patch }] }).success;
  assert.ok(member({ email: "anna@binaafy.se", phone: "070-123 45 67" }));
  assert.ok(!member({ email: "anna@" }), "email");
  assert.ok(!member({ phone: "ring mig" }), "phone");
});

test("tel links get the +46 form", () => {
  assert.equal(telHref("070-123 45 67"), "+46701234567");
  assert.equal(telHref("+46 70 123 45 67"), "+46701234567");
});
