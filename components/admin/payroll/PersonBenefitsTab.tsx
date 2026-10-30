import { formatOre } from "@/lib/core/money";
import { HOUSING_REGION_LABEL } from "@/lib/core/rules/benefits";
import { benefitRulesAt } from "@/lib/core/rules/benefits";
import { BENEFIT_KIND_LABEL, FUEL_LABEL, type CarBenefitResult } from "@/lib/core/payroll/benefits";
import { listBenefits, previewBenefit, type StoredBenefit } from "@/lib/core/payroll/benefits-store";
import { deleteBenefitAction, endBenefitAction, saveBenefitAction } from "@/app/admin/benefit-actions";

const kr = (ore: number) => formatOre(ore, { decimals: 0, currency: true });
const pct = (n: number) => `${String(n).replace(".", ",")} %`;

function CarParameters({ c }: { c: CarBenefitResult }) {
  return (
    <dl className="hr-dl">
      <dt>Regler</dt>
      <dd>{c.regimeLabel}</dd>
      <dt>Nybilspris i beräkningen</dt>
      <dd>
        {kr(c.priceOre)}
        {c.environmentalReductionOre ? ` (efter miljöbilsnedsättning ${kr(c.environmentalReductionOre)})` : ""}
        {c.oldCarFloorApplied ? " (lägst 4 prisbasbelopp, bilen är sex år eller äldre)" : ""}
      </dd>
      <dt>Prisbasbeloppsdel</dt>
      <dd>{kr(c.pbbPartOre)}</dd>
      <dt>Ränterelaterad del</dt>
      <dd>
        {kr(c.interestPartOre)} ({pct(c.interestPercent)} av nybilspriset; statslåneräntan {pct(c.statslaneranta)})
      </dd>
      <dt>Prisrelaterad del</dt>
      <dd>{kr(c.pricePartOre)}</dd>
      <dt>Fordonsskatt</dt>
      <dd>{c.vehicleTaxOre ? kr(c.vehicleTaxOre) : "ingår i prisbasbeloppsdelen"}</dd>
      <dt>Per år</dt>
      <dd>
        {kr(c.yearOre)}
        {c.highMileage ? ` (75 % av ${kr(c.fullYearOre)}: minst 3 000 mil i tjänsten)` : ""}
      </dd>
      <dt>Per månad</dt>
      <dd>
        <strong>{kr(c.monthOre)}</strong>
      </dd>
    </dl>
  );
}

function describe(b: StoredBenefit): string {
  if (b.kind === "bil" && b.car) return `${b.car.registrationNumber} ${b.car.model} · ${FUEL_LABEL[b.car.fuel].toLowerCase()} · årsmodell ${b.car.modelYear}, skattepliktig från ${b.car.firstRegisteredOn}`;
  if (b.kind === "kost") return [b.meals.breakfast ? `${b.meals.breakfast} frukostar` : "", b.meals.lunchOrDinner ? `${b.meals.lunchOrDinner} luncher/middagar` : "", b.meals.fullDays ? `${b.meals.fullDays} dagar helt fri kost` : ""].filter(Boolean).join(", ") + " per månad";
  if (b.kind === "bostad" && b.housing) return `${b.housing.areaM2} m², ${HOUSING_REGION_LABEL[b.housing.region].toLowerCase()}`;
  return b.description;
}

/**
 * Person › Förmåner (docs/hr-lon.md, section 11): the person's benefits
 * with their value this month under the rule book (the car with every
 * part of Skatteverket's formula), the form for a new one, and an end date.
 * A benefit paid on an approved payslip is frozen by the database: it is
 * ended and a new one added instead of being changed.
 */
