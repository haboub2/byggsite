"use client";

import { useState } from "react";
import { EditorForm, type LastSaved, TextArea, TextField } from "./EditorForm";
import type { QuoteDefaults, QuoteSettings } from "@/lib/content/schema";

function DefaultsFields({ side, value, onChange }: { side: "bygg" | "software"; value: QuoteDefaults; onChange: (v: QuoteDefaults) => void }) {
  const set = (k: keyof QuoteDefaults) => (v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="egrid">
      <TextArea label="Inledning" path={`${side}.intro`} value={value.intro} onChange={set("intro")} rows={3} hint="Används när mallen saknar egen inledning." />
      <TextArea label="Betalning" path={`${side}.payment`} value={value.payment} onChange={set("payment")} rows={3} />
      <TextArea label="Garanti och försäkring" path={`${side}.warranty`} value={value.warranty} onChange={set("warranty")} rows={2} />
      <TextArea label="Ingår inte" path={`${side}.excluded`} value={value.excluded} onChange={set("excluded")} rows={3} />
      <TextArea label="Övrigt" path={`${side}.notes`} value={value.notes} onChange={set("notes")} rows={2} />
    </div>
  );
}

export default function QuoteSettingsEditor({ initial, lastSaved }: { initial: QuoteSettings; lastSaved?: LastSaved }) {
  const [s, setS] = useState(initial);
  const set = <K extends keyof QuoteSettings>(k: K) => (v: QuoteSettings[K]) => setS((prev) => ({ ...prev, [k]: v }));

  return (
    <EditorForm contentKey="quote" lastSaved={lastSaved} value={s} initial={initial} submitLabel="Spara">
      <fieldset className="efieldset">
        <legend>Betalningsuppgifter</legend>
        <p className="efield-hint">Visas i sidfoten på varje offert. Lämna tomt det ni inte har.</p>
        <div className="egrid">
          <TextField label="Bankgiro" path="bankgiro" value={s.bankgiro} onChange={set("bankgiro")} placeholder="123-4567" />
          <TextField label="Plusgiro" path="plusgiro" value={s.plusgiro} onChange={set("plusgiro")} />
          <TextField label="IBAN" path="iban" value={s.iban} onChange={set("iban")} placeholder="SE12 3456 7890 1234 5678 9012" />
          <TextField label="BIC" path="bic" value={s.bic} onChange={set("bic")} />
          <TextField label="Momsregistreringsnummer" path="vatNumber" value={s.vatNumber} onChange={set("vatNumber")} placeholder="SE559123456701" hint="Org.nr utan bindestreck, med SE före och 01 efter." />
          <TextField label="Försäkring" path="insurance" value={s.insurance} onChange={set("insurance")} placeholder="Ansvarsförsäkring via Länsförsäkringar" />
        </div>
        <label className="etoggle">
          <input type="checkbox" checked={s.fSkatt} onChange={(e) => set("fSkatt")(e.target.checked)} />
          <span>Godkänd för F-skatt (skrivs i sidfoten)</span>
        </label>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Undertecknare och giltighet</legend>
        <div className="egrid">
          <TextField label="Namn" path="signerName" value={s.signerName} onChange={set("signerName")} />
          <TextField label="Titel" path="signerTitle" value={s.signerTitle} onChange={set("signerTitle")} placeholder="Byggingenjör" />
          <TextField
            label="Giltig antal dagar (standard)"
            path="validDays"
            inputMode="numeric"
            value={s.validDays ? String(s.validDays) : ""}
            onChange={(v) => set("validDays")(Number(v.replace(/[^\d]/g, "")) || 0)}
          />
          <TextField
            label="Betalningsvillkor, dagar (standard)"
            path="paymentDays"
            inputMode="numeric"
            value={String(s.paymentDays)}
            onChange={(v) => set("paymentDays")(Number(v.replace(/[^\d]/g, "")) || 0)}
            hint="Skrivs som ”30 dagar” i offertens faktaruta."
          />
          <TextField label="Dröjsmålsränta" path="lateInterest" value={s.lateInterest} onChange={set("lateInterest")} placeholder="Referensränta + 8 %" />
        </div>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Standardtexter — Bygg</legend>
        <DefaultsFields side="bygg" value={s.bygg} onChange={set("bygg")} />
      </fieldset>
      <fieldset className="efieldset">
        <legend>Standardtexter — Software</legend>
        <DefaultsFields side="software" value={s.software} onChange={set("software")} />
      </fieldset>
    </EditorForm>
  );
}
