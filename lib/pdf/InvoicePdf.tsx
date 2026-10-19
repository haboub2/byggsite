import { Document, Font, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import { formatOre } from "../core/money";
import { rulesAt } from "../core/rules";
import { CUSTOMER_TYPE_LABEL, INVOICE_TYPE_CODE, LINE_KIND_LABEL, type InvoiceDocument } from "../core/documents/invoice";
import { customerSummary, invoiceTotals, type InvoiceTotals } from "../core/invoices/totals";
import { LOGO_DATA_URI } from "./logo";
import { JAKARTA_BOLD, JAKARTA_ITALIC, JAKARTA_MEDIUM, JAKARTA_REGULAR } from "./fonts";

/**
 * The invoice as an A4 PDF, rendered from the frozen EN 16931 document so it
 * can never say something the e-invoice or the ledger does not. Same look as
 * the quote (Plus Jakarta Sans, anthracite, one orange accent). One page for
 * the common case; the line table wraps onto more pages when needed and the
 * payment box repeats at the end.
 *
 * Content follows momslagen's list (docs/fakturering.md, grundkrav 4) and
 * Swedish practice: due date, org nr, F-skatt, bankgiro and OCR, the
 * reverse-charge sentence, and the ROT block with buyer and property.
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
const INK3 = "#6b7680";
const ORANGE = "#f7802e";
const LINE = "#e3e0d9";
const PAPER = "#f6f4ef";
const X = 46;
const NO_LIGATURES = { liga: false, clig: false };

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 70, paddingHorizontal: X, fontFamily: "Jakarta", fontFeatureSettings: NO_LIGATURES, fontSize: 9.5, color: INK },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  logo: { width: 86, height: 28, objectFit: "contain", objectPosition: "left top" },
  headAddr: { fontSize: 8, lineHeight: 1.45, color: INK3, marginTop: 6 },
  title: { fontSize: 24, lineHeight: 1.1, fontWeight: 700, letterSpacing: -0.6, textAlign: "right" },
  number: { fontSize: 12, lineHeight: 1.3, fontWeight: 700, textAlign: "right", marginTop: 2 },
  credit: { fontSize: 8, lineHeight: 1.3, color: ORANGE, fontWeight: 700, textAlign: "right", marginTop: 2, letterSpacing: 1 },

  meta: { flexDirection: "row", gap: 18, paddingVertical: 12, borderTopWidth: 1, borderTopColor: INK, borderBottomWidth: 0.6, borderBottomColor: LINE },
  metaCol: { flex: 1 },
  label: { fontSize: 7, lineHeight: 1.3, letterSpacing: 1.4, textTransform: "uppercase", color: INK3, marginBottom: 3 },
  v: { fontSize: 9.5, lineHeight: 1.4 },
  vBold: { fontSize: 9.5, lineHeight: 1.4, fontWeight: 700 },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  kvK: { fontSize: 9, lineHeight: 1.45, color: INK3 },
  kvV: { fontSize: 9, lineHeight: 1.45 },

  h1: { fontSize: 13, lineHeight: 1.25, fontWeight: 700, marginTop: 18, letterSpacing: -0.2 },
  note: { fontSize: 9.5, lineHeight: 1.5, color: INK2, marginTop: 4 },

  th: { flexDirection: "row", marginTop: 16, paddingBottom: 5, borderBottomWidth: 0.8, borderBottomColor: INK },
  thText: { fontSize: 7, lineHeight: 1.2, letterSpacing: 1.2, textTransform: "uppercase", color: INK3 },
  section: { fontSize: 8.5, lineHeight: 1.3, fontWeight: 700, color: INK2, paddingTop: 8, paddingBottom: 2 },
  tr: { flexDirection: "row", paddingVertical: 5.5, borderBottomWidth: 0.5, borderBottomColor: LINE, alignItems: "flex-start" },
  cDesc: { flex: 1, paddingRight: 10 },
  cKind: { width: 50 },
  cQty: { width: 52, textAlign: "right" },
  cPrice: { width: 74, textAlign: "right" },
  cVat: { width: 40, textAlign: "right" },
  cSum: { width: 80, textAlign: "right" },
  cell: { fontSize: 9, lineHeight: 1.35 },
  cellMuted: { fontSize: 8.5, lineHeight: 1.35, color: INK3 },

  below: { flexDirection: "row", gap: 24, marginTop: 16, alignItems: "flex-start" },
  belowLeft: { flex: 1, gap: 10 },
  box: { borderWidth: 0.6, borderColor: LINE, borderRadius: 4, padding: 10 },
  boxTitle: { fontSize: 7, lineHeight: 1.3, letterSpacing: 1.4, textTransform: "uppercase", color: INK3, marginBottom: 4 },
  boxText: { fontSize: 8.5, lineHeight: 1.5, color: INK2 },
  sum: { width: 250 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, gap: 10 },
  sumK: { fontSize: 9.5, lineHeight: 1.3, color: INK2 },
  sumV: { fontSize: 9.5, lineHeight: 1.3 },
  sumSmall: { fontSize: 8, lineHeight: 1.3, color: INK3 },
  sumRule: { borderTopWidth: 0.6, borderTopColor: LINE, marginTop: 2, paddingTop: 2 },
  sumTotal: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderTopWidth: 1.5, borderTopColor: INK, marginTop: 6, paddingTop: 7 },
  sumTotalK: { fontSize: 11, lineHeight: 1.2, fontWeight: 700 },
  sumTotalV: { fontSize: 15, lineHeight: 1.2, fontWeight: 700, letterSpacing: -0.3 },

  pay: { marginTop: 18, backgroundColor: PAPER, borderRadius: 4, padding: 12, flexDirection: "row", gap: 18, alignItems: "center" },
  payCol: { flex: 1 },
  payV: { fontSize: 12, lineHeight: 1.3, fontWeight: 700, marginTop: 2 },
  payNote: { fontSize: 8, lineHeight: 1.45, color: INK2, marginTop: 6 },
  accent: { width: 3, alignSelf: "stretch", backgroundColor: ORANGE, borderRadius: 2 },

  foot: { position: "absolute", bottom: 26, left: X, right: X, flexDirection: "row", justifyContent: "space-between", gap: 16, paddingTop: 8, borderTopWidth: 0.6, borderTopColor: LINE },
  footText: { fontSize: 7.2, lineHeight: 1.35, color: INK3, flex: 1 },
  footPage: { fontSize: 7.2, lineHeight: 1.35, color: INK3 },
});

const clean = (t: string) => t.replace(/(\d)[  ]+(%|kr\b|SEK\b|m²|tim\b|dagar\b)/g, "$1 $2");
const money = (ore: number) => formatOre(ore).replace(/−/g, "-");
const kr = (ore: number) => `${money(ore)} kr`;
const address = (p: { street: string; postalCode: string; city: string }) =>
  [p.street, [p.postalCode, p.city].filter(Boolean).join(" ")].filter(Boolean).join("\n");
const qty = (n: number) => n.toLocaleString("sv-SE", { maximumFractionDigits: 2 }).replace(/ /g, " ");

function Lines({ text, style }: { text: string; style: Style }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <Text key={i} style={style}>
          {clean(line)}
        </Text>
      ))}
    </>
  );
}

export type InvoicePdfProps = {
  document: InvoiceDocument;
  totals?: InvoiceTotals;
  /** Shown as "Vår referens". */
  signer: string;
  customerNumber?: string | null;
};

