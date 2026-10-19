import { kronorToOre, type Ore } from "../money";

/**
 * ISO 20022 camt.054 (BankToCustomerDebitCreditNotification), the file
 * Swedish banks send for Bankgiro Inbetalningar since BgMax was retired
 * (docs/fakturering.md, Kopplingar). We read what the matching needs:
 * each credit, its booking date, amount, the structured creditor reference
 * (the OCR number), the unstructured message and the payer's name.
 *
 * The parser is deliberately small and tolerant: it walks <Ntry> blocks and,
 * inside them, <TxDtls> blocks, with no namespace handling needed because
 * camt files use a default namespace. Anything it cannot read becomes an
 * unmatched transaction, never a crash.
 */

export type BankTransactionInput = {
  /** Stable id in the file (AcctSvcrRef, EndToEndId or NtryRef + index). */
  externalId: string;
  bookedOn: string;
  amountOre: Ore;
  currency: string;
  /** True for money in. */
  credit: boolean;
  /** Structured reference: the OCR number when the payer gave one. */
  reference: string;
  /** Free text the payer wrote. */
  message: string;
  /** Payer's name when the bank passes it on. */
  counterpart: string;
};

export type Camt054File = {
  account: string | null;
  createdAt: string | null;
  transactions: BankTransactionInput[];
};

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();

/** First <tag>…</tag> text inside a block (tag names only, no attributes). */
function text(block: string, path: string): string | null {
  let scope = block;
  for (const name of path.split("/")) {
    const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(scope);
    if (!m) return null;
    scope = m[1];
  }
  return decode(scope.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function blocks(xml: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function amountOf(block: string): { amountOre: Ore; currency: string } | null {
  const m = /<Amt(?:\s+Ccy="([A-Z]{3})")?[^>]*>([\d.]+)<\/Amt>/.exec(block);
  if (!m) return null;
  return { amountOre: kronorToOre(Number(m[2])), currency: m[1] ?? "SEK" };
}

function txFields(block: string) {
  return {
    reference: (text(block, "RmtInf/Strd/CdtrRefInf/Ref") ?? "").replace(/\s/g, ""),
    message: text(block, "RmtInf/Ustrd") ?? "",
    counterpart: text(block, "RltdPties/Dbtr/Nm") ?? text(block, "RltdPties/Dbtr/Pty/Nm") ?? "",
    endToEnd: text(block, "Refs/EndToEndId") ?? "",
    acctSvcrRef: text(block, "Refs/AcctSvcrRef") ?? "",
  };
}

export function parseCamt054(xml: string): Camt054File {
  if (!/<Document[\s>]/.test(xml) || !/<BkToCstmrDbtCdtNtfctn/.test(xml)) throw new Error("Filen är inte en camt.054 (BankToCustomerDebitCreditNotification).");
  // <Acct><Id><Othr><Id>…: nested same-name tags, so a dedicated pattern.
  const acct = /<Acct>([\s\S]*?)<\/Acct>/.exec(xml)?.[1] ?? "";
  const account = /<IBAN>([^<]+)<\/IBAN>/.exec(acct)?.[1]?.trim() ?? /<Othr>\s*<Id>([^<]+)<\/Id>/.exec(acct)?.[1]?.trim() ?? null;
  const createdAt = text(xml, "GrpHdr/CreDtTm");
  const transactions: BankTransactionInput[] = [];

  blocks(xml, "Ntry").forEach((entry, entryIndex) => {
    const bookedOn = text(entry, "BookgDt/Dt") ?? text(entry, "ValDt/Dt") ?? "";
    const credit = (text(entry, "CdtDbtInd") ?? "CRDT") === "CRDT";
    const entryAmount = amountOf(entry);
    const entryRef = text(entry, "NtryRef") ?? text(entry, "AcctSvcrRef") ?? `ntry-${entryIndex + 1}`;
    const details = blocks(entry, "TxDtls");
    if (details.length === 0) {
      if (!entryAmount) return;
      const f = txFields(entry);
      transactions.push({ externalId: f.acctSvcrRef || entryRef, bookedOn, amountOre: entryAmount.amountOre, currency: entryAmount.currency, credit, ...f });
      return;
    }
    details.forEach((tx, i) => {
      const amt = amountOf(blocks(tx, "AmtDtls")[0] ?? "") ?? amountOf(tx) ?? (details.length === 1 ? entryAmount : null);
      if (!amt) return;
      const f = txFields(tx);
      transactions.push({
        externalId: f.acctSvcrRef || f.endToEnd || `${entryRef}-${i + 1}`,
        bookedOn,
        amountOre: amt.amountOre,
        currency: amt.currency,
        credit: (text(tx, "CdtDbtInd") ?? (credit ? "CRDT" : "DBIT")) === "CRDT",
        reference: f.reference,
        message: f.message,
        counterpart: f.counterpart,
      });
    });
  });

  return { account, createdAt, transactions };
}
