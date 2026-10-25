"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { requestLoginLink, signIn, type LoginLinkState } from "@/app/admin/actions";

type State = { error?: string };

async function action(_prev: State, formData: FormData): Promise<State> {
  const result = await signIn(formData);
  return result ?? {};
}

/** Admin login: password, or a one-time link by e-mail (no new accounts here; those come from /registrera). */
export default function LoginForm({ next, startWithLink = false }: { next?: string; startWithLink?: boolean }) {
  const [mode, setMode] = useState<"password" | "link">(startWithLink ? "link" : "password");
  const [state, formAction, pending] = useActionState<State, FormData>(action, {});
  const [linkState, linkAction, linkPending] = useActionState<LoginLinkState, FormData>(requestLoginLink, {});

  return (
    <div className="login-box">
      {mode === "password" ? (
        <form action={formAction} className="form">
          {next && <input type="hidden" name="next" value={next} />}
          <div className="field">
            <label htmlFor="admin-email">E-post</label>
            <input id="admin-email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="admin-password">Lösenord</label>
            <input id="admin-password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
            {pending ? "Loggar in…" : "Logga in"}
          </button>
          {state.error && (
            <p className="form-feedback error" role="alert">
              {state.error}
            </p>
          )}
        </form>
      ) : linkState.ok ? (
        <p className="form-feedback" role="status">
          {linkState.message}
        </p>
      ) : (
        <form action={linkAction} className="form">
          {next && <input type="hidden" name="next" value={next} />}
          <div className="field">
            <label htmlFor="admin-link-email">E-post</label>
            <input id="admin-link-email" name="email" type="email" autoComplete="email" required />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={linkPending}>
            {linkPending ? "Skickar…" : "Skicka inloggningslänk"}
          </button>
          {linkState.error && (
            <p className="form-feedback error" role="alert">
              {linkState.error}
            </p>
          )}
        </form>
      )}

      <ul className="login-links">
        <li>
          <button type="button" className="link-quiet" onClick={() => setMode(mode === "password" ? "link" : "password")}>
            {mode === "password" ? "Logga in med e-postlänk" : "Logga in med lösenord"}
          </button>
        </li>
        <li>
          <Link href="/registrera" className="link-quiet">
            Registrera företag
          </Link>
        </li>
      </ul>
    </div>
  );
}
