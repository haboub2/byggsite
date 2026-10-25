import { addDays, daysBetween, lateInterestOre, lateInterestPercentAt, referenceRateAt, rulesAt } from "../rules";
import { workdaysBetween } from "../../workdays";
import { toCsv } from "../../csv";
import type { Ore } from "../money";
import type { CustomerType } from "../documents/invoice";
import { DEFAULT_REMINDER_SETTINGS, LAST_REMINDER_PAY_DAYS, reminderDue, type ReminderSettings } from "../reminders/reminders";

/**
 * Inkasso after the reminder chain (docs/fakturering.md, läge 2026-10-25).
 * Pure: when an invoice may get an inkassokrav or be handed to collection,
 * what the demand adds, the interest up to a date period by period, and the
 * generic CSV row a collection agency can import. The database checks the
 * same limits in 0031 (register_collection_demand, open_collection_case).
 *
 * The law, checked 2026-10-25 (sources in docs/fakturering.md):
 *   - inkassolagen (1974:182) 5 §: written demand with the creditor's name,
 *     what the claim is for, capital, interest (amount, rate, period, the
 *     capital it is computed on) and costs separately, and a reasonable time
 *     to pay or object. 6 §: no legal action before that time has run out.
 *   - lag (1981:739) 3 § 1 and 4 §: the debtor pays at most 180 kr for such
 *     a demand, consumer or business, no prior agreement needed (unlike the
 *     60 kr reminder fee, 2 §). 4 a § and 5 §: 450 kr förseningsersättning
 *     between businesses, which swallows reminder and demand fees up to 450
 *     kr. This product does not charge it.
 *   - FFFS 2025:2 (Finansinspektionen, from 1 July 2025; replaces IMY's
 *     general advice and applies to anyone applying inkassolagen, including
 *     a creditor collecting its own claims): heading "Inkassokrav" only for a
 *     5 § demand, the creditor's contact details, print date, who to pay and
 *     object to, which measures may follow (4 kap. 2 §), how interest is
 *     computed and today's rate (4 kap. 4 §), at least eight days by post
 *     (six digitally) and always four bank days from receipt (4 kap. 7 §),
 *     and no collection step before a reminder's deadline (3 kap. 5 §).
 */

export const COLLECTION_STATUSES = ["prepared", "sent", "paid", "closed"] as const;
export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];
export const COLLECTION_STATUS_LABEL: Record<CollectionStatus, string> = {
  prepared: "Underlag klart",
  sent: "Hos inkassobolaget",
  paid: "Betald",
  closed: "Avslutat",
};
export function isOpenCase(status: string): boolean {
  return status === "prepared" || status === "sent";
}

/** Days to pay suggested for an inkassokrav; never less than minimumPayBy. */
export const DEFAULT_DEMAND_PAY_DAYS = 10;

/** What the collection rules read from an invoice record. */
export type CollectionInput = {
  kind: "invoice" | "credit" | "correction";
  status: string;
  payableOre: Ore;
  paidOre: Ore;
  dueOn: string | null;
  reminders: number;
  remindedAt: string | null;
  collectionCaseId: string | null;
  collectionDemandedOn: string | null;
  collectionDemandPayBy: string | null;
  document: { issueDate: string; buyer: { type: CustomerType } };
};

const OPEN = ["issued", "sent", "partially_paid"];

/** Why the invoice cannot be in collection at all, or null. */
function notCollectable(inv: CollectionInput, today: string): string | null {
  if (inv.kind !== "invoice") return "Bara en vanlig faktura kan gå till inkasso.";
  if (!OPEN.includes(inv.status) || inv.payableOre - inv.paidOre <= 0) return "Fakturan är inte obetald.";
  if (!inv.dueOn || inv.dueOn >= today) return "Fakturan har inte förfallit.";
  if (inv.collectionCaseId) return "Fakturan är redan hos inkasso.";
  return null;
}

/** The last reminder before collection said "inom tio dagar": its last day, if that is still running. */
function lastReminderDeadline(inv: CollectionInput, today: string, settings: ReminderSettings): string | null {
  if (!inv.remindedAt || inv.reminders < settings.maxReminders || inv.collectionDemandedOn) return null;
  const until = addDays(inv.remindedAt.slice(0, 10), LAST_REMINDER_PAY_DAYS);
  return today <= until ? until : null;
}

