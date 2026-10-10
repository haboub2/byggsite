import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyProject, projectSchema, slugify } from "./project-schema";

test("slugs from Swedish titles", () => {
  assert.equal(slugify("Villa i Söndrum"), "villa-i-sondrum");
  assert.equal(slugify("Radhus på Vallås"), "radhus-pa-vallas");
  assert.equal(slugify("  Kök & bad — 2026!  "), "kok-bad-2026");
});

const valid = () => ({
  ...emptyProject(),
  slug: "villa-i-sondrum",
  title: "Villa i Söndrum",
  summary: "Genomgående renovering av 1970-talsvilla.",
});

const errorPaths = (data: unknown) => {
  const r = projectSchema.safeParse(data);
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
};

test("a draft without photos is fine", () => {
  assert.deepEqual(errorPaths(valid()), []);
});

test("publishing needs a cover photo", () => {
  assert.deepEqual(errorPaths({ ...valid(), published: true }), ["cover"]);
  assert.deepEqual(
    errorPaths({ ...valid(), published: true, cover: { path: "projects/a.webp", alt: "Nytt kök" } }),
    []
  );
});

test("every photo needs a description", () => {
  const p = { ...valid(), before: { path: "projects/b.webp", alt: "" }, gallery: [{ path: "projects/c.webp", alt: "" }] };
  assert.deepEqual(errorPaths(p).sort(), ["before.alt", "gallery.0.alt"]);
});

test("the address is checked", () => {
  assert.deepEqual(errorPaths({ ...valid(), slug: "Villa i Söndrum" }), ["slug"]);
  assert.deepEqual(errorPaths({ ...valid(), slug: "ny" }), ["slug"]);
});

test("a quote needs to say who said it", () => {
  assert.deepEqual(errorPaths({ ...valid(), testimonial: { quote: "Toppen!", author: "" } }), ["testimonial.author"]);
});
