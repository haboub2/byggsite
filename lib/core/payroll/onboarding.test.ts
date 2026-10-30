import { test } from "node:test";
import assert from "node:assert/strict";
import { payrollOnboarding, type PayrollOnboardingInput } from "./onboarding";
import { payrollSettingsSchema } from "./settings";
import { DEFAULT_PAY_ITEMS } from "./pay-items.default";

const base = (): PayrollOnboardingInput => ({
  settings: payrollSettingsSchema.parse({}),
  confirmed: {},
  approverCount: 1,
  hasAccountant: false,
  orgNr: "",
  taxTableYears: [],
  people: [],
  registerCodes: DEFAULT_PAY_ITEMS.map((i) => i.code),
  hasSeriesL: true,
  runCount: 0,
  today: "2026-11-02",
});

test("a fresh organisation: the register is there, everything else waits", () => {
  const o = payrollOnboarding(base());
  assert.equal(o.total, 12);
  assert.equal(o.done, 1);
  assert.equal(o.steps[0].key, "register");
  assert.equal(o.steps[0].done, true);
  assert.equal(o.next?.key, "agreement");
  assert.equal(o.complete, false);
  assert.match(o.steps.find((s) => s.key === "tax-tables")!.body, /2026/);
  assert.match(o.steps.find((s) => s.key === "agi")!.body, /Organisationsnumret saknas/);
});

test("the agreement step needs the register's preset to follow the decision", () => {
  const i = base();
  i.confirmed.agreement = "2026-11-01T10:00:00Z";
  i.settings.agreement = "byggavtalet";
  assert.equal(payrollOnboarding(i).steps[1].done, false);
  i.settings.payItemPreset = "byggavtalet";
  assert.equal(payrollOnboarding(i).steps[1].done, true);
});

test("the bank step needs an account, not just a confirmation; four eyes need two people", () => {
  const i = base();
  i.confirmed.bank = "2026-11-01T10:00:00Z";
  assert.equal(payrollOnboarding(i).steps.find((s) => s.key === "bank")!.done, false);
  i.settings.bank.iban = "SE4550000000058398257466";
  assert.equal(payrollOnboarding(i).steps.find((s) => s.key === "bank")!.done, true);
  assert.equal(payrollOnboarding(i).steps.find((s) => s.key === "approvers")!.done, false);
  i.hasAccountant = true;
  assert.equal(payrollOnboarding(i).steps.find((s) => s.key === "approvers")!.done, true);
});

test("people: done when every active person has contract, tax and bank; the missing ones are named", () => {
  const i = base();
  const people = [
    { id: "a", name: "Anna", hasContract: true, hasTax: true, hasBank: true, ended: false },
    { id: "b", name: "Bo", hasContract: true, hasTax: false, hasBank: false, ended: false },
    { id: "c", name: "Cecilia", hasContract: false, hasTax: false, hasBank: false, ended: true },
  ];
  i.people = people;
  const step = payrollOnboarding(i).steps.find((s) => s.key === "people")!;
  assert.equal(step.done, false);
  assert.match(step.body, /Bo \(skatt, bankkonto\)/);
  assert.doesNotMatch(step.body, /Cecilia/);
  i.people = [people[0], { ...people[1], hasTax: true, hasBank: true }, people[2]];
  assert.equal(payrollOnboarding(i).steps.find((s) => s.key === "people")!.done, true);
});

test("everything done", () => {
  const i = base();
  for (const k of ["agreement", "period", "payDay", "vacationYear", "bank", "accounts", "pension", "agi"] as const) i.confirmed[k] = "2026-11-01T10:00:00Z";
  i.settings.agreement = "none";
  i.settings.payItemPreset = "none";
  i.settings.bank.iban = "SE4550000000058398257466";
  i.approverCount = 2;
  i.orgNr = "559123-4567";
  i.taxTableYears = [2026];
  i.people = [{ id: "a", name: "Anna", hasContract: true, hasTax: true, hasBank: true, ended: false }];
  const o = payrollOnboarding(i);
  assert.equal(o.complete, true, JSON.stringify(o.steps.filter((s) => !s.done).map((s) => s.key)));
  assert.equal(o.next, null);
});
