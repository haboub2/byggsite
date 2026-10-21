import { Document, Font, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { formatOre } from "../core/money";
import { rulesAt } from "../core/rules";
import type { InvoiceDocument } from "../core/documents/invoice";
import { customerSummary, invoiceTotals, type InvoiceTotals } from "../core/invoices/totals";
import { maskPersonalNumber } from "../core/rot/pnr";
import { JAKARTA_BOLD, JAKARTA_ITALIC, JAKARTA_MEDIUM, JAKARTA_REGULAR } from "./fonts";

/**
 * The invoice as an A4 PDF, rendered from the frozen EN 16931 document so it
 * can never say something the e-invoice or the ledger does not.
 *
 * The layout is the classic Swedish invoice form every accountant knows from
 * Fortnox and Visma: the seller's name or logo, "Faktura" with number and
 * date, the invoice address in the window-envelope spot, two columns of
 * terms (empty fields are printed too, so every invoice has the same shape),
 * the line table filling the page down to the totals box, and a four-column
 * footer with address, contact, payment accounts and registration. Plus
 * Jakarta Sans in the quote's ink, thin grey rules, no filled areas: it
 * prints well in black and white.
 *
 * Lines that do not fit continue on the next page under the same header
 * ("Sida n(m)"); the totals box is on the last page only. Content follows
 * momslagen's list (docs/fakturering.md, grundkrav 4): org nr, VAT nr,
 * F-skatt, due date, bankgiro and OCR, the reverse-charge sentence, and the
 * ROT block with buyer and property (the personal number masked).
 *
 * The seller is the document's frozen seller, so an old invoice never
 * changes; only the logo comes from the organisation's current profile.
 * The same react-pdf quirks as the quote apply (lib/pdf/QuotePdf.tsx): line
 * height is set on Text only and always with a font size, and the running
 * header sits in the flow, since images are left out of absolutely
 * positioned fixed elements.
 */

Font.register({
  family: "Jakarta",
  fonts: [
    { src: JAKARTA_REGULAR, fontWeight: 400 },
    { src: JAKARTA_ITALIC, fontWeight: 400, fontStyle: "italic" },
    { src: JAKARTA_MEDIUM, fontWeight: 500 },
    { src: JAKARTA_BOLD, fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const INK = "#1e2c37";
const INK2 = "#4b5763";
const RULE = "#9aa1a8";
const X = 40;
// The middle column (heading, invoice address, right-hand terms) starts here,
// over a Swedish window envelope's address field.
const MID = 270;
const FOOT_H = 64;
const NO_LIGATURES = { liga: false, clig: false };

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 38 + FOOT_H, paddingHorizontal: X, fontFamily: "Jakarta", fontFeatureSettings: NO_LIGATURES, fontSize: 8.5, color: INK },

  head: { flexDirection: "row", alignItems: "flex-start", minHeight: 58 },
  headLeft: { width: MID, paddingRight: 16, paddingTop: 8 },
  logo: { width: 150, height: 40, objectFit: "contain", objectPosition: "left top" },
  name: { fontSize: 16, lineHeight: 1.15, fontWeight: 700, letterSpacing: -0.3 },
  headMid: { flex: 1, paddingTop: 8 },
  title: { fontSize: 19, lineHeight: 1.1, fontWeight: 700, letterSpacing: -0.4 },
  headRight: { width: 110, alignItems: "flex-end", paddingTop: 22 },
  pageNo: { position: "absolute", top: 22, right: X, width: 110, fontSize: 7.5, lineHeight: 1.2, textAlign: "right" },
  inline: { flexDirection: "row", gap: 10, marginTop: 3 },

  label: { fontSize: 7.5, lineHeight: 1.35, color: INK2 },
  value: { fontSize: 8, lineHeight: 1.35, fontWeight: 500 },
  strong: { fontSize: 8, lineHeight: 1.35, fontWeight: 700 },

  address: { marginLeft: MID - X, marginTop: 30, minHeight: 64 },
  addressName: { fontSize: 9.5, lineHeight: 1.4, fontWeight: 700 },
  addressLine: { fontSize: 9.5, lineHeight: 1.4 },

  terms: { flexDirection: "row", marginTop: 22 },
  termsCol: { width: MID - X, paddingRight: 16 },
  termsColRight: { flex: 1 },
  kv: { flexDirection: "row" },
  kvK: { width: 92, fontSize: 7.5, lineHeight: 1.45, color: INK2 },
  kvV: { flex: 1, fontSize: 7.5, lineHeight: 1.45, fontWeight: 500 },

  intro: { marginTop: 14 },
  introTitle: { fontSize: 9.5, lineHeight: 1.35, fontWeight: 700 },
  introNote: { fontSize: 8, lineHeight: 1.45, color: INK2 },

  th: { flexDirection: "row", marginTop: 14, paddingVertical: 4, borderTopWidth: 0.7, borderTopColor: INK, borderBottomWidth: 0.7, borderBottomColor: INK },
  thText: { fontSize: 7.5, lineHeight: 1.2, fontWeight: 700 },
  rows: { flexGrow: 1, paddingTop: 4 },
  section: { fontSize: 8, lineHeight: 1.3, fontWeight: 700, paddingTop: 6, paddingBottom: 1, paddingLeft: 52 },
  tr: { flexDirection: "row", paddingVertical: 2.5, alignItems: "flex-start" },
  cell: { fontSize: 8, lineHeight: 1.35 },
  cArt: { width: 52 },
  cDesc: { flex: 1, paddingRight: 10 },
  cQty: { width: 50, textAlign: "right" },
  cUnit: { width: 36, paddingLeft: 5 },
  cPrice: { width: 72, textAlign: "right" },
  cSum: { width: 78, textAlign: "right" },

  sum: { marginTop: 10, borderTopWidth: 0.9, borderTopColor: INK },
  sumRow: { flexDirection: "row", alignItems: "flex-start", paddingTop: 5, paddingBottom: 5, borderBottomWidth: 0.7, borderBottomColor: INK },
  sumCols: { flex: 1, flexDirection: "row" },
  sumCol: { flex: 1, paddingRight: 6 },
  sumK: { fontSize: 7.5, lineHeight: 1.35, fontWeight: 700 },
  sumV: { fontSize: 8.5, lineHeight: 1.5 },
  due: { width: 150, alignItems: "flex-end" },
  dueK: { fontSize: 8, lineHeight: 1.35, fontWeight: 700 },
  dueRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: 2 },
  dueCur: { fontSize: 10, lineHeight: 1.3, fontWeight: 700 },
  dueV: { fontSize: 16, lineHeight: 1.15, fontWeight: 700, letterSpacing: -0.3 },
  below: { flexDirection: "row", gap: 16, paddingTop: 4 },
  belowText: { flex: 1 },
  small: { fontSize: 7, lineHeight: 1.45, color: INK2 },
  smallStrong: { fontSize: 7, lineHeight: 1.45, fontWeight: 700 },
  pay: { fontSize: 9, lineHeight: 1.4, fontWeight: 700, marginTop: 3 },
  qr: { width: 62, height: 62 },

  foot: { position: "absolute", bottom: 26, left: X, right: X, height: FOOT_H, flexDirection: "row", paddingTop: 6, borderTopWidth: 0.7, borderTopColor: RULE },
  footCol: { flex: 1, paddingRight: 8 },
  footK: { fontSize: 6.5, lineHeight: 1.3, fontWeight: 700 },
  footV: { fontSize: 7, lineHeight: 1.35, marginBottom: 2 },
});

const clean = (t: string) => t.replace(/(\d)[  ]+(%|kr\b|SEK\b|m²|tim\b|dagar\b)/g, "$1 $2");
const money = (ore: number) => formatOre(ore).replace(/−/g, "-");
const qty = (n: number) => n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, " ");
const postal = (p: { postalCode: string; city: string }) => [p.postalCode, p.city].filter(Boolean).join(" ");

