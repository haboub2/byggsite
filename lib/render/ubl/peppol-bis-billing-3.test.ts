import { test } from "node:test";
import assert from "node:assert/strict";
import { peppolFileName, renderPeppolInvoice, ublAmount, ublQuantity, unitCode, validatePeppol } from "./peppol-bis-billing-3";
import { invoiceDocumentSchema, newInvoiceDocument, type Buyer, type InvoiceDocument, type InvoiceLine } from "../../core/documents/invoice";
import { manualProvider, peppolProvider } from "../../core/peppol/provider";

const seller = {
  name: "Binaafy AB",
  orgNr: "559000-0000",
  vatNr: "SE559000000001",
  street: "Uppstigen 130",
  postalCode: "412 80",
  city: "Göteborg",
  countryCode: "SE",
  email: "faktura@example.se",
  phone: "031-123 45 67",
  fSkatt: true,
};

const vast: Buyer = {
  name: "Bygg & Fastighet i Väst AB",
  orgNr: "556677-8899",
  vatNr: "SE556677889901",
  street: "Storgatan 1",
  postalCode: "411 01",
  city: "Göteborg",
  countryCode: "SE",
  email: "ekonomi@vast.example",
  phone: "",
  type: "foretag",
  customerId: null,
  reference: "Karin Ek",
  peppolId: "",
};

const anna: Buyer = {
  ...vast,
  name: "Anna Lindqvist",
  orgNr: "",
  vatNr: "",
  street: "Bräckevägen 12",
  postalCode: "417 03",
  email: "anna@example.se",
  type: "privat",
  reference: "",
};

const line = (patch: Partial<InvoiceLine>): InvoiceLine => ({
  id: "1",
  description: "Rad",
  quantity: 1,
  unit: "st",
  unitPriceOre: 0,
  vatCategory: "S",
  vatRate: 25,
  kind: "other",
  section: "",
  changeOrderId: null,
  ...patch,
});

/** Faktura 10005 to a business: labour by the hour, sheets by the square metre, one sundry item. */
function kontor(): InvoiceDocument {
  const doc = newInvoiceDocument({ issueDate: "2026-10-10", seller, buyer: vast, paymentMeans: { bankgiro: "5555-1234", termsDays: 30 } });
  doc.number = "10005";
  doc.paymentMeans.ocr = "1000583";
  doc.deliveryDate = "2026-09-30";
  doc.period = { start: "2026-09-01", end: "2026-09-30" };
  doc.note = "Arbete enligt offert 1042.";
  doc.se.lateInterestText = "Dröjsmålsränta enligt räntelagen.";
  doc.references.ourReference = "Johan Berg";
  doc.lines = [
    line({ id: "1", description: "Snickeriarbete, kontor plan 2", quantity: 16, unit: "tim", unitPriceOre: 59_500, kind: "labor" }),
    line({ id: "2", description: "Gipsskivor 13 mm", quantity: 42.5, unit: "m²", unitPriceOre: 8_990, kind: "material" }),
    line({ id: "3", description: "Skruv och lim", quantity: 1, unit: "st", unitPriceOre: 34_550, kind: "material" }),
  ];
  return invoiceDocumentSchema.parse(doc);
}

/** Faktura 10022 from the prototype: 47 500 labour and 34 750 material incl. VAT, ROT 30 %. */
function badrum(): InvoiceDocument {
  const doc = newInvoiceDocument({ issueDate: "2026-10-10", seller, buyer: anna, paymentMeans: { bankgiro: "5555-1234", termsDays: 14 } });
  doc.number = "10022";
  doc.lines = [
    line({ id: "a", description: "Rivning och bortforsling", quantity: 12, unit: "tim", unitPriceOre: 50_000, kind: "labor" }),
    line({ id: "b", description: "Tätskikt och kakelsättning, 40 %", unitPriceOre: 3_200_000, kind: "labor" }),
    line({ id: "c", description: "Kakel och klinker", unitPriceOre: 2_092_000, kind: "material" }),
    line({ id: "d", description: "Tätskiktsduk, fog och fästmassa", unitPriceOre: 688_000, kind: "material" }),
  ];
  doc.se.rot = {
    buyers: [{ name: "Anna Lindqvist", personalNumber: "850412-1234", roomOre: null }],
    property: { kind: "fastighet", designation: "Göteborg Tolered 1:23" },
    deductionOre: null,
  };
  return invoiceDocumentSchema.parse(doc);
}

