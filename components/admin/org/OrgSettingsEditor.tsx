"use client";

import { useState } from "react";
import { EditorForm, TextArea, TextField, type LastSaved } from "../content/EditorForm";
import { saveOrgSettingsAction } from "@/app/admin/org-actions";
import { CHART_KEYS, CHART_KEY_LABEL, type OrgSettings } from "@/lib/core/org/settings";

const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const digits = (v: string) => Number(v.replace(/[^\d]/g, "")) || 0;

/** /admin/installningar: everything the invoices, reminders and the ledger take from the organisation. */
export default function OrgSettingsEditor({ initial, defaults, lastSaved }: { initial: OrgSettings; defaults: Record<string, string>; lastSaved?: LastSaved }) {
  const [s, setS] = useState(initial);
  const setIn =
    <K extends keyof OrgSettings>(group: K) =>
    <F extends keyof OrgSettings[K]>(field: F) =>
    (v: OrgSettings[K][F]) =>
      setS((prev) => ({ ...prev, [group]: { ...(prev[group] as object), [field]: v } }));
  const company = setIn("company");
  const payment = setIn("payment");
  const terms = setIn("terms");
  const reminders = setIn("reminders");
  const chart = setIn("chart");

  return (
    <EditorForm action={saveOrgSettingsAction} value={s} initial={initial} lastSaved={lastSaved} submitLabel="Spara inställningarna" savedNote="Nya fakturor använder dem.">
      <fieldset className="efieldset">
        <legend>Företaget på fakturan</legend>
        <p className="efield-hint">Säljaren på varje ny faktura. Utfärdade fakturor behåller det som stod när de utfärdades.</p>
        <div className="egrid">
          <TextField label="Företagsnamn" path="company.legalName" value={s.company.legalName} onChange={company("legalName")} placeholder="Binaafy AB" />
          <TextField label="Organisationsnummer" path="company.orgNr" value={s.company.orgNr} onChange={company("orgNr")} placeholder="559123-4567" />
          <TextField label="Momsregistreringsnummer" path="company.vatNr" value={s.company.vatNr} onChange={company("vatNr")} placeholder="SE559123456701" hint="Org.nr utan bindestreck, med SE före och 01 efter." />
          <TextField label="E-post" path="company.email" inputMode="email" value={s.company.email} onChange={company("email")} hint="Svar på fakturamejl går hit." />
          <TextField label="Telefon" path="company.phone" inputMode="tel" value={s.company.phone} onChange={company("phone")} />
          <TextField label="Undertecknare" path="company.signer" value={s.company.signer} onChange={company("signer")} hint="Står under fakturamejl och påminnelser." />
          <div className="egrid egrid--address efield--wide">
            <TextField label="Gatuadress" path="company.street" value={s.company.street} onChange={company("street")} />
            <TextField label="Postnummer" path="company.postalCode" inputMode="numeric" value={s.company.postalCode} onChange={company("postalCode")} />
            <TextField label="Ort" path="company.city" value={s.company.city} onChange={company("city")} />
          </div>
        </div>
        <label className="etoggle">
          <input type="checkbox" checked={s.company.fSkatt} onChange={(e) => company("fSkatt")(e.target.checked)} />
          <span>Godkänd för F-skatt (skrivs på fakturan)</span>
        </label>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Betalning</legend>
        <p className="efield-hint">Minst ett sätt krävs för att utfärda. Swish-numret ger QR-koden på PDF:en och i portalen.</p>
        <div className="egrid">
          <TextField label="Bankgiro" path="payment.bankgiro" value={s.payment.bankgiro} onChange={payment("bankgiro")} placeholder="123-4567" />
          <TextField label="Plusgiro" path="payment.plusgiro" value={s.payment.plusgiro} onChange={payment("plusgiro")} />
          <TextField label="IBAN" path="payment.iban" value={s.payment.iban} onChange={payment("iban")} placeholder="SE45 5000 0000 0583 9825 7466" />
          <TextField label="BIC" path="payment.bic" value={s.payment.bic} onChange={payment("bic")} placeholder="ESSESESS" />
          <TextField label="Swish-nummer (företag)" path="payment.swish" inputMode="numeric" value={s.payment.swish} onChange={payment("swish")} placeholder="1231234567" />
        </div>
        <label className="etoggle">
          <input type="checkbox" checked={s.payment.ocrAgreement} onChange={(e) => payment("ocrAgreement")(e.target.checked)} />
          <span>Bankgirot har OCR-avtal</span>
        </label>
        <TextField
          label="Swish Handel: certifikat"
          path="payment.swishCommerce.credentials"
          value={s.payment.swishCommerce.credentials}
          onChange={(v) => payment("swishCommerce")({ credentials: v.trim() })}
          placeholder="env:SWISH"
          hint="Var certifikatet för Swish-numret finns, aldrig certifikatet självt: env:SWISH (miljövariablerna SWISH_*) eller vault:swish_namn (Supabase Vault). Tomt = av. Status visas under rutan Swish Handel nedan."
        />
        <p className="efield-hint">
          Med avtal (OCR-referenskontroll, beställs via banken) står OCR-numret på fakturan. Utan avtal står &quot;Referens&quot; med fakturanumret, som kunden skriver som meddelande. Gäller fakturor som utfärdas efter att du sparat.
        </p>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Villkor</legend>
        <div className="egrid">
          <TextField label="Betalningsvillkor privatpersoner, dagar" path="terms.privat" inputMode="numeric" value={String(s.terms.privat)} onChange={(v) => terms("privat")(digits(v))} />
          <TextField label="Betalningsvillkor företag, dagar" path="terms.foretag" inputMode="numeric" value={String(s.terms.foretag)} onChange={(v) => terms("foretag")(digits(v))} />
          <TextField label="Betalningsvillkor byggföretag, dagar" path="terms.byggforetag" inputMode="numeric" value={String(s.terms.byggforetag)} onChange={(v) => terms("byggforetag")(digits(v))} hint="En kund i registret kan ha egna villkor; de går före." />
        </div>
        <TextArea label="Dröjsmålsränta, text på fakturan" path="lateInterestText" value={s.lateInterestText} onChange={(v) => setS((p) => ({ ...p, lateInterestText: v }))} rows={2} placeholder="Dröjsmålsränta enligt räntelagen, referensräntan plus 8 procentenheter." />
      </fieldset>

      <fieldset className="efieldset">
        <legend>Påminnelser</legend>
        <p className="efield-hint">Avgiften är 60 kr till företag. Ränta räknas enligt räntelagen. Påminnelser skickas med knappen på fakturan, eller av den dagliga körningen om automatiken är på.</p>
        <div className="egrid">
          <TextField label="Dagar efter förfallodagen innan första påminnelsen" path="reminders.graceDays" inputMode="numeric" value={String(s.reminders.graceDays)} onChange={(v) => reminders("graceDays")(digits(v))} />
          <TextField label="Dagar mellan påminnelser" path="reminders.daysBetween" inputMode="numeric" value={String(s.reminders.daysBetween)} onChange={(v) => reminders("daysBetween")(digits(v))} />
        </div>
        <label className="etoggle">
          <input type="checkbox" checked={s.reminders.feeToConsumers} onChange={(e) => reminders("feeToConsumers")(e.target.checked)} />
          <span>Påminnelseavgift även till privatpersoner (bara om era villkor säger det)</span>
        </label>
        <label className="etoggle">
          <input type="checkbox" checked={s.reminders.auto} onChange={(e) => reminders("auto")(e.target.checked)} />
          <span>Skicka påminnelser automatiskt varje morgon (kräver mejl, MAIL_FROM)</span>
        </label>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Bokföring</legend>
        <div className="egrid">
          <div className="efield">
            <label htmlFor="fy-start">Räkenskapsåret börjar</label>
            <select id="fy-start" value={s.fiscalYearStart} onChange={(e) => setS((p) => ({ ...p, fiscalYearStart: e.target.value }))}>
              {MONTHS.map((m, i) => {
                const v = `${String(i + 1).padStart(2, "0")}-01`;
                return (
                  <option key={v} value={v}>
                    1 {m}
                  </option>
                );
              })}
            </select>
            <span className="efield-hint">Används i SIE-filen (#RAR). Verifikationerna numreras per kalenderår.</span>
          </div>
        </div>
        <p className="efield-hint" style={{ marginTop: 12 }}>
          Konton som fakturor, betalningar och påminnelser bokförs på. Lämna tomt för BAS-kontot inom parentes. Ett nytt konto läggs till i kontoplanen när du sparar.
        </p>
        <div className="egrid">
          {CHART_KEYS.map((k) => (
            <TextField key={k} label={`${CHART_KEY_LABEL[k]} (${defaults[k]})`} path={`chart.${k}`} inputMode="numeric" value={s.chart[k]} onChange={(v) => chart(k)(v.replace(/[^\d]/g, "").slice(0, 4))} placeholder={defaults[k]} />
          ))}
        </div>
      </fieldset>
    </EditorForm>
  );
}
