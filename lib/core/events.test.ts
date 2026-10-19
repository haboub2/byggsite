import { test } from "node:test";
import assert from "node:assert/strict";
import { customerTimeline, EVENT_LABEL, EVENT_TYPES, isWebhookEvent, makeEvent, WEBHOOK_EVENT_TYPES } from "./events";

test("every event type has a label and every webhook type is an event type", () => {
  for (const t of EVENT_TYPES) assert.ok(EVENT_LABEL[t].text.length > 0, t);
  for (const t of WEBHOOK_EVENT_TYPES) assert.ok((EVENT_TYPES as readonly string[]).includes(t), t);
  assert.equal(isWebhookEvent("invoice.paid"), true);
  assert.equal(isWebhookEvent("invoice.opened"), false);
});

test("makeEvent stamps the time and rejects unknown types", () => {
  const e = makeEvent({ orgId: "o", aggregateType: "invoice", aggregateId: "i", type: "invoice.issued", data: { number: "10022" }, actor: { kind: "user", id: "u", name: "Ibrahim" } });
  assert.ok(e.at.endsWith("Z"));
  assert.throws(() => makeEvent({ ...e, type: "invoice.exploded" as never }), RangeError);
});

test("the customer timeline hides internal events and sorts oldest first", () => {
  const base = { orgId: "o", aggregateType: "invoice" as const, aggregateId: "i", data: {}, actor: { kind: "system" as const, name: "cron" } };
  const events = [
    makeEvent({ ...base, type: "invoice.sent", at: "2026-10-10T09:41:00Z" }),
    makeEvent({ ...base, type: "invoice.opened", at: "2026-10-11T18:03:00Z" }),
    makeEvent({ ...base, type: "invoice.issued", at: "2026-10-10T09:40:00Z" }),
    makeEvent({ ...base, type: "invoice.created", at: "2026-10-10T09:12:00Z" }),
  ];
  assert.deepEqual(
    customerTimeline(events).map((e) => e.type),
    ["invoice.issued", "invoice.sent"]
  );
});
