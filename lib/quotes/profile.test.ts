import { test } from "node:test";
import assert from "node:assert/strict";
import { orgSettingsSchema } from "../core/org/settings";
import { defaultContent } from "../content/defaults";
import { BLANK_QUOTE_TEXTS, quoteProfile } from "./profile";

const testbolag = orgSettingsSchema.parse({
  company: { legalName: "Testbolag AB", orgNr: "556677-8899", vatNr: "SE556677889901", street: "Provgatan 1", postalCode: "411 01", city: "Göteborg", email: "info@testbolag.se", phone: "031-12 34 56", fSkatt: false, signer: "Tess Testsson" },
  payment: { bankgiro: "123-4567", iban: "SE4550000000058398257466" },
  terms: { privat: 10, foretag: 20, byggforetag: 30 },
});

test("another organisation's quote: its own seller, payment and signer, no site texts", () => {
  const p = quoteProfile(testbolag, BLANK_QUOTE_TEXTS, { brand: "Testbolag AB", logo: null });
  assert.equal(p.company.legalName, "Testbolag AB");
  assert.equal(p.company.orgNr, "556677-8899");
  assert.equal(p.company.phoneDisplay, "031-12 34 56");
  assert.equal(p.settings.bankgiro, "123-4567");
  assert.equal(p.settings.iban, "SE4550000000058398257466");
  assert.equal(p.settings.vatNumber, "SE556677889901");
  assert.equal(p.settings.fSkatt, false);
  assert.equal(p.settings.signerName, "Tess Testsson");
  assert.equal(p.settings.signerTitle, "");
  assert.equal(p.settings.paymentDays, 20);
  assert.equal(p.settings.bygg.intro, "");
  assert.equal(p.logo, null);
  // Nothing of the site's default content leaks into it.
  const json = JSON.stringify(p);
  for (const v of [defaultContent.company.legalName, defaultContent.company.email, defaultContent.quote.bygg.payment]) {
    assert.ok(!json.includes(v), v);
  }
});

test("the site's organisation keeps Offertuppgifter for the texts, the settings for the seller", () => {
  const texts = { ...defaultContent.quote, bankgiro: "999-9999", signerName: "Tess Testsson", signerTitle: "VD" };
  const p = quoteProfile(testbolag, texts, { brand: "Binaafy", logo: "data:image/png;base64,AA" });
  assert.equal(p.settings.bygg.payment, defaultContent.quote.bygg.payment);
  assert.equal(p.settings.validDays, defaultContent.quote.validDays);
  assert.equal(p.settings.bankgiro, "123-4567");
  assert.equal(p.settings.signerTitle, "VD");
  assert.equal(p.brand, "Binaafy");
  // Another signer in the settings does not inherit the site signer's title.
  const other = quoteProfile({ ...testbolag, company: { ...testbolag.company, signer: "Annan Person" } }, texts, { brand: "Binaafy", logo: null });
  assert.equal(other.settings.signerTitle, "");
});

test("no brand falls back to the company name", () => {
  assert.equal(quoteProfile(testbolag, BLANK_QUOTE_TEXTS, { brand: "", logo: null }).brand, "Testbolag AB");
});
