import { test } from "node:test";
import assert from "node:assert/strict";
import { companySchema, contentSchemas, fillWarranty, teamSchema, telHref, reviewsSchema, parseTrustBox, CONTENT_KEYS } from "./schema";
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

test("reviews: empty by default, platform numbers need a date, quotes need a name", () => {
  const ok = defaultContent.reviews;
  assert.ok(reviewsSchema.safeParse(ok).success, "empty default is valid");
  const tp = { name: "Trustpilot", url: "https://se.trustpilot.com/review/binaafy.se", reviewUrl: "", rating: 4.8, count: 12, updated: "2026-10-12" };
  assert.ok(reviewsSchema.safeParse({ ...ok, platforms: [tp] }).success);
  assert.ok(!reviewsSchema.safeParse({ ...ok, platforms: [{ ...tp, updated: "" }] }).success, "numbers without a date");
  assert.ok(reviewsSchema.safeParse({ ...ok, platforms: [{ ...tp, rating: null, count: null, updated: "" }] }).success, "just a link");
  assert.ok(!reviewsSchema.safeParse({ ...ok, platforms: [{ ...tp, rating: 6 }] }).success, "rating above 5");
  assert.ok(!reviewsSchema.safeParse({ ...ok, platforms: [{ ...tp, url: "trustpilot.com" }] }).success, "url without https");
  assert.ok(!reviewsSchema.safeParse({ ...ok, quotes: [{ quote: "Bra jobb.", author: "", platform: "", rating: 5 }] }).success, "quote without a name");
});

test("TrustBox ids are read from the pasted snippet", () => {
  const snippet = `<!-- TrustBox widget - Mini -->
<div class="trustpilot-widget" data-locale="sv-SE" data-template-id="53aa8807dec7e10d38f59f36" data-businessunit-id="0123456789abcdef01234567" data-style-height="150px" data-style-width="100%">
  <a href="https://se.trustpilot.com/review/binaafy.se" target="_blank" rel="noopener">Trustpilot</a>
</div>`;
  assert.deepEqual(parseTrustBox(snippet), { templateId: "53aa8807dec7e10d38f59f36", businessUnitId: "0123456789abcdef01234567" });
  assert.equal(parseTrustBox("<div>ingen widget</div>"), null);
});
