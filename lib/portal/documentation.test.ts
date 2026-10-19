import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cannotFinishReason,
  documentationHealth,
  documentationTree,
  missingPhotosLine,
  plannedPhaseDates,
  reportFingerprintSource,
  safeFileName,
  zipPhotoPaths,
  type ReportInput,
} from "./documentation";
import { BUILT_IN_PHASE_TEMPLATES, photoRequiredByDefault } from "./phase-templates";
import { photoEditSchema, timelineFormSchema } from "./schema";

const phase = (id: string, name: string, sort: number) => ({ id, name, sort });
const note = (id: string, phase_id: string | null, day: string, body = "Text", created_at = `${day}T15:00:00Z`) => ({ id, phase_id, day, body, created_at });
const photo = (id: string, phase_id: string | null, day: string, extra: Partial<{ sort: number; in_report: boolean; created_at: string; caption: string; path: string }> = {}) => ({
  id,
  phase_id,
  day,
  sort: 0,
  in_report: true,
  created_at: `${day}T15:00:00Z`,
  caption: "",
  path: `projects/x/${id}.jpg`,
  ...extra,
});

test("the tree follows the timeline, days run oldest first, phase-less content comes last", () => {
  const tree = documentationTree(
    [phase("b", "Tätskikt", 1), phase("a", "Rivning", 0)],
    [note("n1", "a", "2026-10-21"), note("n2", "a", "2026-10-20"), note("n3", null, "2026-10-19"), note("n4", "gone", "2026-10-22")],
    [photo("p1", "b", "2026-10-23"), photo("p2", "a", "2026-10-20")]
  );
  assert.deepEqual(
    tree.map((c) => [c.phase?.id ?? null, c.days.map((d) => d.day)]),
    [
      ["a", ["2026-10-20", "2026-10-21"]],
      ["b", ["2026-10-23"]],
      // A removed phase counts as no phase.
      [null, ["2026-10-19", "2026-10-22"]],
    ]
  );
});

test("empty notes are left out, unticked photos only when asked, empty phases only when asked", () => {
  const phases = [phase("a", "Rivning", 0), phase("b", "Tätskikt", 1)];
  const notes = [note("n1", "a", "2026-10-20", "  ")];
  const photos = [photo("p1", "a", "2026-10-20", { in_report: false })];
  assert.equal(documentationTree(phases, notes, photos)[0].days[0].photos.length, 1);
  assert.equal(documentationTree(phases, notes, photos)[0].days[0].notes.length, 0);
  assert.equal(documentationTree(phases, notes, photos, { reportOnly: true }).length, 0);
  assert.equal(documentationTree(phases, notes, photos, { reportOnly: true, withEmpty: true }).length, 2);
});

test("photos in a day keep the order they were taken in", () => {
  const tree = documentationTree(
    [phase("a", "Rivning", 0)],
    [],
    [
      photo("late", "a", "2026-10-20", { created_at: "2026-10-20T16:00:00Z", sort: 0 }),
      photo("second", "a", "2026-10-20", { created_at: "2026-10-20T09:00:00Z", sort: 1 }),
      photo("first", "a", "2026-10-20", { created_at: "2026-10-20T09:00:00Z", sort: 0 }),
    ]
  );
  assert.deepEqual(tree[0].days[0].photos.map((p) => p.id), ["first", "second", "late"]);
});

test("health counts working days so far and the days with photos", () => {
  const project = { starts_on: "2026-10-15", ends_on: "2026-10-30", works_saturdays: false };
  // Thu 15, Fri 16, Mon 19, Tue 20 = 4 working days; a photo on Saturday 17 makes it 5.
  const h = documentationHealth(project, [], [{ phase_id: null, day: "2026-10-15" }, { phase_id: null, day: "2026-10-17" }, { phase_id: null, day: "2026-10-17" }], "2026-10-20");
  assert.equal(h.daysSoFar, 5);
  assert.equal(h.daysWithPhotos, 2);
  // Nothing before the start, and the count stops at the end.
  assert.equal(documentationHealth(project, [], [], "2026-10-01").daysSoFar, 0);
  assert.equal(documentationHealth({ ...project, ends_on: "2026-10-16" }, [], [], "2026-11-30").daysSoFar, 2);
});

test("a phase that must be documented is missing photos once it has started", () => {
  const phases = [
    { id: "a", name: "Tätskikt", starts_on: "2026-10-19", done_at: null, photo_required: true },
    { id: "b", name: "El och VVS", starts_on: "2026-10-26", done_at: null, photo_required: true },
    { id: "c", name: "Rivning", starts_on: "2026-10-12", done_at: null, photo_required: false },
  ];
  const project = { starts_on: "2026-10-12", ends_on: "2026-10-30", works_saturdays: false };
  assert.deepEqual(documentationHealth(project, phases, [], "2026-10-20").missing, [{ id: "a", name: "Tätskikt" }]);
  assert.deepEqual(documentationHealth(project, phases, [{ phase_id: "a", day: "2026-10-19" }], "2026-10-20").missing, []);
  assert.equal(missingPhotosLine([{ name: "Tätskikt" }]), "Tätskikt saknar foton");
  assert.equal(missingPhotosLine([{ name: "Tätskikt" }, { name: "El och VVS" }, { name: "Golv" }]), "Tätskikt, El och VVS och Golv saknar foton");
  assert.equal(missingPhotosLine([]), "");
});

