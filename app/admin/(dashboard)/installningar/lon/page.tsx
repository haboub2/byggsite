import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { formatWhen } from "@/lib/admin-format";
import { listMembers } from "@/lib/core/org/members";
import { listEmployees } from "@/lib/core/hr/store";
import { getPayrollSettings, listPayItems, listTaxTableImports } from "@/lib/core/payroll/run-store";
import { payItemsOn } from "@/lib/core/payroll/run";
import { DECISION_DEFAULT, DECISION_LABEL, type PayrollConfirmed, type PayrollDecision } from "@/lib/core/payroll/settings";
import { todayIso } from "@/lib/quotes/schema";
import { Flash } from "@/components/admin/time/parts";
import { applyPayItemPresetAction, savePayrollSettingsAction } from "@/app/admin/payroll-actions";
import { PAY_ITEM_PRESETS, PRESET_DESCRIPTION, PRESET_LABEL, presetChanges } from "@/lib/core/payroll/pay-item-presets";

export const metadata: Metadata = { title: "Inställningar: lön" };

const ACCOUNT_LABEL: Record<string, string> = {
  tax: "Personalskatt",
  net: "Löneskuld (nettolön)",
  contributionCost: "Arbetsgivaravgifter, kostnad",
  contributionLiability: "Arbetsgivaravgifter, skuld",
  vacationCostCollective: "Förändring semesterlöneskuld, kollektiv",
  vacationCostSalaried: "Förändring semesterlöneskuld, tjänstemän",
  vacationLiability: "Upplupna semesterlöner",
  vacationContributionCost: "Avgifter på semesterlöneskuld, kostnad",
  vacationContributionLiability: "Avgifter på semesterlöneskuld, skuld",
  pensionCost: "Tjänstepension, kostnad",
  pensionLiability: "Tjänstepension, upplupen",
  specialPayrollTaxCost: "Särskild löneskatt på pension, kostnad",
  specialPayrollTaxLiability: "Särskild löneskatt på pension, beräknad skuld",
  insuranceCost: "Avtalsförsäkringar (Fora, Collectum), kostnad",
  insuranceLiability: "Avtalsförsäkringar, upplupna",
};

const krOrEmpty = (ore: number | null) => (ore === null ? "" : String(ore / 100).replace(".", ","));

/** One decision: its fields, whether it is confirmed, and the default it runs with until it is. */
function Decision({ id, confirmed, children }: { id: PayrollDecision; confirmed: PayrollConfirmed; children: ReactNode }) {
  return (
    <form action={savePayrollSettingsAction} className="hr-card" id={id}>
      <input type="hidden" name="decision" value={id} />
      <div className="hr-card-head">
        <h2 className="hr-h2">{DECISION_LABEL[id]}</h2>
        {confirmed[id] ? <span className="lon-decided">bekräftad {formatWhen(confirmed[id] as string)}</span> : <span className="lon-undecided">inte bekräftad</span>}
      </div>
      {!confirmed[id] && <p className="hr-muted">Standard tills du sparar: {DECISION_DEFAULT[id]}</p>}
      {children}
      <div>
        <button className="btn btn-primary hr-btn-small" type="submit">
          Spara och bekräfta
        </button>
      </div>
    </form>
  );
}

/**
 * Inställningar › Lön (docs/hr-lon.md, sections 11 and 12, "Before the
 * first real payroll"): each decision with the law's or the common default
 * until the owner saves it, marked "inte bekräftad" here and on the run's
 * checklist. Also the löneartsregister and the imported tax tables.
 */
