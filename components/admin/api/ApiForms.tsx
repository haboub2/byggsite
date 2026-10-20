"use client";

import { useActionState } from "react";
import { createApiKeyAction, createWebhookAction, type ApiAdminState } from "@/app/admin/api-actions";

function Result({ state }: { state: ApiAdminState }) {
  if (state.error)
    return (
      <p className="form-feedback error" role="alert">
        {state.error}
      </p>
    );
  if (!state.message) return null;
  return (
    <div className="form-feedback" role="status" style={{ marginTop: 12 }}>
      <p>{state.message}</p>
      {state.secret && (
        <p className="org-secret" data-secret>
          {state.secret}
        </p>
      )}
    </div>
  );
}

export function CreateKeyForm() {
  const [state, action, pending] = useActionState<ApiAdminState, FormData>(createApiKeyAction, {});
  return (
    <form action={action}>
      <div className="org-inline">
        <label className="sr-only" htmlFor="key-name">
          Namn
        </label>
        <input id="key-name" name="name" required maxLength={80} placeholder="Till exempel: Webbshopen" />
        <label className="sr-only" htmlFor="key-access">
          Behörighet
        </label>
        <select id="key-access" name="access" defaultValue="read">
          <option value="read">Läsa</option>
          <option value="write">Läsa och skriva</option>
        </select>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Skapar…" : "Skapa nyckel"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function CreateWebhookForm({ types }: { types: readonly string[] }) {
  const [state, action, pending] = useActionState<ApiAdminState, FormData>(createWebhookAction, {});
  return (
    <form action={action}>
      <div className="org-inline">
        <label className="sr-only" htmlFor="wh-url">
          Adress
        </label>
        <input id="wh-url" name="url" type="url" required placeholder="https://exempel.se/webhooks" style={{ minWidth: 320 }} />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Registrerar…" : "Registrera"}
        </button>
      </div>
      <fieldset className="efieldset" style={{ marginTop: 12 }}>
        <legend>Händelser (ingen vald = alla)</legend>
        <div className="org-inline">
          {types.map((t) => (
            <label key={t} className="etoggle" style={{ margin: 0 }}>
              <input type="checkbox" name="events" value={t} />
              <span>{t}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Result state={state} />
    </form>
  );
}
