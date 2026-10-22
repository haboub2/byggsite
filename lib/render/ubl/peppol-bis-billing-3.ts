import { formatKronor, formatOre, roundToKronor, type Ore } from "../../core/money";
import { invoiceTotals } from "../../core/invoices/totals";
import { INVOICE_TYPE_CODE, PEPPOL_ID, paymentReference, type InvoiceDocument, type InvoiceLine } from "../../core/documents/invoice";

/**
 * Peppol BIS Billing 3.0 (UBL 2.1) for one invoice document. An invoice
 * becomes <Invoice>, a credit note <CreditNote>. Pure: the document in, the
 * XML text out; sending is lib/core/peppol/provider.ts.
 *
 * Element order follows the UBL 2.1 xsd sequences (Invoice-2, CreditNote-2
 * and the cac aggregates), which the schema validation step of every access
 * point enforces. Empty elements are never written (PEPPOL-EN16931-R008).
 *
 * Choices made against the BIS 3 rules, checked 2026-10-20:
 *  - one document-level cbc:Note only (PEPPOL-EN16931-R002): our note, the
 *    reverse-charge text, the ROT text and the late-interest clause are
 *    joined with line breaks into that one note.
 *  - F-skatt: BT-32 seller tax registration identifier, a PartyTaxScheme
 *    with CompanyID "Godkänd för F-skatt" and TaxScheme "TAX" (the Swedish
 *    rule SE-R-005 checks exactly this), and also BT-33 CompanyLegalForm.
 *  - Bankgiro and plusgiro: PaymentMeansCode 30 with the account digits in
 *    PayeeFinancialAccount/ID and "SE:BANKGIRO" / "SE:PLUSGIRO" in
 *    FinancialInstitutionBranch/ID, which is where the Swedish rules
 *    SE-R-007..010 look for them. IBAN: the BIC goes in that branch ID.
 *  - Org numbers are 10 digits without dash (SE-R-003, SE-R-004).
 *  - A credit note has no cbc:DueDate in UBL 2.1; it is left out. All amounts
 *    on a credit note are positive, the type code 381 carries the sign.
 *
 * ROT: the deduction is neither a discount on the taxable amount nor a
 * prepayment, so it is not an AllowanceCharge and not PrepaidAmount. The XML
 * states the full amount incl. VAT as PayableAmount (BT-115), which keeps
 * BR-CO-16 (PayableAmount = TaxInclusiveAmount − PrepaidAmount +
 * PayableRoundingAmount) true; the rounding here is the öresavrundning of the
 * gross, independent of totals.rounding, which is computed after ROT. The
 * deduction and the amount the buyer actually pays are stated in text, in
 * the document note and in the payment terms (BT-20). Personal numbers and
 * the property designation never go into the XML.
 * SFTI:s rekommendation för hur ROT/RUT uttrycks i Peppol BIS Billing 3 ska
 * verifieras innan första skarpa sändning.
 */

export const PEPPOL_CUSTOMIZATION_ID = "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0";
export const PEPPOL_PROFILE_ID = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

const NS = {
  invoice: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
  credit: "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2",
  cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
} as const;

export type PeppolOptions = { buyerEndpoint?: string | null };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const digits = (s: string) => s.replace(/\D/g, "");

