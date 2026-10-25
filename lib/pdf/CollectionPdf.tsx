import { Document, Font, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { formatOre } from "../core/money";
import { JAKARTA_BOLD, JAKARTA_ITALIC, JAKARTA_MEDIUM, JAKARTA_REGULAR } from "./fonts";
import type { InterestPeriod } from "../core/collections/collections";

/**
 * The collection letters and the summary for the agency, in the invoice's
 * look (Plus Jakarta Sans, anthracite, one orange accent) and with the
 * address where a right-window envelope shows it.
 *
 *   CollectionLetterPdf  an inkassokrav (heading "Inkassokrav" only for a
 *                        demand under 5 § inkassolagen, FFFS 2025:2 4 kap.
 *                        3 §) or a copy of a sent reminder, rebuilt from the
 *                        reminders register for the agency's file.
 *   CollectionSummaryPdf what the agency needs to take the case: creditor,
 *                        debtor (a private person's number masked), the
 *                        claim with interest period by period, payments and
 *                        the reminder history.
 *
 * The data is computed by the caller (lib/core/collections); the PDF only
 * lays it out.
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
const WINDOW_LEFT = 115 * MM;

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 70, paddingHorizontal: X, fontFamily: "Jakarta", fontFeatureSettings: { liga: false, clig: false }, fontSize: 9.5, color: INK },
  fold: { position: "absolute", left: 0, top: 99 * MM, width: 14, borderTopWidth: 0.6, borderTopColor: INK3 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", minHeight: 74 },
  logo: { width: 110, height: 34, objectFit: "contain", objectPosition: "left top" },
  name: { fontSize: 15, lineHeight: 1.2, fontWeight: 700, letterSpacing: -0.3, maxWidth: 260 },
  sender: { fontSize: 7.5, lineHeight: 1.4, color: INK3, marginTop: 6 },
  title: { fontSize: 24, lineHeight: 1.1, fontWeight: 700, letterSpacing: -0.6, textAlign: "right" },
  sub: { fontSize: 9, lineHeight: 1.35, color: INK2, textAlign: "right", marginTop: 3 },
  copy: { alignSelf: "flex-end", marginTop: 8, borderWidth: 1, borderColor: INK3, borderRadius: 3, paddingVertical: 3, paddingHorizontal: 7, fontSize: 8, color: INK2 },

  window: { flexDirection: "row", alignItems: "flex-start", marginTop: 20, minHeight: 100 },
  details: { width: WINDOW_LEFT - X - 34 },
  address: { position: "absolute", left: WINDOW_LEFT - X, right: 0, top: 0 },
  addrName: { fontSize: 11, lineHeight: 1.4, fontWeight: 700, marginTop: 3 },
  addrLine: { fontSize: 11, lineHeight: 1.4 },
  label: { fontSize: 7, lineHeight: 1.3, letterSpacing: 1.4, textTransform: "uppercase", color: INK3, marginBottom: 3 },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: 8, paddingVertical: 1 },
  kvK: { fontSize: 9, lineHeight: 1.4, color: INK3 },
  kvV: { fontSize: 9, lineHeight: 1.4, textAlign: "right", flexShrink: 1 },

  h2: { fontSize: 11, lineHeight: 1.25, fontWeight: 700, marginTop: 18, marginBottom: 4 },
  p: { fontSize: 9.5, lineHeight: 1.5, color: INK, marginTop: 6 },
  small: { fontSize: 8.5, lineHeight: 1.5, color: INK2, marginTop: 4 },

  table: { marginTop: 12 },
  tr: { flexDirection: "row", paddingVertical: 4.5, borderBottomWidth: 0.5, borderBottomColor: LINE, gap: 10 },
  trK: { flex: 1, fontSize: 9.5, lineHeight: 1.35 },
  trD: { fontSize: 8, lineHeight: 1.35, color: INK3 },
  trV: { width: 100, fontSize: 9.5, lineHeight: 1.35, textAlign: "right" },
  total: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderTopWidth: 1.5, borderTopColor: INK, marginTop: 4, paddingTop: 7 },
  totalK: { fontSize: 11, lineHeight: 1.2, fontWeight: 700 },
  totalV: { fontSize: 15, lineHeight: 1.2, fontWeight: 700, letterSpacing: -0.3 },

  pay: { marginTop: 16, backgroundColor: PAPER, borderLeftWidth: 3, borderLeftColor: ORANGE, paddingVertical: 11, paddingHorizontal: 13, flexDirection: "row", gap: 16 },
  payCol: { flex: 1 },
  payV: { fontSize: 12, lineHeight: 1.3, fontWeight: 700 },

  th: { flexDirection: "row", marginTop: 8, paddingBottom: 4, borderBottomWidth: 0.8, borderBottomColor: INK, gap: 8 },
  thText: { fontSize: 7, lineHeight: 1.2, letterSpacing: 1.1, textTransform: "uppercase", color: INK3 },
  row: { flexDirection: "row", paddingVertical: 3.5, borderBottomWidth: 0.5, borderBottomColor: LINE, gap: 8 },
  cell: { fontSize: 8.5, lineHeight: 1.35 },
  grid: { flexDirection: "row", gap: 24, marginTop: 12 },
  col: { flex: 1 },

  foot: { position: "absolute", bottom: 26, left: X, right: X, paddingTop: 8, borderTopWidth: 0.6, borderTopColor: LINE },
  footText: { fontSize: 7.2, lineHeight: 1.4, color: INK3 },
});

const money = (ore: number) => formatOre(ore).replace(/−/g, "-");
const kr = (ore: number) => `${money(ore)} kr`;
const pct = (p: number) => `${String(p).replace(".", ",")} %`;
const postal = (p: { postalCode: string; city: string }) => [p.postalCode, p.city].filter(Boolean).join(" ");

export type Party = { name: string; orgNr?: string; street: string; postalCode: string; city: string; email: string; phone: string };
export type Creditor = Party & { vatNr?: string; signer: string; logo?: string | null };
export type Debtor = Party & { type: "privat" | "foretag" | "byggforetag"; reference?: string; /** Org nr, or a private person's masked personal number. */ id: string };
export type InvoiceFacts = { number: string; issueDate: string; dueDate: string; description: string; payableOre: number; bankgiro: string; plusgiro: string; referenceLabel: string; referenceValue: string; currency: string };
export type AmountLine = { label: string; detail?: string; ore: number };

