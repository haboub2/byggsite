import { daysBetween, lateInterestOre, lateInterestPercentAt, rulesAt } from "../rules";
import type { Ore } from "../money";
import type { CustomerType } from "../documents/invoice";

/**
 * Påminnelser (docs/fakturering.md, fas 3). Pure: given an invoice and the
 * date, say whether a reminder is due and what it may add. The statutory
 * fee (60 kr) applies to businesses; against a consumer only when the
 * contract says so, so it is off by default for private customers.
 * Interest is reference rate + 8 points, actual/365, from the due date (or
 * the last reminder) on what is still unpaid.
 */

export type ReminderSettings = {
  /** Days after the due date before the first reminder. */
  graceDays: number;
  /** Days between reminders. */
  daysBetween: number;
  /** Charge the statutory fee to private customers too (requires it in the terms). */
  feeToConsumers: boolean;
  /** Add late interest on reminders. */
  chargeInterest: boolean;
  /** Reminders before the invoice is handed to collection (shown as a hint only). */
  maxReminders: number;
};

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  graceDays: 3,
  daysBetween: 10,
  feeToConsumers: false,
  chargeInterest: true,
  maxReminders: 2,
};

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
};

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
  if (!["issued", "sent", "partially_paid"].includes(inv.status)) return null;
  const remaining = inv.payableOre - inv.paidOre;
  if (remaining <= 0) return null;
  const overdue = daysOverdue(inv, today);
  if (overdue === 0) return null;
  const sinceLast = inv.remindedAt ? daysBetween(inv.remindedAt.slice(0, 10), today) : null;
  if (sinceLast === null ? overdue < settings.graceDays : sinceLast < settings.daysBetween) return null;

  const rules = rulesAt(today);
  const business = inv.customerType !== "privat";
  const feeOre = business ? rules.reminderFee.businessOre : settings.feeToConsumers ? rules.reminderFee.businessOre : rules.reminderFee.consumerOre;
  const interestFrom = inv.remindedAt ? inv.remindedAt.slice(0, 10) : inv.dueOn!;
  const interestPercent = lateInterestPercentAt(today);
  const interestOre = settings.chargeInterest ? lateInterestOre(remaining, interestPercent, daysBetween(interestFrom, today)) : 0;
  const level = inv.reminders + 1;
  return { level, daysOverdue: overdue, remainingOre: remaining, feeOre, interestOre, interestPercent, interestFrom, lastBeforeCollection: level >= settings.maxReminders };
}

/** The text on the reminder mail and PDF. */
export function reminderText(plan: ReminderPlan, invoiceNumber: string, dueOn: string): string {
  const parts = [`Påminnelse ${plan.level}: faktura ${invoiceNumber} förföll ${dueOn} och är ${plan.daysOverdue} dagar försenad.`];
  if (plan.feeOre > 0) parts.push(`Påminnelseavgift ${plan.feeOre / 100} kr enligt lag.`);
  if (plan.interestOre > 0) parts.push(`Dröjsmålsränta ${plan.interestPercent} % från ${plan.interestFrom}.`);
  if (plan.lastBeforeCollection) parts.push("Betalas inte fakturan inom tio dagar lämnas den till inkasso.");
  return parts.join(" ");
}
