import { isValidOcr, referenceFromOcr } from "../ocr";
import type { BankTransactionInput } from "./camt054";

/**
 * Match money in against open invoices. The OCR number decides when it is
 * there and valid; otherwise an exact amount plus a name that fits, and as
 * a last resort an amount that fits exactly one invoice. Everything else is
 * left for a person. Confidence is shown, never hidden.
 */

export type OpenInvoice = {
  id: string;
  number: string;
  ocr: string | null;
  remainingOre: number;
  buyerName: string;
  dueOn: string | null;
};

export type MatchConfidence = "ocr" | "number" | "amount+name" | "amount";

export type TransactionMatch = {
  invoiceId: string;
  number: string;
  confidence: MatchConfidence;
  /** Paid minus remaining: 0 exact, negative part payment, positive overpayment. */
  differenceOre: number;
};

const digits = (s: string) => s.replace(/\D/g, "");

/** Surname-ish tokens of a name, lowercase, letters only. */
function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 3 && !["ab", "och", "the"].includes(t));
}

function nameFits(counterpart: string, buyerName: string): boolean {
  const a = tokens(counterpart);
  const b = tokens(buyerName);
  return a.length > 0 && b.length > 0 && a.some((t) => b.includes(t));
}

export function matchTransaction(tx: BankTransactionInput, open: OpenInvoice[]): TransactionMatch | null {
  if (!tx.credit || tx.amountOre <= 0) return null;
  const candidatesByOcr = [digits(tx.reference), ...digits(tx.message).length >= 3 ? [digits(tx.message)] : []].filter((d) => d.length >= 3);
  for (const ref of candidatesByOcr) {
    if (!isValidOcr(ref)) continue;
    const inv = open.find((i) => i.ocr === ref) ?? open.find((i) => i.number === referenceFromOcr(ref));
    if (inv) return { invoiceId: inv.id, number: inv.number, confidence: "ocr", differenceOre: tx.amountOre - inv.remainingOre };
  }
  // A bare invoice number in the message ("faktura 10022").
  const numbered = open.filter((i) => new RegExp(`(^|\\D)${i.number}(\\D|$)`).test(tx.message));
  if (numbered.length === 1) return { invoiceId: numbered[0].id, number: numbered[0].number, confidence: "number", differenceOre: tx.amountOre - numbered[0].remainingOre };

  const exact = open.filter((i) => i.remainingOre === tx.amountOre);
  const withName = exact.filter((i) => nameFits(tx.counterpart, i.buyerName));
  if (withName.length === 1) return { invoiceId: withName[0].id, number: withName[0].number, confidence: "amount+name", differenceOre: 0 };
  if (exact.length === 1) return { invoiceId: exact[0].id, number: exact[0].number, confidence: "amount", differenceOre: 0 };
  return null;
}

export function matchAll(txs: BankTransactionInput[], open: OpenInvoice[]): { tx: BankTransactionInput; match: TransactionMatch | null }[] {
  const left = [...open];
  return txs.map((tx) => {
    const match = matchTransaction(tx, left);
    if (match && match.differenceOre >= 0) {
      const i = left.findIndex((x) => x.id === match.invoiceId);
      if (i >= 0) left.splice(i, 1);
    }
    return { tx, match };
  });
}