export function InvoicePdf({ document: doc, totals = invoiceTotals(doc), signer, customerNumber }: InvoicePdfProps) {
  const sum = customerSummary(doc, totals);
  const rules = rulesAt(doc.issueDate);
  const isCredit = doc.kind === "credit";
  const title = isCredit ? "Kreditfaktura" : "Faktura";
  const inclVat = sum.inclVat;
  const seller = doc.seller;
  const buyer = doc.buyer;
  const pm = doc.paymentMeans;
  const sections = [...new Set(doc.lines.map((l) => l.section.trim()))];
  const grouped = sections.length > 1 || (sections.length === 1 && sections[0] !== "");
  const ocr = pm.ocr ?? doc.number ?? "";
  const footer = [
    `${seller.name}${seller.orgNr ? ` · Org.nr ${seller.orgNr}` : ""}${seller.vatNr ? ` · Momsreg.nr ${seller.vatNr}` : ""}${seller.fSkatt ? " · Godkänd för F-skatt" : ""}`,
    [address(seller).replace("\n", ", "), seller.phone, seller.email].filter(Boolean).join(" · "),
  ];

  return (
    <Document title={`${title} ${doc.number ?? "utkast"}`} author={seller.name} subject={doc.title} language="sv">
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt */}
            <Image src={LOGO_DATA_URI} style={s.logo} />
            <Text style={s.headAddr}>{clean(`${seller.name}\n${address(seller)}`)}</Text>
            <Text style={s.headAddr}>{[seller.phone, seller.email].filter(Boolean).join(" · ")}</Text>
          </View>
          <View>
            <Text style={s.title}>{title}</Text>
            <Text style={s.number}>Nr {doc.number ?? "UTKAST"}</Text>
            {isCredit && doc.references.precedingInvoiceNumber ? <Text style={s.credit}>AVSER FAKTURA {doc.references.precedingInvoiceNumber}</Text> : null}
          </View>
        </View>

        <View style={s.meta}>
          <View style={[s.metaCol, { flex: 1.3 }]}>
            <Text style={s.label}>{isCredit ? "Krediteras" : "Faktureras till"}</Text>
            <Text style={s.vBold}>{clean(buyer.name)}</Text>
            <Lines text={address(buyer)} style={s.v} />
            {buyer.type !== "privat" && buyer.orgNr ? <Text style={s.kvK}>Org.nr {buyer.orgNr}</Text> : null}
            {doc.se.reverseCharge && buyer.vatNr ? <Text style={s.kvK}>Momsreg.nr {buyer.vatNr}</Text> : null}
          </View>
          <View style={s.metaCol}>
            <View style={s.kv}>
              <Text style={s.kvK}>Fakturadatum</Text>
              <Text style={s.kvV}>{doc.issueDate}</Text>
            </View>
            {!isCredit ? (
              <View style={s.kv}>
                <Text style={s.kvK}>Förfallodatum</Text>
                <Text style={[s.kvV, { fontWeight: 700 }]}>{doc.dueDate}</Text>
              </View>
            ) : null}
            {doc.period ? (
              <View style={s.kv}>
                <Text style={s.kvK}>Period</Text>
                <Text style={s.kvV}>
                  {doc.period.start} – {doc.period.end}
                </Text>
              </View>
            ) : doc.deliveryDate ? (
              <View style={s.kv}>
                <Text style={s.kvK}>Utfört</Text>
                <Text style={s.kvV}>{doc.deliveryDate}</Text>
              </View>
            ) : null}
            {pm.termsText ? (
              <View style={s.kv}>
                <Text style={s.kvK}>Villkor</Text>
                <Text style={s.kvV}>{pm.termsText}</Text>
              </View>
            ) : null}
          </View>
          <View style={s.metaCol}>
            {customerNumber ? (
              <View style={s.kv}>
                <Text style={s.kvK}>Kundnummer</Text>
                <Text style={s.kvV}>{customerNumber}</Text>
              </View>
            ) : null}
            {buyer.reference ? (
              <View style={s.kv}>
                <Text style={s.kvK}>Er referens</Text>
                <Text style={s.kvV}>{clean(buyer.reference)}</Text>
              </View>
            ) : null}
            <View style={s.kv}>
              <Text style={s.kvK}>Vår referens</Text>
              <Text style={s.kvV}>{clean(doc.references.ourReference || signer)}</Text>
            </View>
            {doc.references.quoteNumber ? (
              <View style={s.kv}>
                <Text style={s.kvK}>Avser</Text>
                <Text style={s.kvV}>
                  Offert {doc.references.quoteNumber}
                  {doc.references.planStep ? `, steg ${doc.references.planStep.step} av ${doc.references.planStep.of}` : ""}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {doc.title ? <Text style={s.h1}>{clean(doc.title)}</Text> : null}
        {doc.note ? <Lines text={doc.note} style={s.note} /> : null}

        <View style={s.th} fixed>
          <Text style={[s.cDesc, s.thText]}>Beskrivning</Text>
          <Text style={[s.cKind, s.thText]}>Typ</Text>
          <Text style={[s.cQty, s.thText]}>Antal</Text>
          <Text style={[s.cPrice, s.thText]}>{inclVat ? "À-pris inkl." : "À-pris"}</Text>
          <Text style={[s.cVat, s.thText]}>Moms</Text>
          <Text style={[s.cSum, s.thText]}>{inclVat ? "Belopp inkl." : "Belopp"}</Text>
        </View>
        {(grouped ? sections : [""]).map((section) => (
          <View key={section || "_"}>
            {grouped ? <Text style={s.section}>{clean(section || "Övrigt")}</Text> : null}
            {doc.lines
              .filter((l) => !grouped || l.section.trim() === section)
              .map((line) => {
                const t = totals.lines[line.id];
                const unitGross = line.quantity ? Math.round(t.gross / line.quantity) : 0;
                return (
                  <View key={line.id} style={s.tr} wrap={false}>
                    <Text style={[s.cDesc, s.cell]}>{clean(line.description)}</Text>
                    <Text style={[s.cKind, s.cellMuted]}>{LINE_KIND_LABEL[line.kind]}</Text>
                    <Text style={[s.cQty, s.cell]}>{`${qty(line.quantity)} ${line.unit}`}</Text>
                    <Text style={[s.cPrice, s.cell]}>{money(inclVat ? unitGross : line.unitPriceOre)}</Text>
                    <Text style={[s.cVat, s.cellMuted]}>{line.vatCategory === "S" ? `${line.vatRate} %` : line.vatCategory === "AE" ? "omv." : "–"}</Text>
                    <Text style={[s.cSum, s.cell]}>{money(inclVat ? t.gross : t.net)}</Text>
                  </View>
                );
              })}
          </View>
        ))}

        <View style={s.below} wrap={false}>
          <View style={s.belowLeft}>
            {doc.se.reverseCharge ? (
              <View style={s.box}>
                <Text style={s.boxTitle}>Moms</Text>
                <Text style={s.boxText}>
                  {rules.reverseCharge.text}. Köparen redovisar momsen enligt 1 kap. 2 § första stycket 4 b mervärdesskattelagen (byggtjänster).
                  {buyer.vatNr ? ` Köparens momsregistreringsnummer: ${buyer.vatNr}.` : ""}
                </Text>
              </View>
            ) : (
              <View style={s.box}>
                <Text style={s.boxTitle}>Moms</Text>
                {totals.vatBreakdown.map((row) => (
                  <Text key={`${row.category}${row.rate}`} style={s.boxText}>
                    {clean(row.category === "E" ? `Momsfritt: underlag ${kr(row.taxable)}.` : `Underlag ${row.rate} %: ${kr(row.taxable)} · utgående moms ${kr(row.vat)}.`)}
                  </Text>
                ))}
              </View>
            )}
            {totals.rot && doc.se.rot ? (
              <View style={s.box}>
                <Text style={s.boxTitle}>ROT-avdrag</Text>
                <Text style={s.boxText}>
                  {clean(
                    `Arbetskostnad inkl. moms ${kr(Math.abs(totals.rot.laborGross))}. Skattereduktion ${Math.round(totals.rot.rate * 100)} %: ${kr(Math.abs(totals.rot.deduction))}, som ${seller.name} ${isCredit ? "återför" : "begär från Skatteverket när fakturan är betald"}.${totals.rot.capped ? " Avdraget är begränsat av årets utrymme." : ""}`
                  )}
                </Text>
                {doc.se.rot.buyers.map((b, i) => (
                  <Text key={i} style={s.boxText}>
                    {clean(`Köpare: ${b.name}, ${b.personalNumber}${doc.se.rot!.buyers.length > 1 ? ` · ${kr(Math.abs(totals.rot!.perBuyer[i] ?? 0))}` : ""}`)}
                  </Text>
                ))}
                {doc.se.rot.property ? (
                  <Text style={s.boxText}>
                    {doc.se.rot.property.kind === "fastighet"
                      ? `Fastighet: ${clean(doc.se.rot.property.designation)}`
                      : `Bostadsrättsförening ${doc.se.rot.property.orgNr}, lägenhet ${doc.se.rot.property.apartmentNumber}`}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {!isCredit && doc.se.lateInterestText ? <Text style={s.boxText}>{clean(doc.se.lateInterestText)}</Text> : null}
          </View>

          <View style={s.sum}>
            {sum.byKind.map((k) => (
              <View key={k.kind} style={s.sumRow}>
                <Text style={s.sumK}>{LINE_KIND_LABEL[k.kind]}</Text>
                <Text style={s.sumV}>{money(k.amount)}</Text>
              </View>
            ))}
            <View style={[s.sumRow, s.sumRule]}>
              <Text style={s.sumK}>{inclVat ? "Summa inkl. moms" : "Summa exkl. moms"}</Text>
              <Text style={s.sumV}>{money(sum.subtotal)}</Text>
            </View>
            {inclVat
              ? totals.vatBreakdown
                  .filter((r) => r.vat !== 0)
                  .map((r) => (
                    <View key={r.rate} style={s.sumRow}>
                      <Text style={s.sumSmall}>varav moms {r.rate} %</Text>
                      <Text style={s.sumSmall}>{money(r.vat)}</Text>
                    </View>
                  ))
              : totals.vatBreakdown
                  .filter((r) => r.vat !== 0)
                  .map((r) => (
                    <View key={r.rate} style={s.sumRow}>
                      <Text style={s.sumK}>Moms {r.rate} %</Text>
                      <Text style={s.sumV}>{money(r.vat)}</Text>
                    </View>
                  ))}
            {sum.rot !== 0 ? (
              <View style={s.sumRow}>
                <Text style={s.sumK}>ROT-avdrag</Text>
                <Text style={s.sumV}>{money(-sum.rot)}</Text>
              </View>
            ) : null}
            {sum.rounding !== 0 ? (
              <View style={s.sumRow}>
                <Text style={s.sumSmall}>Öresavrundning</Text>
                <Text style={s.sumSmall}>{money(sum.rounding)}</Text>
              </View>
            ) : null}
            <View style={s.sumTotal}>
              <Text style={s.sumTotalK}>{isCredit ? "Att återfå" : "Att betala"}</Text>
              <Text style={s.sumTotalV}>{kr(Math.abs(sum.payable))}</Text>
            </View>
          </View>
        </View>

        {!isCredit ? (
          <View style={s.pay} wrap={false}>
            <View style={s.accent} />
            {pm.bankgiro ? (
              <View style={s.payCol}>
                <Text style={s.label}>Bankgiro</Text>
                <Text style={s.payV}>{pm.bankgiro}</Text>
              </View>
            ) : null}
            {pm.plusgiro ? (
              <View style={s.payCol}>
                <Text style={s.label}>Plusgiro</Text>
                <Text style={s.payV}>{pm.plusgiro}</Text>
              </View>
            ) : null}
            {pm.iban ? (
              <View style={s.payCol}>
                <Text style={s.label}>IBAN{pm.bic ? ` / ${pm.bic}` : ""}</Text>
                <Text style={[s.payV, { fontSize: 10 }]}>{pm.iban}</Text>
              </View>
            ) : null}
            <View style={s.payCol}>
              <Text style={s.label}>OCR / referens</Text>
              <Text style={s.payV}>{ocr}</Text>
            </View>
            <View style={[s.payCol, { flex: 1.3 }]}>
              <Text style={s.label}>Att betala senast {doc.dueDate}</Text>
              <Text style={s.payV}>{kr(sum.payable)}</Text>
              {pm.swish ? <Text style={s.payNote}>Swish {pm.swish}, ange {ocr} som meddelande.</Text> : null}
            </View>
          </View>
        ) : null}

        <View style={s.foot} fixed>
          <View style={{ flex: 1 }}>
            {footer.map((f, i) => (
              <Text key={i} style={s.footText}>
                {clean(f)}
              </Text>
            ))}
            <Text style={s.footText}>
              {CUSTOMER_TYPE_LABEL[buyer.type]} · Fakturatyp {INVOICE_TYPE_CODE[doc.kind]}
            </Text>
          </View>
          <Text style={s.footPage} render={({ pageNumber, totalPages }) => `Sida ${pageNumber} av ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
