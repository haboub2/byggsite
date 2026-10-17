import { calculateRot, ROT_RATE, ROT_CAP, type RotResult } from "../rot";
import type { QuoteData, QuoteItem } from "./schema";

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