const TAX_S25 = [
  "<cbc:ID>S</cbc:ID>",
  "<cbc:Percent>25</cbc:Percent>",
  "<cac:TaxScheme>",
  "  <cbc:ID>VAT</cbc:ID>",
  "</cac:TaxScheme>",
];
const indent = (n: number, lines: string[]) => lines.map((l) => " ".repeat(n) + l);

test("amounts, quantities and unit codes", () => {
  assert.equal(ublAmount(680_000), "6800.00");
  assert.equal(ublAmount(5), "0.05");
  assert.equal(ublAmount(-18), "-0.18");
  assert.equal(ublAmount(0), "0.00");
  assert.equal(ublQuantity(16), "16");
  assert.equal(ublQuantity(42.5), "42.5");
  assert.equal(ublQuantity(0.3333), "0.333");
  assert.equal(unitCode("st"), "H87");
  assert.equal(unitCode("tim"), "HUR");
  assert.equal(unitCode("m²"), "MTK");
  assert.equal(unitCode("lpm"), "MTR");
  assert.equal(unitCode("mån"), "MON");
  assert.equal(unitCode("kpl"), "SET");
  assert.equal(unitCode("pall"), "C62");
});

test("golden file: business invoice, 25 % on labour and material, bankgiro and OCR", () => {
  // 16 × 595,00 = 9 520,00 (VAT 2 380,00); 42,5 × 89,90 = 3 820,75 (VAT 955,1875 → 955,19);
  // 1 × 345,50 (VAT 86,375 → 86,38). Net 13 686,25, VAT 3 421,57, gross 17 107,82,
  // öresavrundning +0,18, to pay 17 108,00.
  const expected =
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">',
      "  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>",
      "  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>",
      "  <cbc:ID>10005</cbc:ID>",
      "  <cbc:IssueDate>2026-10-10</cbc:IssueDate>",
      "  <cbc:DueDate>2026-11-09</cbc:DueDate>",
      "  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>",
      "  <cbc:Note>Arbete enligt offert 1042.",
      "Dröjsmålsränta enligt räntelagen.</cbc:Note>",
      "  <cbc:DocumentCurrencyCode>SEK</cbc:DocumentCurrencyCode>",
      "  <cbc:BuyerReference>Karin Ek</cbc:BuyerReference>",
      "  <cac:InvoicePeriod>",
      "    <cbc:StartDate>2026-09-01</cbc:StartDate>",
      "    <cbc:EndDate>2026-09-30</cbc:EndDate>",
      "  </cac:InvoicePeriod>",
      "  <cac:AccountingSupplierParty>",
      "    <cac:Party>",
      '      <cbc:EndpointID schemeID="0007">5590000000</cbc:EndpointID>',
      "      <cac:PartyName>",
      "        <cbc:Name>Binaafy AB</cbc:Name>",
      "      </cac:PartyName>",
      "      <cac:PostalAddress>",
      "        <cbc:StreetName>Uppstigen 130</cbc:StreetName>",
      "        <cbc:CityName>Göteborg</cbc:CityName>",
      "        <cbc:PostalZone>412 80</cbc:PostalZone>",
      "        <cac:Country>",
      "          <cbc:IdentificationCode>SE</cbc:IdentificationCode>",
      "        </cac:Country>",
      "      </cac:PostalAddress>",
      "      <cac:PartyTaxScheme>",
      "        <cbc:CompanyID>SE559000000001</cbc:CompanyID>",
      "        <cac:TaxScheme>",
      "          <cbc:ID>VAT</cbc:ID>",
      "        </cac:TaxScheme>",
      "      </cac:PartyTaxScheme>",
      "      <cac:PartyTaxScheme>",
      "        <cbc:CompanyID>Godkänd för F-skatt</cbc:CompanyID>",
      "        <cac:TaxScheme>",
      "          <cbc:ID>TAX</cbc:ID>",
      "        </cac:TaxScheme>",
      "      </cac:PartyTaxScheme>",
      "      <cac:PartyLegalEntity>",
      "        <cbc:RegistrationName>Binaafy AB</cbc:RegistrationName>",
      "        <cbc:CompanyID>5590000000</cbc:CompanyID>",
      "        <cbc:CompanyLegalForm>Godkänd för F-skatt</cbc:CompanyLegalForm>",
      "      </cac:PartyLegalEntity>",
      "      <cac:Contact>",
      "        <cbc:Name>Johan Berg</cbc:Name>",
      "        <cbc:Telephone>031-123 45 67</cbc:Telephone>",
      "        <cbc:ElectronicMail>faktura@example.se</cbc:ElectronicMail>",
      "      </cac:Contact>",
      "    </cac:Party>",
      "  </cac:AccountingSupplierParty>",
      "  <cac:AccountingCustomerParty>",
      "    <cac:Party>",
      '      <cbc:EndpointID schemeID="0007">5566778899</cbc:EndpointID>',
      "      <cac:PartyName>",
      "        <cbc:Name>Bygg &amp; Fastighet i Väst AB</cbc:Name>",
      "      </cac:PartyName>",
      "      <cac:PostalAddress>",
      "        <cbc:StreetName>Storgatan 1</cbc:StreetName>",
      "        <cbc:CityName>Göteborg</cbc:CityName>",
      "        <cbc:PostalZone>411 01</cbc:PostalZone>",
      "        <cac:Country>",
      "          <cbc:IdentificationCode>SE</cbc:IdentificationCode>",
      "        </cac:Country>",
      "      </cac:PostalAddress>",
      "      <cac:PartyTaxScheme>",
      "        <cbc:CompanyID>SE556677889901</cbc:CompanyID>",
      "        <cac:TaxScheme>",
      "          <cbc:ID>VAT</cbc:ID>",
      "        </cac:TaxScheme>",
      "      </cac:PartyTaxScheme>",
      "      <cac:PartyLegalEntity>",
      "        <cbc:RegistrationName>Bygg &amp; Fastighet i Väst AB</cbc:RegistrationName>",
      "        <cbc:CompanyID>5566778899</cbc:CompanyID>",
      "      </cac:PartyLegalEntity>",
      "      <cac:Contact>",
      "        <cbc:ElectronicMail>ekonomi@vast.example</cbc:ElectronicMail>",
      "      </cac:Contact>",
      "    </cac:Party>",
      "  </cac:AccountingCustomerParty>",
      "  <cac:Delivery>",
      "    <cbc:ActualDeliveryDate>2026-09-30</cbc:ActualDeliveryDate>",
      "  </cac:Delivery>",
      "  <cac:PaymentMeans>",
      "    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>",
      "    <cbc:PaymentID>1000583</cbc:PaymentID>",
      "    <cac:PayeeFinancialAccount>",
      "      <cbc:ID>55551234</cbc:ID>",
      "      <cac:FinancialInstitutionBranch>",
      "        <cbc:ID>SE:BANKGIRO</cbc:ID>",
      "      </cac:FinancialInstitutionBranch>",
      "    </cac:PayeeFinancialAccount>",
      "  </cac:PaymentMeans>",
      "  <cac:PaymentTerms>",
      "    <cbc:Note>30 dagar netto</cbc:Note>",
      "  </cac:PaymentTerms>",
      "  <cac:TaxTotal>",
      '    <cbc:TaxAmount currencyID="SEK">3421.57</cbc:TaxAmount>',
      "    <cac:TaxSubtotal>",
      '      <cbc:TaxableAmount currencyID="SEK">13686.25</cbc:TaxableAmount>',
      '      <cbc:TaxAmount currencyID="SEK">3421.57</cbc:TaxAmount>',
      "      <cac:TaxCategory>",
      ...indent(8, TAX_S25),
      "      </cac:TaxCategory>",
      "    </cac:TaxSubtotal>",
      "  </cac:TaxTotal>",
      "  <cac:LegalMonetaryTotal>",
      '    <cbc:LineExtensionAmount currencyID="SEK">13686.25</cbc:LineExtensionAmount>',
      '    <cbc:TaxExclusiveAmount currencyID="SEK">13686.25</cbc:TaxExclusiveAmount>',
      '    <cbc:TaxInclusiveAmount currencyID="SEK">17107.82</cbc:TaxInclusiveAmount>',
      '    <cbc:PayableRoundingAmount currencyID="SEK">0.18</cbc:PayableRoundingAmount>',
      '    <cbc:PayableAmount currencyID="SEK">17108.00</cbc:PayableAmount>',
      "  </cac:LegalMonetaryTotal>",
      "  <cac:InvoiceLine>",
      "    <cbc:ID>1</cbc:ID>",
      '    <cbc:InvoicedQuantity unitCode="HUR">16</cbc:InvoicedQuantity>',
      '    <cbc:LineExtensionAmount currencyID="SEK">9520.00</cbc:LineExtensionAmount>',
      "    <cac:Item>",
      "      <cbc:Name>Snickeriarbete, kontor plan 2</cbc:Name>",
      "      <cac:ClassifiedTaxCategory>",
      ...indent(8, TAX_S25),
      "      </cac:ClassifiedTaxCategory>",
      "    </cac:Item>",
      "    <cac:Price>",
      '      <cbc:PriceAmount currencyID="SEK">595.00</cbc:PriceAmount>',
      "    </cac:Price>",
      "  </cac:InvoiceLine>",
      "  <cac:InvoiceLine>",
      "    <cbc:ID>2</cbc:ID>",
      '    <cbc:InvoicedQuantity unitCode="MTK">42.5</cbc:InvoicedQuantity>',
      '    <cbc:LineExtensionAmount currencyID="SEK">3820.75</cbc:LineExtensionAmount>',
      "    <cac:Item>",
      "      <cbc:Name>Gipsskivor 13 mm</cbc:Name>",
      "      <cac:ClassifiedTaxCategory>",
      ...indent(8, TAX_S25),
      "      </cac:ClassifiedTaxCategory>",
      "    </cac:Item>",
      "    <cac:Price>",
      '      <cbc:PriceAmount currencyID="SEK">89.90</cbc:PriceAmount>',
      "    </cac:Price>",
      "  </cac:InvoiceLine>",
      "  <cac:InvoiceLine>",
      "    <cbc:ID>3</cbc:ID>",
      '    <cbc:InvoicedQuantity unitCode="H87">1</cbc:InvoicedQuantity>',
      '    <cbc:LineExtensionAmount currencyID="SEK">345.50</cbc:LineExtensionAmount>',
      "    <cac:Item>",
      "      <cbc:Name>Skruv och lim</cbc:Name>",
      "      <cac:ClassifiedTaxCategory>",
      ...indent(8, TAX_S25),
      "      </cac:ClassifiedTaxCategory>",
      "    </cac:Item>",
      "    <cac:Price>",
      '      <cbc:PriceAmount currencyID="SEK">345.50</cbc:PriceAmount>',
      "    </cac:Price>",
      "  </cac:InvoiceLine>",
      "</Invoice>",
    ].join("\n") + "\n";
  assert.equal(renderPeppolInvoice(kontor()), expected);
  assert.deepEqual(validatePeppol(kontor()), []);
});

