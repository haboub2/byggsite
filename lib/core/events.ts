/**
 * The append-only log (docs/fakturering.md, grundkrav 6). Every change to
 * an invoice, payment or claim is an event with who and when. The timeline
 * in admin and the portal, the dashboard's "latest" list and webhooks all
 * read from it. Rows are never updated or deleted (enforced in the
 * database).
 */

export const EVENT_TYPES = [
  "customer.created",
  "customer.updated",
  "invoice.created",
  "invoice.updated",
  "invoice.issued",
  "invoice.sent",
  "invoice.opened",
  "invoice.reminded",
  "invoice.partially_paid",
  "invoice.paid",
  "invoice.credited",
  "invoice.voided",
  "invoice.deleted",
  "payment.received",
  "payment.allocated",
  "payment.removed",
  "rot_claim.created",
  "rot_claim.sent",
  "rot_claim.paid",
  "rot_claim.rejected",
  "export.sie",
  "api_key.created",
  "api_key.revoked",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Events an integrator can subscribe to. Internal ones (opened, updated) stay internal. */
export const WEBHOOK_EVENT_TYPES = [
  "invoice.issued",
  "invoice.sent",
  "invoice.reminded",
  "invoice.partially_paid",
  "invoice.paid",
  "invoice.credited",
  "invoice.voided",
  "payment.received",
  "rot_claim.sent",
  "rot_claim.paid",
  "rot_claim.rejected",
] as const satisfies readonly EventType[];
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export type AggregateType = "customer" | "invoice" | "payment" | "rot_claim" | "export" | "api_key";

export type Actor =
  | { kind: "user"; id: string; name: string }
  | { kind: "api_key"; id: string; name: string }
  | { kind: "system"; name: string }
  | { kind: "customer"; id: string; name: string };

export type CoreEvent = {
  orgId: string;
  aggregateType: AggregateType;
  aggregateId: string;
  type: EventType;
  /** Small, serialisable facts about the change: amounts, recipients, numbers. Never whole documents. */
  data: Record<string, string | number | boolean | null>;
  actor: Actor;
  /** ISO timestamp. */
  at: string;
};

export function makeEvent(input: Omit<CoreEvent, "at"> & { at?: string }): CoreEvent {
  if (!EVENT_TYPES.includes(input.type)) throw new RangeError(`Okänd händelsetyp "${input.type}".`);
  return { ...input, data: input.data ?? {}, at: input.at ?? new Date().toISOString() };
}

export function isWebhookEvent(type: EventType): type is WebhookEventType {
  return (WEBHOOK_EVENT_TYPES as readonly string[]).includes(type);
}

/** Swedish label for the timeline. Events the customer sees in the portal get `customer: true`. */
export const EVENT_LABEL: Record<EventType, { text: string; customer: boolean }> = {
  "customer.created": { text: "Kund skapad", customer: false },
  "customer.updated": { text: "Kund ändrad", customer: false },
  "invoice.created": { text: "Utkast skapat", customer: false },
  "invoice.updated": { text: "Utkast ändrat", customer: false },
  "invoice.issued": { text: "Utfärdad", customer: true },
  "invoice.sent": { text: "Skickad", customer: true },
  "invoice.opened": { text: "Öppnad av kunden", customer: false },
  "invoice.reminded": { text: "Påminnelse skickad", customer: true },
  "invoice.partially_paid": { text: "Delbetald", customer: true },
  "invoice.paid": { text: "Betald", customer: true },
  "invoice.credited": { text: "Krediterad", customer: true },
  "invoice.voided": { text: "Annullerad", customer: true },
  "invoice.deleted": { text: "Utkast borttaget", customer: false },
  "payment.received": { text: "Inbetalning", customer: true },
  "payment.allocated": { text: "Inbetalning kopplad", customer: false },
  "payment.removed": { text: "Inbetalning borttagen", customer: false },
  "rot_claim.created": { text: "ROT-begäran skapad", customer: false },
  "rot_claim.sent": { text: "ROT begärt hos Skatteverket", customer: true },
  "rot_claim.paid": { text: "ROT utbetalt av Skatteverket", customer: true },
  "rot_claim.rejected": { text: "ROT-begäran avvisad", customer: true },
  "export.sie": { text: "SIE-fil exporterad", customer: false },
  "api_key.created": { text: "API-nyckel skapad", customer: false },
  "api_key.revoked": { text: "API-nyckel återkallad", customer: false },
};

/** The events a customer may see in the portal, oldest first. */
export function customerTimeline(events: CoreEvent[]): CoreEvent[] {
  return events.filter((e) => EVENT_LABEL[e.type].customer).sort((a, b) => a.at.localeCompare(b.at));
}
