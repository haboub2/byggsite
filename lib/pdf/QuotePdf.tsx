import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import type { Company, QuoteSettings } from "../content/schema";
import { quoteTotals, sek, qty, validUntil, ROT_RATE, ROT_CAP } from "../quotes/math";
import { ITEM_KIND_LABEL, type Quote } from "../quotes/schema";
import { LOGO_DATA_URI } from "./logo";

/**
 * The quote as an A4 PDF, laid out like a Swedish "offert" from an
 * accounting system (facts box, item table with two decimals, a totals bar
 * and a four-column company footer) in the site's own look: anthracite ink,
 * one orange accent, the standard Helvetica (no font files, covers åäö).
 *
 * Two @react-pdf/renderer 4.9 quirks shape the styles below:
 * - lineHeight on the Page hides absolutely positioned fixed children (the
 *   footer), so line height is set on Text only.
 * - a unitless lineHeight on a Text that inherits its font size is resolved
 *   against the default size, not the inherited one, so every Text style
 *   that sets lineHeight also sets fontSize.
 */

const INK = "#1e2c37";
const INK2 = "#4b5763";
const INK3 = "#6b7680";
const ORANGE = "#f7802e";
const LINE = "#d9d6cf";
const PAPER = "#f6f4ef";

const FOOTER_H = 88;

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: FOOTER_H + 30, paddingHorizontal: 46, fontFamily: "Helvetica", fontSize: 9.5, color: INK },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: INK3 },
  p: { fontSize: 9.5, lineHeight: 1.4 },
  pMuted: { fontSize: 9.5, lineHeight: 1.4, color: INK2 },
  small: { fontSize: 8, lineHeight: 1.35, color: INK3 },
  label: { fontSize: 7.5, letterSpacing: 1.2, textTransform: "uppercase", color: INK3, marginBottom: 4 },

  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 },
  logo: { width: 112, height: 38, objectFit: "contain", objectPosition: "left top" },
  headRight: { alignItems: "flex-end" },
  docTitle: { fontFamily: "Helvetica-Bold", fontSize: 22, letterSpacing: 2, lineHeight: 1.1, marginBottom: 2 },
  pageNo: { fontSize: 8, color: INK3 },

  top: { flexDirection: "row", gap: 20, marginBottom: 22 },
  customer: { flex: 1.1, padding: 12, backgroundColor: PAPER, borderRadius: 3 },
  facts: { flex: 1 },
  fact: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5, borderBottomWidth: 0.5, borderBottomColor: LINE },
  factK: { color: INK3 },
  factV: { fontFamily: "Helvetica-Bold", textAlign: "right", maxWidth: "60%" },

  h1: { fontFamily: "Helvetica-Bold", fontSize: 15, marginBottom: 5, letterSpacing: -0.2 },
  intro: { marginBottom: 16 },

  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 4, marginBottom: 1 },
  thText: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  tr: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: LINE, alignItems: "flex-start" },
  cDesc: { flex: 1, paddingRight: 8 },
  cQty: { width: 44, textAlign: "right" },
  cUnit: { width: 36, paddingLeft: 6 },
  cPrice: { width: 76, textAlign: "right" },
  cSum: { width: 80, textAlign: "right" },
  cell: { fontSize: 9.5, lineHeight: 1.3 },
  kind: { fontSize: 7.5, lineHeight: 1.2, color: INK3 },

  rotBox: { marginTop: 12, padding: 10, backgroundColor: PAPER, borderRadius: 3 },
  rotLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },

  bar: { marginTop: 16, flexDirection: "row", borderTopWidth: 1, borderTopColor: INK, borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 8 },
  barCell: { flex: 1 },
  barK: { fontSize: 8, color: INK3, marginBottom: 2 },
  barV: { fontSize: 10 },
  barTotal: { flex: 1.3, alignItems: "flex-end" },
  barTotalV: { fontFamily: "Helvetica-Bold", fontSize: 13 },
  vatLine: { marginTop: 5, fontSize: 8, color: INK3 },

  terms: { marginTop: 22 },
  term: { marginBottom: 9 },
  termH: { fontFamily: "Helvetica-Bold", fontSize: 9.5, marginBottom: 1 },

  sign: { marginTop: 26, flexDirection: "row", gap: 24 },
  signBox: { flex: 1 },
  signLine: { borderBottomWidth: 0.8, borderBottomColor: INK, height: 32, marginBottom: 4 },

  footer: { position: "absolute", left: 46, right: 46, bottom: 26, height: FOOTER_H, borderTopWidth: 1, borderTopColor: ORANGE, paddingTop: 8, flexDirection: "row", gap: 14 },
  fCol: { flex: 1 },
  fK: { fontSize: 7.5, color: INK3, marginTop: 3 },
  fV: { fontSize: 8.5, lineHeight: 1.3 },
});

const clean = (t: string) => t.replace(/ /g, " ");