/** Öre to an xs:decimal with two decimals: 680000 → "6800.00", -18 → "-0.18". */
export function ublAmount(amount: Ore): string {
  const abs = Math.abs(amount);
  return `${amount < 0 ? "-" : ""}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Quantity with at most three decimals and no trailing zeros: 16 → "16", 42.5 → "42.5". */
export function ublQuantity(q: number): string {
  return q.toFixed(3).replace(/\.?0+$/, "");
}

/** Our units to UN/ECE Recommendation 20 codes (BT-130). Unknown units are "C62" (one). */
const UNIT_CODES: Record<string, string> = {
  st: "H87",
  "st.": "H87",
  tim: "HUR",
  h: "HUR",
  dag: "DAY",
  "m²": "MTK",
  m2: "MTK",
  kvm: "MTK",
  "m³": "MTQ",
  m3: "MTQ",
  m: "MTR",
  lpm: "MTR",
  km: "KMT",
  kg: "KGM",
  ton: "TNE",
  l: "LTR",
  mån: "MON",
  kpl: "SET",
  set: "SET",
};

export function unitCode(unit: string): string {
  return UNIT_CODES[unit.trim().toLowerCase()] ?? "C62";
}

const present = (v: string | null | undefined): v is string => typeof v === "string" && v.trim() !== "";

/** "0007:5591234567" from the option, the buyer's Peppol id, or the buyer's org nr. Null when none. */
export function buyerEndpoint(doc: InvoiceDocument, opts: PeppolOptions = {}): { scheme: string; id: string } | null {
  const raw = present(opts.buyerEndpoint) ? opts.buyerEndpoint.trim() : present(doc.buyer.peppolId) ? doc.buyer.peppolId.trim() : null;
  if (raw) {
    const i = raw.indexOf(":");
    return i > 0 ? { scheme: raw.slice(0, i), id: raw.slice(i + 1) } : null;
  }
  const org = digits(doc.buyer.orgNr);
  return org ? { scheme: "0007", id: org } : null;
}

/** Peppol checks what our draft may still lack. Swedish messages; empty means the XML can be sent. */
export function validatePeppol(doc: InvoiceDocument, opts: PeppolOptions = {}): string[] {
  const errors: string[] = [];
  if (doc.number === null) errors.push("Fakturan är inte utfärdad än; Peppol-filen kan skapas först när den har ett nummer.");
  if (!doc.seller.orgNr) errors.push("Säljarens organisationsnummer saknas.");
  if (!doc.seller.vatNr) errors.push("Säljarens momsregistreringsnummer saknas.");
  if (doc.buyer.type === "privat") errors.push("Peppol används för företag och offentlig sektor, inte privatpersoner.");
  if (present(opts.buyerEndpoint) && !PEPPOL_ID.test(opts.buyerEndpoint.trim())) errors.push("Peppol-id skrivs 0007:5591234567 (schema:id).");
  else if (!buyerEndpoint(doc, opts)) errors.push("Köparen saknar Peppol-id och organisationsnummer; lägg in Peppol-id på kunden.");
  if (!doc.buyer.city) errors.push("Köparens adress saknar ort.");
  if (!doc.buyer.countryCode) errors.push("Köparens adress saknar land.");
  if (doc.lines.length === 0) errors.push("Fakturan måste ha minst en rad.");
  if (doc.kind === "correction" && !doc.references.precedingInvoiceNumber) errors.push("En ändringsfaktura måste hänvisa till fakturan den ersätter.");
  if (doc.kind === "credit") {
    if (!doc.references.precedingInvoiceNumber) errors.push("En kreditfaktura måste hänvisa till fakturan den krediterar.");
    // BR-CO-25: a positive amount due needs a due date or payment terms; a credit note has no due date.
    if (!doc.paymentMeans.termsText) errors.push("Kreditfakturan saknar betalningsvillkor, som Peppol kräver.");
  } else if (!doc.paymentMeans.bankgiro && !doc.paymentMeans.plusgiro && !doc.paymentMeans.iban) {
    errors.push("Ange bankgiro, plusgiro eller IBAN; Swish kan inte anges i Peppol.");
  }
  return errors;
}

export function peppolFileName(doc: Pick<InvoiceDocument, "kind" | "number">): string {
  const number = (doc.number ?? "utkast").replace(/[^A-Za-z0-9-]+/g, "-");
  return `${doc.kind === "credit" ? "kreditfaktura" : doc.kind === "correction" ? "andringsfaktura" : "faktura"}-${number}-peppol.xml`;
}

const TAX_EXEMPTION: Record<InvoiceLine["vatCategory"], { code?: string; reason: string } | null> = {
  S: null,
  AE: { code: "VATEX-EU-AE", reason: "Omvänd betalningsskyldighet" },
  E: { reason: "Undantagen från moms" },
};

/** Ends a sentence with a period unless it already has closing punctuation. */
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

export function renderPeppolInvoice(doc: InvoiceDocument, opts: PeppolOptions = {}): string {
  const credit = doc.kind === "credit";
  const totals = invoiceTotals(doc);
  const cur = doc.currency;
  const out: string[] = [];
  let depth = 0;
  const pad = () => "  ".repeat(depth);
  const open = (tag: string) => {
    out.push(`${pad()}<${tag}>`);
    depth++;
  };
  const close = (tag: string) => {
    depth--;
    out.push(`${pad()}</${tag}>`);
  };
  const el = (tag: string, value: string, attrs = "") => {
    if (value.trim() !== "") out.push(`${pad()}<${tag}${attrs}>${esc(value)}</${tag}>`);
  };
  const amount = (tag: string, ore: Ore) => el(tag, ublAmount(Math.abs(ore)), ` currencyID="${cur}"`);
  const taxCategory = (tag: string, category: InvoiceLine["vatCategory"], rate: number, withReason: boolean) => {
    open(tag);
    el("cbc:ID", category);
    el("cbc:Percent", String(category === "S" ? rate : 0));
    const exemption = withReason ? TAX_EXEMPTION[category] : null;
    if (exemption?.code) el("cbc:TaxExemptionReasonCode", exemption.code);
    if (exemption) el("cbc:TaxExemptionReason", exemption.reason);
    open("cac:TaxScheme");
    el("cbc:ID", "VAT");
    close("cac:TaxScheme");
    close(tag);
  };
  const address = (p: InvoiceDocument["seller"] | InvoiceDocument["buyer"]) => {
    open("cac:PostalAddress");
    el("cbc:StreetName", p.street);
    el("cbc:CityName", p.city);
    el("cbc:PostalZone", p.postalCode);
    open("cac:Country");
    el("cbc:IdentificationCode", p.countryCode);
    close("cac:Country");
    close("cac:PostalAddress");
  };
  const taxScheme = (companyId: string, scheme: "VAT" | "TAX") => {
    open("cac:PartyTaxScheme");
    el("cbc:CompanyID", companyId);
    open("cac:TaxScheme");
    el("cbc:ID", scheme);
    close("cac:TaxScheme");
    close("cac:PartyTaxScheme");
  };
  const contact = (fields: [string, string][]) => {
    if (!fields.some(([, v]) => present(v))) return;
    open("cac:Contact");
    for (const [tag, v] of fields) el(tag, v);
    close("cac:Contact");
  };

  // ROT text: the deduction is the seller's claim on Skatteverket; the buyer pays the rest.
  const rot = totals.rot && totals.rot.deduction !== 0 ? totals.rot : null;
  const rotAmount = rot ? formatOre(Math.abs(rot.deduction)) : "";
  const afterRot = rot ? formatKronor(Math.abs(totals.payable)) : "";

  // Peppol allows one invoice note (BT-22); a change invoice's text comes first in it.
  const notes = [
    doc.correctionNote ?? "",
    doc.note,
    doc.se.reverseCharge ? "Omvänd betalningsskyldighet" : "",
    rot ? `ROT-avdrag ${rotAmount} kr begärs av säljaren hos Skatteverket. Att betala efter ROT-avdrag: ${afterRot}.` : "",
    doc.se.lateInterestText,
  ].filter(present);

  const root = credit ? "CreditNote" : "Invoice";
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(`<${root} xmlns="${credit ? NS.credit : NS.invoice}" xmlns:cac="${NS.cac}" xmlns:cbc="${NS.cbc}">`);
  depth = 1;
  el("cbc:CustomizationID", PEPPOL_CUSTOMIZATION_ID);
  el("cbc:ProfileID", PEPPOL_PROFILE_ID);
  el("cbc:ID", doc.number ?? "UTKAST");
  el("cbc:IssueDate", doc.issueDate);
  if (!credit) el("cbc:DueDate", doc.dueDate);
  el(credit ? "cbc:CreditNoteTypeCode" : "cbc:InvoiceTypeCode", INVOICE_TYPE_CODE[doc.kind]);
  if (notes.length) el("cbc:Note", notes.map((n) => n.trim()).join("\n"));
  el("cbc:DocumentCurrencyCode", cur);
  el("cbc:BuyerReference", present(doc.buyer.reference) ? doc.buyer.reference : present(doc.buyer.name) ? doc.buyer.name : "-");
  if (doc.period) {
    open("cac:InvoicePeriod");
    el("cbc:StartDate", doc.period.start);
    el("cbc:EndDate", doc.period.end);
    close("cac:InvoicePeriod");
  }
  if (present(doc.references.orderReference ?? "")) {
    open("cac:OrderReference");
    el("cbc:ID", doc.references.orderReference ?? "");
    close("cac:OrderReference");
  }
  // BG-3 preceding invoice: the invoice a credit note credits or a change invoice (384) corrects.
  if ((credit || doc.kind === "correction") && present(doc.references.precedingInvoiceNumber)) {
    open("cac:BillingReference");
    open("cac:InvoiceDocumentReference");
    el("cbc:ID", doc.references.precedingInvoiceNumber);
    close("cac:InvoiceDocumentReference");
    close("cac:BillingReference");
  }

  // BG-4 seller
  const seller = doc.seller;
  const sellerOrg = digits(seller.orgNr);
  open("cac:AccountingSupplierParty");
  open("cac:Party");
  el("cbc:EndpointID", sellerOrg, ' schemeID="0007"');
  open("cac:PartyName");
  el("cbc:Name", seller.name);
  close("cac:PartyName");
  address(seller);
  if (present(seller.vatNr)) taxScheme(seller.vatNr, "VAT");
  if (seller.fSkatt) taxScheme("Godkänd för F-skatt", "TAX");
  open("cac:PartyLegalEntity");
  el("cbc:RegistrationName", seller.name);
  el("cbc:CompanyID", sellerOrg);
  if (seller.fSkatt) el("cbc:CompanyLegalForm", "Godkänd för F-skatt");
  close("cac:PartyLegalEntity");
  contact([
    ["cbc:Name", doc.references.ourReference],
    ["cbc:Telephone", seller.phone],
    ["cbc:ElectronicMail", seller.email],
  ]);
  close("cac:Party");
  close("cac:AccountingSupplierParty");

  // BG-7 buyer
  const buyer = doc.buyer;
  const buyerOrg = digits(buyer.orgNr);
  const endpoint = buyerEndpoint(doc, opts);
  open("cac:AccountingCustomerParty");
  open("cac:Party");
  if (endpoint) el("cbc:EndpointID", endpoint.id, ` schemeID="${esc(endpoint.scheme)}"`);
  open("cac:PartyName");
  el("cbc:Name", buyer.name);
  close("cac:PartyName");
  address(buyer);
  if (present(buyer.vatNr)) taxScheme(buyer.vatNr, "VAT");
  open("cac:PartyLegalEntity");
  el("cbc:RegistrationName", buyer.name);
  el("cbc:CompanyID", buyerOrg);
  close("cac:PartyLegalEntity");
  contact([
    ["cbc:Telephone", buyer.phone],
    ["cbc:ElectronicMail", buyer.email],
  ]);
  close("cac:Party");
  close("cac:AccountingCustomerParty");

  if (doc.deliveryDate) {
    open("cac:Delivery");
    el("cbc:ActualDeliveryDate", doc.deliveryDate);
    close("cac:Delivery");
  }

  // BG-16 payment instructions, one PaymentMeans per account.
  const pm = doc.paymentMeans;
  const accounts: { id: string; branch: string }[] = [];
  if (present(pm.bankgiro)) accounts.push({ id: digits(pm.bankgiro), branch: "SE:BANKGIRO" });
  if (present(pm.plusgiro)) accounts.push({ id: digits(pm.plusgiro), branch: "SE:PLUSGIRO" });
  if (present(pm.iban)) accounts.push({ id: pm.iban.replace(/\s/g, "").toUpperCase(), branch: pm.bic.replace(/\s/g, "").toUpperCase() });
  for (const account of accounts) {
    open("cac:PaymentMeans");
    el("cbc:PaymentMeansCode", "30");
    // The OCR number under an OCR agreement, otherwise the invoice number.
    const reference = paymentReference(doc).value;
    if (reference) el("cbc:PaymentID", reference);
    open("cac:PayeeFinancialAccount");
    el("cbc:ID", account.id);
    if (account.branch) {
      open("cac:FinancialInstitutionBranch");
      el("cbc:ID", account.branch);
      close("cac:FinancialInstitutionBranch");
    }
    close("cac:PayeeFinancialAccount");
    close("cac:PaymentMeans");
  }

  // BT-20. Plain terms are written as printed; with ROT the amount to pay follows as its own sentence.
  const rotTerms = rot ? `Att betala efter ROT-avdrag: ${afterRot} (ROT-avdrag ${rotAmount} kr).` : "";
  const terms = present(pm.termsText) ? (rot ? `${sentence(pm.termsText)} ${rotTerms}` : pm.termsText.trim()) : rotTerms;
  if (terms) {
    open("cac:PaymentTerms");
    el("cbc:Note", terms);
    close("cac:PaymentTerms");
  }

  // BG-23 VAT breakdown
  open("cac:TaxTotal");
  amount("cbc:TaxAmount", totals.vat);
  for (const row of totals.vatBreakdown) {
    open("cac:TaxSubtotal");
    amount("cbc:TaxableAmount", row.taxable);
    amount("cbc:TaxAmount", row.vat);
    taxCategory("cac:TaxCategory", row.category, row.rate, true);
    close("cac:TaxSubtotal");
  }
  close("cac:TaxTotal");

  // BG-22 document totals. Rounding is that of the gross, see the header.
  const gross = Math.abs(totals.gross);
  const rounding = roundToKronor(gross) - gross;
  open("cac:LegalMonetaryTotal");
  amount("cbc:LineExtensionAmount", totals.net);
  amount("cbc:TaxExclusiveAmount", totals.net);
  amount("cbc:TaxInclusiveAmount", gross);
  if (rounding !== 0) el("cbc:PayableRoundingAmount", ublAmount(rounding), ` currencyID="${cur}"`);
  amount("cbc:PayableAmount", gross + rounding);
  close("cac:LegalMonetaryTotal");

  // BG-25 lines
  const lineTag = credit ? "cac:CreditNoteLine" : "cac:InvoiceLine";
  for (const line of doc.lines) {
    const t = totals.lines[line.id];
    open(lineTag);
    el("cbc:ID", line.id);
    el(credit ? "cbc:CreditedQuantity" : "cbc:InvoicedQuantity", ublQuantity(line.quantity), ` unitCode="${unitCode(line.unit)}"`);
    amount("cbc:LineExtensionAmount", t.net);
    open("cac:Item");
    el("cbc:Name", line.description);
    taxCategory("cac:ClassifiedTaxCategory", line.vatCategory, line.vatRate, false);
    close("cac:Item");
    open("cac:Price");
    amount("cbc:PriceAmount", line.unitPriceOre);
    close("cac:Price");
    close(lineTag);
  }

  out.push(`</${root}>`);
  return out.join("\n") + "\n";
}