/** The late-interest clause as a value in the terms column: "Enligt räntelagen, referensränta + 8 %". */
export function lateInterestValue(text: string): string {
  const v = text
    .trim()
    .replace(/^dröjsmålsränta\s*/i, "")
    .replace(/referensräntan plus (\d+(?:,\d+)?) procentenheter/i, "referensränta + $1 %")
    .replace(/\.$/, "");
  return v ? v[0].toUpperCase() + v.slice(1) : "Enligt räntelagen";
}

function Field({ k, v, strong = false }: { k: string; v?: string | null; strong?: boolean }) {
  return (
    <View style={s.kv}>
      <Text style={s.kvK}>{k}</Text>
      <Text style={[s.kvV, strong ? { fontWeight: 700 } : {}]}>{clean(v || " ")}</Text>
    </View>
  );
}

function FootField({ k, children }: { k: string; children: ReactNode }) {
  return (
    <>
      <Text style={s.footK}>{k}</Text>
      <Text style={s.footV}>{children}</Text>
    </>
  );
}

export type InvoicePdfProps = {
  document: InvoiceDocument;
  totals?: InvoiceTotals;
  /** Shown as "Vår referens" when the document has no ourReference. */
  signer: string;
  customerNumber?: string | null;
  /** PNG from Swish's QR service, when the invoice is open and has a Swish number. */
  swishQr?: Buffer | null;
  /** The organisation's logo as a data URI; null prints the seller's name. */
  logo?: string | null;
};

