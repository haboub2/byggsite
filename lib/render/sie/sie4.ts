import type { Ore } from "../../core/money";

/**
 * SIE 4 export: the Swedish standard file every bookkeeping program imports
 * (Fortnox, Bokio, Visma, Björn Lundén …). We write type 4 ("transaktioner"),
 * which carries the chart of accounts and every journal entry with its
 * transactions. The file is a serialisation of the ledger
 * (lib/core/ledger/posting.ts), so the bookkeeping is right by construction.
 *
 * Format notes (SIE-gruppen, "SIE filformat 4B"): one label per line, fields
 * separated by spaces, strings in double quotes, amounts in kronor with a
 * dot, dates as YYYYMMDD, CRLF line ends, and the text encoded as PC8
 * (IBM code page 437). `renderSie4` returns a JS string; `encodePc8` turns
 * it into bytes for the download.
 */

export type SieCompany = {
  name: string;
  orgNr: string;
  /** Fiscal year the entries belong to. */
  fiscalYearStart: string; // YYYY-MM-DD
  fiscalYearEnd: string;
};

export type SieAccount = { number: string; name: string };

export type SieTransaction = {
  account: string;
  /** Positive = debit, negative = credit, öre. */
  amount: Ore;
  text?: string;
};

export type SieEntry = {
  /** Series letter, "V". */
  series: string;
  /** Number within the series (and year). */
  number: number;
  /** Accounting date. */
  date: string;
  text: string;
  /** Date the entry was registered, when different from `date`. */
  registeredOn?: string;
  transactions: SieTransaction[];
};

export type SieExport = {
  company: SieCompany;
  accounts: SieAccount[];
  entries: SieEntry[];
  /** Date the file was generated. */
  generatedOn: string;
  /** Program name and version written in #PROGRAM. */
  program?: { name: string; version: string };
};

const CRLF = "\r\n";

const date8 = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new RangeError(`Datum skrivs ÅÅÅÅ-MM-DD, fick "${iso}".`);
  return iso.replace(/-/g, "");
};

/** Kronor with two decimals and a dot; negative with a leading minus. */
export function sieAmount(amount: Ore): string {
  if (!Number.isSafeInteger(amount)) throw new RangeError(`Belopp i öre måste vara heltal, fick ${amount}.`);
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** A quoted SIE string: quotes escaped, line breaks removed. */
export function sieString(s: string): string {
  return `"${s.replace(/[\r\n]+/g, " ").replace(/"/g, '\\"')}"`;
}

export function renderSie4(input: SieExport): string {
  const { company, accounts, entries, generatedOn } = input;
  const program = input.program ?? { name: "Binaafy Faktura", version: "1.0" };
  const out: string[] = [];
  out.push("#FLAGGA 0");
  out.push(`#PROGRAM ${sieString(program.name)} ${program.version}`);
  out.push("#FORMAT PC8");
  out.push(`#GEN ${date8(generatedOn)}`);
  out.push("#SIETYP 4");
  out.push(`#FNAMN ${sieString(company.name)}`);
  out.push(`#ORGNR ${company.orgNr}`);
  out.push(`#RAR 0 ${date8(company.fiscalYearStart)} ${date8(company.fiscalYearEnd)}`);
  out.push("#KPTYP EUBAS97");
  out.push("#VALUTA SEK");

  const used = new Set(entries.flatMap((e) => e.transactions.map((t) => t.account)));
  const chart = [...accounts].sort((a, b) => a.number.localeCompare(b.number));
  for (const a of chart) out.push(`#KONTO ${a.number} ${sieString(a.name)}`);
  for (const n of [...used].sort()) if (!chart.some((a) => a.number === n)) throw new RangeError(`Konto ${n} används men saknas i kontoplanen.`);

  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number)) {
    const sum = e.transactions.reduce((s, t) => s + t.amount, 0);
    if (sum !== 0) throw new RangeError(`Verifikation ${e.series}${e.number} balanserar inte (${sum} öre).`);
    const reg = e.registeredOn && e.registeredOn !== e.date ? ` ${date8(e.registeredOn)}` : "";
    out.push(`#VER ${e.series} ${e.number} ${date8(e.date)} ${sieString(e.text)}${reg}`);
    out.push("{");
    for (const t of e.transactions) {
      const text = t.text ? ` ${sieString(t.text)}` : "";
      out.push(`   #TRANS ${t.account} {} ${sieAmount(t.amount)}${text}`);
    }
    out.push("}");
  }
  return out.join(CRLF) + CRLF;
}

/** Code page 437 (PC8) for the characters Swedish bookkeeping text contains. Anything else becomes "?". */
const PC8: Record<string, number> = {
  "å": 0x86, "ä": 0x84, "ö": 0x94, "Å": 0x8f, "Ä": 0x8e, "Ö": 0x99,
  "é": 0x82, "É": 0x90, "ü": 0x81, "Ü": 0x9a, "æ": 0x91, "Æ": 0x92, "ø": 0x00, "Ø": 0x00,
  "ñ": 0xa4, "Ñ": 0xa5, "ç": 0x87, "Ç": 0x80, "à": 0x85, "è": 0x8a, "ê": 0x88, "ô": 0x93, "û": 0x96,
  "£": 0x9c, "§": 0x15, "°": 0xf8, "²": 0xfd,
};

export function encodePc8(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  let n = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 0x80) bytes[n++] = code;
    else {
      const mapped = PC8[ch];
      bytes[n++] = mapped ? mapped : 0x3f; // "?"
    }
  }
  return bytes.slice(0, n);
}
