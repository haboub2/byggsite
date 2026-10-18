"use client";

import { useActionState } from "react";
import { requestCode, verifyCode, type LoginState } from "@/app/(portal)/portal-actions";

/** Two steps: your e-mail, then the 6-digit code from the e-mail. */
export default function PortalLogin({ demo, linkFailed }: { demo: boolean; linkFailed: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    (prev, formData) => (prev.step === "code" && !formData.has("restart") ? verifyCode(prev, formData) : requestCode(prev, formData)),
    { step: "email" }
  );

  if (state.step === "code" && state.email) {
    return (
      <form action={action} className="form portal-login" noValidate>
        <input type="hidden" name="email" value={state.email} />
        <p className="portal-login-note">
          Vi har skickat en kod till <strong>{state.email}</strong>, om adressen är inbjuden till ett projekt. Skriv koden här,
          eller klicka på länken i mejlet.
        </p>
        <div className="field">
          <label htmlFor="portal-code">Engångskod</label>
          <input
            id="portal-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            placeholder="123456"
            required
            autoFocus
          />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
          {pending ? "Loggar in…" : "Logga in"}
        </button>
        {state.error && (
          <p className="form-feedback error" role="alert">
            {state.error}
          </p>
        )}
        <button type="submit" name="restart" value="1" className="link-quiet portal-login-restart" formNoValidate>
          Ny kod eller annan adress
        </button>
      </form>
    );
  }

  return (
    <form action={action} className="form portal-login" noValidate>
      {linkFailed && (
        <p className="portal-login-note">
          Länken i mejlet har redan använts eller gått ut. Skriv din e-post så får du en ny kod.
        </p>
      )}
      <div className="field">
        <label htmlFor="portal-email">E-post</label>
        <input id="portal-email" name="email" type="email" autoComplete="email" inputMode="email" required autoFocus />
      </div>
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Skickar…" : demo ? "Öppna demo" : "Skicka kod"}
      </button>
      {state.error && (
        <p className="form-feedback error" role="alert">
          {state.error}
        </p>
      )}
      <p className="portal-login-hint">
        {demo
          ? "Demoläge: vilken adress som helst öppnar exempelprojektet."
          : "Inget lösenord. Du får en kod med 6 siffror och en länk i mejlen. Bara adresser som vi har bjudit in kan logga in."}
      </p>
    </form>
  );
}
