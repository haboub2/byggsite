import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { getOrgSettingsRecord, listNumberSeries } from "@/lib/core/org/settings-store";
import { CHART_KEYS, defaultAccountFor } from "@/lib/core/org/settings";
import OrgSettingsEditor from "@/components/admin/org/OrgSettingsEditor";
import { getSwishSetup } from "@/lib/core/payments/swish-store";

export const metadata = { title: "Inställningar" };

/** The organisation's settings (org_settings): seller details, payment, terms, reminders, fiscal year, accounts. */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ny?: string }> }) {
  const check = await requireRole("admin");
  if (!check.ok) redirect("/admin/ekonomi");
  const [{ orgId, settings, saved, updatedAt }, series, { ny }] = await Promise.all([getOrgSettingsRecord(), listNumberSeries(), searchParams]);
  const swish = await getSwishSetup(orgId);
  const defaults = Object.fromEntries(CHART_KEYS.map((k) => [k, defaultAccountFor(k)]));
  return (
    <section className="sec sec--tight">
      <div className="container" style={{ maxWidth: 960 }}>
        <span className="eyebrow">{check.orgName}</span>
        <h1 className="admin-h1">Inställningar</h1>
        <p className="admin-intro">
          Det som står på varje ny faktura och styr påminnelser och bokföring.{" "}
          {saved
            ? null
            : "Inget är sparat här än: fälten är förifyllda från Företaget och Offertuppgifter (som offerterna fortsätter att läsa). Spara en gång så gäller inställningarna här för fakturorna."}
        </p>
        {ny && <p className="form-feedback">Organisationen är skapad. Fyll i uppgifterna nedan innan första fakturan.</p>}
        <OrgSettingsEditor initial={settings} defaults={defaults} lastSaved={updatedAt && saved ? { at: updatedAt, by: null } : undefined} />

        <h2 style={{ marginTop: 48, fontSize: 22 }}>Swish Handel</h2>
        <p className="admin-intro">
          Kunden betalar med en knapp på fakturan och betalningen kvitteras i samma sekund. Kräver avtal om Swish Handel med banken och ett certifikat per Swish-nummer
          (docs/fakturering-checklista.md). Inga hemligheter visas här.
        </p>
        <table className="org-table">
          <tbody>
            <tr>
              <td>Status</td>
              <td>{swish.ready ? <strong>På: knappen Betala med Swish visas på obetalda fakturor</strong> : "Av"}</td>
            </tr>
            <tr>
              <td>Certifikat</td>
              <td>
                {swish.source ? (swish.certificate ? `Finns (${swish.source}${swish.fallback ? ", standard för webbplatsens organisation" : ""})` : `Saknas (${swish.source})`) : "Inget angivet"}
                {swish.certificate && ` · utfärdat för ${swish.certificate.subject} · giltigt till ${swish.certificate.validTo}`}
                {swish.certificate && !swish.hasCa && " · Swishs rot-CA saknas, Nodes egna används"}
              </td>
            </tr>
            <tr>
              <td>Miljö</td>
              <td>{swish.environment === "prod" ? "Produktion (cpc.getswish.net)" : swish.environment === "test" ? "Test, Merchant Swish Simulator (mss.cpc.getswish.net): inga riktiga pengar" : "–"}</td>
            </tr>
            <tr>
              <td>Swish-nummer</td>
              <td>{swish.payee || "–"}</td>
            </tr>
            <tr>
              <td>Callback</td>
              <td>
                {swish.callbackBase ? `${swish.callbackBase}/api/swish/callback` : "–"} · {swish.callbackSecret ? "signeras" : "SWISH_CALLBACK_SECRET saknas"}
              </td>
            </tr>
          </tbody>
        </table>
        {swish.problems.length > 0 && swish.source && (
          <ul className="efield-hint" style={{ marginTop: 8 }}>
            {swish.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}

        <h2 style={{ marginTop: 48, fontSize: 22 }}>Nummerserier</h2>
        <p className="admin-intro">Obrutna serier i databasen (number_series). Ändras inte här: en serie som redan har gett nummer får inte börja om.</p>
        <table className="org-table">
          <thead>
            <tr>
              <th>Serie</th>
              <th>Numrering</th>
              <th>Start</th>
              <th>Nästa</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.series}>
                <td>{s.series === "F" ? "F (fakturor)" : s.series === "V" ? "V (verifikationer)" : s.series}</td>
                <td>{s.perYear ? "Per år" : "Löpande"}</td>
                <td>{s.start}</td>
                <td>{s.next ?? s.start}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: 24 }}>
          <Link href="/admin/organisation" className="link-quiet">
            Medlemmar och roller
          </Link>
        </p>
      </div>
    </section>
  );
}
