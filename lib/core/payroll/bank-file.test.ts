import { test } from "node:test";
import assert from "node:assert/strict";
import { salaryFile, salaryFileTotalOre } from "./bank-file";

const input = {
  messageId: "LON-2026-11",
  createdAt: "2026-11-20T10:15:00",
  executionDate: "2026-11-25",
  period: "2026-11",
  debtor: { name: "Binaafy AB", orgNr: "559123-4567", iban: "SE45 5000 0000 0583 9825 7466", bic: "ESSESESS" },
  payments: [
    { reference: "L1", name: "Erik Eriksson", clearing: "8327", account: "9 123 456 789", amountOre: 2_555_000 },
    { reference: "L2", name: "Fatima <Falk> & Co", clearing: "6000", account: "123456789", amountOre: 1_260_050 },
    { reference: "L3", name: "Noll Nollsson", clearing: "6000", account: "123456789", amountOre: 0 },
  ],
};

// Written by hand from pain.001.001.03 and the Swedish banks' salary implementation (SALA, SESBA, BBAN).
const EXPECTED = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>LON-2026-11</MsgId>
      <CreDtTm>2026-11-20T10:15:00</CreDtTm>
      <NbOfTxs>2</NbOfTxs>
      <CtrlSum>38150.50</CtrlSum>
      <InitgPty><Nm>Binaafy AB</Nm><Id><OrgId><Othr><Id>5591234567</Id><SchmeNm><Cd>BANK</Cd></SchmeNm></Othr></OrgId></Id></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>LON-2026-11-1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>2</NbOfTxs>
      <CtrlSum>38150.50</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>NURG</Cd></SvcLvl><CtgyPurp><Cd>SALA</Cd></CtgyPurp></PmtTpInf>
      <ReqdExctnDt>2026-11-25</ReqdExctnDt>
      <Dbtr><Nm>Binaafy AB</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>SE4550000000058398257466</IBAN></Id><Ccy>SEK</Ccy></DbtrAcct>
      <DbtrAgt><FinInstnId><BIC>ESSESESS</BIC></FinInstnId></DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtTrfTxInf>
        <PmtId><InstrId>L1</InstrId><EndToEndId>L1</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="SEK">25550.00</InstdAmt></Amt>
        <CdtrAgt><FinInstnId><ClrSysMmbId><ClrSysId><Cd>SESBA</Cd></ClrSysId><MmbId>8327</MmbId></ClrSysMmbId></FinInstnId></CdtrAgt>
        <Cdtr><Nm>Erik Eriksson</Nm></Cdtr>
        <CdtrAcct><Id><Othr><Id>83279123456789</Id><SchmeNm><Cd>BBAN</Cd></SchmeNm></Othr></Id></CdtrAcct>
        <RmtInf><Ustrd>Lön 2026-11</Ustrd></RmtInf>
      </CdtTrfTxInf>
      <CdtTrfTxInf>
        <PmtId><InstrId>L2</InstrId><EndToEndId>L2</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="SEK">12600.50</InstdAmt></Amt>
        <CdtrAgt><FinInstnId><ClrSysMmbId><ClrSysId><Cd>SESBA</Cd></ClrSysId><MmbId>6000</MmbId></ClrSysMmbId></FinInstnId></CdtrAgt>
        <Cdtr><Nm>Fatima Falk Co</Nm></Cdtr>
        <CdtrAcct><Id><Othr><Id>6000123456789</Id><SchmeNm><Cd>BBAN</Cd></SchmeNm></Othr></Id></CdtrAcct>
        <RmtInf><Ustrd>Lön 2026-11</Ustrd></RmtInf>
      </CdtTrfTxInf>
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;

test("salary file: pain.001.001.03, one transfer per positive net pay, totals and CtrlSum", () => {
  const f = salaryFile(input);
  assert.equal(f.xml, EXPECTED);
  assert.equal(f.totalOre, 3_815_050);
  assert.equal(f.transactions, 2);
  assert.equal(salaryFileTotalOre(f.xml), 3_815_050);
});

test("salary file: refuses a missing salary account or a person without an account", () => {
  assert.throws(() => salaryFile({ ...input, debtor: { ...input.debtor, iban: "" } }), /IBAN/);
  assert.throws(() => salaryFile({ ...input, payments: [{ ...input.payments[0], clearing: "" }] }), /Erik Eriksson/);
  assert.throws(() => salaryFile({ ...input, payments: [input.payments[2]] }), /inga nettolöner/);
});
