import { lineAmount, percentOf, roundToKronor, splitGross, type Ore } from "../money";
import type { InvoiceLine, LineKind } from "../documents/invoice";
import type { PaymentPlanStep } from "./schema";

/**
 * The pure rules of a payment plan: which step can be invoiced now, what a
 * step invoice contains, and the project's economy figures. The quote is
 * represented by its lines already converted to invoice lines (net öre), so
 * ROT keeps working: labour stays labour on every part invoice.
 */

export type PhaseLike = { id: string; done_at: string | null };
export type ProjectLike = { status: "active" | "done" | "warranty" };

/** Net per kind in the quote (what the steps are shares of). */
export function kindTotals(lines: InvoiceLine[]): Record<LineKind, Ore> {
  const out: Record<LineKind, Ore> = { labor: 0, material: 0, other: 0 };
  for (const l of lines) out[l.kind] += lineAmount(l.unitPriceOre, l.quantity);
  return out;
}

/** The quote's gross total, incl. VAT, from the same lines. */
export function grossTotal(lines: InvoiceLine[]): Ore {
  return lines.reduce((sum, l) => {
    const net = lineAmount(l.unitPriceOre, l.quantity);
    return sum + net + (l.vatCategory === "S" ? percentOf(net, l.vatRate) : 0);
  }, 0);
}

export function stepIsBillable(step: PaymentPlanStep, phases: PhaseLike[], project: ProjectLike, today: string): { ok: boolean; reason: string } {
  if (step.invoiceId) return { ok: false, reason: "Fakturerad" };
  switch (step.dueRule) {
    case "on_start":
      return { ok: true, reason: "Kan faktureras nu" };
    case "on_phase_done": {
      const phase = phases.find((p) => p.id === step.phaseId);
      if (!phase) return { ok: false, reason: "Fasen finns inte längre" };
      return phase.done_at ? { ok: true, reason: "Fasen är klar" } : { ok: false, reason: "Väntar på att fasen bockas klar" };
    }
    case "on_date":
      return step.dueOn && step.dueOn <= today ? { ok: true, reason: "Datumet har passerats" } : { ok: false, reason: `Faktureras ${step.dueOn ?? ""}` };
    case "on_completion":
      return project.status !== "active" ? { ok: true, reason: "Projektet är klart" } : { ok: false, reason: "När projektet markeras klart" };
  }
}

export type StepShare = { kind: LineKind; net: Ore; description: string };

export type ChangeOrderLike = {
  id: string;
  number: number;
  title: string;
  /** Incl. VAT, kronor (as the portal stores it). Negative for deductions. */
  amount: number;
  /** The labour part, kronor incl. VAT. */
  labor_amount: number;
  status: "pending" | "approved" | "declined";
  invoiceId?: string | null;
};

/**
 * The lines of a step invoice. A percent or fixed step takes its share of
 * each kind so ROT stays right. The completion step takes what is left of
 * the quote per kind plus every approved, not yet invoiced ÄTA as its own
 * lines (labour and material separately), tagged with the change order.
 */
