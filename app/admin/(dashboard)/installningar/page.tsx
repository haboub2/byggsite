import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { getOrgSettingsRecord, listNumberSeries } from "@/lib/core/org/settings-store";
import { CHART_KEYS, defaultAccountFor } from "@/lib/core/org/settings";
import OrgSettingsEditor from "@/components/admin/org/OrgSettingsEditor";

export const metadata = { title: "Inställningar" };

/** The organisation's settings (org_settings): seller details, payment, terms, reminders, fiscal year, accounts. */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ny?: string }> }) {
  const check = await requireRole("admin");
  if (!check.ok) redirect("/admin/ekonomi");
  const [{ settings, saved, updatedAt }, series, { ny }] = await Promise.all([getOrgSettingsRecord(), listNumberSeries(), searchParams]);
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
