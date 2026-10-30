"use client";

import { useActionState } from "react";
import { generateContractAction, signDocumentAction, type DocumentActionState } from "@/app/admin/hr-actions";

/** "Skapa avtal (PDF)" for one employment version: renders, freezes and lists it. */
export function GenerateContractButton({ employeeId, employmentId, label = "Skapa avtal (PDF)" }: { employeeId: string; employmentId: string; label?: string }) {
  const [state, action, pending] = useActionState<DocumentActionState, FormData>(generateContractAction, {});
  return (
    <form action={action} className="hr-inline">
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="employmentId" value={employmentId} />
      <button type="submit" className="btn btn-ghost hr-btn-small" disabled={pending}>
        {pending ? "Skapar…" : label}
      </button>
      {state.error && <span className="efield-error">{state.error}</span>}
      {state.ok && <span className="efield-hint">Avtalet är skapat och fryst.</span>}
    </form>
  );
}

/** "Markera som signerad" with the day both signed; e-signature comes later. */
export function SignDocumentForm({ documentId, today }: { documentId: string; today: string }) {
  const [state, action, pending] = useActionState<DocumentActionState, FormData>(signDocumentAction, {});
  return (
    <form action={action} className="hr-inline">
      <input type="hidden" name="documentId" value={documentId} />
      <label className="sr-only" htmlFor={`signed-${documentId}`}>
        Signerat
      </label>
      <input id={`signed-${documentId}`} type="date" name="signedOn" defaultValue={today} max={today} className="hr-date" />
      <button type="submit" className="btn btn-ghost hr-btn-small" disabled={pending}>
        {pending ? "Sparar…" : "Markera som signerad"}
      </button>
      {state.error && <span className="efield-error">{state.error}</span>}
    </form>
  );
}
