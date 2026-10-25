import { test } from "node:test";
import assert from "node:assert/strict";
import { onboardingProgress, onboardingSteps, type OnboardingInput } from "./onboarding";
import { orgSettingsSchema } from "./settings";

/** What create_organization + complete_registration (0021, 0033) store for a new company. */
const fresh = (): OnboardingInput => ({
  settings: orgSettingsSchema.parse({ company: { legalName: "Bergs Bygg AB", orgNr: "559123-4567", email: "jonas@bergsbygg.se", signer: "Jonas Berg" } }),
  termsReviewed: false,
  siteOrg: false,
  customerCount: 0,
  firstCustomerId: null,
  invoiceCount: 0,
});

const status = (input: OnboardingInput) => Object.fromEntries(onboardingSteps(input).map((s) => [s.key, s.done]));

test("a newly registered company has every step left, in order", () => {
  const steps = onboardingSteps(fresh());
  assert.deepEqual(
    steps.map((s) => s.key),
    ["company", "payment", "terms", "logo", "customer", "invoice"]
  );
  assert.ok(steps.every((s) => !s.done));
  assert.equal(steps[0].body, "Saknas: gatuadress, postnummer, ort och momsregistreringsnummer. Står som säljare på varje faktura.");
  const p = onboardingProgress(steps);
  assert.deepEqual({ done: p.done, total: p.total, complete: p.complete, next: p.next?.key }, { done: 0, total: 6, complete: false, next: "company" });
});

test("company details need name, address, org nr and VAT nr", () => {
  const input = fresh();
  input.settings.company = { ...input.settings.company, street: "Byggvägen 1", postalCode: "43160", city: "Mölndal" };
  assert.equal(status(input).company, false);
  input.settings.company.vatNr = "SE559123456701";
  assert.equal(status(input).company, true);
  assert.equal(onboardingSteps(input)[0].body, "Bergs Bygg AB, 559123-4567, Mölndal.");
});

test("payment is bankgiro or Swish; plusgiro or IBAN alone is not enough", () => {
  const input = fresh();
  input.settings.payment.iban = "SE4550000000058398257466";
  assert.equal(status(input).payment, false);
  input.settings.payment.swish = "1231234567";
  assert.equal(status(input).payment, true);
  input.settings.payment.swish = "";
  input.settings.payment.bankgiro = "123-4567";
  assert.equal(status(input).payment, true);
});

test("terms count once the settings page has been saved", () => {
  assert.equal(status({ ...fresh(), termsReviewed: true }).terms, true);
});

test("the logo: the site's organisation always has one, others need their own", () => {
  assert.equal(status(fresh()).logo, false);
  assert.equal(status({ ...fresh(), siteOrg: true }).logo, true);
  assert.equal(onboardingSteps({ ...fresh(), siteOrg: true })[3].href, "/admin/innehall/offert");
  const own = fresh();
  own.settings.branding.logo = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(status(own).logo, true);
});

test("the trial invoice links to Ny faktura with the first customer filled in", () => {
  const none = onboardingSteps(fresh())[5];
  assert.equal(none.href, "/admin/kunder/ny");
  const withCustomer = onboardingSteps({ ...fresh(), customerCount: 2, firstCustomerId: "c-1" });
  assert.equal(withCustomer[4].done, true);
  assert.equal(withCustomer[4].body, "2 kunder i registret.");
  assert.equal(withCustomer[5].href, "/admin/fakturor/ny?kund=c-1");
  assert.equal(withCustomer[5].done, false);
  assert.equal(onboardingSteps({ ...fresh(), customerCount: 1, firstCustomerId: "c-1", invoiceCount: 1 })[5].done, true);
});

test("everything done: complete, no next step", () => {
  const input = fresh();
  input.settings.company = { ...input.settings.company, street: "Byggvägen 1", postalCode: "43160", city: "Mölndal", vatNr: "SE559123456701" };
  input.settings.payment.bankgiro = "123-4567";
  const steps = onboardingSteps({ ...input, termsReviewed: true, siteOrg: true, customerCount: 1, firstCustomerId: "c-1", invoiceCount: 1 });
  const p = onboardingProgress(steps);
  assert.equal(p.complete, true);
  assert.equal(p.next, null);
  assert.equal(p.done, 6);
});

test("the logo field accepts only a PNG or JPEG data URI of limited size", () => {
  const ok = (logo: string) => orgSettingsSchema.safeParse({ branding: { logo } }).success;
  assert.equal(ok(""), true);
  assert.equal(ok("data:image/png;base64,iVBORw0KGgo="), true);
  assert.equal(ok("data:image/jpeg;base64,/9j/4AAQ"), true);
  assert.equal(ok("data:image/svg+xml;base64,PHN2Zz4="), false);
  assert.equal(ok("https://example.com/logo.png"), false);
  assert.equal(ok(`data:image/png;base64,${"A".repeat(200_000)}`), false);
  // Rows saved before the field existed still parse, without a logo.
  assert.equal(orgSettingsSchema.parse({ company: { legalName: "X AB" } }).branding.logo, "");
});
