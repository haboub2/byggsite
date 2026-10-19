import { test } from "node:test";
import assert from "node:assert/strict";
import { caseSchema, emptyCase, areaTitle, type Case } from "./case-schema";

const valid = (): Case => ({
  ...emptyCase(),
  slug: "kundportal-autobazar",
  title: "Kundportal för Autobazar",
  client: "Autobazar",
  area: "webb",
  summary: "En kundportal där kunderna följer sin order själva.",
  solution: "Vi byggde en portal i Next.js med inloggning, orderstatus och dokument, kopplad till affärssystemet.",
});

const errorPaths = (c: unknown) => {
  const r = caseSchema.safeParse(c);
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
};

test("a filled-in case is valid, and so is an empty draft once it has a title, client and summary", () => {
  assert.deepEqual(errorPaths(valid()), []);
  assert.deepEqual(errorPaths({ ...valid(), solution: "", published: false }), []);
});

test("publishing needs a description of what was built", () => {
  assert.deepEqual(errorPaths({ ...valid(), solution: "Kort.", published: true }), ["solution"]);
  assert.deepEqual(errorPaths({ ...valid(), published: true }), []);
});

test("the mistakes people actually make are caught", () => {
  assert.deepEqual(errorPaths({ ...valid(), slug: "Kundportal Autobazar" }), ["slug"]);
  assert.deepEqual(errorPaths({ ...valid(), slug: "ny" }), ["slug"]);
  assert.deepEqual(errorPaths({ ...valid(), url: "www.exempel.se" }), ["url"]);
  assert.deepEqual(errorPaths({ ...valid(), url: "https://www.exempel.se" }), []);
  assert.deepEqual(errorPaths({ ...valid(), cover: { path: "cases/a.webp", alt: "" } }), ["cover.alt"]);
  assert.deepEqual(errorPaths({ ...valid(), testimonial: { quote: "Toppen.", author: "" } }), ["testimonial.author"]);
  assert.deepEqual(
    errorPaths({ ...valid(), metrics: Array.from({ length: 5 }, () => ({ value: "1", label: "x" })) }),
    ["metrics"]
  );
});

test("area labels", () => {
  assert.equal(areaTitle("interna-system"), "Interna system");
  assert.equal(areaTitle(null), null);
});

test("case details: store links, year and feature list are checked", () => {
  assert.deepEqual(errorPaths({ ...valid(), appStore: "apps.apple.com/app/id1" }), ["appStore"]);
  assert.deepEqual(errorPaths({ ...valid(), playStore: "https://play.google.com/store/apps/details?id=x" }), []);
  assert.deepEqual(errorPaths({ ...valid(), year: 1999 }), ["year"]);
  assert.deepEqual(errorPaths({ ...valid(), status: "dev", platform: "both", area: "plattformar" }), []);
  assert.deepEqual(errorPaths({ ...valid(), features: Array.from({ length: 11 }, (_, i) => `Punkt ${i}`) }), ["features"]);
});

test("the imported Alenjaz cases are valid drafts with unique addresses", async () => {
  const { alenjazCases } = await import("./alenjaz-cases");
  for (const c of alenjazCases) {
    assert.deepEqual(errorPaths(c), [], c.slug);
    assert.equal(c.published, false, c.slug);
  }
  assert.equal(new Set(alenjazCases.map((c) => c.slug)).size, alenjazCases.length);
  // Publishing one needs nothing more than ticking the box (a cover photo is optional).
  for (const c of alenjazCases) assert.deepEqual(errorPaths({ ...c, published: true }), [], c.slug);
});