export function InvoicePdf({ document: doc, totals = invoiceTotals(doc), signer, customerNumber, swishQr = null, logo = null }: InvoicePdfProps) {
  const sum = customerSummary(doc, totals);
  const rules = rulesAt(doc.issueDate);
  const isCredit = doc.kind === "credit";
  const title = isCredit ? "Kreditfaktura" : "Faktura";
  const inclVat = sum.inclVat;
  const seller = doc.seller;
  const buyer = doc.buyer;
  const pm = doc.paymentMeans;
  const refs = doc.references;
  const sections = [...new Set(doc.lines.map((l) => l.section.trim()))];
  const grouped = sections.length > 1 || (sections.length === 1 && sections[0] !== "");
  const ocr = pm.ocr ?? doc.number ?? "";
  const rot = totals.rot && doc.se.rot ? { totals: totals.rot, data: doc.se.rot } : null;

  // "Betalas till bankgiro 5555-1234, ange OCR 1000775": the account the
  // customer is most likely to use first, then the others in the footer.
  const account = pm.bankgiro ? `bankgiro ${pm.bankgiro}` : pm.plusgiro ? `plusgiro ${pm.plusgiro}` : pm.iban ? `IBAN ${pm.iban}${pm.bic ? ` (BIC ${pm.bic})` : ""}` : pm.swish ? `Swish ${pm.swish}` : "";
  const payLine = account ? `Betalas till ${account}, ange OCR ${ocr}` : `Ange OCR ${ocr} vid betalning`;

  const ourOrder = refs.quoteNumber ? `Offert ${refs.quoteNumber}${refs.planStep ? `, steg ${refs.planStep.step} av ${refs.planStep.of}` : ""}` : "";
  const delivery = doc.period ? `${doc.period.start} – ${doc.period.end}` : (doc.deliveryDate ?? "");

  const columns: { k: string; v: number }[] = [
    { k: "Netto", v: totals.net },
    { k: "Exkl. moms", v: totals.net },
    { k: "Moms", v: totals.vat },
    ...(rot ? [{ k: "Inkl. moms", v: totals.gross }, { k: "ROT-avdrag", v: -rot.totals.deduction }] : []),
    { k: "Öresavr", v: totals.rounding },
  ];

  return (
    <Document title={`${title} ${doc.number ?? "utkast"}`} author={seller.name} subject={doc.title} language="sv">
      <Page size="A4" style={s.page}>
        <View style={s.head} fixed>
          <View style={s.headLeft}>
            {logo ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt
              <Image src={logo} style={s.logo} />
            ) : (
              <Text style={s.name}>{clean(seller.name)}</Text>
            )}
          </View>
          <View style={s.headMid}>
            <Text style={s.title}>{title}</Text>
            <View style={s.inline}>
              <Text style={s.label}>{isCredit ? "Kreditfakturanr" : "Fakturanr"}</Text>
              <Text style={s.strong}>{doc.number ?? "UTKAST"}</Text>
            </View>
            {isCredit && refs.precedingInvoiceNumber ? <Text style={s.value}>Krediterar faktura {refs.precedingInvoiceNumber}</Text> : null}
          </View>
          <View style={s.headRight}>
            <Text style={s.label}>Fakturadatum</Text>
            <Text style={s.strong}>{doc.issueDate}</Text>
          </View>
        </View>
        {/* Absolutely positioned: a page number inside the header row is never filled in. */}
        <Text style={s.pageNo} fixed render={({ pageNumber, totalPages }) => `Sida ${pageNumber}(${totalPages})`} />

        <View style={s.address}>
          <Text style={s.label}>Fakturaadress</Text>
          <Text style={s.addressName}>{clean(buyer.name)}</Text>
          {buyer.street ? <Text style={s.addressLine}>{clean(buyer.street)}</Text> : null}
          {postal(buyer) ? <Text style={s.addressLine}>{clean(postal(buyer))}</Text> : null}
        </View>

        <View style={s.terms}>
          <View style={s.termsCol}>
            <Field k="Kundnr" v={customerNumber} strong />
            <Field k="Er referens" v={buyer.reference} />
            <Field k="Ert ordernr" />
            <Field k="Leveransvillkor" />
            <Field k="Leveranssätt" />
            <Field k="Ert VAT-nummer" v={buyer.vatNr} />
          </View>
          <View style={s.termsColRight}>
            <Field k="Vår referens" v={refs.ourReference || signer} />
            <Field k="Betalningsvillkor" v={pm.termsText || `${pm.termsDays} dagar netto`} />
            <Field k="Förfallodatum" v={isCredit ? "" : doc.dueDate} strong />
            <Field k="Dröjsmålsränta" v={lateInterestValue(doc.se.lateInterestText)} />
            <Field k="Leveransdatum" v={delivery} />
            <Field k="Vårt ordernr" v={ourOrder} />
          </View>
        </View>

        {doc.title || doc.note ? (
          <View style={s.intro}>
            {doc.title ? <Text style={s.introTitle}>{clean(doc.title)}</Text> : null}
            {doc.note
              ? doc.note.split("\n").map((line, i) => (
                  <Text key={i} style={s.introNote}>
                    {clean(line) || " "}
                  </Text>
                ))
              : null}
          </View>
        ) : null}

        <View style={s.th} fixed>
          <Text style={[s.cArt, s.thText]}>Artnr</Text>
          <Text style={[s.cDesc, s.thText]}>Benämning</Text>
          <Text style={[s.cQty, s.thText]}>Lev ant</Text>
          <Text style={[s.cUnit, s.thText]}>Enhet</Text>
          <Text style={[s.cPrice, s.thText]}>{inclVat ? "À-pris inkl." : "À-pris"}</Text>
          <Text style={[s.cSum, s.thText]}>{inclVat ? "Summa inkl." : "Summa"}</Text>
        </View>

        {/* Grows to push the totals to the bottom of the last page, so every invoice has the same shape. */}
        <View style={s.rows}>
          {(grouped ? sections : [""]).map((section) => (
            <View key={section || "_"}>
              {grouped ? <Text style={s.section}>{clean(section || "Övrigt")}</Text> : null}
              {doc.lines
                .filter((l) => !grouped || l.section.trim() === section)
                .map((line) => {
                  const t = totals.lines[line.id];
                  const unitGross = line.quantity ? Math.round(t.gross / line.quantity) : 0;
                  const unit = inclVat ? unitGross : line.unitPriceOre;
                  return (
                    <View key={line.id} style={s.tr} wrap={false}>
                      <Text style={[s.cArt, s.cell]}> </Text>
                      <Text style={[s.cDesc, s.cell]}>{clean(line.description)}</Text>
                      <Text style={[s.cQty, s.cell]}>{qty(line.quantity)}</Text>
                      <Text style={[s.cUnit, s.cell]}>{line.unit}</Text>
                      <Text style={[s.cPrice, s.cell]}>{money(isCredit ? -Math.abs(unit) : unit)}</Text>
                      <Text style={[s.cSum, s.cell]}>{money(inclVat ? t.gross : t.net)}</Text>
                    </View>
                  );
                })}
            </View>
          ))}
        </View>

        <View style={s.sum} wrap={false}>
          <View style={s.sumRow}>
            <View style={s.sumCols}>
              {columns.map((c) => (
                <View key={c.k} style={s.sumCol}>
                  <Text style={s.sumK}>{c.k}</Text>
                  <Text style={s.sumV}>{money(c.v)}</Text>
                </View>
              ))}
            </View>
            <View style={s.due}>
              <Text style={s.dueK}>ATT BETALA</Text>
              <View style={s.dueRow}>
                <Text style={s.dueCur}>SEK</Text>
                <Text style={s.dueV}>{money(sum.payable)}</Text>
              </View>
            </View>
          </View>

          <View style={s.below}>
            <View style={s.belowText}>
              {totals.vatBreakdown.map((row) => (
                <Text key={`${row.category}${row.rate}`} style={s.smallStrong}>
                  {clean(
                    row.category === "S"
                      ? `Moms ${row.rate} % ${money(row.vat)} (${money(row.taxable)})`
                      : row.category === "AE"
                        ? `Omvänd moms 0,00 (${money(row.taxable)})`
                        : `Momsfritt 0,00 (${money(row.taxable)})`
                  )}
                </Text>
              ))}
              {doc.se.reverseCharge ? (
                <Text style={s.small}>
                  {rules.reverseCharge.text} för byggtjänster gäller. Köparen redovisar momsen (1 kap. 2 § första stycket 4 b mervärdesskattelagen).
                  {buyer.vatNr ? ` Köparens momsreg.nr ${buyer.vatNr}.` : ""}
                </Text>
              ) : null}
              {rot ? (
                <>
                  <Text style={s.small}>
                    {clean(
                      `ROT-avdrag ${money(Math.abs(rot.totals.deduction))} kr: ${Math.round(rot.totals.rate * 100)} % av arbetskostnaden ${money(Math.abs(rot.totals.laborGross))} kr inkl. moms${rot.totals.capped ? ", begränsat av årets utrymme" : ""}. ${
                        isCredit
                          ? `${seller.name} återför avdraget till Skatteverket.`
                          : `Avdraget förutsätter Skatteverkets godkännande; ${seller.name} begär det när fakturan är betald. Medges det inte, eller bara delvis, ska mellanskillnaden betalas.`
                      }`
                    )}
                  </Text>
                  <Text style={s.small}>
                    {clean(
                      [
                        ...rot.data.buyers.map(
                          (b, i) =>
                            `Köpare ${b.name}, ${maskPersonalNumber(b.personalNumber, doc.issueDate)}${rot.data.buyers.length > 1 ? ` (${money(Math.abs(rot.totals.perBuyer[i] ?? 0))} kr)` : ""}`
                        ),
                        rot.data.property
                          ? rot.data.property.kind === "fastighet"
                            ? `Fastighet ${rot.data.property.designation}`
                            : `Bostadsrättsförening ${rot.data.property.orgNr}, lägenhet ${rot.data.property.apartmentNumber}`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    )}
                  </Text>
                </>
              ) : null}
              {isCredit ? (
                <Text style={s.pay}>{refs.precedingInvoiceNumber ? `Krediterar faktura ${refs.precedingInvoiceNumber}. ` : ""}Beloppet regleras mot er nästa betalning eller betalas tillbaka.</Text>
              ) : (
                <>
                  <Text style={s.pay}>
                    {payLine}, senast {doc.dueDate}
                  </Text>
                  {pm.swish && account !== `Swish ${pm.swish}` ? (
                    <Text style={s.small}>
                      Eller Swish till {pm.swish} med {ocr} som meddelande{swishQr ? ": skanna koden" : ""}.
                    </Text>
                  ) : null}
                </>
              )}
            </View>
            {swishQr && !isCredit ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt
              <Image src={{ data: swishQr, format: "png" }} style={s.qr} />
            ) : null}
          </View>
        </View>

        <View style={s.foot} fixed>
          <View style={[s.footCol, { flex: 1.15 }]}>
            <Text style={s.footK}>Adress</Text>
            <Text style={s.footV}>{clean([seller.name, seller.street, postal(seller), "Sverige"].filter(Boolean).join("\n"))}</Text>
          </View>
          <View style={s.footCol}>
            <FootField k="Telefon">{seller.phone || " "}</FootField>
            <FootField k="E-post">{seller.email || " "}</FootField>
          </View>
          <View style={s.footCol}>
            {pm.bankgiro ? <FootField k="Bankgiro">{pm.bankgiro}</FootField> : null}
            {pm.plusgiro ? <FootField k="Plusgiro">{pm.plusgiro}</FootField> : null}
            {pm.swish ? <FootField k="Swish">{pm.swish}</FootField> : null}
            {pm.iban ? <FootField k={pm.bic ? `IBAN / BIC ${pm.bic}` : "IBAN"}>{pm.iban}</FootField> : null}
            <FootField k="Säte">{seller.city || " "}</FootField>
          </View>
          <View style={[s.footCol, { paddingRight: 0 }]}>
            <FootField k="Organisationsnr">{seller.orgNr || " "}</FootField>
            <FootField k="Momsreg.nr">{seller.vatNr || " "}</FootField>
            {seller.fSkatt ? <Text style={s.footK}>Godkänd för F-skatt</Text> : null}
          </View>
        </View>
      </Page>
    </Document>
  );
}
