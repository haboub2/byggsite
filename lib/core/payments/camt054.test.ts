import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCamt054 } from "./camt054";
import { matchAll, matchTransaction } from "./matching";
import { ocrFor } from "../ocr";

const sample = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.054.001.02">
  <BkToCstmrDbtCdtNtfctn>
    <GrpHdr><MsgId>BGI-2026-10-22-1</MsgId><CreDtTm>2026-10-22T06:10:00</CreDtTm></GrpHdr>
    <Ntfctn>
      <Id>N1</Id>
      <Acct><Id><Othr><Id>55551234</Id><SchmeNm><Prtry>BGNR</Prtry></SchmeNm></Othr></Id></Acct>
      <Ntry>
        <NtryRef>1</NtryRef>
        <Amt Ccy="SEK">68000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-10-22</Dt></BookgDt>
        <ValDt><Dt>2026-10-22</Dt></ValDt>
        <NtryDtls>
          <TxDtls>
            <Refs><AcctSvcrRef>BG-2026-10-22-0001</AcctSvcrRef><EndToEndId>NOTPROVIDED</EndToEndId></Refs>
            <AmtDtls><TxAmt><Amt Ccy="SEK">60000.00</Amt></TxAmt></AmtDtls>
            <RltdPties><Dbtr><Nm>ANNA LINDQVIST</Nm></Dbtr></RltdPties>
            <RmtInf><Strd><CdtrRefInf><Tp><CdOrPrtry><Cd>SCOR</Cd></CdOrPrtry></Tp><Ref>${ocrFor(10022)}</Ref></CdtrRefInf></Strd></RmtInf>
          </TxDtls>
          <TxDtls>
            <Refs><AcctSvcrRef>BG-2026-10-22-0002</AcctSvcrRef></Refs>
            <AmtDtls><TxAmt><Amt Ccy="SEK">8000.00</Amt></TxAmt></AmtDtls>
            <RltdPties><Dbtr><Nm>G&amp;OTEBORGS FASTIGHETS AB</Nm></Dbtr></RltdPties>
            <RmtInf><Ustrd>Faktura 10020 del 1</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
      <Ntry>
        <NtryRef>2</NtryRef>
        <Amt Ccy="SEK">12500.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-10-23</Dt></BookgDt>
        <NtryDtls><TxDtls>
          <Refs><AcctSvcrRef>BG-2026-10-23-0001</AcctSvcrRef></Refs>
          <RltdPties><Dbtr><Nm>Nordic Retail AB</Nm></Dbtr></RltdPties>
        </TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <NtryRef>3</NtryRef>
        <Amt Ccy="SEK">150.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2026-10-23</Dt></BookgDt>
      </Ntry>
    </Ntfctn>
  </BkToCstmrDbtCdtNtfctn>
</Document>`;

test("parses entries and transaction details", () => {
  const file = parseCamt054(sample);
  assert.equal(file.account, "55551234");
  assert.equal(file.createdAt, "2026-10-22T06:10:00");
  assert.equal(file.transactions.length, 4);
  const [a, b, c, d] = file.transactions;
  assert.deepEqual(a, { externalId: "BG-2026-10-22-0001", bookedOn: "2026-10-22", amountOre: 6_000_000, currency: "SEK", credit: true, reference: ocrFor(10022), message: "", counterpart: "ANNA LINDQVIST" });
  assert.equal(b.amountOre, 800_000);
  assert.equal(b.counterpart, "G&OTEBORGS FASTIGHETS AB");
  assert.equal(b.message, "Faktura 10020 del 1");
  assert.equal(c.amountOre, 1_250_000);
  assert.equal(c.externalId, "BG-2026-10-23-0001");
  assert.equal(d.credit, false);
  assert.equal(d.externalId, "3");
});

test("rejects other files", () => {
  assert.throws(() => parseCamt054("<html></html>"), /camt\.054/);
});

test("matching: OCR first, then invoice number in the message, then amount and name", () => {
  const open = [
    { id: "i22", number: "10022", ocr: ocrFor(10022), remainingOre: 6_800_000, buyerName: "Anna Lindqvist", dueOn: "2026-10-24" },
    { id: "i20", number: "10020", ocr: ocrFor(10020), remainingOre: 4_250_000, buyerName: "Göteborgs Fastighets AB", dueOn: "2026-10-12" },
    { id: "i21", number: "10021", ocr: ocrFor(10021), remainingOre: 1_250_000, buyerName: "Nordic Retail AB", dueOn: "2026-10-31" },
    { id: "i19", number: "10019", ocr: ocrFor(10019), remainingOre: 1_250_000, buyerName: "Erik Holm", dueOn: "2026-10-31" },
  ];
  const file = parseCamt054(sample);
  const result = matchAll(file.transactions, open);
  assert.equal(result[0].match?.invoiceId, "i22");
  assert.equal(result[0].match?.confidence, "ocr");
  assert.equal(result[0].match?.differenceOre, -800_000); // part payment
  assert.equal(result[1].match?.invoiceId, "i20");
  assert.equal(result[1].match?.confidence, "number");
  assert.equal(result[2].match?.invoiceId, "i21");
  assert.equal(result[2].match?.confidence, "amount+name");
  assert.equal(result[3].match, null); // a debit
});

test("an amount alone matches only when it is unique", () => {
  const tx = { externalId: "x", bookedOn: "2026-10-23", amountOre: 1_250_000, currency: "SEK", credit: true, reference: "", message: "", counterpart: "Okänd" };
  const two = [
    { id: "a", number: "1", ocr: null, remainingOre: 1_250_000, buyerName: "A", dueOn: null },
    { id: "b", number: "2", ocr: null, remainingOre: 1_250_000, buyerName: "B", dueOn: null },
  ];
  assert.equal(matchTransaction(tx, two), null);
  assert.equal(matchTransaction(tx, [two[0]])?.confidence, "amount");
  assert.equal(matchTransaction({ ...tx, reference: "123" }, [two[0]])?.confidence, "amount");
});