test("a photo-required phase can't be ticked done without a photo", () => {
  const p = { id: "a", name: "Tätskikt", photo_required: true };
  assert.match(cannotFinishReason(p, []) ?? "", /^Tätskikt saknar foton/);
  assert.equal(cannotFinishReason(p, [{ phase_id: "a" }]), null);
  assert.equal(cannotFinishReason({ ...p, photo_required: false }, []), null);
});

test("built-in templates and hand-added phases mark Tätskikt and El och VVS", () => {
  const badrum = BUILT_IN_PHASE_TEMPLATES.find((t) => t.key === "badrum")!;
  assert.deepEqual(badrum.phases.filter((p) => p.photo).map((p) => p.name), ["El och VVS", "Tätskikt"]);
  assert.equal(photoRequiredByDefault(" tätskikt "), true);
  assert.equal(photoRequiredByDefault("Tätskiktskontroll"), false);
  // An older client that doesn't send the flag saves it as off.
  const parsed = timelineFormSchema.parse({ starts_on: "", works_saturdays: false, phases: [{ id: null, name: "Rivning", duration_days: "1" }] });
  assert.equal(parsed.phases[0].photo_required, false);
});

test("planned dates leave out delays and ÄTA phases", () => {
  const planned = plannedPhaseDates({ starts_on: "2026-10-19", works_saturdays: false }, [
    { id: "a", sort: 0, duration_days: 2, change_order_id: null },
    { id: "ata", sort: 1, duration_days: 1, change_order_id: "c1" },
    { id: "b", sort: 2, duration_days: 1, change_order_id: null },
  ]);
  assert.deepEqual(planned.get("a"), { starts_on: "2026-10-19", ends_on: "2026-10-20" });
  assert.equal(planned.has("ata"), false);
  assert.deepEqual(planned.get("b"), { starts_on: "2026-10-21", ends_on: "2026-10-21" });
  assert.equal(plannedPhaseDates({ starts_on: "", works_saturdays: false }, []).size, 0);
});

test("the fingerprint changes with what the report prints, not with activity alone", () => {
  const base = {
    project: { id: "p", title: "Bad", address: "", customer_name: "", starts_on: "", ends_on: "", planned_ends_on: "", works_saturdays: false, final_summary: "", quote_id: null, archived_at: null, updated_at: "1" },
    phases: [],
    updates: [],
    photos: [{ id: "f", path: "k", phase_id: null, day: "2026-10-20", caption: "", in_report: true, sort: 0 }],
    documents: [{ id: "r", kind: "report", title: "Rapport", created_at: "x" }],
    changeOrders: [],
    shifts: [],
  } as unknown as ReportInput;
  const a = reportFingerprintSource(base);
  assert.equal(reportFingerprintSource({ ...base, project: { ...base.project, updated_at: "2" } }), a);
  // The locked report itself is not part of what the report prints.
  assert.equal(reportFingerprintSource({ ...base, documents: [] }), a);
  assert.notEqual(reportFingerprintSource({ ...base, photos: [{ ...base.photos[0], caption: "Ny" }] }), a);
  assert.notEqual(reportFingerprintSource({ ...base, project: { ...base.project, final_summary: "Klart" } }), a);
});

test("zip paths: numbered phase folders, a folder per day, numbered photos with captions", () => {
  const tree = documentationTree(
    [phase("a", "Rivning", 0), phase("b", "Tätskikt / våtrum", 1)],
    [],
    [
      photo("p1", "a", "2026-10-20", { sort: 0 }),
      photo("p2", "a", "2026-10-20", { sort: 1, caption: "Golvet: före?" }),
      photo("p3", "b", "2026-10-22", { path: "projects/x/p3.PNG" }),
      photo("p4", null, "2026-10-19"),
    ]
  );
  assert.deepEqual(
    zipPhotoPaths(tree).map((x) => x.name),
    ["01 Rivning/2026-10-20/01.jpg", "01 Rivning/2026-10-20/02 Golvet före.jpg", "02 Tätskikt våtrum/2026-10-22/01.png", "Utan fas/2026-10-19/01.jpg"]
  );
  assert.equal(safeFileName('  a<b>c:"d|e?*.  '), "a b c d e");
  assert.equal(safeFileName("///"), "namnlös");
});

test("a photo edit needs a real day", () => {
  assert.equal(photoEditSchema.safeParse({ caption: "", in_report: true, phase_id: null, day: "2026-02-31" }).success, false);
  assert.equal(photoEditSchema.safeParse({ caption: "x", in_report: false, phase_id: "a", day: "2026-10-20" }).success, true);
});
