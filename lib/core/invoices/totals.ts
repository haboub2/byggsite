import { lineAmount, ore, percentOf, roundToKronor, sumOre, type Ore } from "../money";
import { rulesAt } from "../rules";
import type { InvoiceDocument, InvoiceLine, LineKind } from "../documents/invoice";

/**
 * Totals for an invoice document. Pure: the editor shows them live, the
 * issue step freezes them, the PDF prints them, the ledger posts them.
 * Everything in öre; the only rounding to whole kronor is the final
 * öresavrundning on the amount to pay, and it is shown as its own row
 * (EN 16931 BT-114).
 */

export type LineTotals = {
  id: string;
  kind: LineKind;
  vatCategory: InvoiceLine["vatCategory"];
  vatRate: number;
  net: Ore;
  vat: Ore;
  gross: Ore;
};

export type VatBreakdown = {
  /** BG-23: one row per VAT category and rate that occurs. */
  category: InvoiceLine["vatCategory"];
  rate: number;
  /** BT-116 taxable amount. */
  taxable: Ore;
  /** BT-117 VAT amount. */
  vat: Ore;
};

export type RotTotals = {
  /** 0–1 */
  rate: number;
  /** Labour incl. VAT the deduction is computed on. */
  laborGross: Ore;
  /** rate × laborGross before any cap. */
  uncapped: Ore;
  /** The deduction applied, positive öre (negative on a credit note). */
  deduction: Ore;
  /** Split per buyer, sums to `deduction`. */
  perBuyer: Ore[];
  /** True when caps or an override, not the rate, decided the amount. */
  capped: boolean;
};

export type InvoiceTotals = {
  lines: Record<string, LineTotals>;
  /** BT-109 sum of line net amounts. */
  net: Ore;
  /** BT-110 total VAT. */
  vat: Ore;
  /** BT-112 total incl. VAT. */
  gross: Ore;
  vatBreakdown: VatBreakdown[];
  byKind: { kind: LineKind; net: Ore; gross: Ore }[];
  laborGross: Ore;
  rot: RotTotals | null;
  /** BT-114 rounding so the payable is whole kronor. */
  rounding: Ore;
  /** BT-115 amount due for payment: gross + rounding − ROT. */
  payable: Ore;
  reverseCharge: boolean;
};

export function lineTotals(line: InvoiceLine, sign: 1 | -1 = 1): LineTotals {
  const net = sign * lineAmount(line.unitPriceOre, line.quantity);
  const vat = line.vatCategory === "S" ? percentOf(net, line.vatRate) : 0;
  return { id: line.id, kind: line.kind, vatCategory: line.vatCategory, vatRate: line.vatRate, net, vat, gross: net + vat };
}

/**
 * ROT per the rules at the invoice date: rate × labour incl. VAT, never more
 * than the buyers' combined room, never more than an explicit override.
 * The split fills the buyers with the least room first, so nobody is given
 * more than they can take.
 */
export function rotTotals(doc: InvoiceDocument, laborGross: Ore, sign: 1 | -1): RotTotals | null {
  const rot = doc.se.rot;
  if (!rot || doc.buyer.type !== "privat") return null;
  const rules = rulesAt(doc.issueDate).rot;
  const labor = Math.abs(laborGross);
  const uncapped = percentOf(labor, rules.rate * 100);
  const room = rot.buyers.map((b) => (b.roomOre === null ? rules.capPerPerson : Math.min(b.roomOre, rules.capPerPerson)));
  const roomTotal = sumOre(room);
  const candidates = [uncapped, roomTotal, rot.deductionOre ?? Number.POSITIVE_INFINITY];
  const deduction = Math.min(...candidates);

  const perBuyer = new Array<number>(room.length).fill(0);
  let left = deduction;
  const order = room.map((r, i) => ({ r, i })).sort((a, b) => a.r - b.r);
  order.forEach(({ r, i }, k) => {
    const fair = Math.trunc(left / (order.length - k));
    const take = Math.min(r, fair);
    perBuyer[i] = take;
    left -= take;
  });
  for (const { r, i } of order) {
    if (left <= 0) break;
    const extra = Math.min(r - perBuyer[i], left);
    perBuyer[i] += extra;
    left -= extra;
  }

  return {
    rate: rules.rate,
    laborGross: sign * labor,
    uncapped: sign * uncapped,
    deduction: sign * deduction,
    perBuyer: perBuyer.map((p) => sign * p),
    capped: deduction < uncapped,
  };
}

export function invoiceTotals(doc: InvoiceDocument): InvoiceTotals {
  const sign: 1 | -1 = doc.kind === "credit" ? -1 : 1;
  const lines: Record<string, LineTotals> = {};
  const breakdown = new Map<string, VatBreakdown>();
  const kinds = new Map<LineKind, { net: Ore; gross: Ore }>();
  let net = 0;
  let vat = 0;
  let laborGross = 0;

  for (const line of doc.lines) {
    const t = lineTotals(line, sign);
    lines[line.id] = t;
    net += t.net;
    vat += t.vat;
    if (line.kind === "labor") laborGross += t.gross;
    const key = `${t.vatCategory}:${t.vatRate}`;
    const row = breakdown.get(key) ?? { category: t.vatCategory, rate: t.vatRate, taxable: 0, vat: 0 };
    row.taxable += t.net;
    row.vat += t.vat;
    breakdown.set(key, row);
    const k = kinds.get(line.kind) ?? { net: 0, gross: 0 };
    k.net += t.net;
    k.gross += t.gross;
    kinds.set(line.kind, k);
  }

  const gross = net + vat;
  const rot = rotTotals(doc, laborGross, sign);
  const beforeRounding = gross - (rot?.deduction ?? 0);
  const payable = roundToKronor(beforeRounding);

  return {
    lines,
    net: ore(net),
    vat: ore(vat),
    gross: ore(gross),
    vatBreakdown: [...breakdown.values()].sort((a, b) => b.rate - a.rate || a.category.localeCompare(b.category)),
    byKind: (["labor", "material", "other"] as LineKind[]).filter((k) => kinds.has(k)).map((kind) => ({ kind, ...kinds.get(kind)! })),
    laborGross: ore(laborGross),
    rot,
    rounding: payable - beforeRounding,
    payable,
    reverseCharge: doc.se.reverseCharge,
  };
}

/** The summary the customer reads, in their mode: incl. VAT for private persons, excl. for businesses. */
export function customerSummary(doc: InvoiceDocument, totals: InvoiceTotals = invoiceTotals(doc)) {
  const inclVat = doc.buyer.type === "privat";
  return {
    inclVat,
    byKind: totals.byKind.map((k) => ({ kind: k.kind, amount: inclVat ? k.gross : k.net })),
    subtotal: inclVat ? totals.gross : totals.net,
    vat: totals.vat,
    vatBreakdown: totals.vatBreakdown,
    rot: totals.rot?.deduction ?? 0,
    rounding: totals.rounding,
    payable: totals.payable,
    reverseCharge: totals.reverseCharge,
    ...amountDue(totals.payable, doc.se.offset?.amountOre ?? 0),
  };
}

/**
 * What is left once a payment on a replaced invoice is offset (Rätta belopp
 * on a paid invoice): the customer pays `due`, or gets `refund` back when
 * they had paid more than the new invoice. Both are zero or positive.
 */
export function amountDue(payable: Ore, offset: Ore): { offset: Ore; due: Ore; refund: Ore } {
  ore(payable);
  ore(offset);
  const left = payable - offset;
  return { offset, due: Math.max(0, left), refund: Math.max(0, -left) };
}