test("reverse charge to a construction company: category AE, no VAT, exemption reason", () => {
  const doc = newInvoiceDocument({ issueDate: "2026-10-10", seller, buyer: { ...vast, type: "byggforetag" }, paymentMeans: { bankgiro: "5555-1234" } });
  doc.number = "10006";
  doc.lines = [
    line({ id: "1", description: "Stomkomplettering", quantity: 40, unit: "tim", unitPriceOre: 55_000, vatCategory: "AE", vatRate: 0, kind: "labor" }),
  ];
  const xml = renderPeppolInvoice(invoiceDocumentSchema.parse(doc));
  assert.ok(xml.includes("<cbc:Note>Omvänd betalningsskyldighet</cbc:Note>"));
  assert.ok(xml.includes('  <cac:TaxTotal>\n    <cbc:TaxAmount currencyID="SEK">0.00</cbc:TaxAmount>'));
  assert.ok(
    xml.includes(
      [
        '      <cbc:TaxableAmount currencyID="SEK">22000.00</cbc:TaxableAmount>',
        '      <cbc:TaxAmount currencyID="SEK">0.00</cbc:TaxAmount>',
        "      <cac:TaxCategory>",
        "        <cbc:ID>AE</cbc:ID>",
        "        <cbc:Percent>0</cbc:Percent>",
        "        <cbc:TaxExemptionReasonCode>VATEX-EU-AE</cbc:TaxExemptionReasonCode>",
        "        <cbc:TaxExemptionReason>Omvänd betalningsskyldighet</cbc:TaxExemptionReason>",
      ].join("\n"),
    ),
  );
  // The line carries the category and rate, never the exemption reason.
  assert.ok(xml.includes("      <cac:ClassifiedTaxCategory>\n        <cbc:ID>AE</cbc:ID>\n        <cbc:Percent>0</cbc:Percent>\n        <cac:TaxScheme>"));
  assert.equal(xml.match(/TaxExemptionReasonCode/g)?.length, 2); // open and close tag, once
  assert.ok(xml.includes('<cbc:PayableAmount currencyID="SEK">22000.00</cbc:PayableAmount>'));
});

