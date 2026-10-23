import { test } from "node:test";
import assert from "node:assert/strict";
import { interestCsv, interestFromForm, interestRows, interestSchema, interestStats, toolText, type InterestRow } from "./interest-schema";

const valid = () => ({
  company: "Bergs Bygg AB",
  name: "Jonas Berg",
  email: "jonas@bergsbygg.se",
  phone: "",
  volume: "10-50",
  currentTool: "fortnox",
  currentToolOther: "",
  priority: "",
  consent: "on",
});

const firstError = (input: unknown) => {
  const r = interestSchema.safeParse(input);
  return r.success ? null : r.error.issues[0]?.message;
};

test("a filled-in form is valid, and phone, other tool and priority are optional", () => {
  assert.equal(firstError(valid()), null);
  const { company, name, email, volume, currentTool, consent } = valid();
  const parsed = interestSchema.parse({ company, name, email, volume, currentTool, consent });
  assert.equal(parsed.phone, "");
  assert.equal(parsed.priority, "");
});

test("text is trimmed", () => {
  const parsed = interestSchema.parse({ ...valid(), company: "  Bergs Bygg AB ", email: " jonas@bergsbygg.se " });
  assert.equal(parsed.company, "Bergs Bygg AB");
  assert.equal(parsed.email, "jonas@bergsbygg.se");
});

test("the required fields say what is missing", () => {
  assert.equal(firstError({ ...valid(), company: "  " }), "Ange företagets namn.");
  assert.equal(firstError({ ...valid(), name: "" }), "Ange ditt namn.");
  assert.equal(firstError({ ...valid(), email: "jonas@" }), "Ange en giltig e-postadress.");
  assert.equal(firstError({ ...valid(), volume: "" }), "Välj ungefär hur många fakturor ni skickar i månaden.");
  assert.equal(firstError({ ...valid(), currentTool: "excel" }), "Välj vad ni fakturerar med i dag.");
});

test("consent must be ticked", () => {
  assert.equal(firstError({ ...valid(), consent: undefined }), "Kryssa i att vi får kontakta dig.");
  assert.equal(firstError({ ...valid(), consent: "off" }), "Kryssa i att vi får kontakta dig.");
});

test("only the listed choices pass, matching the table's checks", () => {
  for (const volume of ["under-10", "10-50", "over-50"]) assert.equal(firstError({ ...valid(), volume }), null);
  for (const currentTool of ["fortnox", "visma", "word-excel", "annat"]) assert.equal(firstError({ ...valid(), currentTool }), null);
  assert.notEqual(firstError({ ...valid(), volume: "100+" }), null);
});

test("lengths stay within the table's limits", () => {
  assert.equal(firstError({ ...valid(), company: "x".repeat(201) }), "Företagsnamnet är för långt.");
  assert.equal(firstError({ ...valid(), priority: "x".repeat(2001) }), "Texten är för lång, högst 2 000 tecken.");
  assert.equal(firstError({ ...valid(), priority: "x".repeat(2000) }), null);
});

test("FormData is read field by field, and unknown fields are dropped", () => {
  const form = new FormData();
  for (const [k, v] of Object.entries(valid())) form.set(k, v);
  form.set("website", "spam");
  form.set("org_id", "someone-else");
  const raw = interestFromForm(form);
  assert.equal(raw.company, "Bergs Bygg AB");
  assert.equal("website" in raw, false);
  assert.equal("org_id" in raw, false);
  assert.equal(firstError(raw), null);
});

test("the mail lists every field, with a dash for what was left out", () => {
  const rows = interestRows(interestSchema.parse({ ...valid(), currentTool: "annat", currentToolOther: "Bokio" }));
  assert.deepEqual(rows, [
    ["Företag", "Bergs Bygg AB"],
    ["Namn", "Jonas Berg"],
    ["E-post", "jonas@bergsbygg.se"],
    ["Telefon", "–"],
    ["Fakturor per månad", "10–50"],
    ["Fakturerar i dag med", "Annat: Bokio"],
    ["Viktigast", "–"],
  ]);
});

test("the tool reads as a label, with the visitor's own words when given", () => {
  assert.equal(toolText("fortnox", null), "Fortnox");
  assert.equal(toolText("annat", "Bokio"), "Annat: Bokio");
  assert.equal(toolText("annat", ""), "Annat");
});

test("the CSV has a header, Swedish time and no formulas", () => {
  const row: InterestRow = {
    id: "1",
    created_at: "2026-10-22T12:05:00Z",
    company: "=HYPERLINK(\"x\")",
    name: "Jonas Berg",
    email: "jonas@bergsbygg.se",
    phone: null,
    volume: "over-50",
    current_tool: "word-excel",
    current_tool_other: null,
    priority: "ROT; delfakturor",
    source: { page: "/fakturering", utm_source: "linkedin" },
    consent_at: "2026-10-22T12:05:00Z",
  };
  const lines = interestCsv([row]).replace(/^﻿/, "").split("\r\n");
  assert.equal(lines[0], "Datum;Företag;Namn;E-post;Telefon;Fakturor per månad;Fakturerar i dag med;Viktigast;Sida;Källa");
  assert.equal(lines[1], `2026-10-22 14:05;"'=HYPERLINK(""x"")";Jonas Berg;jonas@bergsbygg.se;;Över 50;Word/Excel;"ROT; delfakturor";/fakturering;linkedin`);
});

test("the key figures count the last 30 days, large companies and Fortnox users", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  const base = { id: "", company: "", name: "", email: "", phone: null, current_tool_other: null, priority: null, source: null, consent_at: "" };
  const rows: InterestRow[] = [
    { ...base, id: "a", created_at: "2026-10-21T12:00:00Z", volume: "over-50", current_tool: "fortnox" },
    { ...base, id: "b", created_at: "2026-09-01T12:00:00Z", volume: "under-10", current_tool: "fortnox" },
    { ...base, id: "c", created_at: "2026-10-01T12:00:00Z", volume: "10-50", current_tool: "visma" },
  ];
  assert.deepEqual(interestStats(rows, now), { total: 3, recent: 2, large: 1, fortnox: 2 });
});
