import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { LEAVING_REASON_LABEL, type CertificateContent } from "../core/payroll/certificate";
import { monthLabel } from "../core/payroll/format";
import { ABSENCE_KIND_LABEL, type AbsenceKind } from "../core/hr/absence";
import { hr, kr, num } from "./hr-report-style";

/**
 * Arbetsgivarintyg as an A4 PDF with what form SO 11 (Sveriges a-kassor)
 * asks for: the employment, the reason it ended, and per calendar month
 * worked hours without övertid, frånvaro hours, övertid and pay. Everything
 * comes from CertificateContent (certificate.ts); the PDF is frozen with
 * its SHA-256 when it is made.
 */

const COLS = { month: 80, worked: 66, absence: 72, overtime: 62, pay: 74 };

export function EmployerCertificatePdf({ content, logo }: { content: CertificateContent; logo: string | null }) {
  const c = content;
  const e = c.employer;
  const absenceText = (a: Partial<Record<AbsenceKind, number>>) =>
    Object.entries(a)
      .filter(([, d]) => d)
      .map(([k, d]) => `${ABSENCE_KIND_LABEL[k as AbsenceKind].toLowerCase()} ${num(d as number)} d`)
      .join(", ");
  return (
    <Document title={`Arbetsgivarintyg, ${c.employee.name}`} author={e.name} subject="Arbetsgivarintyg" creator="Binaafy" producer="Binaafy">
      <Page size="A4" style={hr.page}>
        <View style={hr.head}>
          <View>
            {logo ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt
              <Image src={logo} style={hr.logo} />
            ) : (
              <Text style={hr.employer}>{e.name}</Text>
            )}
            <Text style={hr.employerSmall}>
              {[e.name, e.orgNr && `org.nr ${e.orgNr}`].filter(Boolean).join(" · ")}
              {"\n"}
              {e.address}
            </Text>
          </View>
          <View style={hr.titleBox}>
            <Text style={hr.title}>Arbetsgivarintyg</Text>
            <Text style={hr.subtitle}>Underlag för arbetslöshetskassan, med uppgifterna i blankett SO 11</Text>
            <View style={hr.accent} />
          </View>
        </View>

        <View style={hr.facts}>
          <View style={hr.fact}>
            <Text style={hr.k}>Arbetstagare</Text>
            <Text style={hr.v}>{c.employee.name}</Text>
            <Text style={hr.v}>{c.employee.pnr}</Text>
          </View>
          <View style={hr.fact}>
            <Text style={hr.k}>Intyget avser</Text>
            <Text style={hr.v}>
              {c.from} – {c.to}
            </Text>
          </View>
          <View style={hr.fact}>
            <Text style={hr.k}>Anställningen</Text>
            <Text style={hr.v}>{LEAVING_REASON_LABEL[c.reason]}</Text>
          </View>
        </View>

        <Text style={hr.h2}>Anställning</Text>
        <View style={hr.table}>
          <View style={hr.th}>
            <Text style={[hr.thText, { flex: 1 }]}>Form och befattning</Text>
            <Text style={[hr.thText, { width: 64 }]}>Från</Text>
            <Text style={[hr.thText, { width: 64 }]}>Till</Text>
            <Text style={[hr.thText, { width: 70, textAlign: "right" }]}>Omfattning</Text>
            <Text style={[hr.thText, { width: 90, textAlign: "right" }]}>Lön</Text>
          </View>
          {c.employments.map((x) => (
            <View key={x.contractId} style={hr.tr} wrap={false}>
              <Text style={[hr.cell, { flex: 1, paddingRight: 6 }]}>
                {x.form}
                {x.title ? `, ${x.title}` : ""}
              </Text>
              <Text style={[hr.cell, { width: 64 }]}>{x.startsOn}</Text>
              <Text style={[hr.cell, { width: 64 }]}>{x.endsOn ?? "pågår"}</Text>
              <Text style={[hr.cell, { width: 70, textAlign: "right" }]}>
                {num(x.workingTimePercent)} %{x.weeklyHours ? `, ${num(x.weeklyHours)} h/v` : ""}
              </Text>
              <Text style={[hr.cell, { width: 90, textAlign: "right" }]}>{x.payOre !== null ? `${kr(x.payOre, 0)}/${x.payUnit}` : "–"}</Text>
            </View>
          ))}
        </View>

        <Text style={hr.h2}>Arbetad tid och lön per månad</Text>
        <View style={hr.table}>
          <View style={hr.th}>
            <Text style={[hr.thText, { width: COLS.month }]}>Månad</Text>
            <Text style={[hr.thText, { width: COLS.worked, textAlign: "right" }]}>Arbetat (h)</Text>
            <Text style={[hr.thText, { width: COLS.absence, textAlign: "right" }]}>Frånvaro (h)</Text>
            <Text style={[hr.thText, { width: COLS.overtime, textAlign: "right" }]}>Övertid (h)</Text>
            <Text style={[hr.thText, { flex: 1, paddingLeft: 10 }]}>Frånvaro, dagar</Text>
            <Text style={[hr.thText, { width: COLS.pay, textAlign: "right" }]}>Lön</Text>
          </View>
          {c.months.map((m) => (
            <View key={m.month} style={hr.tr} wrap={false}>
              <Text style={[hr.cell, { width: COLS.month }]}>{monthLabel(m.month)}</Text>
              <Text style={[hr.cell, { width: COLS.worked, textAlign: "right" }]}>
                {num(m.workedHours)}
                {m.hoursFromSchedule ? " *" : ""}
              </Text>
              <Text style={[hr.cell, { width: COLS.absence, textAlign: "right" }]}>{m.absenceHours ? num(m.absenceHours) : ""}</Text>
              <Text style={[hr.cell, { width: COLS.overtime, textAlign: "right" }]}>{m.overtimeHours ? num(m.overtimeHours) : ""}</Text>
              <Text style={[hr.cell, { flex: 1, paddingLeft: 10 }]}>{absenceText(m.absenceDays)}</Text>
              <Text style={[hr.cell, { width: COLS.pay, textAlign: "right" }]}>{kr(m.payOre, 0)}</Text>
            </View>
          ))}
          <View style={hr.trSum} wrap={false}>
            <Text style={[hr.cellBold, { width: COLS.month }]}>Summa</Text>
            <Text style={[hr.cellBold, { width: COLS.worked, textAlign: "right" }]}>{num(c.totals.workedHours)}</Text>
            <Text style={[hr.cellBold, { width: COLS.absence, textAlign: "right" }]}>{num(c.totals.absenceHours)}</Text>
            <Text style={[hr.cellBold, { width: COLS.overtime, textAlign: "right" }]}>{num(c.totals.overtimeHours)}</Text>
            <Text style={[hr.cellBold, { flex: 1 }]} />
            <Text style={[hr.cellBold, { width: COLS.pay, textAlign: "right" }]}>{kr(c.totals.payOre, 0)}</Text>
          </View>
        </View>
        <Text style={hr.note}>
          Arbetat: godkänd tid utan övertid; betald ledighet (semester, permission) räknas som arbetad tid. * Månadslön utan tidrapport: avtalad tid de dagar personen var anställd. Frånvaro: tid med löneavdrag
          (sjuk, VAB, föräldraledighet, tjänstledighet). Lön: bruttolön intjänad i månaden enligt godkända lönebesked, före skatt.
        </Text>

        {c.reasonText ? (
          <View style={hr.box} wrap={false}>
            <Text style={hr.k}>Övriga upplysningar</Text>
            <Text style={hr.v}>{c.reasonText}</Text>
          </View>
        ) : null}

        <View style={hr.sign} wrap={false}>
          <View style={hr.signCol}>
            <Text style={hr.k}>Ort och datum</Text>
            <Text style={hr.v}>{c.madeOn}</Text>
          </View>
          <View style={hr.signCol}>
            <Text style={hr.k}>Arbetsgivarens underskrift</Text>
            <Text style={hr.v}>{e.signer || " "}</Text>
          </View>
        </View>

        <View style={hr.foot} fixed>
          <Text style={hr.footText}>
            Arbetsgivarintyg för {c.employee.name}, gjort {c.madeOn} ur personalregistret, den godkända tiden och lönebeskeden hos {e.name}. Uppgifterna lämnas enligt 47 § lagen (1997:238) om
            arbetslöshetsförsäkring.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
