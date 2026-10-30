import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ContractContent } from "../core/hr/contract";
import { JAKARTA_BOLD, JAKARTA_ITALIC, JAKARTA_MEDIUM, JAKARTA_REGULAR } from "./fonts";

/**
 * An employment contract (or board assignment) as an A4 PDF, in the
 * invoice's look: Plus Jakarta Sans, anthracite ink, one orange accent.
 * Everything it says comes from lib/core/hr/contract.ts; this file only
 * lays it out: title, the sections as label/value tables and paragraphs,
 * two signature lines, and a footer with the template version and pages.
 *
 * The react-pdf quirks of the other documents apply: line height only on
 * Text and always with a font size, never on the Page (it hides the fixed
 * footer); the page number is placed from the top.
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
const X = 52;
const A4_HEIGHT = 841.89;
const NO_LIGATURES = { liga: false, clig: false };

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 74, paddingHorizontal: X, fontFamily: "Jakarta", fontFeatureSettings: NO_LIGATURES, fontSize: 9.5, color: INK },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 1.5, borderBottomColor: INK, paddingBottom: 12 },
  logo: { width: 110, height: 32, objectFit: "contain", objectPosition: "left top" },
  employer: { fontSize: 11, lineHeight: 1.3, fontWeight: 700, maxWidth: 260 },
  titleBox: { alignItems: "flex-end", maxWidth: 300 },
  title: { fontSize: 20, lineHeight: 1.15, fontWeight: 700, letterSpacing: -0.4, textAlign: "right" },
  subtitle: { fontSize: 9, lineHeight: 1.4, color: INK2, textAlign: "right", marginTop: 4 },
  accent: { width: 36, borderTopWidth: 3, borderTopColor: ORANGE, marginTop: 8 },

  section: { marginTop: 16 },
  h2: { fontSize: 8, lineHeight: 1.3, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: INK2, marginBottom: 5 },
  row: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: LINE },
  k: { width: 150, fontSize: 9, lineHeight: 1.4, color: INK3, paddingRight: 10 },
  v: { flex: 1, fontSize: 9.5, lineHeight: 1.4 },
  p: { fontSize: 9.5, lineHeight: 1.5, color: INK, marginTop: 4 },

  signs: { flexDirection: "row", gap: 40, marginTop: 34 },
  sign: { flex: 1 },
  signPlace: { fontSize: 8.5, lineHeight: 1.4, color: INK3, marginBottom: 34 },
  signLine: { borderTopWidth: 0.8, borderTopColor: INK, paddingTop: 4 },
  signText: { fontSize: 9, lineHeight: 1.4 },
  signName: { fontSize: 8.5, lineHeight: 1.4, color: INK3 },

  foot: { position: "absolute", bottom: 28, left: X, right: X, paddingTop: 8, paddingRight: 70, borderTopWidth: 0.6, borderTopColor: LINE },
  footText: { fontSize: 7.2, lineHeight: 1.4, color: INK3 },
  footPage: { position: "absolute", top: A4_HEIGHT - 28 - 2 * 7.2 * 1.4, right: X, width: 70, fontSize: 7.2, lineHeight: 1.4, color: INK3, textAlign: "right" },
});

export type EmploymentContractPdfProps = {
  content: ContractContent;
  employerName: string;
  employeeName: string;
  logo: string | null;
  /** The day the document was made. */
  madeOn: string;
};

export function EmploymentContractPdf({ content, employerName, employeeName, logo, madeOn }: EmploymentContractPdfProps) {
  return (
    <Document title={`${content.title}, ${employeeName}`} author={employerName} subject={content.subtitle} creator="Binaafy" producer="Binaafy">
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View>
            {logo ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt
              <Image src={logo} style={s.logo} />
            ) : (
              <Text style={s.employer}>{employerName}</Text>
            )}
          </View>
          <View style={s.titleBox}>
            <Text style={s.title}>{content.title}</Text>
            <Text style={s.subtitle}>{content.subtitle}</Text>
            <View style={s.accent} />
          </View>
        </View>

        {content.sections.map((section) => (
          <View key={section.heading} style={s.section} wrap={(section.paragraphs?.length ?? 0) > 2}>
            <Text style={s.h2} minPresenceAhead={40}>
              {section.heading}
            </Text>
            {(section.rows ?? []).map(([k, v], i) => (
              <View key={`${k}-${i}`} style={s.row} wrap={false}>
                <Text style={s.k}>{k}</Text>
                <Text style={s.v}>{v}</Text>
              </View>
            ))}
            {(section.paragraphs ?? []).map((p, i) => (
              <Text key={i} style={s.p}>
                {p}
              </Text>
            ))}
          </View>
        ))}

        <View style={s.signs} wrap={false}>
          <View style={s.sign}>
            <Text style={s.signPlace}>Ort och datum</Text>
            <View style={s.signLine}>
              <Text style={s.signText}>{content.signatures.employer}</Text>
              <Text style={s.signName}>Namnförtydligande</Text>
            </View>
          </View>
          <View style={s.sign}>
            <Text style={s.signPlace}>Ort och datum</Text>
            <View style={s.signLine}>
              <Text style={s.signText}>{content.signatures.employee}</Text>
              <Text style={s.signName}>{employeeName}</Text>
            </View>
          </View>
        </View>

        <View style={s.foot} fixed>
          <Text style={s.footText}>
            {content.title} · {employeeName} · upprättat {madeOn} · mall {content.template} version {content.templateVersion}. Avtalet upprättas i två exemplar, ett till var part.
          </Text>
        </View>
        <Text style={s.footPage} fixed render={({ pageNumber, totalPages }) => `Sida ${pageNumber} av ${totalPages}`} />
      </Page>
    </Document>
  );
}