export default async function PayrollSettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; fel?: string }> }) {
  const check = await requireRole("admin");
  if (!check.ok) redirect("/admin/ekonomi");
  const sp = await searchParams;
  const [{ settings, confirmed, updatedAt }, members, items, imports, employees] = await Promise.all([
    getPayrollSettings(),
    listMembers().catch(() => []),
    listPayItems(),
    listTaxTableImports(),
    listEmployees().catch(() => []),
  ]);
  const approvers = members.filter((m) => m.role === "owner" || m.role === "admin");
  const today = todayIso();
  const register = payItemsOn(items, today);
  const pendingPreset = settings.payItemPreset !== settings.agreement ? presetChanges(items, settings.agreement, today) : [];

  return (
    <section className="sec sec--tight">
      <div className="container" style={{ maxWidth: 960 }}>
        <Link href="/admin/installningar" className="link-quiet">
          ← Inställningar
        </Link>
        <span className="eyebrow" style={{ display: "block", marginTop: 16 }}>
          {check.orgName}
        </span>
        <h1 className="admin-h1">Inställningar: lön</h1>
        <p className="admin-intro">
          Besluten inför den första riktiga lönen. Varje beslut har lagens eller det vanliga standardvärdet och visas som inte bekräftat, här och på lönekörningens kontrollista, tills du sparar det. {updatedAt ? `Senast ändrat ${formatWhen(updatedAt)}.` : ""}
        </p>
        <Flash ok={sp.ok} error={sp.fel} />

        <div className="hr-stack hr-gap">
          <Decision confirmed={confirmed} id="period">
            <div className="efield">
              <label htmlFor="f-vp">Rörlig lön, tid och frånvaro</label>
              <select id="f-vp" name="variablePeriod" defaultValue={settings.variablePeriod} className="tg-select">
                <option value="previous">Månaden före (månadslön för innevarande månad)</option>
                <option value="same">Samma månad som månadslönen</option>
              </select>
            </div>
          </Decision>

          <Decision confirmed={confirmed} id="payDay">
            <div className="efield">
              <label htmlFor="f-pd">Lönedag (dag i månaden, 1–28; helg flyttas till bankdagen före)</label>
              <input id="f-pd" name="payDay" type="number" min={1} max={28} defaultValue={settings.payDay} />
            </div>
          </Decision>

          <Decision confirmed={confirmed} id="vacationYear">
            <div className="efield">
              <label htmlFor="f-vy">Semesterår</label>
              <select id="f-vy" name="vacationYear" defaultValue={settings.vacationYear} className="tg-select">
                <option value="law">1 april – 31 mars (semesterlagen)</option>
                <option value="calendar">Kalenderår</option>
              </select>
            </div>
          </Decision>

          <Decision confirmed={confirmed} id="agreement">
            <div className="efield">
              <label htmlFor="f-ag">Kollektivavtal</label>
              <select id="f-ag" name="agreement" defaultValue={settings.agreement} className="tg-select">
                <option value="none">Inget kollektivavtal</option>
                <option value="byggavtalet">Byggavtalet (Byggnads)</option>
                <option value="tjanstemannaavtalet">Tjänstemannaavtalet (Byggföretagen)</option>
                <option value="both">Båda</option>
              </select>
            </div>
            <p className="hr-muted">
              Varje persons avtal står på personen; det här beslutet är organisationens och styr Fora och Collectum. När det sparas får löneartsregistret förvalet för avtalet (nya versioner från i dag): {PRESET_DESCRIPTION[settings.agreement]}
            </p>
            {settings.payItemPreset && (
              <p className="hr-muted">
                Registret följer förvalet {PRESET_LABEL[settings.payItemPreset]}
                {settings.payItemPresetAppliedAt ? `, tillämpat ${formatWhen(settings.payItemPresetAppliedAt)}` : ""}.
                {pendingPreset.length > 0 && ` Beslutet säger ${PRESET_LABEL[settings.agreement]}; spara det igen så får ${pendingPreset.length} lönearter en ny version.`}
              </p>
            )}
          </Decision>

          <Decision confirmed={confirmed} id="approvers">
            <fieldset className="hr-check">
              <legend className="hr-muted">Vem får godkänna (ingen vald: alla ägare och administratörer utom den som räknade)</legend>
              {approvers.length === 0 && <p className="hr-muted">Inga medlemmar att välja i demoläget.</p>}
              {approvers.map((m) => (
                <label key={m.userId}>
                  <input type="checkbox" name="approvers" value={m.userId} defaultChecked={settings.approvers.includes(m.userId)} /> {m.email} ({m.role === "owner" ? "ägare" : "administratör"})
                </label>
              ))}
            </fieldset>
          </Decision>

          <Decision confirmed={confirmed} id="bank">
            <div className="tg-fields">
              <div className="efield tg-wide">
                <label htmlFor="f-iban">Lönekontots IBAN</label>
                <input id="f-iban" name="iban" defaultValue={settings.bank.iban} placeholder="SE45 5000 0000 0583 9825 7466" />
              </div>
              <div className="efield">
                <label htmlFor="f-bic">BIC</label>
                <input id="f-bic" name="bic" defaultValue={settings.bank.bic} placeholder="ESSESESS" />
              </div>
              <div className="efield">
                <label htmlFor="f-cust">Kundnummer hos banken (om banken kräver)</label>
                <input id="f-cust" name="customerId" defaultValue={settings.bank.customerId} />
              </div>
            </div>
            <p className="hr-muted">Lönefilen är ISO 20022 pain.001.001.03 (Nordea, SEB, Swedbank, Handelsbanken). Systemet skickar den aldrig; den laddas upp och signeras i banken.</p>
          </Decision>

          <Decision confirmed={confirmed} id="accounts">
            <div className="tg-fields">
              {Object.entries(settings.accounts).map(([k, v]) => (
                <div className="efield" key={k}>
                  <label htmlFor={`f-${k}`}>{ACCOUNT_LABEL[k] ?? k}</label>
                  <input id={`f-${k}`} name={k} defaultValue={v} inputMode="numeric" pattern="\d{4}" required />
                </div>
              ))}
            </div>
            <p className="hr-muted">Lönearternas egna konton (7010, 7210, 7081 …) står i löneartsregistret nedan.</p>
          </Decision>

          <Decision confirmed={confirmed} id="pension">
            <div className="tg-fields">
              <div className="efield">
                <label htmlFor="f-fora">Kundnummer hos Fora (SAF-LO)</label>
                <input id="f-fora" name="foraCustomerNo" defaultValue={settings.pension.foraCustomerNo} />
              </div>
              <div className="efield">
                <label htmlFor="f-fok">FOK-ID för arbetarna (Fora)</label>
                <input id="f-fok" name="foraFokId" defaultValue={settings.pension.foraFokId} placeholder="FOK306834" />
              </div>
              <div className="efield">
                <label htmlFor="f-coll">Kundnummer hos Collectum (ITP 1)</label>
                <input id="f-coll" name="collectumCustomerNo" defaultValue={settings.pension.collectumCustomerNo} />
              </div>
            </div>
            <p className="hr-muted">FOK-ID är den avtalskategori arbetarna är uppmärkta med på Foras Mina sidor (t.ex. FOK306834 för Byggavtalet); det står på varje rad i Fora-underlaget.</p>
          </Decision>

          <Decision confirmed={confirmed} id="expenses">
            <div className="tg-fields">
              <div className="efield">
                <label htmlFor="f-mil">Milersättning med egen bil, kr per mil</label>
                <input id="f-mil" name="ownCarPerMil" inputMode="decimal" defaultValue={krOrEmpty(settings.expenses.ownCarPerMilOre)} />
              </div>
              <div className="efield">
                <label htmlFor="f-milf">Med förmånsbil, kr per mil (tomt: 12 kr)</label>
                <input id="f-milf" name="companyCarPerMil" inputMode="decimal" defaultValue={krOrEmpty(settings.expenses.companyCarPerMilOre)} />
              </div>
              <div className="efield">
                <label htmlFor="f-mile">Med förmånsbil el, kr per mil (tomt: 9,50 kr)</label>
                <input id="f-mile" name="companyElectricCarPerMil" inputMode="decimal" defaultValue={krOrEmpty(settings.expenses.companyElectricCarPerMilOre)} />
              </div>
              <div className="efield">
                <label htmlFor="f-td">Traktamente hel dag, kr (tomt: 300 kr)</label>
                <input id="f-td" name="perDiemFullDay" inputMode="decimal" defaultValue={krOrEmpty(settings.expenses.perDiemFullDayOre)} />
              </div>
              <div className="efield">
                <label htmlFor="f-th">Halv dag, kr (tomt: 150 kr)</label>
                <input id="f-th" name="perDiemHalfDay" inputMode="decimal" defaultValue={krOrEmpty(settings.expenses.perDiemHalfDayOre)} />
              </div>
              <div className="efield">
                <label htmlFor="f-tn">Natt, kr (tomt: 150 kr)</label>
                <input id="f-tn" name="perDiemNight" inputMode="decimal" defaultValue={krOrEmpty(settings.expenses.perDiemNightOre)} />
              </div>
            </div>
            <p className="hr-muted">
              Det företaget betalar. Skatteverkets schabloner är skattefria (milersättning 25 kr per mil med egen bil); det som betalas över dem blir skattepliktig lön med arbetsgivaravgifter. Ett utlägg räknas när det godkänns, med beslutet som gäller då.
            </p>
          </Decision>

          <Decision confirmed={confirmed} id="agi">
            <div className="tg-fields">
              <div className="efield tg-wide">
                <label htmlFor="f-large">Omsättning (beskattningsunderlag för moms)</label>
                <select id="f-large" name="largeEmployer" defaultValue={settings.agi.largeEmployer ? "yes" : "no"} className="tg-select">
                  <option value="no">Högst 40 miljoner kr: AGI och betalning den 12:e (17:e i januari och augusti)</option>
                  <option value="yes">Över 40 miljoner kr: AGI den 26:e, betalningen ändå den 12:e (17:e i januari)</option>
                </select>
              </div>
              <div className="efield">
                <label htmlFor="f-cn">Kontaktperson i AGI-filen</label>
                <input id="f-cn" name="contactName" defaultValue={settings.agi.contactName} placeholder="Företagets undertecknare" />
              </div>
              <div className="efield">
                <label htmlFor="f-cp">Telefon</label>
                <input id="f-cp" name="contactPhone" defaultValue={settings.agi.contactPhone} placeholder="Företagets telefon" />
              </div>
              <div className="efield">
                <label htmlFor="f-ce">E-post</label>
                <input id="f-ce" name="contactEmail" type="email" defaultValue={settings.agi.contactEmail} placeholder="Företagets e-post" />
              </div>
            </div>
            <p className="hr-muted">Tomma fält tar företagets uppgifter (Inställningar › Företaget). Skatteverket ringer kontaktpersonen om något i filen behöver redas ut.</p>
          </Decision>

          <Decision confirmed={confirmed} id="vaxaStod">
            <fieldset className="hr-check">
              <legend className="hr-muted">De första anställda som ger växa-stöd (högst två; inte ägare, delägare eller närstående)</legend>
              {employees.filter((e) => !e.isOwner && !e.isBoardMember).length === 0 && <p className="hr-muted">Ingen anställd att välja.</p>}
              {employees
                .filter((e) => !e.isOwner && !e.isBoardMember)
                .map((e) => (
                  <label key={e.id}>
                    <input type="checkbox" name="vaxaEmployees" value={e.id} defaultChecked={settings.vaxaStod.employeeIds.includes(e.id)} /> {e.name}
                  </label>
                ))}
            </fieldset>
            <p className="hr-muted">Lönen betalar full avgift; Lönerapporter visar underlaget per månad att ansöka om i Skatteverkets e-tjänst, efter att månadens AGI är lämnad.</p>
          </Decision>

          <div className="hr-card" id="tables">
            <h2 className="hr-h2">Skattetabeller</h2>
            {imports.length === 0 ? (
              <p>Inga skattetabeller är importerade. Kör <code>npm run tax-tables:import -- 2026 --out tabeller.json</code> och sedan <code>npm run tax-tables:load -- tabeller.json</code> (service role).</p>
            ) : (
              <table className="org-table">
                <thead>
                  <tr>
                    <th>År</th>
                    <th>Tabeller</th>
                    <th>Rader</th>
                    <th>SHA-256</th>
                    <th>Importerad</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((i) => (
                    <tr key={i.id}>
                      <td>{i.year}</td>
                      <td>
                        {i.tables[0]}–{i.tables[i.tables.length - 1]}
                      </td>
                      <td>{i.rowCount}</td>
                      <td>
                        <code>{i.sha256.slice(0, 12)}…</code>
                      </td>
                      <td>
                        {i.demo ? "Demo: repots provfil" : `${formatWhen(i.importedAt)} av ${i.importedBy}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="hr-card" id="register">
            <h2 className="hr-h2">Löneartsregistret</h2>
            <p className="hr-muted">
              Flaggorna styr skatt, avgifter, semester, pension, AGI-ruta och konto. En ändring blir en ny version från ett datum; ett godkänt lönebesked behåller versionen det räknades med. Förvalen per kollektivavtal
              sätter Fora- och Collectum-flaggorna och lägger till Byggavtalets helglön och arbetstidsförkortning; ett förval tar aldrig bort en löneart.
            </p>
            <form action={applyPayItemPresetAction} className="hr-inline">
              <label>
                Förval{" "}
                <select name="preset" defaultValue={settings.agreement} className="tg-select">
                  {PAY_ITEM_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {PRESET_LABEL[p]}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn btn-ghost hr-btn-small" type="submit">
                Tillämpa förvalet
              </button>
            </form>
            <div className="hr-table-wrap">
              <table className="org-table">
                <thead>
                  <tr>
                    <th>Art</th>
                    <th>Namn</th>
                    <th>Skatt</th>
                    <th>Avgift</th>
                    <th>Semester</th>
                    <th>Pension</th>
                    <th>AGI</th>
                    <th>Konto</th>
                  </tr>
                </thead>
                <tbody>
                  {register.map((i) => (
                    <tr key={i.code}>
                      <td>{i.code}</td>
                      <td>
                        {i.name}
                        {i.version > 1 && <span className="hr-muted">version {i.version}</span>}
                      </td>
                      <td>{i.flags.taxable ? (i.flags.taxMode === "lump_sum" ? "engång" : "tabell") : "–"}</td>
                      <td>{i.flags.subjectToEmployerContribution ? "ja" : "–"}</td>
                      <td>{i.flags.vacationPayBasis ? "ja" : "–"}</td>
                      <td>{i.flags.pensionReportable ? "ja" : "–"}</td>
                      <td>{i.flags.agiBox ?? "–"}</td>
                      <td>
                        {i.flags.account}
                        {i.kind === "benefit" ? ` / ${i.flags.counterAccount}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
