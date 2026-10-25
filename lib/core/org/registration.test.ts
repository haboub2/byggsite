import { test } from "node:test";
import assert from "node:assert/strict";
import { REGISTRATION_TOKEN, normaliseOrgNr, registrationDonePath, registrationFromForm, registrationProblem, registrationSchema } from "./registration";
import { safeAdminNext } from "./roles";

const valid = { orgName: "Bergs Bygg AB", orgNr: "559123-4567", contactName: "Jonas Berg", email: "Jonas@BergsBygg.se", accept: "on" };

test("a valid registration parses, with the address in lower case", () => {
  const r = registrationSchema.parse(valid);
  assert.deepEqual(r, { ...valid, email: "jonas@bergsbygg.se" });
});

test("the org nr is required and written as in the settings, ten digits get their hyphen", () => {
  assert.equal(normaliseOrgNr("5591234567"), "559123-4567");
  assert.equal(normaliseOrgNr("559123 4567"), "559123-4567");
  assert.equal(registrationSchema.parse({ ...valid, orgNr: "5591234567" }).orgNr, "559123-4567");
  for (const orgNr of ["", "12345", "559123-456", "SE5591234567", "559123-45678"]) {
    const r = registrationSchema.safeParse({ ...valid, orgNr });
    assert.equal(r.success, false, orgNr);
  }
  assert.equal(registrationSchema.safeParse({ ...valid, orgNr: "" }).error?.issues[0]?.message, "Ange organisationsnumret.");
  assert.equal(registrationSchema.safeParse({ ...valid, orgNr: "12345" }).error?.issues[0]?.message, "Organisationsnummer skrivs 559123-4567.");
});

test("name, contact and address are checked", () => {
  assert.equal(registrationSchema.safeParse({ ...valid, orgName: "B" }).success, false);
  assert.equal(registrationSchema.safeParse({ ...valid, orgName: "x".repeat(121) }).success, false);
  assert.equal(registrationSchema.safeParse({ ...valid, contactName: "  " }).success, false);
  assert.equal(registrationSchema.safeParse({ ...valid, email: "jonas@" }).success, false);
  assert.equal(registrationSchema.safeParse({ ...valid, email: undefined }).success, false);
});

test("the checkbox about authority and terms is required", () => {
  for (const accept of [undefined, "", "off"]) {
    const r = registrationSchema.safeParse({ ...valid, accept });
    assert.equal(r.success, false, String(accept));
    assert.equal(r.error?.issues[0]?.message, "Kryssa i att du är behörig och godkänner villkoren.");
  }
});

test("the form's fields are read, unknown ones (the honeypot) ignored", () => {
  const f = new FormData();
  for (const [k, v] of Object.entries(valid)) f.set(k, v);
  f.set("website", "spam");
  assert.deepEqual(registrationFromForm(f), valid);
});

test("the link's landing carries a 64-hex token that the login may send back to", () => {
  const token = "a".repeat(64);
  assert.equal(REGISTRATION_TOKEN.test(token), true);
  assert.equal(REGISTRATION_TOKEN.test("a".repeat(48)), false);
  const next = registrationDonePath(token);
  assert.equal(next, `/admin/registrera/klar?r=${token}`);
  assert.equal(safeAdminNext(next), next);
  assert.equal(safeAdminNext("/admin/registrera/klar?r=abc"), null);
  assert.equal(safeAdminNext(`/admin/registrera/klar?r=${token}&x=1`), null);
  assert.equal(safeAdminNext("/admin/fakturor/ny"), "/admin/fakturor/ny");
  assert.equal(safeAdminNext(`/admin/inbjudan/${"b".repeat(48)}`), `/admin/inbjudan/${"b".repeat(48)}`);
  assert.equal(safeAdminNext("https://example.com/admin"), null);
  assert.equal(safeAdminNext("//example.com"), null);
  assert.equal(safeAdminNext("/mitt-projekt"), null);
});

test("database messages from complete_registration map to the problem shown", () => {
  assert.equal(registrationProblem("Registreringen finns inte. Öppna länken i det senaste mejlet."), "saknas");
  assert.equal(registrationProblem("Registreringen är redan slutförd. Logga in som vanligt."), "anvand");
  assert.equal(registrationProblem("Länken har gått ut. Registrera företaget igen."), "utgangen");
  assert.equal(registrationProblem("Registreringen gäller a@b.se, men du är inloggad som c@d.se."), "adress");
  assert.equal(registrationProblem("connection reset"), "fel");
});
