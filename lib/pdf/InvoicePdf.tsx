import { Document, Font, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import { formatOre } from "../core/money";
import { rulesAt } from "../core/rules";
import { LINE_KIND_LABEL, paymentReference, type InvoiceDocument } from "../core/documents/invoice";
import { customerSummary, invoiceTotals, type InvoiceTotals } from "../core/invoices/totals";
import { maskPersonalNumber } from "../core/rot/pnr";
import { JAKARTA_BOLD, JAKARTA_ITALIC, JAKARTA_MEDIUM, JAKARTA_REGULAR } from "./fonts";

/**
 * The invoice as an A4 PDF, rendered from the frozen EN 16931 document so it
 * can never say something the e-invoice or the ledger does not. Same look as
 * the quote (Plus Jakarta Sans, anthracite, one orange accent). One page for
 * the common case; the line table wraps onto more pages when needed and the
 * totals and payment box follow the last line.
 *
 * Laid out to be posted: the buyer's address sits top right where a Swedish
 * window envelope (C5/E65, window on the right) shows it, about 115 mm from
 * the left and 45 mm from the top, with a fold mark at a third of the page.
 * Title, number and the sender's logo are above it; the invoice details
 * (dates, references, terms) are on the left beside it.
 *
 * Content follows momslagen's list (docs/fakturering.md, grundkrav 4) and
 * Swedish practice: due date, org nr, F-skatt, bankgiro and OCR, the
 * reverse-charge sentence, and the ROT block with buyer and property (the
 * personal number masked, ÅÅÅÅMMDD-XXXX, since 0023). The seller is the
 * document's frozen seller, so an old invoice never changes; only the logo
 * comes from the organisation's current profile.
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
const MM = 72 / 25.4;
const A4_HEIGHT = 841.89;
// The window of a Swedish right-window envelope: the address block starts
// here, measured from the page's left edge.
const WINDOW_LEFT = 115 * MM;
const NO_LIGATURES = { liga: false, clig: false };

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 70, paddingHorizontal: X, fontFamily: "Jakarta", fontFeatureSettings: NO_LIGATURES, fontSize: 9.5, color: INK },
  fold: { position: "absolute", left: 0, top: 99 * MM, width: 14, borderTopWidth: 0.6, borderTopColor: INK3 },

  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", minHeight: 74 },
  logo: { width: 110, height: 34, objectFit: "contain", objectPosition: "left top" },
  name: { fontSize: 15, lineHeight: 1.2, fontWeight: 700, letterSpacing: -0.3, maxWidth: 260 },
  sender: { fontSize: 7.5, lineHeight: 1.4, color: INK3, marginTop: 6 },
  title: { fontSize: 24, lineHeight: 1.1, fontWeight: 700, letterSpacing: -0.6, textAlign: "right" },
  number: { fontSize: 12, lineHeight: 1.3, fontWeight: 700, textAlign: "right", marginTop: 2 },
  credit: { fontSize: 8.5, lineHeight: 1.3, color: INK2, textAlign: "right", marginTop: 2 },

  window: { flexDirection: "row", alignItems: "flex-start", marginTop: 20, minHeight: 100 },
  details: { width: WINDOW_LEFT - X - 34 },
  address: { position: "absolute", left: WINDOW_LEFT - X, right: 0, top: 0 },
  addrName: { fontSize: 11, lineHeight: 1.4, fontWeight: 700, marginTop: 3 },
  addrLine: { fontSize: 11, lineHeight: 1.4 },
  addrSmall: { fontSize: 8.5, lineHeight: 1.4, color: INK3, marginTop: 3 },
  label: { fontSize: 7, lineHeight: 1.3, letterSpacing: 1.4, textTransform: "uppercase", color: INK3, marginBottom: 3 },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: 8, paddingVertical: 1 },
  kvK: { fontSize: 9, lineHeight: 1.4, color: INK3 },
  kvV: { fontSize: 9, lineHeight: 1.4, textAlign: "right", flexShrink: 1 },

  h1: { fontSize: 13, lineHeight: 1.25, fontWeight: 700, marginTop: 22, letterSpacing: -0.2 },
  note: { fontSize: 9.5, lineHeight: 1.5, color: INK2, marginTop: 4 },

  th: { flexDirection: "row", marginTop: 14, paddingBottom: 5, borderBottomWidth: 0.8, borderBottomColor: INK },
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
  belowLeft: { flex: 1, gap: 8 },
  box: { borderWidth: 0.6, borderColor: LINE, borderRadius: 4, padding: 9 },
  boxText: { fontSize: 8.5, lineHeight: 1.5, color: INK2 },
  sum: { width: 230 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5, gap: 10 },
  sumK: { fontSize: 9.5, lineHeight: 1.3, color: INK2 },
  sumV: { fontSize: 9.5, lineHeight: 1.3 },
  sumSmall: { fontSize: 8, lineHeight: 1.3, color: INK3 },
  sumRule: { borderTopWidth: 0.6, borderTopColor: LINE, marginTop: 2, paddingTop: 5 },
  sumTotal: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderTopWidth: 1.5, borderTopColor: INK, marginTop: 6, paddingTop: 7 },
  sumTotalK: { fontSize: 11, lineHeight: 1.2, fontWeight: 700 },
  sumTotalV: { fontSize: 15, lineHeight: 1.2, fontWeight: 700, letterSpacing: -0.3 },

  pay: { marginTop: 16, backgroundColor: PAPER, borderLeftWidth: 3, borderLeftColor: ORANGE, paddingVertical: 11, paddingHorizontal: 13, flexDirection: "row", gap: 16, alignItems: "center" },
  payCol: { flex: 1 },
  payV: { fontSize: 12, lineHeight: 1.3, fontWeight: 700 },
  payNote: { fontSize: 8, lineHeight: 1.45, color: INK2, marginTop: 5 },

  foot: { position: "absolute", bottom: 26, left: X, right: X, paddingTop: 8, paddingRight: 70, borderTopWidth: 0.6, borderTopColor: LINE },
  footText: { fontSize: 7.2, lineHeight: 1.4, color: INK3 },
  cont: { position: "absolute", top: 14, left: X, right: X, fontSize: 7.5, lineHeight: 1.3, color: INK3, textAlign: "right" },
  // Placed from the top: a page number anchored to the bottom is never drawn.
  footPage: { position: "absolute", top: A4_HEIGHT - 26 - 2 * 7.2 * 1.4, right: X, width: 70, fontSize: 7.2, lineHeight: 1.4, color: INK3, textAlign: "right" },
});

const clean = (t: string) => t.replace(/(\d)[  ]+(%|kr\b|SEK\b|m²|tim\b|dagar\b)/g, "$1 $2");
const money = (ore: number) => formatOre(ore).replace(/−/g, "-");
const kr = (ore: number) => `${money(ore)} kr`;
const postal = (p: { postalCode: string; city: string }) => [p.postalCode, p.city].filter(Boolean).join(" ");
const qty = (n: number) => n.toLocaleString("sv-SE", { maximumFractionDigits: 2 }).replace(/ /g, " ");

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

function Detail({ k, v, bold = false }: { k: string; v: string; bold?: boolean }) {
  if (!v) return null;
  return (
    <View style={s.kv}>
      <Text style={s.kvK}>{k}</Text>
      <Text style={[s.kvV, bold ? { fontWeight: 700 } : {}]}>{clean(v)}</Text>
    </View>
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
  const ref = paymentReference(doc);
  const footer = [
    [seller.name, [seller.street, postal(seller)].filter(Boolean).join(", "), seller.phone, seller.email].filter(Boolean).join(" · "),
    [seller.orgNr ? `Org.nr ${seller.orgNr}` : "", seller.vatNr ? `Momsreg.nr ${seller.vatNr}` : "", seller.city ? `Säte ${seller.city}` : "", seller.fSkatt ? "Godkänd för F-skatt" : ""].filter(Boolean).join(" · "),
  ];

  return (
    <Document title={`${title} ${doc.number ?? "utkast"}`} author={seller.name} subject={doc.title} language="sv">
      <Page size="A4" style={s.page}>
        <View style={s.fold} />

        <View style={s.head}>
          <View>
            {logo ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt
              <Image src={logo} style={s.logo} />
            ) : (
              <Text style={s.name}>{clean(seller.name)}</Text>
            )}
            <Text style={s.sender}>{clean([seller.name, seller.street, postal(seller)].filter(Boolean).join(" · "))}</Text>
          </View>
          <View>
            <Text style={s.title}>{title}</Text>
            <Text style={s.number}>Nr {doc.number ?? "UTKAST"}</Text>
            {isCredit && refs.precedingInvoiceNumber ? <Text style={s.credit}>Krediterar faktura {refs.precedingInvoiceNumber}</Text> : null}
          </View>
        </View>

        <View style={s.window}>
          <View style={s.details}>
            <Text style={s.label}>Fakturadetaljer</Text>
            <Detail k="Fakturadatum" v={doc.issueDate} />
            {!isCredit ? <Detail k="Förfallodatum" v={doc.dueDate} bold /> : null}
            <Detail k="Kundnummer" v={customerNumber ?? ""} />
            <Detail k="Er referens" v={buyer.reference} />
            <Detail k="Vår referens" v={refs.ourReference || signer} />
            {!isCredit ? <Detail k="Villkor" v={pm.termsText} /> : null}
            <Detail k={doc.period ? "Period" : "Utfört"} v={doc.period ? `${doc.period.start} – ${doc.period.end}` : (doc.deliveryDate ?? "")} />
            <Detail k="Avser" v={refs.quoteNumber ? `Offert ${refs.quoteNumber}${refs.planStep ? `, steg ${refs.planStep.step} av ${refs.planStep.of}` : ""}` : ""} />
            {isCredit ? <Detail k="Krediterar" v={refs.precedingInvoiceNumber ? `Faktura ${refs.precedingInvoiceNumber}` : ""} /> : null}
          </View>
          {/* In the envelope's window: nothing but the recipient. */}
          <View style={s.address}>
            <Text style={s.label}>{isCredit ? "Krediteras" : "Faktureras till"}</Text>
            <Text style={s.addrName}>{clean(buyer.name)}</Text>
            {buyer.street ? <Text style={s.addrLine}>{clean(buyer.street)}</Text> : null}
            {postal(buyer) ? <Text style={s.addrLine}>{clean(postal(buyer))}</Text> : null}
            {buyer.type !== "privat" && buyer.orgNr ? <Text style={s.addrSmall}>Org.nr {buyer.orgNr}</Text> : null}
            {doc.se.reverseCharge && buyer.vatNr ? <Text style={s.addrSmall}>Momsreg.nr {buyer.vatNr}</Text> : null}
          </View>
        </View>

        {doc.title ? <Text style={s.h1}>{clean(doc.title)}</Text> : null}
        {doc.note ? <Lines text={doc.note} style={s.note} /> : null}

        <View style={[s.th, doc.title || doc.note ? {} : { marginTop: 22 }]} fixed>
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
                <Text style={s.label}>Moms</Text>
                <Text style={s.boxText}>
                  {rules.reverseCharge.text}. Köparen redovisar momsen enligt 1 kap. 2 § första stycket 4 b mervärdesskattelagen (byggtjänster).
                  {buyer.vatNr ? ` Köparens momsregistreringsnummer: ${buyer.vatNr}.` : ""}
                </Text>
              </View>
            ) : (
              <View style={s.box}>
                <Text style={s.label}>Moms</Text>
                {totals.vatBreakdown.map((row) => (
                  <Text key={`${row.category}${row.rate}`} style={s.boxText}>
                    {clean(row.category === "E" ? `Momsfritt: underlag ${kr(row.taxable)}.` : `Underlag ${row.rate} %: ${kr(row.taxable)} · utgående moms ${kr(row.vat)}.`)}
                  </Text>
                ))}
              </View>
            )}
            {totals.rot && doc.se.rot ? (
              <View style={s.box}>
                <Text style={s.label}>ROT-avdrag</Text>
                <Text style={s.boxText}>
                  {clean(
                    `Arbetskostnad inkl. moms ${kr(Math.abs(totals.rot.laborGross))}. Skattereduktion ${Math.round(totals.rot.rate * 100)} %: ${kr(Math.abs(totals.rot.deduction))}, som ${seller.name} ${isCredit ? "återför" : "begär från Skatteverket när fakturan är betald"}.${totals.rot.capped ? " Avdraget är begränsat av årets utrymme." : ""}${isCredit ? "" : " Avdraget förutsätter Skatteverkets godkännande; medges det inte, eller bara delvis, ska mellanskillnaden betalas."}`
                  )}
                </Text>
                {doc.se.rot.buyers.map((b, i) => (
                  <Text key={i} style={s.boxText}>
                    {clean(`Köpare: ${b.name}, ${maskPersonalNumber(b.personalNumber, doc.issueDate)}${doc.se.rot!.buyers.length > 1 ? ` · ${kr(Math.abs(totals.rot!.perBuyer[i] ?? 0))}` : ""}`)}
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
            {totals.vatBreakdown
              .filter((r) => r.vat !== 0)
              .map((r) => (
                <View key={r.rate} style={s.sumRow}>
                  <Text style={inclVat ? s.sumSmall : s.sumK}>{inclVat ? `varav moms ${r.rate} %` : `Moms ${r.rate} %`}</Text>
                  <Text style={inclVat ? s.sumSmall : s.sumV}>{money(r.vat)}</Text>
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
          <View wrap={false}>
            <View style={s.pay}>
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
                <View style={[s.payCol, { flex: 1.6 }]}>
                  <Text style={s.label}>IBAN{pm.bic ? ` / BIC ${pm.bic}` : ""}</Text>
                  <Text style={[s.payV, { fontSize: 10 }]}>{pm.iban}</Text>
                </View>
              ) : null}
              <View style={s.payCol}>
                <Text style={s.label}>{ref.label}</Text>
                <Text style={s.payV}>{ref.value}</Text>
              </View>
              <View style={s.payCol}>
                <Text style={s.label}>Förfaller</Text>
                <Text style={s.payV}>{doc.dueDate}</Text>
              </View>
              <View style={[s.payCol, { flex: 1.25 }]}>
                <Text style={s.label}>Att betala</Text>
                <Text style={s.payV}>{kr(sum.payable)}</Text>
              </View>
              {swishQr ? (
                // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt
                <Image src={{ data: swishQr, format: "png" }} style={{ width: 60, height: 60 }} />
              ) : null}
            </View>
            <Text style={s.payNote}>
              {ref.instruction}
              {pm.swish ? ` Swish ${pm.swish} med ${ref.value} som meddelande${swishQr ? ", eller skanna koden" : ""}.` : ""}
            </Text>
          </View>
        ) : null}

        <View style={s.foot} fixed>
          {footer.map((f, i) => (
            <Text key={i} style={s.footText}>
              {clean(f)}
            </Text>
          ))}
        </View>
        <Text
          style={s.cont}
          fixed
          render={({ pageNumber, totalPages }) => (pageNumber > 1 ? `${title} ${doc.number ?? "utkast"} · ${buyer.name} · sida ${pageNumber} av ${totalPages}` : "")}
        />
        {/* On its own: react-pdf drops a fixed footer whose children include a page-number render prop. */}
        <Text style={s.footPage} fixed render={({ pageNumber, totalPages }) => `Sida ${pageNumber} av ${totalPages}`} />
      </Page>
    </Document>
  );
}
