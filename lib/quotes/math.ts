import { calculateRot, ROT_RATE, ROT_CAP, type RotResult } from "../rot";
import { ITEM_KINDS, ITEM_KIND_LABEL, type ItemKind, type QuoteData, type QuoteItem } from "./schema";

/**
 * Totals for a quote. Pure, so the editor can show them live and the PDF
 * prints the same figures. Lines are kept in öre precision; the totals are
 * rounded to whole kronor, which is how Swedish quotes are read.
 */

export type LineTotals = { net: number; vat: number; gross: number };

export type QuoteTotals = {
  lines: Record<string, LineTotals>;
  net: number;
  vat: number;
  /** VAT per rate, only rates that occur. */
  vatByRate: { rate: number; amount: number }[];
  gross: number;
  laborGross: number;
  /** Set when the quote shows a ROT deduction. */
  rot: RotResult | null;
  /** What the customer pays: gross, minus ROT when it applies. */
  pay: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function lineTotals(item: QuoteItem, pricesInclVat: boolean): LineTotals {
  const factor = 1 + item.vatRate / 100;
  const amount = (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
  const net = pricesInclVat ? amount / factor : amount;
  const gross = pricesInclVat ? amount : amount * factor;
  return { net: r2(net), vat: r2(gross - net), gross: r2(gross) };
}

/** ROT applies to private customers on the Bygg side only. */
export function rotApplies(q: Pick<QuoteData, "division" | "rot" | "customer">): boolean {
  return q.division === "bygg" && q.rot && q.customer.type === "privat";
}

export function quoteTotals(q: QuoteData): QuoteTotals {
  const lines: Record<string, LineTotals> = {};
  let net = 0;
  let gross = 0;
  let laborGross = 0;
  const byRate = new Map<number, number>();
  for (const item of q.items) {
    const t = lineTotals(item, q.pricesInclVat);
    lines[item.id] = t;
    net += t.net;
    gross += t.gross;
    if (item.kind === "labor") laborGross += t.gross;
    byRate.set(item.vatRate, (byRate.get(item.vatRate) ?? 0) + t.vat);
  }
  net = Math.round(net);
  gross = Math.round(gross);
  laborGross = Math.round(laborGross);
  const vatByRate = [...byRate.entries()]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[0] - a[0])
    .map(([rate, amount]) => ({ rate, amount: Math.round(amount) }));
  const vat = gross - net;

  const rot = rotApplies(q)
    ? calculateRot({
        labor: laborGross,
        material: gross - laborGross,
        owners: Array.from({ length: Math.max(1, q.rotPersons.length) }, () => ({})),
      })
    : null;

  return { lines, net, vat, vatByRate, gross, laborGross, rot, pay: rot ? rot.pay : gross };
}

export { ROT_RATE, ROT_CAP };

/**
 * How amounts are shown to the customer, decided by who the customer is,
 * not by how the prices were typed in: a private person sees what they pay,
 * incl. VAT; a business sees amounts excl. VAT, which is what it books.
 */
export function showsInclVat(q: Pick<QuoteData, "customer">): boolean {
  return q.customer.type === "privat";
}

/**
 * The "Pris sammanställning" box on the PDF. Rows are the cost per kind
 * (labour, material, other) in the customer's display mode, in öre; the
 * rounding row brings them to the whole-krona total, and for private
 * customers the ROT deduction comes off before the total. The rows always
 * add up to the total exactly.
 */
export type PriceSummary = {
  inclVat: boolean;
  byKind: { kind: ItemKind; amount: number }[];
  /** Whole-krona total minus the exact sum of the rows, in öre. */
  rounding: number;
  /** ROT deduction, positive kronor; 0 when ROT doesn't apply. */
  rot: number;
  /** The big figure: what a private customer pays, or the amount excl. VAT for a business. */
  total: number;
  /** Before the ROT deduction, incl. VAT (private customers). */
  grossBeforeRot: number;
  net: number;
  gross: number;
  vatByRate: { rate: number; amount: number }[];
};

export function priceSummary(q: QuoteData, totals: QuoteTotals = quoteTotals(q)): PriceSummary {
  const inclVat = showsInclVat(q);
  const sums = new Map<ItemKind, number>();
  for (const item of q.items) {
    const line = totals.lines[item.id];
    if (!line) continue;
    sums.set(item.kind, (sums.get(item.kind) ?? 0) + (inclVat ? line.gross : line.net));
  }
  const byKind = ITEM_KINDS.filter((k) => sums.has(k)).map((kind) => ({ kind, amount: r2(sums.get(kind)!) }));
  const exact = r2(byKind.reduce((sum, row) => sum + row.amount, 0));
  const shown = inclVat ? totals.gross : totals.net;
  const rot = inclVat && totals.rot ? totals.rot.deduction : 0;
  return {
    inclVat,
    byKind,
    rounding: r2(shown - exact),
    rot,
    total: shown - rot,
    grossBeforeRot: totals.gross,
    net: totals.net,
    gross: totals.gross,
    vatByRate: totals.vatByRate,
  };
}

/**
 * The item table's groups. Rows with a work step ("Rivning", "Tätskikt") are
 * grouped by step in the order the steps first appear; with no steps at all,
 * Bygg rows group by kind (Arbete, Material, Övrigt). A single group gets no
 * heading. Subtotals are in the customer's display mode, in öre.
 */
export type ItemGroup = { title: string; items: QuoteItem[]; subtotal: number };

export function groupItems(q: QuoteData, totals: QuoteTotals = quoteTotals(q)): ItemGroup[] {
  const inclVat = showsInclVat(q);
  const bySection = q.items.some((i) => i.section.trim());
  const keyOf = (i: QuoteItem) =>
    bySection ? i.section.trim() || "Övrigt" : q.division === "bygg" ? ITEM_KIND_LABEL[i.kind] : "";
  const order = bySection ? [] : ITEM_KINDS.map((k) => ITEM_KIND_LABEL[k]);
  const groups = new Map<string, QuoteItem[]>();
  for (const k of order) groups.set(k, []);
  for (const item of q.items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  const list = [...groups.entries()]
    .filter(([, items]) => items.length > 0)
    .map(([title, items]) => ({
      title,
      items,
      subtotal: r2(items.reduce((sum, i) => sum + (inclVat ? totals.lines[i.id]?.gross ?? 0 : totals.lines[i.id]?.net ?? 0), 0)),
    }));
  return list.length === 1 ? [{ ...list[0], title: "" }] : list;
}

/** A line's unit price in the display mode, whatever mode it was typed in. */
export function displayUnitPrice(item: QuoteItem, pricesInclVat: boolean, inclVat: boolean): number {
  const price = Number(item.unitPrice) || 0;
  if (pricesInclVat === inclVat) return price;
  const factor = 1 + item.vatRate / 100;
  return r2(inclVat ? price * factor : price / factor);
}

/** "12 345 kr" — plain spaces so it renders the same in the PDF and the browser. */
export function kr(n: number): string {
  return `${Math.round(n).toLocaleString("sv-SE").replace(/ /g, " ")} kr`;
}

/** "120 000,00" — accounting style for the PDF, plain spaces. */
export function sek(n: number): string {
  return n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00a0/g, " ");
}

/** Quantity with up to two decimals, Swedish comma. */
export function qty(n: number): string {
  return n.toLocaleString("sv-SE", { maximumFractionDigits: 2 }).replace(/ /g, " ");
}

/** Valid-until date from the document date and the validity in days. */
export function validUntil(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}