test("exempt lines: category E with a reason", () => {
  const doc = kontor();
  doc.lines = [line({ id: "1", description: "Vidarefakturerad avgift", unitPriceOre: 10_000, vatCategory: "E", vatRate: 0 })];
  const xml = renderPeppolInvoice(doc);
  assert.ok(xml.includes("<cbc:ID>E</cbc:ID>\n        <cbc:Percent>0</cbc:Percent>\n        <cbc:TaxExemptionReason>Undantagen från moms</cbc:TaxExemptionReason>"));
});

test("ROT: full amount incl. VAT is payable, the deduction is stated in text only", () => {
  const doc = badrum();
  const xml = renderPeppolInvoice(doc);
  // Gross 82 250,00; ROT 30 % of 47 500 = 14 250; the buyer pays 68 000.
  assert.ok(xml.includes('<cbc:TaxInclusiveAmount currencyID="SEK">82250.00</cbc:TaxInclusiveAmount>'));
  assert.ok(xml.includes('<cbc:PayableAmount currencyID="SEK">82250.00</cbc:PayableAmount>'));
  assert.ok(!xml.includes("PrepaidAmount"));
  assert.ok(!xml.includes("AllowanceCharge"));
  assert.ok(!xml.includes("PayableRoundingAmount"));
  assert.ok(xml.includes("ROT-avdrag 14 250,00 kr begärs av säljaren hos Skatteverket. Att betala efter ROT-avdrag: 68 000 kr."));
  assert.ok(xml.includes("<cbc:Note>14 dagar netto. Att betala efter ROT-avdrag: 68 000 kr (ROT-avdrag 14 250,00 kr).</cbc:Note>"));
  // No personal number or property designation, in any form.
  for (const secret of ["850412", "8504121234", "198504121234", "Tolered"]) assert.ok(!xml.includes(secret), secret);
  // A private buyer without org nr or Peppol id has no endpoint; the validator says why.
  assert.ok(!xml.match(/AccountingCustomerParty>\s*<cac:Party>\s*<cbc:EndpointID/));
});

