import type { InvoiceDocument } from "../documents/invoice";
import { byNumber, type ExportData } from "./model";

/**
 * The JSON export: everything one organisation has in the invoicing core,
 * the file a customer takes along when leaving the product. It has to stay
 * readable for years, so every record is mapped field by field here instead
 * of dumping database rows: a migration that renames a column changes the
 * loader, not this file. Fields are only added within a schema version;
 * renaming or removing one means `schemaVersion: 2`.
 *
 * Money is integer öre (1 krona = 100 öre), with `currency` beside it where
 * a record has one. Personal numbers are masked (ÅÅÅÅMMDD-XXXX) unless an
 * owner or admin exported, then twelve digits (`format.personalNumbers`).
 * Dates are ISO 8601: `YYYY-MM-DD` for dates, UTC
 * timestamps for moments. Every list is sorted, so two exports of the same
 * data are identical apart from `exportedAt`.
 */

export const EXPORT_SCHEMA_VERSION = 1;

const byKey =
  <T>(...keys: ((x: T) => string | number | null | undefined)[]) =>
  (a: T, b: T): number => {
    for (const k of keys) {
      const x = k(a) ?? "";
      const y = k(b) ?? "";
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  };

/** The invoice document with the ROT buyers' personal numbers in plain text, when they were opened. The ciphertext goes: it is useless without the key. */
function withPersonalNumbers(doc: InvoiceDocument, opened: (string | null)[] | undefined): InvoiceDocument {
  const rot = doc.se.rot;
  if (!rot || !opened) return doc;
  return {
    ...doc,
    se: {
      ...doc.se,
      rot: {
        ...rot,
        buyers: rot.buyers.map((b, i) => {
          if (!opened[i]) return b;
          const { personalNumberSealed, ...rest } = b;
          void personalNumberSealed;
          return { ...rest, personalNumber: opened[i]! };
        }),
      },
    },
  };
}

export function buildJsonExport(data: ExportData, exportedAt: string = new Date().toISOString()) {
  const invoiceNumber = new Map(data.invoices.map((i) => [i.id, i.number]));
  const opened = data.personalNumbers;
  return {
    exportedAt,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    format: {
      generator: "Binaafy fakturering",
      money: "Heltal i öre (1 kr = 100 öre).",
      dates: "ISO 8601; datum ÅÅÅÅ-MM-DD, tidpunkter i UTC.",
      invoiceDocument: "invoices[].document följer EN 16931 (lib/core/documents/invoice.ts), med svenska tillägg under se.",
      personalNumbers: opened ? "plain" : "masked",
    },
    org: {
      id: data.org.id,
      name: data.org.name,
      orgNr: data.org.orgNr,
      slug: data.org.slug,
      settings: data.settings,
      numberSeries: [...data.numberSeries]
        .sort(byKey((s) => s.series))
        .map((s) => ({ series: s.series, perYear: s.perYear, start: s.start, pad: s.pad, next: s.next })),
      accounts: [...data.accounts].sort(byKey((a) => a.number)).map((a) => ({ number: a.number, name: a.name, active: a.active })),
      periodLocks: [...data.periodLocks]
        .sort(byKey((l) => l.periodStart))
        .map((l) => ({ periodStart: l.periodStart, periodEnd: l.periodEnd, lockedBy: l.lockedBy, lockedAt: l.lockedAt })),
    },
    customers: [...data.customers]
      .sort(byKey((c) => c.createdAt, (c) => c.id))
      .map((c) => ({
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
        peppolId: c.peppolId,
        defaultTermsDays: c.defaultTermsDays,
        notes: c.notes,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        deletedAt: c.deletedAt,
      })),
    // Numbered invoices by number, then drafts by when they were started.
    invoices: [...data.invoices.filter((i) => i.number).sort(byNumber), ...data.invoices.filter((i) => !i.number).sort(byKey((i) => i.createdAt, (i) => i.id))]
      .map((i) => ({
        id: i.id,
        series: i.series,
        number: i.number,
        kind: i.kind,
        status: i.status,
        customerId: i.customerId,
        quoteId: i.quoteId,
        projectId: i.projectId,
        creditsInvoiceId: i.creditsInvoiceId,
        correctsInvoiceId: i.correctsInvoiceId,
        correctedBy: i.correctedBy,
        replacesInvoiceId: i.replacesInvoiceId,
        offsetFromCreditId: i.offsetFromCreditId,
        voidedAt: i.voidedAt,
        voidedBy: i.voidedBy,
        voidReason: i.voidReason,
        currency: i.document.currency,
        totalOre: i.totalOre,
        vatOre: i.vatOre,
        rotOre: i.rotOre,
        payableOre: i.payableOre,
        paidOre: i.paidOre,
        issuedOn: i.issuedOn,
        dueOn: i.dueOn,
        ocr: i.ocr,
        sha256: i.sha256,
        sentAt: i.sentAt,
        paidAt: i.paidAt,
        remindedAt: i.remindedAt,
        reminders: i.reminders,
        createdBy: i.createdBy,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
        document: withPersonalNumbers(i.document, opened?.invoiceBuyers[i.id]),
      })),
    payments: [...data.payments]
      .sort(byKey((p) => p.paidOn, (p) => p.createdAt, (p) => p.id))
      .map((p) => ({
        id: p.id,
        amountOre: p.amountOre,
        currency: p.currency,
        method: p.method,
        paidOn: p.paidOn,
        reference: p.reference,
        note: p.note,
        bankTransactionId: p.bankTransactionId,
        createdBy: p.createdBy,
        createdAt: p.createdAt,
        allocations: [...p.allocations]
          .sort(byKey((a) => a.invoiceId))
          .map((a) => ({ invoiceId: a.invoiceId, invoiceNumber: invoiceNumber.get(a.invoiceId) ?? null, amountOre: a.amountOre })),
      })),
    journal: [...data.journal]
      .sort(byKey((e) => e.series, (e) => e.fiscalYear, (e) => e.number, (e) => e.id))
      .map((e) => ({
        id: e.id,
        series: e.series,
        fiscalYear: e.fiscalYear,
        number: e.number,
        date: e.date,
        text: e.text,
        sourceType: e.sourceType,
        sourceId: e.sourceId,
        reversedBy: e.reversedBy,
        createdAt: e.createdAt,
        lines: e.lines.map((l) => ({ account: l.account, debitOre: l.debit, creditOre: l.credit, text: l.text })),
      })),
    reminders: [...data.reminders]
      .sort(byKey((r) => r.sentAt, (r) => r.id))
      .map((r) => ({ id: r.id, invoiceId: r.invoiceId, level: r.level, feeOre: r.feeOre, interestOre: r.interestOre, sentTo: r.sentTo, sentAt: r.sentAt, createdBy: r.createdBy })),
    recurringInvoices: [...data.recurring]
      .sort(byKey((r) => r.createdAt, (r) => r.id))
      .map((r) => ({ id: r.id, customerId: r.customerId, name: r.name, interval: r.interval, nextOn: r.nextOn, autoIssue: r.autoIssue, active: r.active, createdAt: r.createdAt, template: r.template })),
    paymentPlans: [...data.paymentPlans]
      .sort(byKey((p) => p.createdAt, (p) => p.id))
      .map((p) => ({
        id: p.id,
        projectId: p.projectId,
        quoteId: p.quoteId,
        kind: p.kind,
        createdAt: p.createdAt,
        steps: [...p.steps]
          .sort(byKey((s) => s.sort, (s) => s.id))
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
      })),
    rotClaims: [...data.rotClaims]
      .sort(byKey((c) => c.createdAt, (c) => c.id))
      .map((c) => ({
        id: c.id,
        status: c.status,
        sentOn: c.sentOn,
        decidedOn: c.decidedOn,
        paidOre: c.paidOre,
        note: c.note,
        createdAt: c.createdAt,
        items: [...c.items]
          .sort(byKey((i) => i.invoiceNumber, (i) => i.id))
          .map((i) => ({
            id: i.id,
            invoiceId: i.invoiceId,
            invoiceNumber: i.invoiceNumber,
            buyerName: i.buyerName,
            personalNumber: opened?.claimItems[i.id] ?? i.personalNumber,
            amountOre: i.amountOre,
            workOre: i.workOre,
            paidOn: i.paidOn,
            status: i.status,
            category: i.category,
            property: i.property,
          })),
      })),
    bankTransactions: [...data.bankTransactions]
      .sort(byKey((t) => t.bookedOn, (t) => t.importedAt, (t) => t.id))
      .map((t) => ({
        id: t.id,
        source: t.source,
        externalId: t.externalId,
        bookedOn: t.bookedOn,
        amountOre: t.amountOre,
        currency: t.currency,
        reference: t.reference,
        counterpart: t.counterpart,
        status: t.status,
        importedAt: t.importedAt,
      })),
    events: [...data.events]
      .sort(byKey((e) => e.at, (e) => e.id))
      .map((e) => ({ id: e.id, at: e.at, aggregateType: e.aggregateType, aggregateId: e.aggregateId, type: e.type, actor: e.actor, data: e.data })),
  };
}

export type JsonExport = ReturnType<typeof buildJsonExport>;

/** Indented, one trailing newline. Integers stay integers: öre never pass through floats. */
export function serializeJsonExport(x: JsonExport): string {
  return `${JSON.stringify(x, null, 2)}\n`;
}