/** Why an inkassokrav cannot be sent today, or null when it can. */
export function demandBlocker(inv: CollectionInput, today: string, settings: ReminderSettings = DEFAULT_REMINDER_SETTINGS): string | null {
  const no = notCollectable(inv, today);
  if (no) return no;
  if (inv.collectionDemandedOn) return `Inkassokrav skickades ${inv.collectionDemandedOn}.`;
  const until = lastReminderDeadline(inv, today, settings);
  if (until) return `Påminnelse ${inv.reminders} gav kunden tid till och med ${until}. Inkassokravet kan skickas efter det.`;
  return null;
}

/** Why the invoice cannot be handed to collection today, or null when it can. */
export function collectionBlocker(inv: CollectionInput, today: string, settings: ReminderSettings = DEFAULT_REMINDER_SETTINGS): string | null {
  const no = notCollectable(inv, today);
  if (no) return no;
  if (inv.reminders < 1) return "Skicka minst en påminnelse eller ett inkassokrav först.";
  if (inv.collectionDemandPayBy && today <= inv.collectionDemandPayBy) return `Inkassokravet ger kunden tid till och med ${inv.collectionDemandPayBy}.`;
  const until = lastReminderDeadline(inv, today, settings);
  if (until) return `Påminnelse ${inv.reminders} gav kunden tid till och med ${until}.`;
  return null;
}

/**
 * The earliest last day to pay for a demand sent `today`: eight calendar
 * days, and at least four bank days from the day after sending (when a
 * letter can arrive), so a weekend or a holiday pushes it later.
 */
export function minimumPayBy(today: string): string {
  const rules = rulesAt(today).collection;
  const receipt = addDays(today, 1);
  let d = addDays(today, rules.minPayDays);
  while (workdaysBetween(receipt, addDays(d, 1)) < rules.minBankDays) d = addDays(d, 1);
  return d;
}

export function defaultPayBy(today: string): string {
  const suggested = addDays(today, DEFAULT_DEMAND_PAY_DAYS);
  const min = minimumPayBy(today);
  return suggested > min ? suggested : min;
}

/** Why `payBy` is not an acceptable last day to pay, or null. */
export function payByProblem(payBy: string, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payBy)) return "Ange sista betalningsdag som ÅÅÅÅ-MM-DD.";
  const min = minimumPayBy(today);
  if (payBy < min) return `Sista betalningsdag ska vara ${min} eller senare: minst åtta dagar och fyra bankdagar från att kravet kommer fram.`;
  if (payBy > addDays(today, 60)) return "Sista betalningsdag får vara högst 60 dagar fram.";
  return null;
}

export type DemandPlan = {
  /** Unpaid on the invoice. */
  remainingOre: Ore;
  /** The statutory demand fee, 180 kr. */
  feeOre: Ore;
  /** Interest since the due date or the last reminder, booked with the demand like a reminder's. */
  interestOre: Ore;
  interestFrom: string;
  interestPercent: number;
  /** Fees and interest on earlier reminders, still owed. */
  earlierFeesOre: Ore;
  earlierInterestOre: Ore;
  totalOre: Ore;
  payBy: string;
  daysOverdue: number;
};

/** What an inkassokrav sent today asks for. Throws when it cannot be sent. */
export function demandPlan(
  inv: CollectionInput,
  today: string,
  options: { payBy: string; settings?: ReminderSettings; earlier: { feesOre: Ore; interestOre: Ore } }
): DemandPlan {
  const settings = options.settings ?? DEFAULT_REMINDER_SETTINGS;
  const blocked = demandBlocker(inv, today, settings);
  if (blocked) throw new Error(blocked);
  const badDate = payByProblem(options.payBy, today);
  if (badDate) throw new Error(badDate);
  // The interest part is a reminder's: from the due date or the last reminder, today's rate.
  const r = reminderDue(
    { payableOre: inv.payableOre, paidOre: inv.paidOre, dueOn: inv.dueOn, issueDate: inv.document.issueDate, reminders: inv.reminders, remindedAt: inv.remindedAt, customerType: inv.document.buyer.type, status: inv.status, kind: inv.kind },
    today,
    { ...settings, graceDays: 0, daysBetween: 0 }
  )!;
  const feeOre = rulesAt(today).collection.demandFeeOre;
  // As the letter says: each half-year's reference rate (equal to the reminder's within one half-year).
  const interestOre = settings.chargeInterest ? interestToDate({ payableOre: r.remainingOre, dueOn: r.interestFrom, payments: [], to: today }).totalOre : 0;
  const totalOre = r.remainingOre + options.earlier.feesOre + options.earlier.interestOre + feeOre + interestOre;
  return {
    remainingOre: r.remainingOre,
    feeOre,
    interestOre,
    interestFrom: r.interestFrom,
    interestPercent: r.interestPercent,
    earlierFeesOre: options.earlier.feesOre,
    earlierInterestOre: options.earlier.interestOre,
    totalOre,
    payBy: options.payBy,
    daysOverdue: r.daysOverdue,
  };
}

