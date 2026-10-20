import { Document, Font, Page, Text, View, Image, StyleSheet, Svg, Path } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { Style } from "@react-pdf/stylesheet";
import type { QuoteSettings } from "../content/schema";
import type { QuoteCompany as Company } from "../quotes/profile";
import { deductionLabel, DEDUCTION_RULES, displayUnitPrice, groupItems, priceSummary, quoteTotals, sek, qty, showsInclVat, validUntil, formatDate } from "../quotes/math";
import { ITEM_KIND_LABEL, type ItemKind, type Quote } from "../quotes/schema";
import { BANNER_LINE } from "../quotes/cover";
import { JAKARTA_BOLD, JAKARTA_ITALIC, JAKARTA_MEDIUM, JAKARTA_REGULAR } from "./fonts";
import type { PdfPhoto } from "./photos";

/**
 * The quote as an A4 PDF in the site's own look: Plus Jakarta Sans,
 * anthracite ink, one orange accent, cream panels. Reading order: a photo
 * cover, the parties, the work grouped by step with subtotals, the price
 * summary, how the job runs, a photo band, the terms as checklists, and
 * the signature with our contact and payment details.
 *
 * Two @react-pdf/renderer 4.9 quirks shape the styles below:
 * - lineHeight on the Page hides absolutely positioned fixed children (the
 *   footer), so line height is set on Text only.
 * - a unitless lineHeight on a Text that inherits its font size is resolved
 *   against the default size, not the inherited one, so every Text style
 *   that sets lineHeight also sets fontSize.
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
// The built-in hyphenation is English and splits Swedish words in odd places
// ("vä-gen"); whole words wrap instead.
Font.registerHyphenationCallback((word) => [word]);

const INK = "#1e2c37";
const INK2 = "#4b5763";
const INK3 = "#6b7680";
const ORANGE = "#f7802e";
const LINE = "#e3e0d9";
const PAPER = "#f6f4ef";
const WHITE = "#ffffff";
const X = 46; // page margin
// Ligatures off: "ff" and "fi" glyphs lose their letters when the PDF text is
// copied or searched ("Offert" became "Ofert").
const NO_LIGATURES = { liga: false, clig: false };

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 64, paddingHorizontal: X, fontFamily: "Jakarta", fontFeatureSettings: NO_LIGATURES, fontSize: 9.5, color: INK },
  bold: { fontWeight: 700 },
  pMuted: { fontSize: 9.5, lineHeight: 1.5, color: INK2 },
  small: { fontSize: 8, lineHeight: 1.45, color: INK3 },
  label: { fontSize: 7, lineHeight: 1.3, letterSpacing: 1.4, textTransform: "uppercase", color: INK3 },

  // Running header and footer
  // In the flow, not absolutely positioned: react-pdf leaves images out of
  // absolutely positioned fixed elements.
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, paddingBottom: 9, borderBottomWidth: 0.6, borderBottomColor: LINE },
  headLogo: { width: 76, height: 24, objectFit: "contain", objectPosition: "left top" },
  // Without a logo (an organisation other than the site's): the company name.
  headName: { fontSize: 11, lineHeight: 1.2, fontWeight: 700, paddingTop: 6, maxWidth: 260 },
  headRight: { alignItems: "flex-end", paddingTop: 8 },
  headText: { fontSize: 8, color: INK3 },
  foot: { position: "absolute", bottom: 26, left: X, right: X, flexDirection: "row", justifyContent: "space-between", paddingTop: 8, borderTopWidth: 0.6, borderTopColor: LINE },
  footText: { fontSize: 7.5, lineHeight: 1.2, color: INK3 },

  // Section headings
  section: { marginTop: 24 },
  h2Row: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  h2Dash: { width: 14, height: 2, backgroundColor: ORANGE, marginRight: 8 },
  h2: { fontSize: 13, lineHeight: 1.2, fontWeight: 700, letterSpacing: -0.2 },
  h2Aside: { marginLeft: "auto", fontSize: 8, lineHeight: 1.2, color: INK3 },

  // Title block
  eyebrow: { fontSize: 7.5, lineHeight: 1.2, letterSpacing: 1.8, color: ORANGE, fontWeight: 700, marginBottom: 6 },
  h1: { fontSize: 22, lineHeight: 1.15, fontWeight: 700, letterSpacing: -0.5 },

  // Parties
  parties: { flexDirection: "row", gap: 14 },
  party: { flex: 1, borderWidth: 0.6, borderColor: LINE, borderRadius: 4 },
  partyHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: PAPER, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  partyNo: { fontSize: 9, lineHeight: 1.2, fontWeight: 700, color: ORANGE, marginRight: 6 },
  partyTitle: { fontSize: 9.5, lineHeight: 1.2, fontWeight: 700 },
  partyBody: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, paddingTop: 4, paddingBottom: 10 },
  field: { width: "50%", paddingTop: 7, paddingRight: 8 },
  fieldWide: { width: "100%", paddingTop: 7 },
  fieldV: { fontSize: 9, lineHeight: 1.35, marginTop: 2 },

  // Item table
  th: { flexDirection: "row", paddingBottom: 5, borderBottomWidth: 0.8, borderBottomColor: INK },
  thText: { fontSize: 7, lineHeight: 1.2, letterSpacing: 1.2, textTransform: "uppercase", color: INK3 },
  group: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: PAPER, borderRadius: 3 },
  groupTitle: { fontSize: 9.5, lineHeight: 1.2, fontWeight: 700 },
  groupSum: { fontSize: 9, lineHeight: 1.2, fontWeight: 500, color: INK2 },
  tr: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: LINE, alignItems: "flex-start" },
  cDesc: { flex: 1, paddingRight: 10 },
  cQty: { width: 40, textAlign: "right" },
  cUnit: { width: 34, paddingLeft: 6 },
  cPrice: { width: 74, textAlign: "right" },
  cSum: { width: 78, textAlign: "right" },
  cell: { fontSize: 9, lineHeight: 1.35 },
  kind: { fontSize: 7, lineHeight: 1.3, color: INK3, marginTop: 1 },

  // Price summary
  sum: { marginTop: 22 },
  sumHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 },
  sumTitle: { fontSize: 13, lineHeight: 1.2 },
  sumMode: { fontSize: 8, lineHeight: 1.2, color: INK3, textDecoration: "underline" },
  sumRows: { backgroundColor: PAPER, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, paddingHorizontal: 14, borderBottomWidth: 0.6, borderBottomColor: WHITE },
  sumK: { fontSize: 9.5, lineHeight: 1.3 },
  sumTag: { fontSize: 7.5, lineHeight: 1.3, color: ORANGE, fontStyle: "italic" },
  sumV: { fontSize: 9.5, lineHeight: 1.3, textAlign: "right" },
  sumRule: { height: 2.5, backgroundColor: INK },
  sumTotal: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingTop: 10, paddingHorizontal: 14 },
  sumTotalK: { fontSize: 12, lineHeight: 1.2, fontWeight: 700 },
  sumTotalV: { fontSize: 17, lineHeight: 1.2, fontWeight: 700, letterSpacing: -0.3 },
  sumBelow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, marginTop: 3 },
  sumBelowK: { fontSize: 8.5, lineHeight: 1.35, color: INK3 },
  sumBelowV: { fontSize: 8.5, lineHeight: 1.35, color: INK3 },
  sumAfter: { fontSize: 8, lineHeight: 1.4, color: INK3, textAlign: "right", paddingHorizontal: 14, marginTop: 3 },

  // How the job runs
  steps: { flexDirection: "row", gap: 12 },
  step: { flex: 1, paddingTop: 10, borderTopWidth: 2, borderTopColor: INK },
  stepNo: { fontSize: 18, lineHeight: 1.1, fontWeight: 700, color: ORANGE },
  stepTitle: { fontSize: 9.5, lineHeight: 1.3, fontWeight: 700, marginTop: 6 },
  stepText: { fontSize: 8, lineHeight: 1.45, color: INK2, marginTop: 3 },

  // Photo band
  band: { marginTop: 26, marginHorizontal: -X, height: 124, position: "relative", backgroundColor: INK },
  bandPhoto: { position: "absolute", top: 0, left: 0, width: "100%", height: 124, objectFit: "cover" },
  bandShade: { position: "absolute", top: 0, left: 0, width: "100%", height: 124, backgroundColor: INK, opacity: 0.42 },
  bandText: { position: "absolute", left: X, right: X, bottom: 22 },
  accent: { width: 36, height: 3, backgroundColor: ORANGE, marginBottom: 12 },
  bandLine: { fontSize: 19, lineHeight: 1.2, fontWeight: 700, color: WHITE, letterSpacing: -0.3 },

  // Terms
  termRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  term: { flex: 1, padding: 11, backgroundColor: PAPER, borderRadius: 4 },
  termWide: { flex: 1, padding: 11, backgroundColor: PAPER, borderRadius: 4 },
  termH: { fontSize: 9.5, lineHeight: 1.3, fontWeight: 700, marginBottom: 5 },
  bullet: { flexDirection: "row", alignItems: "flex-start", marginTop: 3 },
  bulletIcon: { width: 9, height: 9, marginTop: 2.5, marginRight: 6 },
  bulletText: { flex: 1, fontSize: 8.5, lineHeight: 1.45, color: INK2 },
  termText: { fontSize: 8.5, lineHeight: 1.45, color: INK2 },
  rotLine: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },

  // Signature and contact
  sign: { flexDirection: "row", gap: 24, marginTop: 18 },
  signBox: { flex: 1 },
  signLine: { borderBottomWidth: 0.8, borderBottomColor: INK, height: 34, marginBottom: 5 },
  contact: { flexDirection: "row", gap: 14, marginTop: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: ORANGE },
  contactCol: { flex: 1 },
  contactV: { fontSize: 8.5, lineHeight: 1.45, marginTop: 3 },

  // Cover page
  cover: { fontFamily: "Jakarta", fontFeatureSettings: NO_LIGATURES, color: INK, backgroundColor: WHITE },
  coverPhoto: { width: "100%", height: 300, objectFit: "cover" },
  coverBlock: { width: "100%", height: 300, backgroundColor: INK },
  coverParties: { marginTop: 22 },
  coverBottom: { position: "absolute", left: X, right: X, bottom: 30 },
  facts: { flexDirection: "row", paddingTop: 12, borderTopWidth: 0.6, borderTopColor: LINE },
  factsInline: { flexDirection: "row", marginTop: 14, paddingTop: 10, borderTopWidth: 0.6, borderTopColor: LINE },
  fact: { flex: 1, paddingRight: 8 },
  factLast: { flex: 1.25 },
  factV: { fontSize: 9.5, lineHeight: 1.3, fontWeight: 500, marginTop: 3 },
  factStrong: { fontSize: 12, lineHeight: 1.2, fontWeight: 700, marginTop: 2 },
  coverBody: { paddingHorizontal: X, paddingTop: 34 },
  coverLabel: { fontSize: 8, lineHeight: 1.2, letterSpacing: 2.4, color: INK3, marginBottom: 8 },
  coverTitle: { fontSize: 32, lineHeight: 1.12, fontWeight: 700, letterSpacing: -0.9, marginBottom: 10 },
  coverFoot: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 18 },
  coverLogo: { width: 104, height: 34, objectFit: "contain", objectPosition: "left bottom" },
  coverName: { fontSize: 13, lineHeight: 1.2, fontWeight: 700, maxWidth: 220 },
  coverContact: { fontSize: 8, lineHeight: 1.5, color: INK3, textAlign: "right" },
});

/* ------------------------------------------------------------ helpers */

