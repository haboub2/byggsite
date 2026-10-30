import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PayslipDocument } from "../core/payroll/payslip";
import { JAKARTA_BOLD, JAKARTA_ITALIC, JAKARTA_MEDIUM, JAKARTA_REGULAR } from "./fonts";

/**
 * A lönebesked as an A4 PDF in the invoice's look (Plus Jakarta Sans,
 * anthracite ink, one orange accent). Everything comes from the frozen
 * PayslipDocument and its run context; nothing is computed here except
 * formatting. The employee's personnummer is masked.
 *
 * The react-pdf quirks of the other documents apply: line height only on
 * Text and always with a font size, never on the Page.
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
const SOFT = "#f6f4ef";
const X = 48;
const NO_LIGATURES = { liga: false, clig: false };

const s = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 64, paddingHorizontal: X, fontFamily: "Jakarta", fontFeatureSettings: NO_LIGATURES, fontSize: 9, color: INK },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 1.5, borderBottomColor: INK, paddingBottom: 12 },
  logo: { width: 110, height: 32, objectFit: "contain", objectPosition: "left top" },
  employer: { fontSize: 11, lineHeight: 1.3, fontWeight: 700, maxWidth: 260 },
  employerSmall: { fontSize: 8.5, lineHeight: 1.4, color: INK2, marginTop: 4 },
  titleBox: { alignItems: "flex-end" },
  title: { fontSize: 20, lineHeight: 1.15, fontWeight: 700, letterSpacing: -0.4 },
  subtitle: { fontSize: 9, lineHeight: 1.4, color: INK2, marginTop: 4, textAlign: "right" },
  accent: { width: 36, borderTopWidth: 3, borderTopColor: ORANGE, marginTop: 8 },

  facts: { flexDirection: "row", marginTop: 14, gap: 18 },
  fact: { flex: 1 },
  k: { fontSize: 7.5, lineHeight: 1.3, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: INK3 },
  v: { fontSize: 9.5, lineHeight: 1.4, marginTop: 2 },

  table: { marginTop: 18 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 4 },
  tr: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: LINE },
  cText: { flex: 1, fontSize: 9, lineHeight: 1.35, paddingRight: 8 },
  cCode: { width: 34, fontSize: 8, lineHeight: 1.35, color: INK3 },
  cNum: { width: 70, fontSize: 9, lineHeight: 1.35, textAlign: "right" },
  cAmt: { width: 78, fontSize: 9, lineHeight: 1.35, textAlign: "right" },
  thText: { fontSize: 7.5, lineHeight: 1.3, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: INK2 },

  sums: { marginTop: 12, marginLeft: "auto", width: 260 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  sumK: { fontSize: 9, lineHeight: 1.35, color: INK2 },
  sumV: { fontSize: 9, lineHeight: 1.35, textAlign: "right" },
  netRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, marginTop: 4, borderTopWidth: 1.5, borderTopColor: INK },
  netK: { fontSize: 12, lineHeight: 1.3, fontWeight: 700 },
  netV: { fontSize: 12, lineHeight: 1.3, fontWeight: 700 },

  boxes: { flexDirection: "row", gap: 12, marginTop: 20 },
  box: { flex: 1, backgroundColor: SOFT, padding: 10 },
  boxH: { fontSize: 7.5, lineHeight: 1.3, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: INK2, marginBottom: 4 },
  boxRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
  boxK: { flex: 1, fontSize: 8.5, lineHeight: 1.35, color: INK2, paddingRight: 6 },
  boxV: { fontSize: 8.5, lineHeight: 1.35, textAlign: "right" },

  foot: { position: "absolute", bottom: 26, left: X, right: X, paddingTop: 8, borderTopWidth: 0.6, borderTopColor: LINE },
  footText: { fontSize: 7, lineHeight: 1.4, color: INK3 },
});

const kr = (ore: number) =>
  `${(ore / 100).toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, " ")} kr`;
const qty = (n: number | null, unit: string | null) => (n === null ? "" : `${String(Math.round(n * 100) / 100).replace(".", ",")}${unit ? ` ${unit}` : ""}`);
const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
export const monthLabel = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

const TAX_METHOD: Record<string, string> = {
  table: "tabell",
  "jamkning-percent": "jämkning",
  "jamkning-amount": "jämkning (belopp)",
  "side-income": "30 % (sidoinkomst)",
  none: "inget skatteavdrag",
  "below-annual-threshold": "under 1 000 kr per år",
  "below-single-payment": "under 100 kr",
};

export type PayslipPdfProps = {
  doc: PayslipDocument;
  number: number | null;
  employer: { name: string; orgNr: string; street: string; postalCode: string; city: string };
  logo: string | null;
};

export function PayslipPdf({ doc, number, employer, logo }: PayslipPdfProps) {
  const t = doc.totals;
  const c = doc.context;
  const taxLabel =
    doc.tax.method === "table" || doc.tax.method === "jamkning-amount"
      ? `Skatteavdrag, tabell ${doc.tax.tableNo} kolumn ${doc.tax.columnNo}${doc.tax.method === "jamkning-amount" ? " (jämkning)" : ""}`
      : `Skatteavdrag, ${TAX_METHOD[doc.tax.method] ?? doc.tax.method}${doc.tax.percent !== null ? ` ${String(doc.tax.percent).replace(".", ",")} %` : ""}`;
  const variable = c && (c.timeFrom !== doc.periodStart || c.timeTo !== doc.periodEnd) ? `Tid och frånvaro ${monthLabel(c.timeFrom)}` : null;
  return (
    <Document title={`Lönebesked ${monthLabel(doc.periodStart)}, ${doc.employeeName}`} author={employer.name} subject="Lönebesked" creator="Binaafy" producer="Binaafy">
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View>
            {logo ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt
              <Image src={logo} style={s.logo} />
            ) : (
              <Text style={s.employer}>{employer.name}</Text>
            )}
            <Text style={s.employerSmall}>
              {[employer.name, employer.orgNr && `org.nr ${employer.orgNr}`].filter(Boolean).join(" · ")}
              {"\n"}
              {[employer.street, [employer.postalCode, employer.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
            </Text>
          </View>
          <View style={s.titleBox}>
            <Text style={s.title}>Lönebesked</Text>
            <Text style={s.subtitle}>
              {monthLabel(doc.periodStart)}
              {number !== null ? ` · nr L${number}` : ""}
            </Text>
            <View style={s.accent} />
          </View>
        </View>

        <View style={s.facts}>
          <View style={s.fact}>
            <Text style={s.k}>Anställd</Text>
            <Text style={s.v}>{doc.employeeName}</Text>
            {c?.pnrMasked ? <Text style={s.v}>{c.pnrMasked}</Text> : null}
          </View>
          <View style={s.fact}>
            <Text style={s.k}>Period</Text>
            <Text style={s.v}>
              {doc.periodStart} – {doc.periodEnd}
            </Text>
            {variable ? <Text style={s.v}>{variable}</Text> : null}
          </View>
          <View style={s.fact}>
            <Text style={s.k}>Utbetalning</Text>
            <Text style={s.v}>{doc.payDate}</Text>
          </View>
        </View>

        <View style={s.table}>
          <View style={s.th}>
            <Text style={[s.cCode, s.thText]}>Art</Text>
            <Text style={[s.cText, s.thText]}>Benämning</Text>
            <Text style={[s.cNum, s.thText]}>Antal</Text>
            <Text style={[s.cNum, s.thText]}>À-pris</Text>
            <Text style={[s.cAmt, s.thText]}>Belopp</Text>
          </View>
          {doc.lines.map((l, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <Text style={s.cCode}>{l.code}</Text>
              <Text style={s.cText}>
                {l.text}
                {l.ratePercent !== null && l.basisOre !== null && l.unitPriceOre === null ? ` (${String(l.ratePercent).replace(".", ",")} % av ${kr(l.basisOre)})` : ""}
              </Text>
              <Text style={s.cNum}>{qty(l.quantity, l.unit)}</Text>
              <Text style={s.cNum}>{l.unitPriceOre !== null ? kr(l.unitPriceOre) : ""}</Text>
              <Text style={s.cAmt}>{kr(l.amountOre)}</Text>
            </View>
          ))}
        </View>

        <View style={s.sums} wrap={false}>
          <View style={s.sumRow}>
            <Text style={s.sumK}>Bruttolön</Text>
            <Text style={s.sumV}>{kr(t.cashGrossOre)}</Text>
          </View>
          {t.benefitOre ? (
            <View style={s.sumRow}>
              <Text style={s.sumK}>Förmåner (skattepliktigt värde)</Text>
              <Text style={s.sumV}>{kr(t.benefitOre)}</Text>
            </View>
          ) : null}
          {t.taxFreeReimbursementOre ? (
            <View style={s.sumRow}>
              <Text style={s.sumK}>Skattefria ersättningar</Text>
              <Text style={s.sumV}>{kr(t.taxFreeReimbursementOre)}</Text>
            </View>
          ) : null}
          <View style={s.sumRow}>
            <Text style={s.sumK}>{taxLabel}</Text>
            <Text style={s.sumV}>{kr(-t.taxOre)}</Text>
          </View>
          {doc.tax.lumpSumOre ? (
            <View style={s.sumRow}>
              <Text style={s.sumK}>varav engångsskatt {doc.tax.lumpSumPercent} %</Text>
              <Text style={s.sumV}>{kr(-doc.tax.lumpSumOre)}</Text>
            </View>
          ) : null}
          {t.netAdjustmentOre ? (
            <View style={s.sumRow}>
              <Text style={s.sumK}>Avdrag efter skatt</Text>
              <Text style={s.sumV}>{kr(t.netAdjustmentOre)}</Text>
            </View>
          ) : null}
          <View style={s.netRow}>
            <Text style={s.netK}>Att utbetala</Text>
            <Text style={s.netV}>{kr(t.netOre)}</Text>
          </View>
        </View>

        <View style={s.boxes} wrap={false}>
          <View style={s.box}>
            <Text style={s.boxH}>Hittills i år</Text>
            <View style={s.boxRow}>
              <Text style={s.boxK}>Bruttolön</Text>
              <Text style={s.boxV}>{c ? kr(c.yearToDate.cashGrossOre) : "–"}</Text>
            </View>
            <View style={s.boxRow}>
              <Text style={s.boxK}>Skatteavdrag</Text>
              <Text style={s.boxV}>{c ? kr(c.yearToDate.taxOre) : "–"}</Text>
            </View>
          </View>
          <View style={s.box}>
            <Text style={s.boxH}>Semester</Text>
            <View style={s.boxRow}>
              <Text style={s.boxK}>Betalda dagar kvar</Text>
              <Text style={s.boxV}>{c?.vacation.remainingDays !== null && c?.vacation.remainingDays !== undefined ? String(c.vacation.remainingDays).replace(".", ",") : c?.vacation.rule === "procent" ? "procentregeln" : "–"}</Text>
            </View>
            {c?.vacation.rule === "procent" && c.vacation.liabilityOre ? (
              <View style={s.boxRow}>
                <Text style={s.boxK}>Intjänad semesterlön</Text>
                <Text style={s.boxV}>{kr(c.vacation.liabilityOre)}</Text>
              </View>
            ) : null}
          </View>
          <View style={s.box}>
            <Text style={s.boxH}>Arbetsgivaren betalar också</Text>
            <View style={s.boxRow}>
              <Text style={s.boxK}>Avgifter {String(doc.contributions.ratePercent).replace(".", ",")} %</Text>
              <Text style={s.boxV}>{kr(t.employerContributionOre)}</Text>
            </View>
            {c?.pension.premiumOre ? (
              <View style={s.boxRow}>
                <Text style={s.boxK}>Tjänstepension ({c.pension.scheme === "itp1" ? "ITP 1" : "SAF-LO"})</Text>
                <Text style={s.boxV}>{kr(c.pension.premiumOre)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={s.foot} fixed>
          <Text style={s.footText}>
            Lönebesked {number !== null ? `L${number} ` : ""}· {doc.employeeName} · regler från {doc.ruleSetValidFrom}
            {doc.taxTableVersion ? ` · skattetabell ${doc.payDate.slice(0, 4)} (${doc.taxTableVersion.slice(0, 12)})` : ""}. Frågor om lönen: kontakta {employer.name}.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