test("ROT with an odd gross: rounding is that of the gross, not of the amount after ROT", () => {
  const doc = badrum();
  doc.lines[2] = { ...doc.lines[2], unitPriceOre: 2_092_033 }; // + 0,33 net, + 0,0825 VAT → gross 82 250,41
  const xml = renderPeppolInvoice(doc);
  assert.ok(xml.includes('<cbc:TaxInclusiveAmount currencyID="SEK">82250.41</cbc:TaxInclusiveAmount>'));
  assert.ok(xml.includes('<cbc:PayableRoundingAmount currencyID="SEK">-0.41</cbc:PayableRoundingAmount>'));
  assert.ok(xml.includes('<cbc:PayableAmount currencyID="SEK">82250.00</cbc:PayableAmount>'));
});

test("credit note: CreditNote root, type 381, billing reference, positive amounts", () => {
  const doc = kontor();
  doc.kind = "credit";
  doc.number = "10007";
  doc.references.precedingInvoiceNumber = "10005";
  const xml = renderPeppolInvoice(doc);
  assert.ok(xml.includes('<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" '));
  assert.ok(xml.endsWith("</CreditNote>\n"));
  assert.ok(xml.includes("  <cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>"));
  assert.ok(!xml.includes("InvoiceTypeCode"));
  assert.ok(!xml.includes("<cbc:DueDate>"));
  assert.ok(xml.includes("  <cac:BillingReference>\n    <cac:InvoiceDocumentReference>\n      <cbc:ID>10005</cbc:ID>"));
  assert.ok(xml.includes('<cbc:CreditedQuantity unitCode="HUR">16</cbc:CreditedQuantity>'));
  assert.ok(!xml.includes("InvoicedQuantity"));
  assert.ok(!xml.includes("<cac:InvoiceLine>"));
  assert.equal(xml.match(/<cac:CreditNoteLine>/g)?.length, 3);
  assert.ok(xml.includes('<cbc:PayableAmount currencyID="SEK">17108.00</cbc:PayableAmount>'));
  assert.ok(xml.includes('<cbc:PayableRoundingAmount currencyID="SEK">0.18</cbc:PayableRoundingAmount>'));
  // Every amount positive (the rounding could be negative, here it is not).
  for (const m of xml.matchAll(/currencyID="SEK">([^<]+)</g)) assert.ok(!m[1].startsWith("-"), m[0]);
  // Order: BillingReference after BuyerReference, before the parties.
  assert.ok(xml.indexOf("<cbc:BuyerReference>") < xml.indexOf("<cac:BillingReference>"));
  assert.ok(xml.indexOf("<cac:BillingReference>") < xml.indexOf("<cac:AccountingSupplierParty>"));
  assert.deepEqual(validatePeppol(doc), []);
  assert.equal(peppolFileName(doc), "kreditfaktura-10007-peppol.xml");
  assert.equal(peppolFileName(kontor()), "faktura-10005-peppol.xml");
});

