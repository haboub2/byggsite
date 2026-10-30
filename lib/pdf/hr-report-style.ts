import { Font, StyleSheet } from "@react-pdf/renderer";
import { JAKARTA_BOLD, JAKARTA_ITALIC, JAKARTA_MEDIUM, JAKARTA_REGULAR } from "./fonts";

/**
 * The look of the lönebesked (PayslipPdf.tsx) for the phase 4 documents:
 * arbetsgivarintyg and årsbesked. Line height only on Text and always with
 * a font size, never on the Page (react-pdf hides fixed footers otherwise).
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

export const INK = "#1e2c37";
export const INK2 = "#4b5763";
export const INK3 = "#6b7680";
const ORANGE = "#f7802e";
const LINE = "#e3e0d9";
const SOFT = "#f6f4ef";
const X = 48;

export const hr = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 64, paddingHorizontal: X, fontFamily: "Jakarta", fontFeatureSettings: { liga: false, clig: false }, fontSize: 9, color: INK },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 1.5, borderBottomColor: INK, paddingBottom: 12 },
  logo: { width: 110, height: 32, objectFit: "contain", objectPosition: "left top" },
  employer: { fontSize: 11, lineHeight: 1.3, fontWeight: 700, maxWidth: 260 },
  employerSmall: { fontSize: 8.5, lineHeight: 1.4, color: INK2, marginTop: 4 },
  titleBox: { alignItems: "flex-end" },
  title: { fontSize: 20, lineHeight: 1.15, fontWeight: 700, letterSpacing: -0.4 },
  subtitle: { fontSize: 9, lineHeight: 1.4, color: INK2, marginTop: 4, textAlign: "right", maxWidth: 240 },
  accent: { width: 36, borderTopWidth: 3, borderTopColor: ORANGE, marginTop: 8 },
  facts: { flexDirection: "row", marginTop: 14, gap: 18 },
  fact: { flex: 1 },
  k: { fontSize: 7.5, lineHeight: 1.3, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: INK3 },
  v: { fontSize: 9.5, lineHeight: 1.4, marginTop: 2 },
  h2: { fontSize: 10, lineHeight: 1.3, fontWeight: 700, marginTop: 18 },
  table: { marginTop: 6 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 4 },
  tr: { flexDirection: "row", paddingVertical: 3.5, borderBottomWidth: 0.5, borderBottomColor: LINE },
  trSum: { flexDirection: "row", paddingVertical: 4, borderTopWidth: 1, borderTopColor: INK },
  thText: { fontSize: 7, lineHeight: 1.3, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: INK2 },
  cell: { fontSize: 8.5, lineHeight: 1.35 },
  cellBold: { fontSize: 8.5, lineHeight: 1.35, fontWeight: 700 },
  note: { fontSize: 8, lineHeight: 1.45, color: INK2, marginTop: 8 },
  box: { backgroundColor: SOFT, padding: 10, marginTop: 14 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: LINE },
  sumK: { fontSize: 9.5, lineHeight: 1.35, color: INK2 },
  sumV: { fontSize: 9.5, lineHeight: 1.35, textAlign: "right" },
  sign: { flexDirection: "row", gap: 24, marginTop: 28 },
  signCol: { flex: 1, borderTopWidth: 0.8, borderTopColor: INK, paddingTop: 4 },
  foot: { position: "absolute", bottom: 26, left: X, right: X, paddingTop: 8, borderTopWidth: 0.6, borderTopColor: LINE },
  footText: { fontSize: 7, lineHeight: 1.4, color: INK3 },
});

export const kr = (ore: number, decimals = 2) =>
  `${(ore / 100).toLocaleString("sv-SE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).replace(/\s/g, " ")} kr`;
export const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
