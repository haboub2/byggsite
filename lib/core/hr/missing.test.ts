import { test } from "node:test";
import assert from "node:assert/strict";
import { missingData } from "./missing";
import type { Employee, EmploymentDocument, EmploymentVersion, TaxVersion } from "./schema";

const employee = (e: Partial<Employee> = {}) =>
  ({ id: "e", name: "Anna", pnrMasked: "19850412-XXXX", bankAccountMasked: "••••6789", street: "Storgatan 2", city: "Borås", endedAt: null, ...e }) as Employee;
const version = (v: Partial<EmploymentVersion> = {}) =>
  ({ id: "v1", contractId: "v1", version: 1, form: "tillsvidare", startsOn: "2026-01-01", endsOn: null, validFrom: "2026-01-01", validTo: null, ...v }) as EmploymentVersion;
const tax = (t: Partial<TaxVersion> = {}) => ({ kind: "table", tableNo: 33, columnNo: 1, mainEmployer: true, validFrom: "2026-01-01", adjustmentValidTo: null, ...t }) as TaxVersion;
const signedFor = (employmentId: string) => ({ employmentId, signedAt: "2026-01-02" }) as EmploymentDocument;
const keys = (b: ReturnType<typeof missingData>) => b.map((x) => x.key);
const today = "2026-10-30";

test("a complete person has no badges", () => {
  assert.deepEqual(missingData({ employee: employee(), versions: [version()], tax: [tax()], documents: [signedFor("v1")], today }), []);
});

test("each missing piece gets its badge", () => {
  const b = missingData({ employee: employee({ pnrMasked: "", bankAccountMasked: "", street: "" }), versions: [version()], tax: [], documents: [], today });
  assert.deepEqual(keys(b), ["pnr", "bank", "tax", "signed", "address"]);
  assert.deepEqual(keys(missingData({ employee: employee(), versions: [], tax: [], documents: [], today })), ["contract"]);
});

test("a new version needs its own signed contract; an ended contract needs nothing", () => {
  const v2 = version({ id: "v2", version: 2, validFrom: "2026-06-01" });
  assert.deepEqual(keys(missingData({ employee: employee(), versions: [version({ validTo: "2026-05-31" }), v2], tax: [tax()], documents: [signedFor("v1")], today })), ["signed"]);
  const ended = version({ endsOn: "2026-03-31" });
  assert.deepEqual(keys(missingData({ employee: employee(), versions: [ended], tax: [], documents: [], today })), ["contract"]);
});

test("jämkning running out within 30 days, or gone", () => {
  assert.match(missingData({ employee: employee(), versions: [version()], tax: [tax({ adjustmentValidTo: "2026-11-15" })], documents: [signedFor("v1")], today })[0].label, /går ut 2026-11-15/);
  assert.match(missingData({ employee: employee(), versions: [version()], tax: [tax({ adjustmentValidTo: "2026-10-01" })], documents: [signedFor("v1")], today })[0].label, /gick ut/);
});