function Head({ creditor, title, sub, copy }: { creditor: Creditor; title: string; sub: string[]; copy?: string }) {
  return (
    <View style={s.head}>
      <View>
        {creditor.logo ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt
          <Image src={creditor.logo} style={s.logo} />
        ) : (
          <Text style={s.name}>{creditor.name}</Text>
        )}
        <Text style={s.sender}>
          {[creditor.name, creditor.street, postal(creditor)].filter(Boolean).join(" · ")}
          {"\n"}
          {[creditor.orgNr ? `Org.nr ${creditor.orgNr}` : "", creditor.phone, creditor.email].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <View>
        <Text style={s.title}>{title}</Text>
        {sub.map((t) => (
          <Text key={t} style={s.sub}>
            {t}
          </Text>
        ))}
        {copy ? <Text style={s.copy}>{copy}</Text> : null}
      </View>
    </View>
  );
}

function Window({ debtor, facts }: { debtor: Debtor; facts: [string, string][] }) {
  return (
    <View style={s.window}>
      <View style={s.details}>
        {facts.map(([k, v]) => (
          <View key={k} style={s.kv}>
            <Text style={s.kvK}>{k}</Text>
            <Text style={s.kvV}>{v}</Text>
          </View>
        ))}
      </View>
      <View style={s.address}>
        <Text style={s.addrName}>{debtor.name}</Text>
        {debtor.reference ? <Text style={s.addrLine}>{debtor.reference}</Text> : null}
        <Text style={s.addrLine}>{debtor.street}</Text>
        <Text style={s.addrLine}>{postal(debtor)}</Text>
      </View>
    </View>
  );
}

function Amounts({ lines, totalLabel, totalOre }: { lines: AmountLine[]; totalLabel: string; totalOre: number }) {
  return (
    <View style={s.table} wrap={false}>
      {lines.map((l) => (
        <View key={l.label} style={s.tr}>
          <View style={{ flex: 1 }}>
            <Text style={s.trK}>{l.label}</Text>
            {l.detail ? <Text style={s.trD}>{l.detail}</Text> : null}
          </View>
          <Text style={s.trV}>{kr(l.ore)}</Text>
        </View>
      ))}
      <View style={s.total}>
        <Text style={s.totalK}>{totalLabel}</Text>
        <Text style={s.totalV}>{kr(totalOre)}</Text>
      </View>
    </View>
  );
}

function Foot({ creditor }: { creditor: Creditor }) {
  return (
    <View style={s.foot} fixed>
      <Text style={s.footText}>
        {[creditor.name, creditor.street, postal(creditor), creditor.orgNr ? `Org.nr ${creditor.orgNr}` : "", creditor.vatNr ? `Momsreg.nr ${creditor.vatNr}` : ""].filter(Boolean).join(" · ")}
        {"\n"}
        {[creditor.phone ? `Telefon ${creditor.phone}` : "", creditor.email ? `E-post ${creditor.email}` : ""].filter(Boolean).join(" · ")}
      </Text>
    </View>
  );
}

