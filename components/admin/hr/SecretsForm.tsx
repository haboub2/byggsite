"use client";

import { useState } from "react";
import { EditorForm, TextField } from "../content/EditorForm";
import { saveEmployeeSecretsAction } from "@/app/admin/hr-actions";
import { CheckField } from "./fields";

type Secrets = { pnr: string; bankClearing: string; bankAccount: string; removeBank: boolean };
const EMPTY: Secrets = { pnr: "", bankClearing: "", bankAccount: "", removeBank: false };

/** A new personnummer or bank account; the old values are never shown here. */
export function SecretsForm({ id, pnrMasked, bankMasked }: { id: string; pnrMasked: string; bankMasked: string }) {
  const [s, setS] = useState<Secrets>(EMPTY);
  const set = <K extends keyof Secrets>(k: K) => (v: Secrets[K]) => setS((prev) => ({ ...prev, [k]: v }));
  return (
    <EditorForm action={saveEmployeeSecretsAction} hidden={{ id }} submitLabel="Spara" value={s} initial={EMPTY} savedNote="Krypterat och loggat.">
      <fieldset className="efieldset">
        <legend>Personnummer och bankkonto</legend>
        <p className="efield-hint">
          Nu: {pnrMasked || "inget personnummer"} · {bankMasked || "inget bankkonto"}. Lämna ett fält tomt för att behålla det som är inlagt.
        </p>
        <div className="egrid">
          <TextField label="Nytt personnummer" path="pnr" value={s.pnr} onChange={set("pnr")} placeholder="ÅÅMMDD-XXXX" />
          <div />
          <TextField label="Clearingnummer" path="bankClearing" inputMode="numeric" value={s.bankClearing} onChange={set("bankClearing")} />
          <TextField label="Nytt kontonummer" path="bankAccount" inputMode="numeric" value={s.bankAccount} onChange={set("bankAccount")} />
          {bankMasked && <CheckField label="Ta bort bankkontot" checked={s.removeBank} onChange={set("removeBank")} />}
        </div>
      </fieldset>
    </EditorForm>
  );
}
