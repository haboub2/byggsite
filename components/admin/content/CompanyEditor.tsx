"use client";

import { useState } from "react";
import { EditorForm, type LastSaved, TextField, useFieldError } from "./EditorForm";
import type { Company } from "@/lib/content/schema";

function Areas({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const error = useFieldError("areasServed");
  const add = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div className={`efield efield--wide${error ? " has-error" : ""}`}>
      <label htmlFor="areas-add">Områden ni arbetar i</label>
      <ul className="chips-edit">
        {value.map((a) => (
          <li key={a}>
            {a}
            <button type="button" aria-label={`Ta bort ${a}`} onClick={() => onChange(value.filter((x) => x !== a))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="chips-add">
        <input
          id="areas-add"
          value={draft}
          placeholder="Lägg till ort, t.ex. Varberg"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn btn-ghost" onClick={add}>
          Lägg till
        </button>
      </div>
      <span className={error ? "efield-error" : "efield-hint"}>
        {error ?? "Visas i Google-data och i texten om var ni arbetar."}
      </span>
    </div>
  );
}

function Stats({
  title,
  hint,
  path,
  value,
  onChange,
  warranty,
}: {
  title: string;
  hint: string;
  path: "byggStats" | "softwareStats";
  value: Company["byggStats"];
  onChange: (v: Company["byggStats"]) => void;
  warranty: string;
}) {
  const set = (i: number, k: "value" | "label", v: string) =>
    onChange(value.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  return (
    <fieldset className="efieldset">
      <legend>{title}</legend>
      <p className="efield-hint">{hint}</p>
      <div className="stats-edit">
        {value.map((s, i) => (
          <div key={i} className="stat-edit">
            <TextField label="Siffra" path={`${path}.${i}.value`} value={s.value} onChange={(v) => set(i, "value", v)} />
            <TextField label="Text" path={`${path}.${i}.label`} value={s.label} onChange={(v) => set(i, "label", v)} />
          </div>
        ))}
        <div className="stat-edit stat-edit--locked">
          <span className="stat-preview">{warranty}</span>
          <span className="efield-hint">garanti — ändras under Garanti</span>
        </div>
      </div>
    </fieldset>
  );
}

export default function CompanyEditor({
  initial,
  warranty,
  lastSaved,
}: {
  lastSaved?: LastSaved;
  initial: Company;
  warranty: { bygg: string; software: string };
}) {
  const [c, setC] = useState(initial);
  const set = <K extends keyof Company>(k: K) => (v: Company[K]) => setC((prev) => ({ ...prev, [k]: v }));

  return (
    <EditorForm lastSaved={lastSaved} contentKey="company" value={c} initial={initial}>
      <fieldset className="efieldset">
        <legend>Företaget</legend>
        <div className="egrid">
          <TextField label="Företagsnamn (juridiskt)" path="legalName" value={c.legalName} onChange={set("legalName")} />
          <TextField
            label="Organisationsnummer"
            path="orgNr"
            value={c.orgNr}
            onChange={set("orgNr")}
            placeholder="559123-4567"
            hint="Lämna tomt tills bolaget är registrerat."
          />
          <TextField label="Kontaktperson" path="contactPerson" value={c.contactPerson} onChange={set("contactPerson")} />
          <TextField label="Öppettider" path="hours" value={c.hours} onChange={set("hours")} placeholder="Mån–Fre, 07:00–16:00" />
        </div>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Adress</legend>
        <div className="egrid egrid--address">
          <TextField label="Gatuadress" path="street" value={c.street} onChange={set("street")} />
          <TextField label="Postnummer" path="postalCode" value={c.postalCode} onChange={set("postalCode")} inputMode="numeric" />
          <TextField label="Ort" path="city" value={c.city} onChange={set("city")} />
        </div>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Kontakt</legend>
        <div className="egrid">
          <TextField
            label="Telefon som den visas"
            path="phoneDisplay"
            value={c.phoneDisplay}
            onChange={set("phoneDisplay")}
            placeholder="079-304 97 37"
          />
          <TextField
            label="Telefon för ring-knappar"
            path="phone"
            value={c.phone}
            onChange={set("phone")}
            placeholder="+46793049737"
            inputMode="tel"
            hint="Samma nummer med +46 och utan nolla och mellanslag."
          />
          <TextField label="E-post" path="email" value={c.email} onChange={set("email")} inputMode="email" wide />
        </div>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Område</legend>
        <Areas value={c.areasServed} onChange={set("areasServed")} />
      </fieldset>

      <Stats
        title="Siffror på Bygg-sidan"
        hint="Visas under rubriken på startsidan. Skriv bara det som går att styrka."
        path="byggStats"
        value={c.byggStats}
        onChange={set("byggStats")}
        warranty={warranty.bygg}
      />
      <Stats
        title="Siffror på Software-sidan"
        hint="Visas under rubriken på Software-sidan."
        path="softwareStats"
        value={c.softwareStats}
        onChange={set("softwareStats")}
        warranty={warranty.software}
      />
    </EditorForm>
  );
}
