import { addDays, daysBetween, lateInterestOre, lateInterestPercentAt, referenceRateAt, rulesAt } from "../rules";
import type { Ore } from "../money";
import type { CustomerType } from "../documents/invoice";

/**
 * Påminnelser (docs/fakturering.md, fas 3). Pure: given an invoice and the
 * date, say whether a reminder is due and what it may add. The fee (at most
 * 60 kr) is charged only when the invoice itself carried the clause, to
 * businesses and consumers alike: lag (1981:739) 2 § requires the agreement
 * to exist when the claim arose. Interest is reference rate + 8 points,
 * actual/365, on what is still unpaid, from the due date (or the last
 * reminder); against a consumer not before 30 days after the invoice
 * (räntelagen 4 § 3 st: the invoice is the demand that states interest).
 */

export type ReminderSettings = {
  /** Days after the due date before the first reminder. */
  graceDays: number;
  /** Days between reminders. */
  daysBetween: number;
  /** Add late interest on reminders. */
  chargeInterest: boolean;
  /** Reminders before the invoice is handed to collection (shown as a hint only). */
  maxReminders: number;
};

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  graceDays: 3,
  daysBetween: 10,
  chargeInterest: true,
  maxReminders: 2,
};

/** Days after the invoice date before interest may run against a consumer (räntelagen 4 § 3 st). */
export const CONSUMER_INTEREST_DAYS = 30;

export type ReminderInput = {
  payableOre: Ore;
  paidOre: Ore;
  dueOn: string | null;
  issueDate: string;
  reminders: number;
  remindedAt: string | null;
  customerType: CustomerType;
  status: string;
  kind: "invoice" | "credit" | "correction";
  /** The påminnelseavgift the invoice carried as a clause (document.se.reminderFeeOre); absent or 0 = none may be charged. */
  reminderFeeOre?: Ore;
  /** Handed to a collection agency (invoices.collection_case_id, 0031): no more reminders. */
  atCollection?: boolean;
  /** An inkassokrav has been sent (0031): the next step is collection, not another reminder. */
  demanded?: boolean;
};

/** The reminder input from an invoice record (lib/core/invoices/store.ts). */
export function reminderInput(inv: {
  payableOre: Ore;
  paidOre: Ore;
  dueOn: string | null;
  reminders: number;
  remindedAt: string | null;
  status: string;
  kind: ReminderInput["kind"];
  document: { issueDate: string; buyer: { type: CustomerType }; se?: { reminderFeeOre?: number } };
  collectionCaseId?: string | null;
  collectionDemandedOn?: string | null;
}): ReminderInput {
  return {
    payableOre: inv.payableOre,
    paidOre: inv.paidOre,
    dueOn: inv.dueOn,
    issueDate: inv.document.issueDate,
    reminders: inv.reminders,
    remindedAt: inv.remindedAt,
    customerType: inv.document.buyer.type,
    reminderFeeOre: inv.document.se?.reminderFeeOre ?? 0,
    status: inv.status,
    kind: inv.kind,
    atCollection: Boolean(inv.collectionCaseId),
    demanded: Boolean(inv.collectionDemandedOn),
  };
}

/** The time the last reminder before collection gives the customer (reminderText says "inom tio dagar"). */
export const LAST_REMINDER_PAY_DAYS = 10;

export type ReminderPlan = {
  level: number;
  daysOverdue: number;
  remainingOre: Ore;
  feeOre: Ore;
  interestOre: Ore;
  interestPercent: number;
  /** Interest counted from this date to `today`. */
  interestFrom: string;
  /** True when this reminder is the last before collection. */
  lastBeforeCollection: boolean;
  /** The reference rate for `today` is not in the rule book: the reminder must not be sent (assertReferenceRateKnown). */
  rateAssumed: boolean;
};

/** Days overdue, or 0. */
export function daysOverdue(inv: Pick<ReminderInput, "dueOn">, today: string): number {
  if (!inv.dueOn || inv.dueOn >= today) return 0;
  return daysBetween(inv.dueOn, today);
}

/**
 * What a reminder sent today would contain, or null when none is due:
 * not overdue, nothing unpaid, a credit note, too soon after the last one.
 */
export function reminderDue(inv: ReminderInput, today: string, settings: ReminderSettings = DEFAULT_REMINDER_SETTINGS): ReminderPlan | null {
  if (inv.kind !== "invoice") return null;
  if (inv.atCollection || inv.demanded) return null;
  if (!["issued", "sent", "partially_paid"].includes(inv.status)) return null;
  const remaining = inv.payableOre - inv.paidOre;
  if (remaining <= 0) return null;
  const overdue = daysOverdue(inv, today);
  if (overdue === 0) return null;
  const sinceLast = inv.remindedAt ? daysBetween(inv.remindedAt.slice(0, 10), today) : null;
  if (sinceLast === null ? overdue < settings.graceDays : sinceLast < settings.daysBetween) return null;

  const rules = rulesAt(today);
  // Only what the invoice agreed, never above the statutory ceiling.
  const feeOre = Math.min(inv.reminderFeeOre ?? 0, rules.reminderFee.maxOre);
  const interestFrom = inv.remindedAt ? inv.remindedAt.slice(0, 10) : interestStart(inv);
  const interestPercent = lateInterestPercentAt(today);
  const interestDays = Math.max(0, daysBetween(interestFrom, today));
  const interestOre = settings.chargeInterest ? lateInterestOre(remaining, interestPercent, interestDays) : 0;
  const level = inv.reminders + 1;
  return { level, daysOverdue: overdue, remainingOre: remaining, feeOre, interestOre, interestPercent, interestFrom, lastBeforeCollection: level >= settings.maxReminders, rateAssumed: referenceRateAt(today).assumed };
}

/**
 * The day interest starts on an invoice nobody has reminded about yet: the
 * due date, but against a consumer never earlier than 30 days after the
 * invoice date (räntelagen 4 § 3 st), whatever the payment terms were.
 */
export function interestStart(inv: Pick<ReminderInput, "dueOn" | "issueDate" | "customerType">): string {
  const due = inv.dueOn!;
  if (inv.customerType !== "privat") return due;
  const earliest = addDays(inv.issueDate, CONSUMER_INTEREST_DAYS);
  return earliest > due ? earliest : due;
}

/** The text on the reminder mail and PDF. */
export function reminderText(plan: ReminderPlan, invoiceNumber: string, dueOn: string): string {
  const parts = [`Påminnelse ${plan.level}: faktura ${invoiceNumber} förföll ${dueOn} och är ${plan.daysOverdue} dagar försenad.`];
  if (plan.feeOre > 0) parts.push(`Påminnelseavgift ${plan.feeOre / 100} kr enligt fakturans villkor.`);
  if (plan.interestOre > 0) parts.push(`Dröjsmålsränta ${plan.interestPercent} % från ${plan.interestFrom}.`);
  if (plan.lastBeforeCollection) parts.push("Betalas inte fakturan inom tio dagar lämnas den till inkasso.");
  return parts.join(" ");
}