test("validatePeppol reports what Peppol needs", () => {
  const draft = badrum();
  draft.number = null;
  const errors = validatePeppol(draft);
  assert.ok(errors.some((e) => e.includes("inte utfärdad")));
  assert.ok(errors.includes("Peppol används för företag och offentlig sektor, inte privatpersoner."));
  assert.ok(errors.includes("Köparen saknar Peppol-id och organisationsnummer; lägg in Peppol-id på kunden."));

  // An explicit endpoint or the buyer's Peppol id satisfies the endpoint check.
  assert.ok(!validatePeppol(draft, { buyerEndpoint: "0007:5591234567" }).some((e) => e.includes("Peppol-id")));
  assert.ok(validatePeppol(draft, { buyerEndpoint: "5591234567" }).some((e) => e.includes("schema:id")));
  const withId = invoiceDocumentSchema.parse({ ...kontor(), buyer: { ...vast, orgNr: "", peppolId: "0088:7300010000001" } });
  assert.ok(renderPeppolInvoice(withId).includes('<cbc:EndpointID schemeID="0088">7300010000001</cbc:EndpointID>'));
  assert.ok(renderPeppolInvoice(withId, { buyerEndpoint: "0007:5591234567" }).includes('<cbc:EndpointID schemeID="0007">5591234567</cbc:EndpointID>'));

  const bare = kontor();
  bare.seller = { ...bare.seller, orgNr: "", vatNr: "" };
  bare.buyer = { ...bare.buyer, city: "" };
  bare.lines = [];
  bare.paymentMeans = { ...bare.paymentMeans, bankgiro: "", swish: "1231234567" };
  const e2 = validatePeppol(bare);
  for (const part of ["Säljarens organisationsnummer", "Säljarens momsregistreringsnummer", "saknar ort", "minst en rad", "bankgiro, plusgiro eller IBAN"])
    assert.ok(e2.some((e) => e.includes(part)), part);

  const credit = kontor();
  credit.kind = "credit";
  credit.paymentMeans = { ...credit.paymentMeans, bankgiro: "", termsText: "" };
  const e3 = validatePeppol(credit);
  assert.ok(e3.includes("En kreditfaktura måste hänvisa till fakturan den krediterar."));
  assert.ok(e3.some((e) => e.includes("betalningsvillkor")));
  assert.ok(!e3.some((e) => e.includes("bankgiro"))); // payment means are optional on a credit note
});

