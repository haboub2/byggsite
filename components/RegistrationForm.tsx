"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { HONEYPOT } from "@/lib/schema";
import { submitRegistration, type RegistrationState } from "@/app/(site)/registrera/actions";

const INITIAL: RegistrationState = { status: "idle", attempt: 0 };

/** Self-registration for the invoicing product (/registrera, 0033). */
export default function RegistrationForm({ product }: { product: string }) {
  const [state, action, pending] = useActionState(submitRegistration, INITIAL);
  const v = state.values ?? {};
  const done = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === "done") done.current?.focus();
  }, [state.status]);

  if (state.status === "done") {
    return (
      <div className="interest-thanks" ref={done} tabIndex={-1} role="status">
        <span className="eyebrow eyebrow--accent">Kolla mejlen</span>
        <h3>Nästan klart.</h3>
        <p>
          Vi har skickat en länk till <strong>{state.email}</strong>. Öppna den på den här enheten, så skapas företaget i {product} och du
          kommer till startguiden. Länken gäller i sju dagar.
        </p>
        <p className="efield-hint">Inget mejl efter några minuter? Titta i skräpposten, eller registrera igen med samma adress så skickas länken på nytt.</p>
        {state.demoLink && (
          <p className="form-feedback">
            Demoläge, inget mejl skickas: <a href={state.demoLink}>öppna länken</a>.
          </p>
        )}
      </div>
    );
  }

  return (
    // The key remounts the form after a failed attempt, so the fields get back what was typed.
    <form key={state.attempt} className="form" action={action} noValidate>
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="rf-website">Lämna tomt</label>
        <input id="rf-website" name={HONEYPOT} type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="form-row">
        <div className="field">
          <label htmlFor="rf-org">Företagsnamn *</label>
          <input id="rf-org" name="orgName" type="text" autoComplete="organization" required maxLength={120} defaultValue={v.orgName} />
        </div>
        <div className="field">
          <label htmlFor="rf-orgnr">Organisationsnummer *</label>
          <input id="rf-orgnr" name="orgNr" type="text" inputMode="numeric" placeholder="559123-4567" required maxLength={13} defaultValue={v.orgNr} />
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label htmlFor="rf-name">Ditt namn *</label>
          <input id="rf-name" name="contactName" type="text" autoComplete="name" required maxLength={120} defaultValue={v.contactName} />
        </div>
        <div className="field">
          <label htmlFor="rf-email">E-post *</label>
          <input id="rf-email" name="email" type="email" autoComplete="email" required defaultValue={v.email} />
        </div>
      </div>

      <p className="efield-hint">
        Du blir ägare av företagets konto och loggar in med e-postlänkar, utan lösenord. Vi behandlar uppgifterna enligt{" "}
        <Link href="/integritetspolicy">integritetspolicyn</Link>.
      </p>

      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Skickar…" : "Registrera företaget"}
      </button>
      <p className={`form-feedback ${state.status === "error" ? "error" : ""}`} role="status" aria-live="polite">
        {state.status === "error" ? state.message : null}
      </p>
      <p className="efield-hint" style={{ textAlign: "center" }}>
        Har ni redan ett konto? <Link href="/admin/login">Logga in</Link>
      </p>
    </form>
  );
}
