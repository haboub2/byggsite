import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chartFromSettings,
  fiscalYearFor,
  orgSettingsSchema,
  overrideAccounts,
  reminderSettingsFrom,
  resolveOrgSettings,
  sellerFromSettings,
  settingsFromContent,
  termsDaysFor,
} from "./settings";
import { DEFAULT_CHART } from "../ledger/posting";

const content = {
  company: { legalName: "Binaafy AB", orgNr: "559000-0000", street: "Storgatan 1", postalCode: "302 62", city: "Halmstad", email: "info@binaafy.se", phoneDisplay: "079-304 97 37" },
  quote: { vatNumber: "SE559000000001", fSkatt: true, bankgiro: "123-4567", plusgiro: "", iban: "", bic: "", paymentDays: 20, lateInterest: "Referensränta + 8 %", signerName: "Ibrahim" },
  env: { SWISH_NUMBER: "123 456 78 90", REMINDERS_AUTO: "1", REMINDERS_GRACE_DAYS: "5" },
};

test("an empty row parses to defaults, and every field has one", () => {
  const s = orgSettingsSchema.parse({});
  assert.equal(s.company.legalName, "");
  assert.equal(s.terms.foretag, 30);
  assert.equal(s.fiscalYearStart, "01-01");
  assert.equal(s.reminders.auto, false);
  assert.equal(s.chart.receivables, "");
});

test("the first organisation falls back to content blocks and environment while the row is empty", () => {
  const s = resolveOrgSettings({}, () => settingsFromContent(content));
  assert.equal(s.company.legalName, "Binaafy AB");
  assert.equal(s.company.vatNr, "SE559000000001");
  assert.equal(s.payment.swish, "1234567890");
  assert.equal(s.payment.bankgiro, "123-4567");
  assert.equal(s.terms.privat, 20);
  assert.equal(s.lateInterestText, "Referensränta + 8 %");
  assert.equal(s.reminders.auto, true);
  assert.equal(s.reminders.graceDays, 5);
  assert.equal(s.company.signer, "Ibrahim");
});

test("another organisation with an empty row gets empty defaults, never the fallback", () => {
  const s = resolveOrgSettings({});
  assert.equal(s.company.legalName, "");
  assert.equal(s.payment.bankgiro, "");
});

test("a saved row wins as a whole, cleared fields stay cleared", () => {
  const s = resolveOrgSettings({ company: { legalName: "Testbolag AB" }, payment: { bankgiro: "" } }, () => settingsFromContent(content));
  assert.equal(s.company.legalName, "Testbolag AB");
  assert.equal(s.payment.bankgiro, "");
  assert.equal(s.payment.swish, "");
});

test("a row with one invalid value keeps the rest", () => {
  const s = resolveOrgSettings({ company: { legalName: "X AB", orgNr: "fel" }, terms: { privat: 10 } });
  assert.equal(s.company.legalName, "X AB");
  assert.equal(s.company.orgNr, "");
  assert.equal(s.terms.privat, 10);
});

test("validation: org nr, VAT nr, bankgiro, Swish, IBAN normalised", () => {
  assert.equal(orgSettingsSchema.safeParse({ company: { orgNr: "5590000000" } }).success, true);
  assert.equal(orgSettingsSchema.safeParse({ company: { vatNr: "SE5590" } }).success, false);
  assert.equal(orgSettingsSchema.safeParse({ payment: { bankgiro: "12-34" } }).success, false);
  assert.equal(orgSettingsSchema.safeParse({ payment: { swish: "0701234567" } }).success, false);
  assert.equal(orgSettingsSchema.parse({ payment: { iban: "se45 5000 0000 0583 9825 7466" } }).payment.iban, "SE4550000000058398257466");
  assert.equal(orgSettingsSchema.safeParse({ fiscalYearStart: "07-15" }).success, false);
  assert.equal(orgSettingsSchema.safeParse({ chart: { bank: "19" } }).success, false);
});

test("seller block, terms per customer type, reminder settings", () => {
  const s = settingsFromContent(content);
  assert.deepEqual(sellerFromSettings(s), {
    name: "Binaafy AB",
    orgNr: "559000-0000",
    vatNr: "SE559000000001",
    street: "Storgatan 1",
    postalCode: "302 62",
    city: "Halmstad",
    countryCode: "SE",
    email: "info@binaafy.se",
    phone: "079-304 97 37",
    fSkatt: true,
  });
  const t = orgSettingsSchema.parse({ terms: { privat: 10, foretag: 30, byggforetag: 45 } });
  assert.equal(termsDaysFor(t, "byggforetag"), 45);
  assert.equal(termsDaysFor(t, undefined), 30);
  assert.equal(reminderSettingsFrom(s).graceDays, 5);
  assert.equal(reminderSettingsFrom(s).maxReminders, 2);
});

test("chart: BAS unless overridden, and overrides become accounts", () => {
  assert.deepEqual(chartFromSettings(orgSettingsSchema.parse({})), DEFAULT_CHART);
  const s = orgSettingsSchema.parse({ chart: { bank: "1940", sales25: "3011" } });
  const c = chartFromSettings(s);
  assert.equal(c.bank, "1940");
  assert.equal(c.sales[25], "3011");
  assert.equal(c.sales[12], "3002");
  assert.deepEqual(overrideAccounts(s), [
    { number: "1940", name: "Företagskonto" },
    { number: "3011", name: "Försäljning 25 %" },
  ]);
});

test("fiscal year: calendar year and a broken year", () => {
  assert.deepEqual(fiscalYearFor("2026-10-20"), { start: "2026-01-01", end: "2026-12-31" });
  assert.deepEqual(fiscalYearFor("2026-10-20", "05-01"), { start: "2026-05-01", end: "2027-04-30" });
  assert.deepEqual(fiscalYearFor("2026-03-31", "05-01"), { start: "2025-05-01", end: "2026-04-30" });
  assert.deepEqual(fiscalYearFor("2028-02-10", "03-01"), { start: "2027-03-01", end: "2028-02-29" });
});