function PayBox({ invoice, totalOre, payBy }: { invoice: InvoiceFacts; totalOre: number; payBy: string | null }) {
  return (
    <View style={s.pay} wrap={false}>
      <View style={s.payCol}>
        <Text style={s.label}>Att betala</Text>
        <Text style={s.payV}>{kr(totalOre)}</Text>
      </View>
      {payBy ? (
        <View style={s.payCol}>
          <Text style={s.label}>Senast</Text>
          <Text style={s.payV}>{payBy}</Text>
        </View>
      ) : null}
      <View style={s.payCol}>
        <Text style={s.label}>{invoice.bankgiro ? "Bankgiro" : invoice.plusgiro ? "Plusgiro" : "Betalning"}</Text>
        <Text style={s.payV}>{invoice.bankgiro || invoice.plusgiro || "Enligt fakturan"}</Text>
      </View>
      <View style={s.payCol}>
        <Text style={s.label}>{invoice.referenceLabel}</Text>
        <Text style={s.payV}>{invoice.referenceValue}</Text>
      </View>
    </View>
  );
}

export type LetterProps = {
  kind: "reminder" | "demand";
  creditor: Creditor;
  debtor: Debtor;
  invoice: InvoiceFacts;
  /** The day it was (or will be) sent; also the print date on a demand. */
  sentOn: string;
  level: number;
  lines: AmountLine[];
  totalOre: number;
  payBy: string | null;
  daysOverdue: number;
  /** Today's rate for the interest paragraph (FFFS 2025:2 4 kap. 4 §). */
  interest: { percent: number; referencePercent: number } | null;
  /** "Kopia ur påminnelseregistret …" on a copy rebuilt for the agency. */
  copy?: string;
  sentTo?: string;
};

/** An inkassokrav, or a copy of a reminder. */
export function CollectionLetterPdf(p: LetterProps) {
  const demand = p.kind === "demand";
  const title = demand ? "Inkassokrav" : `Påminnelse ${p.level}`;
  const contact = [p.creditor.phone ? `telefon ${p.creditor.phone}` : "", p.creditor.email ? `e-post ${p.creditor.email}` : ""].filter(Boolean).join(" eller ");
  return (
    <Document title={`${title} faktura ${p.invoice.number}`} author={p.creditor.name} language="sv">
      <Page size="A4" style={s.page}>
        <View style={s.fold} fixed />
        <Head creditor={p.creditor} title={title} sub={[`Faktura ${p.invoice.number}`, `${demand ? "Utskriftsdatum" : "Skickad"} ${p.sentOn}`]} copy={p.copy} />
        <Window
          debtor={p.debtor}
          facts={[
            ["Borgenär", p.creditor.name],
            ...(p.creditor.orgNr ? ([["Org.nr", p.creditor.orgNr]] as [string, string][]) : []),
            ["Faktura", p.invoice.number],
            ["Fakturadatum", p.invoice.issueDate],
            ["Förföll", p.invoice.dueDate],
            ...(p.debtor.id ? ([[p.debtor.type === "privat" ? "Personnr" : "Ert org.nr", p.debtor.id]] as [string, string][]) : []),
            ...(p.sentTo ? ([["Skickad till", p.sentTo]] as [string, string][]) : []),
          ]}
        />

        <Text style={s.p}>
          {demand
            ? `Vi har inte fått betalt för faktura ${p.invoice.number} daterad ${p.invoice.issueDate}, som avser ${p.invoice.description}. Fakturan förföll ${p.invoice.dueDate} och är ${p.daysOverdue} dagar försenad${p.level > 1 ? ", trots påminnelse" : ""}. Vi kräver därför betalning enligt nedan.`
            : `Vi saknar betalning för faktura ${p.invoice.number} daterad ${p.invoice.issueDate}, som avser ${p.invoice.description}. Fakturan förföll ${p.invoice.dueDate}.`}
        </Text>

        <Amounts lines={p.lines} totalLabel="Att betala" totalOre={p.totalOre} />
        <PayBox invoice={p.invoice} totalOre={p.totalOre} payBy={p.payBy} />

        {demand ? (
          <>
            <Text style={s.h2}>Ränta</Text>
            <Text style={s.small}>
              Dröjsmålsräntan är beräknad enligt räntelagen (1975:635) 6 §, med Riksbankens referensränta för varje kalenderhalvår plus åtta procentenheter.
              {p.interest ? ` Gällande räntesats i dag är ${pct(p.interest.percent)} (referensränta ${pct(p.interest.referencePercent)} plus 8).` : ""} Räntan fortsätter att löpa på kapitalet till dess betalning sker. Inkassoavgiften är den som lagen (1981:739) om ersättning för inkassokostnader m.m. medger.
            </Text>
            <Text style={s.h2}>Har du invändningar?</Text>
            <Text style={s.small}>
              Anser du att kravet är felaktigt, kontakta {p.creditor.name} senast {p.payBy}
              {contact ? ` på ${contact}` : ""}, eller skriv till {[p.creditor.street, postal(p.creditor)].filter(Boolean).join(", ")}. Vi avvaktar då med vidare åtgärder tills invändningen är utredd. Betalning görs till {p.creditor.name}, med uppgifterna ovan.
            </Text>
            <Text style={s.h2}>Om du inte betalar</Text>
            <Text style={s.small}>
              Betalar du inte senast {p.payBy} och har du inte invänt mot kravet, lämnar vi fordran till ett inkassobolag eller ansöker om betalningsföreläggande hos Kronofogdemyndigheten. Det kan medföra ytterligare kostnader för dig. Har du redan betalat kan du bortse från det här kravet.
            </Text>
          </>
        ) : (
          <Text style={s.small}>Har du redan betalat de senaste dagarna kan du bortse från den här påminnelsen.</Text>
        )}

        <Text style={s.p}>
          Vänliga hälsningar,{"\n"}
          {p.creditor.signer || p.creditor.name}
          {"\n"}
          {p.creditor.name}
        </Text>
        <Foot creditor={p.creditor} />
      </Page>
    </Document>
  );
}