/** The timeline's line for an invoice.collection event (data.action from 0031). */
export function collectionEventText(data: Record<string, unknown>): string {
  const kr = (ore: unknown) => (typeof ore === "number" ? `${Math.round(ore / 100).toLocaleString("sv-SE")} kr` : "");
  const ref = typeof data.reference === "string" && data.reference ? ` ${data.reference}` : "";
  switch (data.action) {
    case "demand":
      return [`Inkassokrav skickat, betala senast ${String(data.payBy ?? "")}`, typeof data.fee === "number" && data.fee > 0 ? `inkassoavgift ${kr(data.fee)}` : "", typeof data.interest === "number" && data.interest > 0 ? `ränta ${kr(data.interest)}` : ""].filter(Boolean).join(" · ");
    case "prepared":
      return `Lämnad till inkasso, ärende${ref}`;
    case "sent":
      return `Ärende${ref} skickat till ${String(data.agency || "inkassobolaget")}${data.externalRef ? ` (deras nr ${String(data.externalRef)})` : ""}`;
    case "paid":
      return `Inkassoärende${ref} stängt: fakturan betald`;
    case "closed":
      return `Inkassoärende${ref} avslutat${data.reason ? `: ${String(data.reason)}` : ""}`;
    default:
      return "Inkasso";
  }
}

/* ---------- interest up to a date ---------- */

export type InterestPeriod = { from: string; to: string; days: number; capitalOre: Ore; percent: number; referencePercent: number; interestOre: Ore };
export type InterestToDate = { totalOre: Ore; periods: InterestPeriod[]; from: string; to: string; percentToday: number };

const halfYearStarts = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++)
    for (const md of ["01-01", "07-01"]) {
      const d = `${y}-${md}`;
      if (d > from && d < to) out.push(d);
    }
  return out;
};

/**
 * Late interest from the due date up to `to` (exclusive end, as the
 * reminders count days), räntelagen 6 §: the reference rate of each
 * calendar half-year plus eight points (9 §), simple interest actual/365 on
 * what was unpaid in each period. A payment reduces the capital from its
 * date. Periods with the same capital and rate are merged.
 */
export function interestToDate(input: { payableOre: Ore; dueOn: string; payments: { paidOn: string; amountOre: Ore }[]; to: string }): InterestToDate {
  const { dueOn, to } = input;
  const percentToday = lateInterestPercentAt(to);
  if (to <= dueOn) return { totalOre: 0, periods: [], from: dueOn, to, percentToday };
  const cuts = [...new Set([dueOn, ...halfYearStarts(dueOn, to), ...input.payments.map((p) => p.paidOn).filter((d) => d > dueOn && d < to), to])].sort();
  const periods: InterestPeriod[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const from = cuts[i];
    const end = cuts[i + 1];
    const paid = input.payments.filter((p) => p.paidOn <= from).reduce((s, p) => s + p.amountOre, 0);
    const capitalOre = Math.max(0, input.payableOre - paid);
    const percent = lateInterestPercentAt(from);
    const last = periods[periods.length - 1];
    if (last && last.to === from && last.capitalOre === capitalOre && last.percent === percent) {
      last.to = end;
      last.days = daysBetween(last.from, end);
    } else {
      periods.push({ from, to: end, days: daysBetween(from, end), capitalOre, percent, referencePercent: referenceRateAt(from).percent, interestOre: 0 });
    }
  }
  const kept = periods.filter((p) => p.capitalOre > 0 && p.days > 0);
  for (const p of kept) p.interestOre = lateInterestOre(p.capitalOre, p.percent, p.days);
  return { totalOre: kept.reduce((s, p) => s + p.interestOre, 0), periods: kept, from: dueOn, to, percentToday };
}

/* ---------- the claim handed to the agency ---------- */

export type ReminderRecord = { kind: "reminder" | "demand"; level: number; feeOre: Ore; interestOre: Ore; sentAt: string; sentTo: string; payBy: string | null };

