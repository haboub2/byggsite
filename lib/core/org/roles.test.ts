import { test } from "node:test";
import assert from "node:assert/strict";
import { adminLandingPath, assignableRoles, canOpenAdminPath, hasAccess } from "./roles";

test("access levels", () => {
  assert.equal(hasAccess("accountant", "read"), true);
  assert.equal(hasAccess("accountant", "write"), false);
  assert.equal(hasAccess("readonly", "read"), true);
  assert.equal(hasAccess("staff", "write"), true);
  assert.equal(hasAccess("staff", "admin"), false);
  assert.equal(hasAccess("admin", "admin"), true);
  assert.equal(hasAccess("admin", "owner"), false);
  assert.equal(hasAccess("owner", "owner"), true);
  assert.equal(hasAccess(null, "read"), false);
});

test("an accountant reads Ekonomi, Bokföringen, fakturor, kunder and ROT, nothing that creates", () => {
  for (const p of ["/admin/ekonomi", "/admin/ekonomi/export", "/admin/ekonomi/export/sie", "/admin/fakturor", "/admin/fakturor/abc", "/admin/fakturor/abc/pdf", "/admin/kunder/abc", "/admin/rot", "/admin/organisation"])
    assert.equal(canOpenAdminPath("accountant", p), true, p);
  for (const p of ["/admin", "/admin/leads/1", "/admin/offerter", "/admin/fakturor/ny", "/admin/kunder/ny", "/admin/fakturor/aterkommande", "/admin/fakturor/bank", "/admin/installningar", "/admin/api", "/admin/innehall/foretaget", "/admin/projekt"])
    assert.equal(canOpenAdminPath("accountant", p), false, p);
});

test("staff opens everything; anyone opens invitations and a new organisation", () => {
  assert.equal(canOpenAdminPath("staff", "/admin/offerter"), true);
  assert.equal(canOpenAdminPath(null, "/admin/inbjudan/abc"), true);
  assert.equal(canOpenAdminPath(null, "/admin/ny-organisation"), true);
  assert.equal(canOpenAdminPath(null, "/admin/registrera/klar"), true);
  assert.equal(canOpenAdminPath(null, "/admin/registrerad"), false);
  assert.equal(canOpenAdminPath(null, "/admin/ekonomi"), false);
});

test("the website's content only for owner/admin in the organisation that owns the site", () => {
  assert.equal(hasAccess("owner", "site"), false);
  assert.equal(hasAccess("owner", "site", true), true);
  assert.equal(hasAccess("admin", "site", true), true);
  assert.equal(hasAccess("staff", "site", true), false);
  for (const p of ["/admin/innehall/foretaget", "/admin/innehall/offert", "/admin/innehall/projekt/ny", "/admin/intresse", "/admin/intresse/csv"]) {
    assert.equal(canOpenAdminPath("owner", p), false, p);
    assert.equal(canOpenAdminPath("owner", p, true), true, p);
    assert.equal(canOpenAdminPath("staff", p, true), false, p);
  }
  // Everything else is the same in every organisation.
  assert.equal(canOpenAdminPath("owner", "/admin/offerter"), true);
  assert.equal(canOpenAdminPath("staff", "/admin"), true);
});

test("only owners make owners; staff assigns nothing", () => {
  assert.ok(assignableRoles("owner").includes("owner"));
  assert.ok(!assignableRoles("admin").includes("owner"));
  assert.deepEqual(assignableRoles("staff"), []);
});

test("payroll: owner, admin and accountant read Personal; staff and readonly do not", () => {
  assert.equal(hasAccess("owner", "payroll"), true);
  assert.equal(hasAccess("admin", "payroll"), true);
  assert.equal(hasAccess("accountant", "payroll"), true);
  assert.equal(hasAccess("staff", "payroll"), false);
  assert.equal(hasAccess("readonly", "payroll"), false);
  assert.equal(hasAccess("employee", "payroll"), false);
  for (const p of ["/admin/personal", "/admin/personal/abc", "/admin/personal/abc/dokument/def"]) {
    assert.equal(canOpenAdminPath("owner", p), true, p);
    assert.equal(canOpenAdminPath("accountant", p), true, p);
    assert.equal(canOpenAdminPath("staff", p), false, p);
    assert.equal(canOpenAdminPath("readonly", p), false, p);
  }
  // Adding people is for owner and admin.
  assert.equal(canOpenAdminPath("admin", "/admin/personal/ny"), true);
  assert.equal(canOpenAdminPath("accountant", "/admin/personal/ny"), false);
});

test("employee: no admin page, lands in the portal; may be invited by owner and admin", () => {
  for (const p of ["/admin", "/admin/idag", "/admin/ekonomi", "/admin/fakturor", "/admin/personal", "/admin/organisation"]) assert.equal(canOpenAdminPath("employee", p), false, p);
  assert.equal(canOpenAdminPath("employee", "/admin/inbjudan/abc"), true);
  assert.equal(hasAccess("employee", "read"), false);
  assert.equal(adminLandingPath("employee"), "/mitt-projekt");
  assert.equal(adminLandingPath("accountant"), "/admin/ekonomi");
  assert.ok(assignableRoles("admin").includes("employee"));
});
