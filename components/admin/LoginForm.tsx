"use client";

import { useActionState, useRef, useState } from "react";
import { requestLoginLink, signIn, type LoginLinkState } from "@/app/admin/actions";
import { MailIcon } from "@/components/RegistrationForm";
import { LOGIN_LINK_VALIDITY } from "@/lib/product";

type State = { error?: string };

async function passwordAction(_prev: State, formData: FormData): Promise<State> {
  const result = await signIn(formData);
  return result ?? {};
}

/**
 * Admin login after the approved mockup (LoggaIn.dc.html): a sign-in link by
 * e-mail is the main way, the password folded away below. One e-mail field
 * serves both buttons. No new accounts here; those come from /registrera.
 */
export default function LoginForm({ next }: { next?: string }) {
  const [linkState, linkAction, linkPending] = useActionState<LoginLinkState, FormData>(requestLoginLink, {});
  const [pwState, pwAction, pwPending] = useActionState<State, FormData>(passwordAction, {});
  const pwButton = useRef<HTMLButtonElement>(null);
  // Controlled, so the address stays after a sent link (React resets uncontrolled fields after an action).
  const [email, setEmail] = useState("");
  const error = pwState.error ?? linkState.error;

  return (
    <>
      <form action={linkAction} className="login-card form">
        {next && <input type="hidden" name="next" value={next} />}
        <div className="field">
          <label htmlFor="admin-email">E-post</label>
          <input id="admin-email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={linkPending}>
          {linkPending ? "Skickar…" : "Skicka inloggningslänk"}
        </button>
        <div className="login-or" aria-hidden="true">
          <span>eller</span>
        </div>
        <details className="login-password" open={!!pwState.error}>
          <summary>Logga in med lösenord</summary>
          <div className="login-password-body">
            <div className="field">
              <label htmlFor="admin-password">Lösenord</label>
              <input
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                onKeyDown={(e) => {
                  // Enter here means the password login, not the form's first button (the link).
                  if (e.key === "Enter") {
                    e.preventDefault();
                    pwButton.current?.click();
                  }
                }}
              />
            </div>
            <button ref={pwButton} type="submit" formAction={pwAction} className="btn btn-dark btn-block" disabled={pwPending}>
              {pwPending ? "Loggar in…" : "Logga in"}
            </button>
            <span className="login-forgot">Glömt lösenordet? Använd länken ovan.</span>
          </div>
        </details>
        {error && (
          <p className="form-feedback error" role="alert">
            {error}
          </p>
        )}
      </form>

      {linkState.ok && (
        <div className="mail-sent" role="status">
          <MailIcon />
          <span>
            <strong>Länken skickad till {linkState.email}.</strong> Den gäller i {LOGIN_LINK_VALIDITY}. Titta i skräpposten om den dröjer.
          </span>
        </div>
      )}
    </>
  );
}