function Lines({ text, style }: { text: string; style?: Style }) {
  return (
    <>
      {clean(text)
        .split(/\n+/)
        .filter(Boolean)
        .map((line, i) => (
          <Text key={i} style={style}>
            {line}
          </Text>
        ))}
    </>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.fact}>
      <Text style={s.factK}>{k}</Text>
      <Text style={s.factV}>{clean(v)}</Text>
    </View>
  );
}

function FooterItem({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return (
    <>
      <Text style={s.fK}>{k}</Text>
      <Text style={s.fV}>{clean(v)}</Text>
    </>
  );
}

export function QuotePdf({ quote, company, settings }: { quote: Quote; company: Company; settings: QuoteSettings }) {
  const d = quote.data;
  const t = quoteTotals(d);
  const c = d.customer;
  const isBusiness = c.type === "foretag";
  const incl = d.pricesInclVat;
  const sideName = d.division === "bygg" ? "Bygg" : "Software";
  const number = String(quote.number);
  const ourRef = settings.signerName || company.contactPerson;
  const customerLabel = isBusiness && c.company ? c.company : c.name;
  const persons = d.rotPersons.length > 0 ? d.rotPersons : [{ name: "", personalNumber: "" }];

  const terms: { h: string; p: string }[] = [
    { h: "Betalningsvillkor", p: d.terms.payment },
    { h: "Start och leverans", p: d.terms.start },
    { h: "Garanti och försäkring", p: d.terms.warranty },
    { h: "Ingår inte", p: d.terms.excluded },
    { h: "Övrigt", p: d.terms.notes },
  ].filter((x) => x.p.trim());

  const bankLines = [
    settings.bankgiro ? `Bankgiro ${settings.bankgiro}` : "",
    settings.plusgiro ? `Plusgiro ${settings.plusgiro}` : "",
    settings.iban ? `IBAN ${settings.iban}` : "",
    settings.bic ? `BIC ${settings.bic}` : "",
  ].filter(Boolean);

  return (
    <Document title={`Offert ${number} – ${company.legalName}`} author={company.legalName} subject={d.title} language="sv-SE">
      <Page size="A4" style={s.page}>
        <View style={s.head} fixed>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt */}
          <Image src={LOGO_DATA_URI} style={s.logo} />
          <View style={s.headRight}>
            <Text style={s.docTitle}>OFFERT</Text>
            <Text style={s.pageNo} fixed render={({ pageNumber, totalPages }) => `Offert ${number}  ·  Sida ${pageNumber} (${totalPages})`} />
          </View>
        </View>

        <View style={s.footer} fixed>
          <View style={s.fCol}>
            <FooterItem k="Adress" v={`${company.legalName}\n${company.street}\n${company.postalCode} ${company.city}`} />
          </View>
          <View style={s.fCol}>
            <FooterItem k="Telefon" v={company.phoneDisplay} />
            <FooterItem k="E-post" v={company.email} />
          </View>
          <View style={s.fCol}>
            <FooterItem k="Betalning" v={bankLines.join("\n")} />
          </View>
          <View style={s.fCol}>
            <FooterItem k="Organisationsnr" v={company.orgNr} />
            <FooterItem k="Momsreg.nr" v={settings.vatNumber} />
            {settings.fSkatt ? <Text style={[s.fV, s.bold, { marginTop: 4 }]}>Godkänd för F-skatt</Text> : null}
          </View>
        </View>

        <View style={s.top}>
          <View style={s.customer}>
            <Text style={s.label}>Till</Text>
            {isBusiness && c.company ? <Text style={[s.p, s.bold]}>{clean(c.company)}</Text> : null}
            <Text style={isBusiness && c.company ? s.p : [s.p, s.bold]}>{clean(c.name)}</Text>
            {c.street ? <Text style={s.p}>{clean(c.street)}</Text> : null}
            {c.postalCode || c.city ? <Text style={s.p}>{clean(`${c.postalCode} ${c.city}`.trim())}</Text> : null}
            {c.phone ? <Text style={s.pMuted}>{clean(c.phone)}</Text> : null}
            {c.email ? <Text style={s.pMuted}>{clean(c.email)}</Text> : null}
            {isBusiness && c.orgNr ? <Text style={s.pMuted}>Org.nr {c.orgNr}</Text> : null}
          </View>
          <View style={s.facts}>
            <Fact k="Offertdatum" v={d.date} />
            <Fact k="Offertnr" v={number} />
            <Fact k="Giltig t.o.m." v={validUntil(d.date, d.validDays)} />
            <Fact k="Vår referens" v={ourRef} />
            {c.reference ? <Fact k="Er referens" v={c.reference} /> : null}
            <Fact k="Betalningsvillkor" v={`${d.paymentDays} dagar`} />
            {settings.lateInterest ? <Fact k="Dröjsmålsränta" v={settings.lateInterest} /> : null}
            <Fact k="Verksamhet" v={`${company.legalName} ${sideName}`} />
          </View>
        </View>

        <Text style={s.h1}>{clean(d.title)}</Text>
        {d.intro.trim() ? (
          <View style={s.intro}>
            <Lines text={d.intro} style={s.pMuted} />
          </View>
        ) : null}

        <View style={s.th}>
          <Text style={[s.cDesc, s.thText]}>Benämning</Text>
          <Text style={[s.cQty, s.thText]}>Antal</Text>
          <Text style={[s.cUnit, s.thText]}>Enhet</Text>
          <Text style={[s.cPrice, s.thText]}>À-pris</Text>
          <Text style={[s.cSum, s.thText]}>Summa</Text>
        </View>
        {d.items.map((it) => (
          <View key={it.id} style={s.tr} wrap={false}>
            <View style={s.cDesc}>
              <Text style={s.cell}>{clean(it.description)}</Text>
              {d.division === "bygg" ? <Text style={s.kind}>{ITEM_KIND_LABEL[it.kind]}</Text> : null}
            </View>
            <Text style={[s.cQty, s.cell]}>{qty(it.qty)}</Text>
            <Text style={[s.cUnit, s.cell]}>{it.unit}</Text>
            <Text style={[s.cPrice, s.cell]}>{sek(it.unitPrice)}</Text>
            <Text style={[s.cSum, s.cell]}>{sek(incl ? t.lines[it.id].gross : t.lines[it.id].net)}</Text>
          </View>
        ))}
        <Text style={[s.small, { marginTop: 4 }]}>
          {incl ? "Belopp i SEK, inklusive moms." : "Belopp i SEK, exklusive moms."}
        </Text>

        {t.rot ? (
          <View style={s.rotBox} wrap={false}>
            <Text style={[s.p, s.bold]}>Preliminär skattereduktion (ROT)</Text>
            {persons.map((person, i) => t.rot && (
              <View key={i} style={s.rotLine}>
                <Text style={s.p}>
                  {clean(person.name || (i === 0 && c.name) || `Person ${i + 1}`)}
                  {person.personalNumber ? ` (${person.personalNumber})` : ""}
                </Text>
                <Text style={s.p}>-{sek(t.rot.perOwner[i] ?? 0)} SEK</Text>
              </View>
            ))}
            <Text style={[s.small, { marginTop: 4 }]}>
              {Math.round(ROT_RATE * 100)} % av arbetskostnaden inkl. moms ({sek(t.laborGross)} SEK), högst {sek(ROT_CAP)} SEK per
              person och år{t.rot.capped ? " – avdraget här begränsas av årstaket" : ""}. Avdraget dras på fakturan och
              förutsätter att ni äger bostaden, har betalat tillräckligt med skatt under året och inte redan använt ert
              utrymme. Material och resor ger inget avdrag. Vi förbehåller oss rätten att fakturera återstående belopp,
              motsvarande skattereduktionen, om begäran avslås av Skatteverket.
            </Text>
          </View>
        ) : null}

        <View style={s.bar} wrap={false}>
          <View style={s.barCell}>
            <Text style={s.barK}>Exkl. moms</Text>
            <Text style={s.barV}>{sek(t.net)}</Text>
          </View>
          <View style={s.barCell}>
            <Text style={s.barK}>Moms</Text>
            <Text style={s.barV}>{sek(t.vat)}</Text>
          </View>
          <View style={s.barCell}>
            <Text style={s.barK}>Totalt</Text>
            <Text style={s.barV}>{sek(t.gross)}</Text>
          </View>
          {t.rot ? (
            <View style={s.barCell}>
              <Text style={s.barK}>Skattered.</Text>
              <Text style={s.barV}>-{sek(t.rot.deduction)}</Text>
            </View>
          ) : null}
          <View style={s.barTotal}>
            <Text style={s.barK}>{t.rot ? "Offertvärde efter ROT" : "Offertvärde"}</Text>
            <Text style={s.barTotalV}>SEK {sek(t.pay)}</Text>
          </View>
        </View>
        <Text style={s.vatLine}>
          {t.vatByRate.length > 0
            ? t.vatByRate.map((v) => `Moms ${v.rate} %  ${sek(v.amount)}  (underlag ${sek(Math.round((v.amount * 100) / v.rate))})`).join("   ·   ")
            : "Momsfritt."}
        </Text>

        <View style={s.terms}>
          {terms.map((x) => (
            <View key={x.h} style={s.term} wrap={false}>
              <Text style={s.termH}>{x.h}</Text>
              <Lines text={x.p} style={s.pMuted} />
            </View>
          ))}
          <View style={s.term} wrap={false}>
            <Text style={s.termH}>Giltighet</Text>
            <Text style={s.pMuted}>Offerten gäller till och med {validUntil(d.date, d.validDays)}. Priserna gäller under giltighetstiden.</Text>
          </View>
        </View>

        <View style={s.sign} wrap={false}>
          <View style={s.signBox}>
            <Text style={s.label}>Godkännande av offert</Text>
            <View style={s.signLine} />
            <Text style={s.small}>Ort, datum och underskrift · {clean(customerLabel)}</Text>
          </View>
          <View style={s.signBox}>
            <Text style={s.label}>För {clean(company.legalName)}</Text>
            <View style={s.signLine} />
            <Text style={s.small}>
              {clean(ourRef)}
              {settings.signerTitle ? `, ${clean(settings.signerTitle)}` : ""}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
