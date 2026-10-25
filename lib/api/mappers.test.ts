import { test } from "node:test";
import assert from "node:assert/strict";
import type { InvoiceDocument } from "../core/documents/invoice";
import type { RotClaim } from "../core/rot/store";
import type { PaymentPlan } from "../core/plans/schema";
import { apiDocument, decodeCursor, encodeCursor, eventResource, pageInMemory, paymentPlanResource, paymentResource, rotClaimResource } from "./mappers";
import { eventListQuerySchema, eventResourceSchema, paymentPlanResourceSchema, paymentResourceSchema, rotClaimResourceSchema } from "./schemas";

const TODAY = "2026-10-25";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function claim(personalNumber: string): RotClaim {
  return {
    id: ID(1),
    name: "Oktober",
    status: "sent",
    sentOn: "2026-10-20",
    decidedOn: null,
    paidOre: 0,
    note: "Oktober\nintern anteckning",
    createdAt: "2026-10-20T08:00:00Z",
    items: [
      {
        id: ID(2),
        invoiceId: ID(3),
        invoiceNumber: "10005",
        buyerId: null,
        buyerName: "Anna Andersson",
        personalNumber,
        amountOre: 1_500_000,
        workOre: 5_000_000,
        paidOn: "2026-10-15",
        status: "pending",
        property: { kind: "fastighet", designation: "Täby Hägernäs 1:23" },
        category: "Bygg",
      },
    ],
  };
}

test("ROT claim: the personal number is masked even when the store has it in clear (demo)", () => {
  const r = rotClaimResource(claim("850412-1234"), TODAY);
  assert.equal(r.items[0].personalNumber, "19850412-XXXX");
  assert.ok(!JSON.stringify(r).includes("1234"));
  assert.equal(rotClaimResource(claim("198504121234"), TODAY).items[0].personalNumber, "19850412-XXXX");
  assert.equal(rotClaimResource(claim("19850412-XXXX"), TODAY).items[0].personalNumber, "19850412-XXXX", "already masked (database): unchanged");
  assert.equal(rotClaimResource(claim("skräp"), TODAY).items[0].personalNumber, "", "malformed: nothing");
  assert.equal(r.requestedOre, 1_500_000);
  assert.equal(rotClaimResourceSchema.safeParse(r).success, true);
  assert.ok(!("note" in r), "the internal note stays internal");
});

test("invoice document: ROT buyers masked, ciphertext removed, rest untouched", () => {
  const doc = {
    lines: [{ id: "l1" }],
    se: {
      reverseCharge: false,
      lateInterestText: "",
      rot: {
        buyers: [
          { name: "Anna", personalNumber: "850412-1234", roomOre: null },
          { name: "Bo", personalNumber: "19790101-XXXX", personalNumberSealed: "c2VhbGVk", roomOre: 1000 },
        ],
        property: null,
        deductionOre: null,
      },
    },
  } as unknown as InvoiceDocument;
  const out = apiDocument(doc, TODAY);
  assert.deepEqual(out.se.rot!.buyers, [
    { name: "Anna", personalNumber: "19850412-XXXX", roomOre: null },
    { name: "Bo", personalNumber: "19790101-XXXX", roomOre: 1000 },
  ]);
  assert.equal(out.lines, doc.lines);
  assert.equal(doc.se.rot!.buyers[0].personalNumber, "850412-1234", "the input is not changed");
  const noRot = { se: { rot: null } } as unknown as InvoiceDocument;
  assert.equal(apiDocument(noRot, TODAY), noRot);
});

test("payment plan: steps in order, camelCase, öre", () => {
  const plan: PaymentPlan = {
    id: ID(10),
    projectId: ID(11),
    quoteId: null,
    kind: "fixed",
    createdAt: "2026-10-01T10:00:00Z",
    steps: [
      { id: ID(13), planId: ID(10), sort: 1, label: "Slutfaktura", percent: null, amountOre: null, phaseId: null, dueRule: "on_completion", dueOn: null, laborShare: null, invoiceId: null, createdAt: "2026-10-01T10:00:00Z" },
      { id: ID(12), planId: ID(10), sort: 0, label: "30 % vid start", percent: 30, amountOre: null, phaseId: null, dueRule: "on_start", dueOn: null, laborShare: 0.6, invoiceId: ID(14), createdAt: "2026-10-01T10:00:00Z" },
    ],
  };
  const r = paymentPlanResource(plan);
  assert.deepEqual(r.steps.map((s) => s.label), ["30 % vid start", "Slutfaktura"]);
  assert.ok(!("planId" in r.steps[0]));
  assert.equal(paymentPlanResourceSchema.safeParse(r).success, true);
});

test("event and payment resources match their schemas", () => {
  const e = eventResource({ id: ID(20), orgId: "o", aggregateType: "invoice", aggregateId: ID(21), type: "invoice.corrected", data: { number: "10005", correctionNumber: "10006" }, actor: { kind: "user", id: "anna@x.se", name: "anna@x.se" }, at: "2026-10-25T10:00:00.123456+00:00" });
  assert.deepEqual(e.actor, { kind: "user", name: "anna@x.se" });
  assert.ok(!("orgId" in e));
  assert.equal(eventResourceSchema.safeParse(e).success, true);
  const p = paymentResource({ id: ID(30), amountOre: -5000, method: "swish", paidOn: "2026-10-20", reference: "", note: "", createdAt: "2026-10-20T10:00:00Z", allocations: [{ invoiceId: ID(31), amountOre: -5000 }] });
  assert.equal(p.currency, "SEK");
  assert.equal(paymentResourceSchema.safeParse(p).success, true);
});

test("cursor: round trip, and anything else is refused (it goes into a database filter)", () => {
  const c = encodeCursor("2026-10-25T10:00:00.123456+00:00", ID(5));
  assert.deepEqual(decodeCursor(c), { at: "2026-10-25T10:00:00.123456+00:00", id: ID(5) });
  assert.equal(decodeCursor("inte-en-cursor"), null);
  assert.equal(decodeCursor(Buffer.from(JSON.stringify(['2026-10-25",id.gt.x', ID(5)])).toString("base64url")), null);
  assert.equal(decodeCursor(Buffer.from(JSON.stringify(["2026-10-25T10:00:00Z", "1 or 1=1"])).toString("base64url")), null);
});

test("paging in memory: every row once, in order, both directions, stable when rows are added", () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ id: ID(i + 1), at: `2026-10-25T10:00:0${i % 3}Z` }));
  for (const order of ["asc", "desc"] as const) {
    const seen: string[] = [];
    let cursor: { at: string; id: string } | null = null;
    let pages = 0;
    for (;;) {
      const { page, next } = pageInMemory(rows, order, 3, cursor);
      seen.push(...page.map((r) => r.id));
      pages++;
      if (!next) break;
      cursor = decodeCursor(next);
      if (order === "desc" && pages === 1) rows.push({ id: ID(99), at: "2026-10-25T11:00:00Z" }); // newer than the cursor: not on later pages
    }
    assert.equal(new Set(seen).size, seen.length, `${order}: no repeats`);
    assert.equal(seen.length, 7, `${order}: every row`);
    rows.splice(7);
  }
});

test("event list query: defaults and filters", () => {
  const q = eventListQuerySchema.parse({ aggregateType: "invoice", limit: "20" });
  assert.deepEqual(q, { aggregateType: "invoice", order: "desc", limit: 20 });
  assert.equal(eventListQuerySchema.safeParse({ aggregateType: "project" }).success, false);
  assert.equal(eventListQuerySchema.safeParse({ limit: "201" }).success, false);
});
