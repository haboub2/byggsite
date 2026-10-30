/**
 * The salary file (docs/hr-lon.md, sections 1 and 3 `bank_files`): ISO
 * 20022 pain.001.001.03, the customer credit transfer the Swedish banks
 * take for salary payments (Nordea, SEB, Swedbank, Handelsbanken follow
 * the common Swedish implementation of the message). One payment
 * information block from the salary account in the settings (IBAN + BIC),
 * category purpose SALA, executed on pay day; one credit transfer per
 * payslip to the employee's clearing and account number (BBAN, the
 * clearing also as the creditor agent's SESBA member id), with
 * "Lön <period>" as the message. The system never sends the file; a
 * person uploads and signs it in the bank.
 *
 * payroll_bank_file_store() (0039) reads NbOfTxs, CtrlSum and every
 * InstdAmt back out of the XML and refuses a file that is not the
 * payslips' positive net pay.
 */

import { sumOre, type Ore } from "../money";
import type { IsoDate } from "../rules/index";

export type BankPayment = {
  /** EndToEndId: the payslip number ("L12"). */
  reference: string;
  name: string;
  clearing: string;
  account: string;
  amountOre: Ore;
};

export type SalaryFileInput = {
  messageId: string;
  /** ISO date-time without zone, Swedish local time ("2026-11-20T10:15:00"). */
  createdAt: string;
  executionDate: IsoDate;
  /** "2026-11": the message on every payment is "Lön 2026-11". */
  period: string;
  debtor: { name: string; orgNr: string; iban: string; bic: string; customerId?: string };
  payments: readonly BankPayment[];
};

export type SalaryFile = { xml: string; totalOre: Ore; transactions: number };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
/** The message's Latin character set: other letters are replaced, names cut at 70. */
const name = (s: string) => esc(s.normalize("NFC").replace(/[^\p{L}\p{N} .,\-/()+:?']/gu, " ").replace(/\s+/g, " ").trim().slice(0, 70));
const amount = (ore: Ore) => `${Math.trunc(ore / 100)}.${String(Math.abs(ore) % 100).padStart(2, "0")}`;
const digits = (s: string) => s.replace(/\D/g, "");

export function salaryFile(input: SalaryFileInput): SalaryFile {
  const payments = input.payments.filter((p) => p.amountOre > 0);
  if (!payments.length) throw new Error("Det finns inga nettolöner att betala ut.");
  const iban = input.debtor.iban.replace(/\s/g, "").toUpperCase();
  if (!/^SE\d{22}$/.test(iban)) throw new Error("Lönekontots IBAN saknas eller är fel; fyll i det under Inställningar › Lön.");
  if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(input.debtor.bic)) throw new Error("Bankens BIC saknas; fyll i det under Inställningar › Lön.");
  for (const p of payments) {
    if (!/^\d{4,5}$/.test(digits(p.clearing)) || digits(p.account).length < 6) throw new Error(`${p.name}: clearing- och kontonummer saknas eller är fel.`);
  }
  const totalOre = sumOre(payments.map((p) => p.amountOre));
  const orgId = digits(input.debtor.orgNr);
  const initiatorId = input.debtor.customerId
    ? `<Id><OrgId><Othr><Id>${esc(input.debtor.customerId)}</Id><SchmeNm><Cd>BANK</Cd></SchmeNm></Othr></OrgId></Id>`
    : orgId
      ? `<Id><OrgId><Othr><Id>${orgId}</Id><SchmeNm><Cd>BANK</Cd></SchmeNm></Othr></OrgId></Id>`
      : "";
  const tx = payments
    .map(
      (p) =>
        `      <CdtTrfTxInf>
        <PmtId><InstrId>${esc(p.reference)}</InstrId><EndToEndId>${esc(p.reference)}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="SEK">${amount(p.amountOre)}</InstdAmt></Amt>
        <CdtrAgt><FinInstnId><ClrSysMmbId><ClrSysId><Cd>SESBA</Cd></ClrSysId><MmbId>${digits(p.clearing).slice(0, 4)}</MmbId></ClrSysMmbId></FinInstnId></CdtrAgt>
        <Cdtr><Nm>${name(p.name)}</Nm></Cdtr>
        <CdtrAcct><Id><Othr><Id>${digits(p.clearing)}${digits(p.account)}</Id><SchmeNm><Cd>BBAN</Cd></SchmeNm></Othr></Id></CdtrAcct>
        <RmtInf><Ustrd>Lön ${esc(input.period)}</Ustrd></RmtInf>
      </CdtTrfTxInf>`
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${esc(input.messageId)}</MsgId>
      <CreDtTm>${esc(input.createdAt)}</CreDtTm>
      <NbOfTxs>${payments.length}</NbOfTxs>
      <CtrlSum>${amount(totalOre)}</CtrlSum>
      <InitgPty><Nm>${name(input.debtor.name)}</Nm>${initiatorId}</InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(input.messageId)}-1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${payments.length}</NbOfTxs>
      <CtrlSum>${amount(totalOre)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>NURG</Cd></SvcLvl><CtgyPurp><Cd>SALA</Cd></CtgyPurp></PmtTpInf>
      <ReqdExctnDt>${input.executionDate}</ReqdExctnDt>
      <Dbtr><Nm>${name(input.debtor.name)}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${iban}</IBAN></Id><Ccy>SEK</Ccy></DbtrAcct>
      <DbtrAgt><FinInstnId><BIC>${esc(input.debtor.bic)}</BIC></FinInstnId></DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
${tx}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
  return { xml, totalOre, transactions: payments.length };
}

/** CtrlSum read back from a stored file, in öre (the reconciliation's bank figure in demo mode). */
export function salaryFileTotalOre(xml: string): Ore | null {
  const m = /<GrpHdr>[\s\S]*?<CtrlSum>(\d+)\.(\d{2})<\/CtrlSum>/.exec(xml);
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
}