/** Keeps a number on the same line as its unit ("40 %", "3 000 kr"). */
const clean = (t: string) => t.replace(/(\d)[ \u00a0]+(%|kr\b|SEK\b|m\u00b2|m2\b|tim\b|dagar\b|veckor\b)/g, "$1\u00a0$2");

/** Amounts with a plain hyphen for minus, so they read the same everywhere. */
const signed = (n: number) => (n < 0 ? `-${sek(-n)}` : sek(n));

/** Text as list items: one per line, or one per sentence for a paragraph. */
function bullets(text: string): string[] {
  return clean(text)
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-ZÅÄÖ0-9])/))
    .map((x) => x.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

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

/** A section heading, never left alone at the bottom of a page: `keep` is
 *  how much of what follows must fit below it. */
function Heading({ children, aside, keep = 120 }: { children: string; aside?: string; keep?: number }) {
  return (
    <View style={s.h2Row} minPresenceAhead={keep}>
      <View style={s.h2Dash} />
      <Text style={s.h2}>{children}</Text>
      {aside ? <Text style={s.h2Aside}>{aside}</Text> : null}
    </View>
  );
}

function Check() {
  return (
    <Svg style={s.bulletIcon} viewBox="0 0 10 10">
      <Path d="M1.6 5.3 L4.1 7.7 L8.6 2.5" stroke={ORANGE} strokeWidth={1.6} fill="none" />
    </Svg>
  );
}

function Cross() {
  return (
    <Svg style={s.bulletIcon} viewBox="0 0 10 10">
      <Path d="M2.2 2.2 L7.8 7.8 M7.8 2.2 L2.2 7.8" stroke={INK3} strokeWidth={1.4} fill="none" />
    </Svg>
  );
}

function BulletList({ text, icon }: { text: string; icon: "check" | "cross" }) {
  return (
    <>
      {bullets(text).map((line, i) => (
        <View key={i} style={s.bullet}>
          {icon === "check" ? <Check /> : <Cross />}
          <Text style={s.bulletText}>{line}</Text>
        </View>
      ))}
    </>
  );
}

function Field({ k, v, wide = false }: { k: string; v: string; wide?: boolean }) {
  if (!v.trim()) return null;
  return (
    <View style={wide ? s.fieldWide : s.field}>
      <Text style={s.label}>{k}</Text>
      <Text style={s.fieldV}>{clean(v)}</Text>
    </View>
  );
}

const addressOf = (street: string, postalCode: string, city: string) =>
  [street, [postalCode, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

/* ------------------------------------------------------------ cover */

/** The facts row: dates, payment terms, side and the figure the customer
 *  reads first. On the cover, or on the first page when there is no cover. */
function Facts({ quote, company, style }: { quote: Quote; company: Company; style: Style }) {
  const d = quote.data;
  const p = priceSummary(d);
  const amountLabel = p.inclVat ? (p.deduction > 0 ? `Att betala efter ${deductionLabel(p.deductionKind)}` : "Att betala") : "Totalt exkl. moms";
  const facts: [string, string][] = [
    ["Offertdatum", formatDate(d.date)],
    ["Giltig till", formatDate(validUntil(d.date, d.validDays))],
    ["Betalning", `${d.paymentDays} dagar netto`],
    ["Verksamhet", `${company.legalName} ${d.division === "bygg" ? "Bygg" : "Software"}`],
    [amountLabel, `${sek(p.total).replace(/,00$/, "")} kr`],
  ];
  return (
    <View style={style}>
      {facts.map(([k, v], i) => (
        <View key={k} style={i === facts.length - 1 ? s.factLast : s.fact}>
          <Text style={s.label}>{k}</Text>
          <Text style={i === facts.length - 1 ? s.factStrong : s.factV}>{clean(v)}</Text>
        </View>
      ))}
    </View>
  );
}

/** Page 1: a photo, the title, the parties, and the facts row at the bottom. */
function CoverPage({ quote, company, settings, logo, photo }: { quote: Quote; company: Company; settings: QuoteSettings; logo: string | null; photo: PdfPhoto | null }) {
  const d = quote.data;
  return (
    <Page size="A4" style={s.cover}>
      {photo ? (
        // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt
        <Image src={photo} style={s.coverPhoto} />
      ) : (
        <View style={s.coverBlock} />
      )}
      <View style={s.coverBody}>
        <View style={s.accent} />
        <Text style={s.coverLabel}>OFFERT {quote.number}</Text>
        <Text style={s.coverTitle}>{clean(d.title || "Offert")}</Text>
        <Parties quote={quote} company={company} settings={settings} heading={false} />
      </View>
      <View style={s.coverBottom}>
        <Facts quote={quote} company={company} style={s.facts} />
        <View style={s.coverFoot}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt */}
          {logo ? <Image src={logo} style={s.coverLogo} /> : <Text style={s.coverName}>{clean(company.legalName)}</Text>}
          <Text style={s.coverContact}>{clean([company.phoneDisplay, company.email].filter(Boolean).join(" · "))}</Text>
        </View>
      </View>
    </Page>
  );
}

/* ------------------------------------------------------------ sections */

function Parties({ quote, company, settings, heading = true }: { quote: Quote; company: Company; settings: QuoteSettings; heading?: boolean }) {
  const d = quote.data;
  const c = d.customer;
  const business = c.type === "foretag";
  return (
    <View style={heading ? s.section : s.coverParties} wrap={false}>
      {heading ? <Heading>Parter</Heading> : null}
      <View style={s.parties}>
        <View style={s.party}>
          <View style={s.partyHead}>
            <Text style={s.partyNo}>01</Text>
            <Text style={s.partyTitle}>Beställare</Text>
          </View>
          <View style={s.partyBody}>
            {business ? <Field k="Företag" v={c.company} /> : null}
            {business ? <Field k="Org.nr" v={c.orgNr} /> : null}
            <Field k={business ? "Kontaktperson" : "Namn"} v={c.name} />
            <Field k="Telefon" v={c.phone} />
            <Field k="E-post" v={c.email} wide={c.email.length > 26} />
            {business ? <Field k="Er referens" v={c.reference} /> : null}
            <Field k={d.division === "bygg" ? "Arbetsplats" : "Adress"} v={addressOf(c.street, c.postalCode, c.city)} wide />
          </View>
        </View>
        <View style={s.party}>
          <View style={s.partyHead}>
            <Text style={s.partyNo}>02</Text>
            <Text style={s.partyTitle}>Utställare</Text>
          </View>
          <View style={s.partyBody}>
            <Field k="Företag" v={company.legalName} />
            <Field k="Org.nr" v={company.orgNr} />
            <Field k="Vår referens" v={settings.signerName} />
            <Field k="Telefon" v={company.phoneDisplay} />
            <Field k="E-post" v={company.email} wide={company.email.length > 26} />
            <Field k="Adress" v={addressOf(company.street, company.postalCode, company.city)} wide />
          </View>
        </View>
      </View>
    </View>
  );
}

function Items({ quote }: { quote: Quote }) {
  const d = quote.data;
  if (d.items.length === 0) return null;
  const t = quoteTotals(d);
  const incl = showsInclVat(d);
  const groups = groupItems(d, t);
  // Grouped by work step, the kind (labour/material) still matters for ROT.
  const showKind = d.division === "bygg" && d.items.some((i) => i.section.trim());
  return (
    <View style={s.section}>
      <Heading aside={incl ? "Belopp i SEK inkl. moms" : "Belopp i SEK exkl. moms"} keep={160}>
        {d.division === "bygg" ? "Arbete och material" : "Specifikation"}
      </Heading>
      <View style={s.th}>
        <Text style={[s.cDesc, s.thText, { paddingLeft: 8 }]}>Benämning</Text>
        <Text style={[s.cQty, s.thText]}>Antal</Text>
        <Text style={[s.cUnit, s.thText]}>Enhet</Text>
        <Text style={[s.cPrice, s.thText]}>À-pris</Text>
        <Text style={[s.cSum, s.thText, { paddingRight: 8 }]}>Summa</Text>
      </View>
      {groups.map((g) => (
        <View key={g.title || "rows"}>
          {g.title ? (
            <View style={s.group} minPresenceAhead={40}>
              <Text style={s.groupTitle}>{clean(g.title)}</Text>
              <Text style={s.groupSum}>{sek(g.subtotal)}</Text>
            </View>
          ) : null}
          {g.items.map((it) => (
            <View key={it.id} style={s.tr} wrap={false}>
              <View style={s.cDesc}>
                <Text style={s.cell}>{clean(it.description)}</Text>
                {showKind ? <Text style={s.kind}>{ITEM_KIND_LABEL[it.kind]}</Text> : null}
              </View>
              <Text style={[s.cQty, s.cell]}>{qty(it.qty)}</Text>
              <Text style={[s.cUnit, s.cell]}>{it.unit}</Text>
              <Text style={[s.cPrice, s.cell]}>{sek(displayUnitPrice(it, d.pricesInclVat, incl))}</Text>
              <Text style={[s.cSum, s.cell]}>{sek(incl ? t.lines[it.id].gross : t.lines[it.id].net)}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const KIND_SUM_LABEL: Record<ItemKind, string> = {
  labor: "Arbetskostnad",
  material: "Materialkostnad",
  other: "Övrigt",
};

/** "Pris sammanställning": costs excl. VAT, VAT, the ROT/RUT deduction and
 *  rounding, down to what a private person pays. A business reads the total
 *  excl. VAT, with VAT and the total incl. VAT right under it. */
function PriceSummaryBox({ quote }: { quote: Quote }) {
  const d = quote.data;
  const p = priceSummary(d);
  const software = d.division === "01";
  const label = deductionLabel(p.deductionKind);
  // Software has no labour/material split worth showing: one row for it all.
  const kindRows = software
    ? [{ k: "Summa enligt specifikation", v: Math.round(p.byKind.reduce((sum, r) => sum + r.amount, 0) * 100) / 100 }]
    : p.byKind.map((row) => ({
        k: KIND_SUM_LABEL[row.kind],
        v: row.amount,
        tag: row.kind === "labor" && p.deduction > 0 ? `Berättigad för ${label}-avdrag` : undefined,
      }));
  const vatRows = p.vatByRate.map((v) => ({ k: `Moms ${v.rate} %`, v: v.amount }));
  const rows: { k: string; v: number; tag?: string }[] = [
    ...kindRows,
    ...(p.inclVat ? vatRows : []),
    ...(p.deduction > 0 ? [{ k: `${label}-avdrag`, v: -p.deduction }] : []),
    { k: "Öresavrundning", v: p.rounding },
  ];
  const totalLabel = p.inclVat ? (p.deduction > 0 ? `Att betala efter ${label}` : "Att betala") : "Totalt exkl. moms";
  // Below the total: for a business VAT and the amount incl. VAT, which they pay;
  // for a private person the price before the deduction.
  const below: { k: string; v: number }[] = p.inclVat
    ? p.deduction > 0
      ? [{ k: "Totalpris utan avdrag", v: p.gross }]
      : []
    : [...vatRows, { k: "Att betala inkl. moms", v: p.gross }];

  return (
    <View style={s.sum} wrap={false}>
      <View style={s.sumHead}>
        <Text style={s.sumTitle}>
          <Text style={s.bold}>Pris </Text>sammanställning
        </Text>
        <Text style={s.sumMode}>Belopp i SEK</Text>
      </View>
      <View style={s.sumRows}>
        {rows.map((row) => (
          <View key={row.k} style={s.sumRow}>
            <View>
              <Text style={s.sumK}>{row.k}</Text>
              {row.tag ? <Text style={s.sumTag}>{row.tag}</Text> : null}
            </View>
            <Text style={s.sumV}>{signed(row.v)}</Text>
          </View>
        ))}
      </View>
      <View style={s.sumRule} />
      <View style={s.sumTotal}>
        <Text style={s.sumTotalK}>{totalLabel}</Text>
        <Text style={s.sumTotalV}>SEK {sek(p.total)}</Text>
      </View>
      {below.map((row) => (
        <View key={row.k} style={s.sumBelow}>
          <Text style={s.sumBelowK}>{row.k}</Text>
          <Text style={s.sumBelowV}>{sek(row.v)}</Text>
        </View>
      ))}
      {p.vatByRate.length === 0 ? <Text style={s.sumAfter}>Momsfritt.</Text> : null}
    </View>
  );
}

const STEPS: Record<Quote["data"]["division"], { title: string; text: string }[]> = {
  bygg: [
    { title: "Godkännande", text: "Ni godkänner offerten. Vi bokar startdatum och skickar en tidplan." },
    { title: "Startmöte", text: "Vi går igenom ritningar, materialval och hur hemmet skyddas under arbetet." },
    { title: "Bygget", text: "Ni följer arbetet i kundportalen med foton och tidplan. Ändringar godkänns där innan de görs." },
    { title: "Slutbesiktning", text: "Vi går igenom resultatet tillsammans och lämnar dokumentation och garantibevis." },
  ],
  "01": [
    { title: "Godkännande", text: "Ni godkänner offerten och vi bokar uppstart." },
    { title: "Uppstart", text: "Vi går igenom mål, innehåll och tidplan tillsammans." },
    { title: "Utveckling", text: "Ni ser arbetet löpande och godkänner varje etapp." },
    { title: "Lansering", text: "Vi lanserar, lär upp er och tar hand om drift och support." },
  ],
};

function Process({ quote }: { quote: Quote }) {
  return (
    <View style={s.section} wrap={false}>
      <Heading>Så går det till</Heading>
      <View style={s.steps}>
        {STEPS[quote.data.division].map((step, i) => (
          <View key={step.title} style={s.step}>
            <Text style={s.stepNo}>{String(i + 1).padStart(2, "0")}</Text>
            <Text style={s.stepTitle}>{step.title}</Text>
            <Text style={s.stepText}>{step.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Terms({ quote }: { quote: Quote }) {
  const d = quote.data;
  const t = quoteTotals(d);
  const c = d.customer;
  const persons = d.rotPersons.length > 0 ? d.rotPersons : [{ name: "", personalNumber: "" }];
  const cards: { h: string; body: ReactNode; wide?: boolean }[] = [];
  if (d.terms.payment.trim()) cards.push({ h: "Betalningsvillkor", body: <Lines text={d.terms.payment} style={s.termText} /> });
  if (d.terms.start.trim()) cards.push({ h: "Start och leverans", body: <Lines text={d.terms.start} style={s.termText} /> });
  if (d.terms.warranty.trim()) cards.push({ h: "Garanti och försäkring", body: <BulletList text={d.terms.warranty} icon="check" /> });
  if (d.terms.excluded.trim()) cards.push({ h: "Ingår inte", body: <BulletList text={d.terms.excluded} icon="cross" /> });
  if (d.terms.notes.trim()) cards.push({ h: "Övrigt", body: <Lines text={d.terms.notes} style={s.termText} /> });
  const rot = t.rot;
  if (rot) {
    const label = deductionLabel(t.deductionKind);
    const rule = DEDUCTION_RULES[t.deductionKind];
    cards.push({
      h: `${label}-avdrag, preliminärt`,
      wide: true,
      body: (
        <>
          {persons.map((person, i) => (
            <View key={i} style={s.rotLine}>
              <Text style={s.termText}>
                {clean(person.name || (i === 0 && c.name) || `Person ${i + 1}`)}
                {person.personalNumber ? ` (${person.personalNumber})` : ""}
              </Text>
              <Text style={s.termText}>-{sek(rot.perOwner[i] ?? 0)} SEK</Text>
            </View>
          ))}
          <Text style={[s.small, { marginTop: 6 }]}>
            {Math.round(rule.rate * 100)} % av arbetskostnaden inkl. moms ({sek(t.laborGross)} SEK), högst {sek(rule.cap)} SEK per
            person och år{t.deductionKind === "rut" ? " för ROT och RUT tillsammans" : ""}{rot.capped ? ", här begränsat av årstaket" : ""}. Avdraget dras på fakturan och förutsätter att ni
            {t.deductionKind === "rot" ? " äger bostaden," : ""} har betalat tillräckligt med skatt under året och inte redan använt ert utrymme. Material och resor ger inget
            avdrag. Vi förbehåller oss rätten att fakturera återstående belopp, motsvarande skattereduktionen, om begäran avslås av
            Skatteverket.
          </Text>
        </>
      ),
    });
  }
  if (cards.length === 0) return null;
  // Rows of two half-width cards; a wide card, or a half one left alone, fills its row.
  const rows: (typeof cards)[] = [];
  for (const card of cards) {
    const last = rows[rows.length - 1];
    if (!card.wide && last && last.length === 1 && !last[0].wide) last.push(card);
    else rows.push([card]);
  }
  const renderRow = (row: typeof cards) => (
    <View key={row[0].h} style={s.termRow}>
      {row.map((card) => (
        <View key={card.h} style={row.length === 2 ? s.term : s.termWide}>
          <Text style={s.termH}>{card.h}</Text>
          {card.body}
        </View>
      ))}
    </View>
  );
  // The heading travels with the first row, so it is never left alone at a page end.
  return (
    <View style={s.section}>
      <View wrap={false}>
        <Heading>Villkor</Heading>
        {renderRow(rows[0])}
      </View>
      {rows.slice(1).map((row) => (
        <View key={row[0].h} wrap={false}>
          {renderRow(row)}
        </View>
      ))}
    </View>
  );
}

function Signature({ quote, company, settings }: { quote: Quote; company: Company; settings: QuoteSettings }) {
  const d = quote.data;
  const c = d.customer;
  const customerLabel = c.type === "foretag" && c.company ? c.company : c.name;
  const ourRef = settings.signerName || company.legalName;
  return (
    <View style={s.section}>
      <Heading>Godkännande</Heading>
      <Text style={s.pMuted}>
        Offerten gäller till och med {formatDate(validUntil(d.date, d.validDays))}. Priserna gäller under giltighetstiden.
        Godkänn genom att skriva under och skicka tillbaka, eller svara på mejlet.
      </Text>
      <View style={s.sign}>
        <View style={s.signBox}>
          <View style={s.signLine} />
          <Text style={s.small}>Ort, datum och underskrift{customerLabel ? ` · ${clean(customerLabel)}` : ""}</Text>
        </View>
        <View style={s.signBox}>
          <View style={s.signLine} />
          <Text style={s.small}>
            För {clean(company.legalName)} · {clean(ourRef)}
            {settings.signerTitle ? `, ${clean(settings.signerTitle)}` : ""}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Contact({ company, settings }: { company: Company; settings: QuoteSettings }) {
  const cols: { k: string; v: string[] }[] = [
    { k: "Adress", v: [company.legalName, company.street, `${company.postalCode} ${company.city}`] },
    { k: "Kontakt", v: [company.phoneDisplay, company.email] },
    {
      k: "Betalning",
      v: [
        settings.bankgiro ? `Bankgiro ${settings.bankgiro}` : "",
        settings.plusgiro ? `Plusgiro ${settings.plusgiro}` : "",
        settings.iban ? `IBAN ${settings.iban}` : "",
        settings.bic ? `BIC ${settings.bic}` : "",
      ],
    },
    {
      k: "Företaget",
      v: [company.orgNr ? `Org.nr ${company.orgNr}` : "", settings.vatNumber ? `Momsreg.nr ${settings.vatNumber}` : "", settings.fSkatt ? "Godkänd för F-skatt" : ""],
    },
  ];
  return (
    <View style={s.contact}>
      {cols.map((col) => {
        const lines = col.v.map((x) => x.trim()).filter(Boolean);
        return lines.length ? (
          <View key={col.k} style={s.contactCol}>
            <Text style={s.label}>{col.k}</Text>
            <Text style={s.contactV}>{clean(lines.join("\n"))}</Text>
          </View>
        ) : null;
      })}
    </View>
  );
}

/* ------------------------------------------------------------ document */

export type QuotePhotos = {
  cover: PdfPhoto | null;
  banner: PdfPhoto | null;
  /** False when the quote is set to "no photo": no cover page and no band. */
  withCover: boolean;
};

export function QuotePdf({
  quote,
  company,
  settings,
  logo,
  photos = { cover: null, banner: null, withCover: false },
}: {
  quote: Quote;
  company: Company;
  settings: QuoteSettings;
  /** Data URI of the logo, or null to print the company name (lib/quotes/profile.ts). */
  logo: string | null;
  photos?: QuotePhotos;
}) {
  const d = quote.data;
  const number = String(quote.number);
  // The cover page is not counted in "Sida 1 av 3".
  const skip = photos.withCover ? 1 : 0;
  const footLine = [company.legalName, company.orgNr ? `Org.nr ${company.orgNr}` : "", company.phoneDisplay, company.email].filter(Boolean).join("  ·  ");

  return (
    <Document title={`Offert ${number} – ${company.legalName}`} author={company.legalName} subject={d.title} language="sv-SE">
      {photos.withCover ? <CoverPage quote={quote} company={company} settings={settings} logo={logo} photo={photos.cover} /> : null}
      <Page size="A4" style={s.page}>
        <View style={s.head} fixed>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt */}
          {logo ? <Image src={logo} style={s.headLogo} /> : <Text style={s.headName}>{clean(company.legalName)}</Text>}
          <View style={s.headRight}>
            <Text style={s.headText} render={({ pageNumber, totalPages }) => `Offert ${number}  ·  Sida ${pageNumber - skip} av ${totalPages - skip}`} />
          </View>
        </View>
        <View style={s.foot} fixed>
          <Text style={s.footText}>{clean(footLine)}</Text>
          {settings.fSkatt ? <Text style={s.footText}>Godkänd för F-skatt</Text> : null}
        </View>

        {/* Without a cover, the title, facts and parties open the first page. */}
        {photos.withCover ? null : (
          <>
            <Text style={s.eyebrow}>OFFERT {number}</Text>
            <Text style={s.h1}>{clean(d.title || "Offert")}</Text>
            <Facts quote={quote} company={company} style={s.factsInline} />
            <Parties quote={quote} company={company} settings={settings} />
          </>
        )}
        {d.intro.trim() ? (
          <View style={photos.withCover ? undefined : s.section}>
            <Heading>Beskrivning av arbetet</Heading>
            <Lines text={d.intro} style={s.pMuted} />
          </View>
        ) : null}

        <Items quote={quote} />
        <PriceSummaryBox quote={quote} />
        {d.show.process ? <Process quote={quote} /> : null}

        {d.show.band && photos.banner ? (
          <View style={s.band} wrap={false}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt */}
            <Image src={photos.banner} style={s.bandPhoto} />
            <View style={s.bandShade} />
            <View style={s.bandText}>
              <View style={s.accent} />
              <Text style={s.bandLine}>{BANNER_LINE[d.division]}</Text>
            </View>
          </View>
        ) : null}

        <Terms quote={quote} />
        {/* Signature and our details stay together on the last page. */}
        <View wrap={false}>
          <Signature quote={quote} company={company} settings={settings} />
          <Contact company={company} settings={settings} />
        </View>
      </Page>
    </Document>
  );
}
