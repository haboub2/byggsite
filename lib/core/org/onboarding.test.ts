import { test } from "node:test";
import assert from "node:assert/strict";
import { onboardingProgress, onboardingSteps, stepRange, trialInvoice, type OnboardingInput } from "./onboarding";
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

/** Everything filled in except what the test changes. */
const ready = (): OnboardingInput => {
  const input = fresh();
  input.settings.company = { ...input.settings.company, street: "Byggvägen 1", postalCode: "431 60", city: "Mölndal", vatNr: "SE559123456701" };
  input.settings.payment.bankgiro = "5678-9012";
  input.settings.branding.logo = "data:image/png;base64,iVBORw0KGgo=";
  return { ...input, termsReviewed: true, customerCount: 1, firstCustomerId: "c-1" };
};

const status = (input: OnboardingInput) => Object.fromEntries(onboardingSteps(input).map((s) => [s.key, s.done]));
const progressOf = (input: OnboardingInput) => {
  const steps = onboardingSteps(input);
  return onboardingProgress(steps, trialInvoice(input, steps));
};

test("a newly registered company has five steps left, in the mockup's order", () => {
  const steps = onboardingSteps(fresh());
  assert.deepEqual(
    steps.map((s) => [s.n, s.title]),
    [
      [1, "Företaget på fakturan"],
      [2, "Betalning"],
      [3, "Villkor och påminnelser"],
      [4, "Logotyp"],
      [5, "Första kunden"],
    ]
  );
  assert.ok(steps.every((s) => !s.done));
  assert.deepEqual(progressOf(fresh()), { done: 0, total: 5, complete: false, next: { title: "Företaget på fakturan", href: "/admin/installningar#foretaget" } });
});

test("company details need name, address, org nr and VAT nr, and are summed up when done", () => {
  const input = ready();
  input.settings.company.vatNr = "";
  assert.equal(status(input).company, false);
  assert.equal(onboardingSteps(ready())[0].body, "Bergs Bygg AB · 559123-4567 · SE559123456701 · Byggvägen 1, 431 60 Mölndal");
});

test("payment is bankgiro or Swish; plusgiro or IBAN alone is not enough", () => {
  const input = fresh();
  input.settings.payment.iban = "SE4550000000058398257466";
  assert.equal(status(input).payment, false);
  input.settings.payment.swish = "1231234567";
  assert.equal(status(input).payment, true);
  assert.equal(onboardingSteps(input)[1].body, "Bankgiro saknas · Swish 1231234567");
  assert.equal(onboardingSteps(ready())[1].body, "Bankgiro 5678-9012 · Swish saknas · OCR-avtal ej kryssat ännu");
});

test("terms: the default is offered for approval, and counts once saved", () => {
  const step = onboardingSteps(fresh())[2];
  assert.equal(step.done, false);
  assert.equal(step.action, "approve-terms");
  assert.equal(step.body, "30 dagar till privatpersoner och företag är förvalt. Dröjsmålsränta enligt räntelagen, påminnelseavgift 60 kr till företag.");
  assert.equal(status({ ...fresh(), termsReviewed: true }).terms, true);
  // The banner cannot approve: its "next" for the terms leads to the guide.
  const input = ready();
  assert.equal(progressOf({ ...input, termsReviewed: false }).next?.href, "/admin/kom-igang");
});

test("the logo: the site's organisation always has one, others need their own", () => {
  assert.equal(status(fresh()).logo, false);
  assert.equal(status({ ...fresh(), siteOrg: true }).logo, true);
  assert.equal(onboardingSteps({ ...fresh(), siteOrg: true })[3].href, "/admin/innehall/offert");
  assert.equal(status(ready()).logo, true);
});

test("the trial invoice is locked until the five steps are done, then links to Ny faktura with the customer", () => {
  const input = ready();
  input.termsReviewed = false;
  input.settings.branding.logo = "";
  const locked = trialInvoice({ ...input, customerCount: 0, firstCustomerId: null });
  assert.equal(locked.unlocked, false);
  assert.deepEqual(locked.waitingFor, [3, 4, 5]);
  assert.equal(stepRange(locked.waitingFor), "3–5");
  assert.equal(stepRange([3, 5]), "3 och 5");
  assert.equal(stepRange([1, 2]), "1 och 2");
  assert.equal(stepRange([4]), "4");

  const open = trialInvoice(ready());
  assert.deepEqual(open, { unlocked: true, done: false, waitingFor: [], href: "/admin/fakturor/ny?kund=c-1" });
  assert.deepEqual(progressOf(ready()), { done: 5, total: 5, complete: false, next: { title: "Provfakturan", href: "/admin/fakturor/ny?kund=c-1" } });
});

test("five steps and an invoice: complete, no next step", () => {
  const p = progressOf({ ...ready(), invoiceCount: 1 });
  assert.equal(p.complete, true);
  assert.equal(p.next, null);
  // An invoice without the steps is not enough.
  assert.equal(progressOf({ ...fresh(), invoiceCount: 3 }).complete, false);
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