export type CollectionClaim = {
  asOf: string;
  capitalOre: Ore;
  interest: InterestToDate;
  /** Of the interest, what reminders and the demand already charged (booked on 8313). */
  invoicedInterestOre: Ore;
  reminderFeesOre: Ore;
  demandFeeOre: Ore;
  totalOre: Ore;
};

/** Capital, interest up to `asOf` and the fees, as the summary and the CSV state them. */
export function collectionClaim(input: { payableOre: Ore; paidOre: Ore; dueOn: string; payments: { paidOn: string; amountOre: Ore }[]; reminders: ReminderRecord[]; asOf: string }): CollectionClaim {
  const capitalOre = input.payableOre - input.paidOre;
  const interest = interestToDate({ payableOre: input.payableOre, dueOn: input.dueOn, payments: input.payments, to: input.asOf });
  const reminderFeesOre = input.reminders.filter((r) => r.kind === "reminder").reduce((s, r) => s + r.feeOre, 0);
  const demandFeeOre = input.reminders.filter((r) => r.kind === "demand").reduce((s, r) => s + r.feeOre, 0);
  const invoicedInterestOre = input.reminders.reduce((s, r) => s + r.interestOre, 0);
  return { asOf: input.asOf, capitalOre, interest, invoicedInterestOre, reminderFeesOre, demandFeeOre, totalOre: capitalOre + interest.totalOre + reminderFeesOre + demandFeeOre };
}

/* ---------- the generic CSV ---------- */

/**
 * The first fourteen columns are the generic set most Swedish agencies map
 * on upload (one row per invoice); the rest make the row complete without
 * the PDFs. Amounts in kronor with decimal comma, dates ÅÅÅÅ-MM-DD.
 */
export const COLLECTION_CSV_HEADER = [
  "Ärendenr",
  "Gäldenär",
  "Orgnr/personnr",
  "Adress",
  "E-post",
  "Telefon",
  "Fakturanr",
  "Fakturadatum",
  "Förfallodatum",
  "Kapital",
  "Ränta",
  "Påminnelseavgift",
  "OCR",
  "Bankgiro",
  "Postnummer",
  "Ort",
  "Land",
  "Gäldenärstyp",
  "Inkassoavgift",
  "Ränta från",
  "Ränta till",
  "Räntesats idag",
  "Valuta",
  "Fordran avser",
] as const;

export type CollectionCsvRow = {
  reference: string;
  debtor: { name: string; type: CustomerType; id: string; street: string; postalCode: string; city: string; countryCode: string; email: string; phone: string };
  invoice: { number: string; issueDate: string; dueDate: string; ocr: string; bankgiro: string; currency: string; description: string };
  claim: CollectionClaim;
};

/** "1250,00": kronor with decimal comma, no thousands separator, for import. */
export function csvAmount(ore: Ore): string {
  const sign = ore < 0 ? "-" : "";
  const abs = Math.abs(Math.round(ore));
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

const percentText = (p: number) => String(p).replace(".", ",");

export function collectionCsv(rows: CollectionCsvRow[]): string {
  return toCsv(
    [...COLLECTION_CSV_HEADER],
    rows.map((r) => [
      r.reference,
      r.debtor.name,
      r.debtor.id,
      r.debtor.street,
      r.debtor.email,
      // "+46 70…" would be guarded as a formula ('+46…); 0046 is the same number and imports cleanly.
      r.debtor.phone.replace(/^\s*\+/, "00"),
      r.invoice.number,
      r.invoice.issueDate,
      r.invoice.dueDate,
      csvAmount(r.claim.capitalOre),
      csvAmount(r.claim.interest.totalOre),
      csvAmount(r.claim.reminderFeesOre),
      r.invoice.ocr,
      r.invoice.bankgiro,
      r.debtor.postalCode,
      r.debtor.city,
      r.debtor.countryCode,
      r.debtor.type === "privat" ? "Privatperson" : "Företag",
      csvAmount(r.claim.demandFeeOre),
      r.claim.interest.from,
      r.claim.asOf,
      percentText(r.claim.interest.percentToday),
      r.invoice.currency,
      r.invoice.description,
    ])
  );
}

/** "Inkassounderlag-10001-1-Anna-Andersson": file-safe, for the zip and its files. */
export function collectionFileStem(reference: string, debtor: string): string {
  const safe = (v: string, max: number) =>
    v
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, max);
  return ["Inkassounderlag", safe(reference, 20), safe(debtor, 40)].filter(Boolean).join("-");
}
