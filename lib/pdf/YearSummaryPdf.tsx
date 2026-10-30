import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { YearSummaryRow } from "../core/payroll/year-end";
import { hr, kr } from "./hr-report-style";

/**
 * Årsbesked per person: the year's pay from the approved payslips of the
 * closed runs paid in it (year-end.ts / year_summary()). One page per
 * person. Since 2019 there are no kontrolluppgifter; the same amounts went
 * to Skatteverket month by month in the AGI.
 */

export type YearSummaryPdfProps = {
  year: number;
  rows: readonly (YearSummaryRow & { pnrMasked: string })[];
  employer: { name: string; orgNr: string; street: string; postalCode: string; city: string };
  logo: string | null;
  madeOn: string;
};

export function YearSummaryPdf({ year, rows, employer, logo, madeOn }: YearSummaryPdfProps) {
  return (
    <Document title={`Årsbesked ${year}`} author={employer.name} subject="Årsbesked" creator="Binaafy" producer="Binaafy">
      {rows.map((r) => (
        <Page key={r.employeeId} size="A4" style={hr.page}>
          <View style={hr.head}>
            <View>
              {logo ? (
                // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt
                <Image src={logo} style={hr.logo} />
              ) : (
                <Text style={hr.employer}>{employer.name}</Text>
              )}
              <Text style={hr.employerSmall}>
                {[employer.name, employer.orgNr && `org.nr ${employer.orgNr}`].filter(Boolean).join(" · ")}
                {"\n"}
                {[employer.street, [employer.postalCode, employer.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
              </Text>
            </View>
            <View style={hr.titleBox}>
              <Text style={hr.title}>Årsbesked {year}</Text>
              <Text style={hr.subtitle}>Lön och skatt under året</Text>
              <View style={hr.accent} />
            </View>
          </View>

          <View style={hr.facts}>
            <View style={hr.fact}>
              <Text style={hr.k}>Anställd</Text>
              <Text style={hr.v}>{r.name}</Text>
              {r.pnrMasked ? <Text style={hr.v}>{r.pnrMasked}</Text> : null}
            </View>
            <View style={hr.fact}>
              <Text style={hr.k}>Utbetalningar</Text>
              <Text style={hr.v}>
                {r.payslips} lönebesked, {r.firstPayDate} – {r.lastPayDate}
              </Text>
            </View>
          </View>

          <View style={hr.box}>
            {(
              [
                ["Bruttolön", r.cashGrossOre],
                ...(r.repaidOre ? ([["Lön du betalat tillbaka (rättad i arbetsgivardeklarationen)", -r.repaidOre]] as const) : []),
                ["Förmåner (skattepliktigt värde)", r.benefitOre],
                ["Skattefria ersättningar (traktamente, milersättning, utlägg)", r.taxFreeReimbursementOre],
                ["Avdragen preliminär skatt", -r.taxOre],
                ["Utbetalt netto", r.netOre],
              ] as const
            ).map(([k, v]) => (
              <View key={k} style={hr.sumRow}>
                <Text style={hr.sumK}>{k}</Text>
                <Text style={hr.sumV}>{kr(v)}</Text>
              </View>
            ))}
            <View style={hr.sumRow}>
              <Text style={hr.sumK}>Arbetsgivaren betalade dessutom arbetsgivaravgifter</Text>
              <Text style={hr.sumV}>{kr(r.employerContributionOre)}</Text>
            </View>
          </View>
          <Text style={hr.note}>
            Beloppen är summan av lönebeskeden som betalades ut under {year}. Det finns inga kontrolluppgifter längre: samma belopp har redovisats till Skatteverket månad för månad i
            arbetsgivardeklarationen och syns under Mina sidor hos Skatteverket, där den förifyllda inkomstdeklarationen hämtar dem. Stämmer något inte, kontakta {employer.name}.
          </Text>

          <View style={hr.foot} fixed>
            <Text style={hr.footText}>
              Årsbesked {year} · {r.name} · gjort {madeOn} hos {employer.name}
            </Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}
