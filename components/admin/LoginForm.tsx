"use client";

import { useActionState } from "react";
import { signIn } from "@/app/admin/actions";

type State = { error?: string };

async function action(_prev: State, formData: FormData): Promise<State> {
  const result = await signIn(formData);
  return result ?? {};
}

export default function LoginForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(action, {});

  return (
    <form action={formAction} className="form" style={{ maxWidth: 380, margin: "0 auto" }}>
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
  );
}