export async function PersonBenefitsTab({ employeeId, today, canWrite }: { employeeId: string; today: string; canWrite: boolean }) {
  const benefits = await listBenefits(employeeId);
  const rules = benefitRulesAt(today);
  return (
    <div className="hr-stack">
      {benefits.length === 0 && <div className="inbox-empty">Inga förmåner.</div>}
      {benefits.map((b) => {
        let preview;
        let error = "";
        try {
          preview = previewBenefit(b, today);
        } catch (err) {
          error = err instanceof Error ? err.message : "Kan inte värderas.";
        }
        const ended = b.validTo !== null && b.validTo < today;
        return (
          <article key={b.id} className="hr-card">
            <div className="hr-card-head">
              <div>
                <h2 className="hr-h2">{BENEFIT_KIND_LABEL[b.kind]}</h2>
                <p className="hr-muted">
                  {describe(b)} · från {b.validFrom}
                  {b.validTo ? ` till ${b.validTo}` : ""}
                </p>
              </div>
              <span className="inv-status" data-status={ended ? "credited" : "paid"}>
                {ended ? "Avslutad" : preview ? `${kr(preview.valueOre)}/mån` : "–"}
              </span>
            </div>
            {error && <p className="hr-badge" data-tone="alert">{error}</p>}
            {preview && b.kind === "bil" && <CarParameters c={preview.computation as unknown as CarBenefitResult} />}
            {preview && b.employeePaymentOre > 0 && (
              <p className="hr-muted">
                Värde {kr(preview.grossOre)} minus det personen betalar, {kr(b.employeePaymentOre)} per månad.
              </p>
            )}
            {preview && preview.warnings.map((w) => <p key={w} className="hr-badge" data-tone="warn">{w}</p>)}
            <p className="hr-muted">
              <small>
                Sparat värde {kr(b.monthlyValueOre)}/mån med reglerna från {b.ruleVersion}; körningen räknar varje månad med lönedagens regler. Förmånsvärdet bokförs mot 7399 och redovisas i ruta {b.kind === "bil" ? "013" : "012"}.
              </small>
            </p>
            {canWrite && !ended && (
              <div className="hr-inline">
                <form action={endBenefitAction} className="hr-inline">
                  <input type="hidden" name="employeeId" value={employeeId} />
                  <input type="hidden" name="benefitId" value={b.id} />
                  <label>
                    Sista dag <input className="efield-input" type="date" name="validTo" defaultValue={today} required />
                  </label>
                  <button className="btn btn-ghost hr-btn-small" type="submit">
                    Avsluta
                  </button>
                </form>
                <form action={deleteBenefitAction}>
                  <input type="hidden" name="employeeId" value={employeeId} />
                  <input type="hidden" name="benefitId" value={b.id} />
                  <button className="btn btn-ghost hr-btn-small" type="submit">
                    Ta bort (bara om den aldrig betalats)
                  </button>
                </form>
              </div>
            )}
          </article>
        );
      })}
      {canWrite && (
        <details className="hr-details" open={benefits.length === 0}>
          <summary>Ny förmån</summary>
          <form action={saveBenefitAction} className="hr-stack hr-card">
            <input type="hidden" name="employeeId" value={employeeId} />
            <div className="hr-inline">
              <label>
                Förmån{" "}
                <select className="efield-input" name="kind" defaultValue="bil">
                  {Object.entries(BENEFIT_KIND_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Från <input className="efield-input" type="date" name="validFrom" defaultValue={`${today.slice(0, 7)}-01`} required />
              </label>
              <label>
                Till <input className="efield-input" type="date" name="validTo" />
              </label>
              <label>
                Personen betalar per månad (kr) <input className="efield-input" name="employeePayment" inputMode="decimal" style={{ width: 110 }} />
              </label>
            </div>
            <fieldset className="hr-card">
              <legend>Bil (Skatteverkets formel {rules.incomeYear}: 0,29 prisbasbelopp, {pct(Math.round((0.7 * rules.car.statslaneranta + 1) * 1000) / 1000)} och 13 % av nybilspriset, fordonsskatt)</legend>
              <div className="hr-inline">
                <label>
                  Registreringsnummer <input className="efield-input" name="registrationNumber" style={{ width: 100 }} />
                </label>
                <label>
                  Modell <input className="efield-input" name="carModel" />
                </label>
                <label>
                  Skattepliktig första gången <input className="efield-input" type="date" name="firstRegisteredOn" />
                </label>
                <label>
                  Årsmodell <input className="efield-input" name="modelYear" inputMode="numeric" style={{ width: 80 }} />
                </label>
                <label>
                  Drivmedel{" "}
                  <select className="efield-input" name="fuel" defaultValue="bensin">
                    {Object.entries(FUEL_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="hr-inline">
                <label>
                  Nybilspris (kr) <input className="efield-input" name="newCarPrice" inputMode="decimal" style={{ width: 120 }} />
                </label>
                <label>
                  Extrautrustning (kr) <input className="efield-input" name="extraEquipment" inputMode="decimal" style={{ width: 120 }} />
                </label>
                <label>
                  Fordonsskatt per år (kr) <input className="efield-input" name="vehicleTax" inputMode="decimal" style={{ width: 100 }} />
                </label>
                <label>
                  Tjänstekörning mil per år <input className="efield-input" name="businessMil" inputMode="numeric" style={{ width: 90 }} />
                </label>
                <label>
                  <input type="checkbox" name="fuelPaidByEmployer" /> Företaget betalar drivmedel för privat körning
                </label>
              </div>
              <p className="hr-muted">
                Nybilspriset ur Skatteverkets nybilsprislista; miljöbilsnedsättning (el och vätgas 350 000 kr, laddhybrid 140 000 kr, gas 100 000 kr, högst halva priset) räknas för bilar skattepliktiga från 1 juli 2022. Värdet per månad visas när förmånen är sparad.
              </p>
            </fieldset>
            <fieldset className="hr-card">
              <legend>
                Kost ({kr(rules.meals.breakfastOre)} frukost, {kr(rules.meals.lunchOrDinnerOre)} lunch eller middag, {kr(rules.meals.fullDayOre)} helt fri kost per dag)
              </legend>
              <div className="hr-inline">
                <label>
                  Frukostar per månad <input className="efield-input" name="breakfast" inputMode="numeric" style={{ width: 70 }} />
                </label>
                <label>
                  Luncher/middagar per månad <input className="efield-input" name="lunchOrDinner" inputMode="numeric" style={{ width: 70 }} />
                </label>
                <label>
                  Dagar med helt fri kost <input className="efield-input" name="fullDays" inputMode="numeric" style={{ width: 70 }} />
                </label>
              </div>
            </fieldset>
            <fieldset className="hr-card">
              <legend>Bostad (Skatteverkets schablon per m² och månad)</legend>
              <div className="hr-inline">
                <label>
                  Bostadsyta m² <input className="efield-input" name="areaM2" inputMode="decimal" style={{ width: 80 }} />
                </label>
                <label>
                  Område{" "}
                  <select className="efield-input" name="region" defaultValue="storgoteborg">
                    {Object.entries(HOUSING_REGION_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v} ({kr(rules.housing.perSquareMetreMonthOre[k as keyof typeof HOUSING_REGION_LABEL])}/m²)
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>
            <fieldset className="hr-card">
              <legend>Annan förmån (marknadsvärde)</legend>
              <div className="hr-inline">
                <label>
                  Beskrivning <input className="efield-input" name="description" />
                </label>
                <label>
                  Marknadsvärde per månad (kr) <input className="efield-input" name="marketValue" inputMode="decimal" style={{ width: 110 }} />
                </label>
              </div>
            </fieldset>
            <button className="btn btn-primary" type="submit">
              Spara förmånen
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
