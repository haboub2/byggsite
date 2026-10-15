import { test } from "node:test";
import assert from "node:assert/strict";
import { builtInTemplates, quoteFromTemplate, templateGroups } from "./templates";
import { quoteSchema } from "./schema";
import { defaultContent } from "../content/defaults";

test("template keys are unique and every job has at least one template", () => {
  const keys = builtInTemplates.map((t) => t.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const division of ["bygg", "01"] as const) {
    const groups = templateGroups(division);
    assert.ok(groups.length >= 4, `${division} has groups`);
    for (const g of groups) assert.ok(g.templates.length >= 1, g.group);
  }
});

test("every built-in template produces a valid quote", () => {
  for (const t of builtInTemplates) {
    const q = quoteFromTemplate(t, defaultContent.quote, "2026-10-15");
    // Title and customer are the admin's job; everything the template fills in must validate.
    const r = quoteSchema.safeParse({ ...q, title: q.title || "Rubrik", customer: { ...q.customer, name: "Kund" } });
    assert.ok(r.success, `${t.key}: ${r.success ? "" : JSON.stringify(r.error.issues[0])}`);
  }
});
