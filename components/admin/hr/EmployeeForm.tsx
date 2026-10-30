"use client";

import { useState } from "react";
import { EditorForm, TextArea, TextField } from "../content/EditorForm";
import { createEmployeeAction, saveEmployeeContactAction } from "@/app/admin/hr-actions";
import { AGREEMENTS, AGREEMENT_LABEL, type EmployeeContact } from "@/lib/core/hr/schema";
import { CheckField, SelectField } from "./fields";

type NewPerson = EmployeeContact & { pnr: string; bankClearing: string; bankAccount: string };

const AGREEMENT_OPTIONS = AGREEMENTS.map((a) => ({ value: a, label: AGREEMENT_LABEL[a] }));

/** Contact details; a new person also gets personnummer and bank account (encrypted by the database). */
function ContactFields({ p, set }: { p: EmployeeContact; set: <K extends keyof EmployeeContact>(k: K) => (v: EmployeeContact[K]) => void }) {
  return (
    <>
      <TextField label="Namn" path="name" value={p.name} onChange={set("name")} placeholder="Anna Lindqvist" />
      <TextField label="E-post" path="email" inputMode="email" value={p.email} onChange={set("email")} hint="En inbjudan som anställd till samma adress kopplar inloggningen till personen." />
      <TextField label="Telefon" path="phone" inputMode="tel" value={p.phone} onChange={set("phone")} />
      <SelectField label="Kollektivavtal" path="agreement" value={p.agreement} options={AGREEMENT_OPTIONS} onChange={set("agreement")} hint="Styr semesterprocent, OB/övertid och tjänstepension i nya avtal." />
      <div className="egrid egrid--address efield--wide">
        <TextField label="Gatuadress" path="street" value={p.street} onChange={set("street")} />
        <TextField label="Postnummer" path="postalCode" inputMode="numeric" value={p.postalCode} onChange={set("postalCode")} />
        <TextField label="Ort" path="city" value={p.city} onChange={set("city")} />
      </div>
      <CheckField label="Ägare i bolaget" checked={p.isOwner} onChange={set("isOwner")} hint="För 3:12-planeraren och växa-stöd (fas 5)." />
      <CheckField label="Styrelseledamot" checked={p.isBoardMember} onChange={set("isBoardMember")} />
      <TextField label="Närmast anhörig" path="emergencyContact" value={p.emergencyContact} onChange={set("emergencyContact")} placeholder="Namn och telefon" />
      <TextArea label="Anteckningar (interna)" path="notes" value={p.notes} onChange={set("notes")} rows={2} />
    </>
  );
}

const EMPTY: NewPerson = {
  name: "",
  email: "",
  phone: "",
  street: "",
  postalCode: "",
  city: "",
  isOwner: false,
  isBoardMember: false,
  agreement: "none",
  emergencyContact: "",
  notes: "",
  pnr: "",
  bankClearing: "",
  bankAccount: "",
};

export function NewEmployeeForm({ agreement }: { agreement: EmployeeContact["agreement"] }) {
  const initial = { ...EMPTY, agreement };
  const [p, setP] = useState<NewPerson>(initial);
  const set = <K extends keyof NewPerson>(k: K) => (v: NewPerson[K]) => setP((prev) => ({ ...prev, [k]: v }));
  const setContact = <K extends keyof EmployeeContact>(k: K) => (v: EmployeeContact[K]) => setP((prev) => ({ ...prev, [k]: v }));
  return (
    <EditorForm action={createEmployeeAction} submitLabel="Lägg till personen" value={p} initial={initial} savedNote="">
      <fieldset className="efieldset">
        <legend>Person</legend>
        <div className="egrid">
          <ContactFields p={p} set={setContact} />
        </div>
      </fieldset>
      <fieldset className="efieldset">
        <legend>Personnummer och bankkonto</legend>
        <p className="efield-hint">Krypteras i databasen. Bara ägare och administratörer kan visa dem, och varje visning loggas.</p>
        <div className="egrid">
          <TextField label="Personnummer" path="pnr" value={p.pnr} onChange={set("pnr")} placeholder="ÅÅMMDD-XXXX" hint="Eller samordningsnummer. Födelsedagen sparas för arbetsgivaravgiftens åldersgrupp." />
          <div />
          <TextField label="Clearingnummer" path="bankClearing" inputMode="numeric" value={p.bankClearing} onChange={set("bankClearing")} placeholder="8327" />
          <TextField label="Kontonummer" path="bankAccount" inputMode="numeric" value={p.bankAccount} onChange={set("bankAccount")} hint="Lönen betalas hit (bankfilen kommer i fas 3)." />
        </div>
      </fieldset>
    </EditorForm>
  );
}

export function ContactForm({ id, initial }: { id: string; initial: EmployeeContact }) {
  const [p, setP] = useState<EmployeeContact>(initial);
  const set = <K extends keyof EmployeeContact>(k: K) => (v: EmployeeContact[K]) => setP((prev) => ({ ...prev, [k]: v }));
  return (
    <EditorForm action={saveEmployeeContactAction} hidden={{ id }} submitLabel="Spara uppgifterna" value={p} initial={initial} savedNote="">
      <fieldset className="efieldset">
        <legend>Kontaktuppgifter</legend>
        <div className="egrid">
          <ContactFields p={p} set={set} />
        </div>
      </fieldset>
    </EditorForm>
  );
}
