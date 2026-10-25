import type { z } from "zod";
import type { Customer } from "../core/customers/schema";
import type { InvoiceDocument } from "../core/documents/invoice";
import type { CoreEvent } from "../core/events";
import type { InvoiceRecord } from "../core/invoices/store";
import type { PaymentMethod } from "../core/ledger/posting";
import type { PaymentPlan } from "../core/plans/schema";
import type { RotClaim } from "../core/rot/store";
import { maskPersonalNumber } from "../core/rot/pnr";
import { todayIso } from "../quotes/schema";
import type {
  customerResourceSchema,
  eventResourceSchema,
  invoiceResourceSchema,
  paymentPlanResourceSchema,
  paymentResourceSchema,
  rotClaimResourceSchema,
} from "./schemas";

/**
 * Rows as the API returns them: the resource schemas in lib/api/schemas.ts,
 * camelCase, money in öre. Pure functions, so the tests can check them
 * without a database.
 *
 * Personal numbers are always masked in the API (ÅÅÅÅMMDD-XXXX): the stored
 * ones already are (0023), demo mode's are not, and the sealed ciphertext
 * never leaves.
 */

export function customerResource(c: Customer): z.infer<typeof customerResourceSchema> {
  return {
    id: c.id,
    type: c.type,
    name: c.name,
    company: c.company,
    orgNr: c.orgNr,
    vatNr: c.vatNr,
    email: c.email,
    invoiceEmails: c.invoiceEmails,
    ccEmails: c.ccEmails,
    phone: c.phone,
    street: c.street,
    postalCode: c.postalCode,
    city: c.city,
    reference: c.reference,
    peppolId: c.peppolId ?? "",
    defaultTermsDays: c.defaultTermsDays,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/** The document with the ROT buyers' personal numbers masked and without the ciphertext. */
export function apiDocument(doc: InvoiceDocument, today = todayIso()): InvoiceDocument {
  const rot = doc.se.rot;
  if (!rot) return doc;
  return {
    ...doc,
    se: {
      ...doc.se,
      rot: {
        ...rot,
        buyers: rot.buyers.map((b) => {
          const out = { ...b, personalNumber: maskPersonalNumber(b.personalNumber, today) };
          delete out.personalNumberSealed;
          return out;
        }),
      },
    },
  };
}

export function invoiceResource(inv: InvoiceRecord): z.infer<typeof invoiceResourceSchema> {
  return {
    id: inv.id,
    series: inv.series,
    number: inv.number,
    kind: inv.kind,
    status: inv.status,
    customerId: inv.customerId,
    projectId: inv.projectId,
    currency: "SEK",
    totalOre: inv.totalOre,
    vatOre: inv.vatOre,
    rotOre: inv.rotOre,
    payableOre: inv.payableOre,
    paidOre: inv.paidOre,
    issuedOn: inv.issuedOn,
    dueOn: inv.dueOn,
    ocr: inv.ocr,
    sha256: inv.sha256,
    sentAt: inv.sentAt,
    paidAt: inv.paidAt,
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
    document: apiDocument(inv.document),
  };
}

export function paymentPlanResource(p: PaymentPlan): z.infer<typeof paymentPlanResourceSchema> {
  return {
    id: p.id,
    projectId: p.projectId,
    quoteId: p.quoteId,
    kind: p.kind,
    createdAt: p.createdAt,
    steps: [...p.steps]
      .sort((a, b) => a.sort - b.sort)
      .map((s) => ({
        id: s.id,
        sort: s.sort,
        label: s.label,
        phaseId: s.phaseId,
        percent: s.percent,
        amountOre: s.amountOre,
        laborShare: s.laborShare,
        dueRule: s.dueRule,
        dueOn: s.dueOn,
        invoiceId: s.invoiceId,
        createdAt: s.createdAt,
      })),
  };
}

export function rotClaimResource(c: RotClaim, today = todayIso()): z.infer<typeof rotClaimResourceSchema> {
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    sentOn: c.sentOn,
    decidedOn: c.decidedOn,
    requestedOre: c.items.reduce((sum, i) => sum + i.amountOre, 0),
    paidOre: c.paidOre,
    createdAt: c.createdAt,
    items: c.items.map((i) => ({
      id: i.id,
      invoiceId: i.invoiceId,
      invoiceNumber: i.invoiceNumber,
      buyerName: i.buyerName,
      personalNumber: maskPersonalNumber(i.personalNumber, today),
      amountOre: i.amountOre,
      workOre: i.workOre,
      paidOn: i.paidOn,
      status: i.status,
      property: i.property,
      category: i.category,
    })),
  };
}

export function eventResource(e: CoreEvent & { id: string }): z.infer<typeof eventResourceSchema> {
  return {
    id: e.id,
    type: e.type,
    aggregateType: e.aggregateType,
    aggregateId: e.aggregateId,
    data: e.data,
    actor: { kind: e.actor.kind, name: e.actor.name },
    createdAt: e.at,
  };
}

export type ApiPayment = {
  id: string;
  amountOre: number;
  method: PaymentMethod;
  paidOn: string;
  reference: string;
  note: string;
  createdAt: string;
  allocations: { invoiceId: string; amountOre: number }[];
};

export function paymentResource(p: ApiPayment): z.infer<typeof paymentResourceSchema> {
  return { id: p.id, amountOre: p.amountOre, currency: "SEK", method: p.method, paidOn: p.paidOn, reference: p.reference, note: p.note, createdAt: p.createdAt, allocations: p.allocations };
}

/* ---------- cursors ---------- */

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:\d{2})?)$/;

/** An opaque cursor for keyset pagination on (created_at, id). */
export function encodeCursor(at: string, id: string): string {
  return Buffer.from(JSON.stringify([at, id]), "utf8").toString("base64url");
}

/** The position in a cursor, or null when it is not one of ours. */
export function decodeCursor(cursor: string): { at: string; id: string } | null {
  try {
    const v = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(v) || v.length !== 2) return null;
    const [at, id] = v;
    // Strict: the value goes into a PostgREST filter.
    if (typeof at !== "string" || !TIMESTAMP.test(at) || Number.isNaN(Date.parse(at))) return null;
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
    return { at, id };
  } catch {
    return null;
  }
}

/** Compare two (at, id) positions as instants, then by id. */
function comparePosition(a: { at: string; id: string }, b: { at: string; id: string }): number {
  const t = Date.parse(a.at) - Date.parse(b.at);
  return t !== 0 ? t : a.id.localeCompare(b.id);
}

/**
 * One page of rows already in memory (demo mode), in the given order, after
 * the cursor. The database does the same with a keyset query.
 */
export function pageInMemory<T extends { at: string; id: string }>(rows: readonly T[], order: "asc" | "desc", limit: number, cursor: { at: string; id: string } | null): { page: T[]; next: string | null } {
  const sign = order === "asc" ? 1 : -1;
  const sorted = [...rows].sort((a, b) => sign * comparePosition(a, b));
  const after = cursor ? sorted.filter((r) => sign * comparePosition(r, cursor) > 0) : sorted;
  const page = after.slice(0, limit);
  const last = page[page.length - 1];
  return { page, next: after.length > limit && last ? encodeCursor(last.at, last.id) : null };
}
