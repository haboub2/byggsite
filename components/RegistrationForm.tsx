"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { HONEYPOT } from "@/lib/schema";
import { LOGIN_LINK_VALIDITY } from "@/lib/product";
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
      <div className="reg-card" ref={done} tabIndex={-1} role="status">
        <span className="eyebrow eyebrow--accent">Kolla mejlen</span>
        <h2>Länken är skickad</h2>
        <div className="mail-sent">
          <MailIcon />
          <span>
            <strong>Länken skickad till {state.email}.</strong> Den gäller i {LOGIN_LINK_VALIDITY}. Titta i skräpposten om den dröjer.
          </span>
        </div>
        <p className="efield-hint">
          Öppna den på den här enheten, så skapas företaget i {product} och du kommer till startguiden. Har länken gått ut, registrera igen med samma
          adress så kommer en ny.
        </p>
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
    <form key={state.attempt} className="reg-card form" action={action} noValidate>
      <h2>Nytt företag</h2>
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="rf-website">Lämna tomt</label>
        <input id="rf-website" name={HONEYPOT} type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="field">
        <label htmlFor="rf-org">Företagsnamn</label>
        <input id="rf-org" name="orgName" type="text" autoComplete="organization" required maxLength={120} defaultValue={v.orgName} />
      </div>
      <div className="field">
        <label htmlFor="rf-orgnr">Organisationsnummer</label>
        <input id="rf-orgnr" name="orgNr" type="text" inputMode="numeric" placeholder="559123-4567" required maxLength={13} defaultValue={v.orgNr} aria-describedby="rf-orgnr-hint" />
        <span id="rf-orgnr-hint" className="efield-hint">
          Adress och övriga uppgifter fyller du i senare i startguiden. F-skatt och momsregistrering antas vara klara.
        </span>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="rf-name">Ditt namn</label>
          <input id="rf-name" name="contactName" type="text" autoComplete="name" required maxLength={120} defaultValue={v.contactName} />
        </div>
        <div className="field">
          <label htmlFor="rf-email">E-post</label>
          <input id="rf-email" name="email" type="email" autoComplete="email" required defaultValue={v.email} />
        </div>
      </div>

      <label className="checkbox">
        <input type="checkbox" name="accept" required defaultChecked={v.accept === "on"} />
        <span>Jag är behörig att teckna företaget och godkänner användarvillkoren och personuppgiftsbiträdesavtalet.</span>
      </label>

      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Skickar…" : "Skicka länken till min e-post"}
      </button>
      {state.status === "error" && (
        <p className="form-feedback error" role="alert">
          {state.message}
        </p>
      )}
      <p className="reg-alt">
        Har du redan ett konto? <Link href="/admin/login">Logga in</Link>
      </p>
    </form>
  );
}

export function MailIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}
