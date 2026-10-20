import { test } from "node:test";
import assert from "node:assert/strict";
import { assignableRoles, canOpenAdminPath, hasAccess } from "./roles";

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
  assert.equal(canOpenAdminPath(null, "/admin/ekonomi"), false);
});

test("only owners make owners; staff assigns nothing", () => {
  assert.ok(assignableRoles("owner").includes("owner"));
  assert.ok(!assignableRoles("admin").includes("owner"));
  assert.deepEqual(assignableRoles("staff"), []);
});