test("payment means: one per account, bankgiro first, IBAN with BIC", () => {
  const doc = kontor();
  doc.paymentMeans = { ...doc.paymentMeans, plusgiro: "12 34 56-7", iban: "SE45 5000 0000 0583 9825 7466", bic: "ESSESESS" };
  const xml = renderPeppolInvoice(doc);
  assert.equal(xml.match(/<cac:PaymentMeans>/g)?.length, 3);
  const ids = [...xml.matchAll(/<cac:PayeeFinancialAccount>\s*<cbc:ID>([^<]+)<\/cbc:ID>\s*<cac:FinancialInstitutionBranch>\s*<cbc:ID>([^<]+)</g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(ids, [
    ["55551234", "SE:BANKGIRO"],
    ["1234567", "SE:PLUSGIRO"],
    ["SE4550000000058398257466", "ESSESESS"],
  ]);
});

test("BR-CO-16 and the sums hold in the XML", () => {
  const num = (xml: string, tag: string) => Math.round(Number(xml.match(new RegExp(`<cbc:${tag} currencyID="SEK">([^<]+)<`))?.[1] ?? "0") * 100);
  const all = (xml: string, re: RegExp) => [...xml.matchAll(re)].map((m) => Math.round(Number(m[1]) * 100));
  const docs = [kontor(), badrum(), { ...kontor(), kind: "credit" as const, number: "10007" }];
  const odd = badrum();
  odd.lines[2] = { ...odd.lines[2], unitPriceOre: 2_092_077 };
  docs.push(odd);
  for (const doc of docs) {
    const xml = renderPeppolInvoice(doc);
    const payable = num(xml, "PayableAmount");
    const inclusive = num(xml, "TaxInclusiveAmount");
    const exclusive = num(xml, "TaxExclusiveAmount");
    const rounding = num(xml, "PayableRoundingAmount");
    const taxTotal = Number(xml.match(/<cac:TaxTotal>\s*<cbc:TaxAmount currencyID="SEK">([^<]+)</)![1]) * 100;
    assert.equal(payable, inclusive + rounding, "BR-CO-16");
    assert.equal(payable % 100, 0, "whole kronor");
    assert.equal(inclusive, exclusive + Math.round(taxTotal), "BR-CO-15");
    const subtotalTax = all(xml, /<\/cbc:TaxableAmount>\s*<cbc:TaxAmount currencyID="SEK">([^<]+)</g);
    assert.equal(subtotalTax.reduce((a, b) => a + b, 0), Math.round(taxTotal), "BR-CO-14");
    const lineAmounts = all(xml, /Quantity>\s*<cbc:LineExtensionAmount currencyID="SEK">([^<]+)</g);
    assert.equal(lineAmounts.length, doc.lines.length);
    assert.equal(lineAmounts.reduce((a, b) => a + b, 0), num(xml, "LineExtensionAmount"), "BR-CO-10");
  }
});

test("manual provider logs instead of sending; unknown providers are refused", async () => {
  const before = process.env.PEPPOL_PROVIDER;
  try {
    delete process.env.PEPPOL_PROVIDER;
    assert.equal(peppolProvider(), manualProvider);
    const r = await manualProvider.send("<Invoice/>", { invoiceId: "x", number: "10005", receiver: "0007:5566778899" });
    assert.equal(r.status, "logged");
    assert.match(r.id, /^[0-9a-f-]{36}$/);
    process.env.PEPPOL_PROVIDER = "pagero";
    assert.throws(() => peppolProvider(), /Okänd Peppol-accesspunkt/);
  } finally {
    if (before === undefined) delete process.env.PEPPOL_PROVIDER;
    else process.env.PEPPOL_PROVIDER = before;
  }
});