export function stepInvoiceLines(input: {
  step: PaymentPlanStep;
  stepIndex: number;
  stepCount: number;
  quoteLines: InvoiceLine[];
  quoteNumber: number | null;
  /** Net already invoiced per kind by earlier steps. */
  invoicedByKind: Record<LineKind, Ore>;
  changeOrders: ChangeOrderLike[];
  vatRate?: number;
}): InvoiceLine[] {
  const { step, quoteLines, changeOrders } = input;
  const vatRate = input.vatRate ?? 25;
  const totals = kindTotals(quoteLines);
  const ref = input.quoteNumber ? `enligt offert ${input.quoteNumber}` : "enligt offert";
  const stepText = `steg ${input.stepIndex + 1} av ${input.stepCount}`;
  const lines: InvoiceLine[] = [];
  const kinds: LineKind[] = ["labor", "material", "other"];
  const label: Record<LineKind, string> = { labor: "Arbete", material: "Material", other: "Övrigt" };

  if (step.dueRule === "on_completion") {
    for (const kind of kinds) {
      const left = totals[kind] - (input.invoicedByKind[kind] ?? 0);
      if (left === 0) continue;
      lines.push(line(`rest-${kind}`, `${label[kind]} ${ref}, slutfaktura (${stepText})`, left, kind, vatRate));
    }
    for (const co of changeOrders) {
      if (co.status !== "approved" || co.invoiceId) continue;
      const grossLabor = Math.trunc(co.labor_amount) * 100;
      const grossRest = Math.trunc(co.amount) * 100 - grossLabor;
      if (grossLabor !== 0) lines.push({ ...line(`ata-${co.number}-a`, `ÄTA ${co.number}: ${co.title}, arbete`, splitGross(grossLabor, vatRate).net, "labor", vatRate), changeOrderId: co.id, section: "ÄTA" });
      if (grossRest !== 0) lines.push({ ...line(`ata-${co.number}-m`, `ÄTA ${co.number}: ${co.title}, material`, splitGross(grossRest, vatRate).net, "material", vatRate), changeOrderId: co.id, section: "ÄTA" });
    }
    return lines;
  }

  const gross = grossTotal(quoteLines);
  const share = step.percent !== null ? step.percent / 100 : gross > 0 ? (step.amountOre ?? 0) / gross : 0;
  for (const kind of kinds) {
    if (totals[kind] === 0) continue;
    let net = Math.round(totals[kind] * share);
    if (step.laborShare !== null && step.percent !== null) {
      // The admin set how much of this step is labour: redistribute between labour and the rest.
      const stepNet = Math.round((totals.labor + totals.material + totals.other) * share);
      const laborNet = Math.round(stepNet * step.laborShare);
      const restTotal = totals.material + totals.other;
      net = kind === "labor" ? laborNet : restTotal > 0 ? Math.round(((stepNet - laborNet) * totals[kind]) / restTotal) : 0;
    }
    const pct = step.percent !== null ? `${step.percent} %` : "delfaktura";
    lines.push(line(`del-${kind}`, `${label[kind]} ${ref}, ${pct} (${stepText})`, net, kind, vatRate));
  }
  return lines;
}

function line(id: string, description: string, net: Ore, kind: LineKind, vatRate: number): InvoiceLine {
  return { id, description, quantity: 1, unit: "st", unitPriceOre: net, vatCategory: "S", vatRate, kind, section: "", changeOrderId: null };
}

/** What the step will amount to incl. VAT, for the plan's list. */
export function stepGross(step: PaymentPlanStep, quoteLines: InvoiceLine[], invoicedGrossSoFar: Ore, approvedChangeOrdersKr: number): Ore {
  const gross = grossTotal(quoteLines);
  if (step.dueRule === "on_completion") return gross - invoicedGrossSoFar + approvedChangeOrdersKr * 100;
  if (step.percent !== null) return roundToKronor(percentOf(gross, step.percent));
  return step.amountOre ?? 0;
}

export type InvoiceLike = { kind: "invoice" | "credit" | "correction";status: string; payableOre: Ore; paidOre: Ore; rotOre: Ore; totalOre: Ore };

export type ProjectEconomy = {
  quoteGross: Ore;
  changeOrdersApproved: Ore;
  changeOrdersPending: Ore;
  total: Ore;
  invoiced: Ore;
  paid: Ore;
  outstanding: Ore;
  leftToInvoice: Ore;
  rotOnInvoices: Ore;
  invoiceCount: number;
};

export function projectEconomy(quoteLines: InvoiceLine[], changeOrders: ChangeOrderLike[], invoices: InvoiceLike[]): ProjectEconomy {
  const quoteGross = grossTotal(quoteLines);
  const approved = changeOrders.filter((c) => c.status === "approved").reduce((s, c) => s + Math.trunc(c.amount) * 100, 0);
  const pending = changeOrders.filter((c) => c.status === "pending").reduce((s, c) => s + Math.trunc(c.amount) * 100, 0);
  // A change invoice repeats its original's amounts; only the original counts.
  const issued = invoices.filter((i) => i.status !== "draft" && i.status !== "void" && i.kind !== "correction");
  const invoiced = issued.reduce((s, i) => s + i.totalOre, 0); // credits are negative
  const paid = issued.filter((i) => i.kind === "invoice").reduce((s, i) => s + i.paidOre, 0);
  const outstanding = issued.filter((i) => i.kind === "invoice" && i.status !== "credited").reduce((s, i) => s + (i.payableOre - i.paidOre), 0);
  const rot = issued.reduce((s, i) => s + i.rotOre, 0);
  const total = quoteGross + approved;
  return {
    quoteGross,
    changeOrdersApproved: approved,
    changeOrdersPending: pending,
    total,
    invoiced,
    paid,
    outstanding,
    leftToInvoice: total - invoiced,
    rotOnInvoices: rot,
    invoiceCount: issued.length,
  };
}
