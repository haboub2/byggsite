"use client";

import { useActionState } from "react";
import { setLeadNote, setLeadStatus, type LeadActionState } from "@/app/admin/actions";

const STATUS_OPTIONS = [
  { value: "new", label: "Ny" },
  { value: "contacted", label: "Kontaktad" },
  { value: "won", label: "Vunnen" },
  { value: "lost", label: "Förlorad" },
] as const;

export function StatusControl({ id, status }: { id: string; status: string }) {
  const [state, action, pending] = useActionState<LeadActionState, FormData>(setLeadStatus, {});
  return (
    <form action={action} className="lead-status">
      <input type="hidden" name="id" value={id} />
      <div className="calc-seg" role="group" aria-label="Status">
        {STATUS_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="submit"
            name="status"
            value={o.value}
            aria-pressed={status === o.value}
            data-status={o.value}
            disabled={pending}
          >
            {o.label}
          </button>
        ))}
      </div>
      {state.error && (
        <p className="form-feedback error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function NoteForm({ id, note }: { id: string; note: string | null }) {
  const [state, action, pending] = useActionState<LeadActionState, FormData>(setLeadNote, {});
  return (
    <form action={action} className="lead-note">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={`note-${id}`}>Anteckning</label>
      <textarea
        id={`note-${id}`}
        name="note"
        rows={4}
        defaultValue={note ?? ""}
        placeholder="Ringde 26/9, hembesök bokat torsdag 10:00."
        maxLength={4000}
      />
      <div className="lead-note-foot">
        <button type="submit" className="btn btn-dark" disabled={pending}>
          {pending ? "Sparar…" : "Spara anteckning"}
        </button>
        <span className={`form-feedback ${state.error ? "error" : state.ok ? "success" : ""}`} role="status">
          {state.error ?? (state.ok && !pending ? "Sparat" : "")}
        </span>
      </div>
    </form>
  );
}