export type SummaryProps = {
  reference: string;
  asOf: string;
  creditor: Creditor;
  debtor: Debtor;
  invoice: InvoiceFacts;
  capitalOre: number;
  periods: InterestPeriod[];
  interestOre: number;
  invoicedInterestOre: number;
  reminderFeesOre: number;
  demandFeeOre: number;
  totalOre: number;
  percentToday: number;
  payments: { paidOn: string; amountOre: number; method: string }[];
  reminders: { label: string; sentOn: string; sentTo: string; feeOre: number; interestOre: number; payBy: string | null }[];
  files: string[];
  agency: string;
  note: string;
};

/** Inkassounderlag: everything the agency needs, on one or two pages. */
export function CollectionSummaryPdf(p: SummaryProps) {
  return (
    <Document title={`Inkassounderlag ${p.reference}`} author={p.creditor.name} language="sv">
      <Page size="A4" style={s.page}>
        <Head creditor={p.creditor} title="Inkassounderlag" sub={[`Ärende ${p.reference}`, `Faktura ${p.invoice.number}`, `Beräknat ${p.asOf}`]} />

        <View style={s.grid}>
          <View style={s.col}>
            <Text style={s.label}>Borgenär</Text>
            <Text style={s.cell}>
              {[p.creditor.name, p.creditor.orgNr ? `Org.nr ${p.creditor.orgNr}` : "", p.creditor.street, postal(p.creditor), p.creditor.phone, p.creditor.email, p.creditor.signer ? `Kontakt: ${p.creditor.signer}` : ""].filter(Boolean).join("\n")}
            </Text>
          </View>
          <View style={s.col}>
            <Text style={s.label}>Gäldenär</Text>
            <Text style={s.cell}>
              {[
                p.debtor.name,
                p.debtor.type === "privat" ? "Privatperson" : "Företag",
                p.debtor.id ? `${p.debtor.type === "privat" ? "Personnr" : "Org.nr"} ${p.debtor.id}` : "",
                p.debtor.reference ? `Ref. ${p.debtor.reference}` : "",
                p.debtor.street,
                postal(p.debtor),
                p.debtor.phone,
                p.debtor.email,
              ]
                .filter(Boolean)
                .join("\n")}
            </Text>
          </View>
          <View style={s.col}>
            <Text style={s.label}>Fordran</Text>
            <Text style={s.cell}>
              {[`Faktura ${p.invoice.number}`, `Fakturadatum ${p.invoice.issueDate}`, `Förfallodatum ${p.invoice.dueDate}`, `Fakturerat ${kr(p.invoice.payableOre)}`, `Avser ${p.invoice.description}`, `${p.invoice.referenceLabel} ${p.invoice.referenceValue}`, p.invoice.bankgiro ? `Bankgiro ${p.invoice.bankgiro}` : ""].filter(Boolean).join("\n")}
            </Text>
          </View>
        </View>

        <Text style={s.h2}>Fordran per {p.asOf}</Text>
        <Amounts
          lines={[
            { label: "Kapital", detail: "Obetalt på fakturan", ore: p.capitalOre },
            {
              label: `Dröjsmålsränta ${p.invoice.dueDate} – ${p.asOf}`,
              detail: `Räntelagen 6 §, referensränta + 8 procentenheter per halvår, i dag ${pct(p.percentToday)}.${p.invoicedInterestOre ? ` Varav ${kr(p.invoicedInterestOre)} debiterad i påminnelser och inkassokrav.` : ""}`,
              ore: p.interestOre,
            },
            ...(p.reminderFeesOre ? [{ label: "Påminnelseavgifter", detail: "Lag (1981:739) 2 och 4 §§", ore: p.reminderFeesOre }] : []),
            ...(p.demandFeeOre ? [{ label: "Inkassoavgift", detail: "Eget inkassokrav, lag (1981:739) 3 och 4 §§", ore: p.demandFeeOre }] : []),
          ]}
          totalLabel="Summa fordran"
          totalOre={p.totalOre}
        />
        <Text style={s.small}>Ingen förseningsersättning (lag 1981:739, 4 a §) är debiterad.</Text>

        {p.periods.length > 0 && (
          <>
            <Text style={s.h2}>Räntan period för period</Text>
            <View style={s.th}>
              {["Från", "Till", "Dagar", "Kapital", "Ränta %", "Ränta"].map((h, i) => (
                <Text key={h} style={[s.thText, { flex: 1, textAlign: i > 1 ? "right" : "left" }]}>
                  {h}
                </Text>
              ))}
            </View>
            {p.periods.map((r) => (
              <View key={r.from} style={s.row} wrap={false}>
                <Text style={[s.cell, { flex: 1 }]}>{r.from}</Text>
                <Text style={[s.cell, { flex: 1 }]}>{r.to}</Text>
                <Text style={[s.cell, { flex: 1, textAlign: "right" }]}>{r.days}</Text>
                <Text style={[s.cell, { flex: 1, textAlign: "right" }]}>{money(r.capitalOre)}</Text>
                <Text style={[s.cell, { flex: 1, textAlign: "right" }]}>{String(r.percent).replace(".", ",")}</Text>
                <Text style={[s.cell, { flex: 1, textAlign: "right" }]}>{money(r.interestOre)}</Text>
              </View>
            ))}
          </>
        )}

        <Text style={s.h2}>Påminnelser och krav</Text>
        {p.reminders.length === 0 ? (
          <Text style={s.small}>Inga.</Text>
        ) : (
          p.reminders.map((r) => (
            <View key={`${r.label}-${r.sentOn}`} style={s.row} wrap={false}>
              <Text style={[s.cell, { flex: 2 }]}>{r.label}</Text>
              <Text style={[s.cell, { flex: 1 }]}>{r.sentOn}</Text>
              <Text style={[s.cell, { flex: 2 }]}>{r.sentTo || "–"}</Text>
              <Text style={[s.cell, { flex: 2, textAlign: "right" }]}>
                {[r.feeOre ? `avgift ${kr(r.feeOre)}` : "", r.interestOre ? `ränta ${kr(r.interestOre)}` : "", r.payBy ? `betala senast ${r.payBy}` : ""].filter(Boolean).join(", ") || "–"}
              </Text>
            </View>
          ))
        )}

        <Text style={s.h2}>Inbetalningar</Text>
        {p.payments.length === 0 ? (
          <Text style={s.small}>Inga.</Text>
        ) : (
          p.payments.map((r, i) => (
            <View key={`${r.paidOn}-${i}`} style={s.row} wrap={false}>
              <Text style={[s.cell, { flex: 1 }]}>{r.paidOn}</Text>
              <Text style={[s.cell, { flex: 1 }]}>{r.method}</Text>
              <Text style={[s.cell, { flex: 1, textAlign: "right" }]}>{kr(r.amountOre)}</Text>
            </View>
          ))
        )}

        {(p.agency || p.note) && (
          <>
            <Text style={s.h2}>Ärendet</Text>
            <Text style={s.small}>{[p.agency ? `Inkassobolag: ${p.agency}` : "", p.note].filter(Boolean).join("\n")}</Text>
          </>
        )}

        <Text style={s.h2}>Bilagor</Text>
        <Text style={s.small}>{p.files.join("\n")}</Text>
        <Foot creditor={p.creditor} />
      </Page>
    </Document>
  );
}
