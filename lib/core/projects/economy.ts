import { lineAmount, type Ore } from "../money";
import type { InvoiceLine } from "../documents/invoice";

/**
 * A project's costs against what it has invoiced, and what is earned but
 * not yet invoiced. Pure, so the box Ekonomi on the project page and any
 * later report agree. All figures are excl. VAT: VAT is not the company's
 * money, and costs are booked without it.
 */

export const COST_KINDS = ["supplier", "hours", "material", "other"] as const;
export type CostKind = (typeof COST_KINDS)[number];
export const COST_KIND_LABEL: Record<CostKind, string> = { supplier: "Leverantörsfaktura", hours: "Timmar", material: "Material", other: "Övrigt" };

export type CostLike = { kind: CostKind; amountOre: Ore };
export type PhaseShareLike = { duration_days: number; done_at: string | null; change_order_id: string | null };
export type InvoicedLike = { kind: "invoice" | "credit" | "correction";status: string; totalOre: Ore; vatOre: Ore; lines: Pick<InvoiceLine, "unitPriceOre" | "quantity" | "changeOrderId">[] };

/** Amount of an hours row: hours × internal rate, rounded to whole öre. */
export function hoursAmount(hours: number, hourlyRateOre: Ore): Ore {
  if (!Number.isFinite(hours) || hours < 0) throw new RangeError("Timmar kan inte vara negativa.");
  return Math.round(hours * hourlyRateOre);
}

/** Issued invoices and credit notes excl. VAT (credits are negative). ROT is still revenue: Skatteverket pays it. */
export function invoicedNet(invoices: InvoicedLike[]): Ore {
  return invoices.filter((i) => i.status !== "draft" && i.status !== "void" && i.kind !== "correction").reduce((s, i) => s + i.totalOre - i.vatOre, 0);
}

/** The part of the invoiced net that is ÄTA lines, which the quote's phases do not cover. */
function changeOrderNet(invoices: InvoicedLike[]): Ore {
  return invoices
    .filter((i) => i.status !== "draft" && i.status !== "void" && i.kind !== "correction")
    .reduce((s, i) => s + (i.kind === "credit" ? -1 : 1) * i.lines.filter((l) => l.changeOrderId).reduce((t, l) => t + Math.abs(lineAmount(l.unitPriceOre, l.quantity)), 0), 0);
}

/**
 * Share of the quote's work that is done: finished phases weighted by their
 * days in the timeline. Phases an ÄTA added are left out (they are not in
 * the quote). With no days at all, each phase counts the same.
 */
export function doneShare(phases: PhaseShareLike[]): number {
  const quoted = phases.filter((p) => !p.change_order_id);
  if (!quoted.length) return 0;
  const days = quoted.reduce((s, p) => s + Math.max(0, p.duration_days), 0);
  if (days === 0) return quoted.filter((p) => p.done_at).length / quoted.length;
  return quoted.filter((p) => p.done_at).reduce((s, p) => s + Math.max(0, p.duration_days), 0) / days;
}

export type ProjectMargin = {
  costs: Ore;
  costsByKind: Record<CostKind, Ore>;
  invoicedNet: Ore;
  /** Täckningsbidrag: invoiced excl. VAT minus costs. */
  contribution: Ore;
  /** Contribution as a percentage of invoiced, one decimal; null until something is invoiced. */
  marginPercent: number | null;
  /** The quote excl. VAT, null without a quote. */
  quoteNet: Ore | null;
  /** 0–1 */
  doneShare: number;
  /** Done share of the quote excl. VAT. */
  earned: Ore;
  /**
   * Earned minus what is invoiced of the quote (ÄTA lines excluded).
   * Positive: work done that is not invoiced yet. Negative: invoiced ahead
   * of the work (an advance, as a payment plan usually does).
   */
  earnedNotInvoiced: Ore;
};

export function projectMargin(input: { quoteNetOre: Ore | null; phases: PhaseShareLike[]; invoices: InvoicedLike[]; costs: CostLike[] }): ProjectMargin {
  const costsByKind: Record<CostKind, Ore> = { supplier: 0, hours: 0, material: 0, other: 0 };
  for (const c of input.costs) costsByKind[c.kind] += c.amountOre;
  const costs = costsByKind.supplier + costsByKind.hours + costsByKind.material + costsByKind.other;
  const net = invoicedNet(input.invoices);
  const contribution = net - costs;
  const share = doneShare(input.phases);
  const earned = input.quoteNetOre === null ? 0 : Math.round(input.quoteNetOre * share);
  return {
    costs,
    costsByKind,
    invoicedNet: net,
    contribution,
    marginPercent: net > 0 ? Math.round((1000 * contribution) / net) / 10 : null,
    quoteNet: input.quoteNetOre,
    doneShare: share,
    earned,
    earnedNotInvoiced: input.quoteNetOre === null ? 0 : earned - (net - changeOrderNet(input.invoices)),
  };
}
