"use client";

import { useActionState } from "react";
import {
  changeQuoteStatus,
  deleteQuote,
  saveQuoteAsTemplate,
  sendQuote,
  type QuoteToolState,
} from "@/app/admin/quote-actions";
import { QUOTE_STATUSES, QUOTE_STATUS_LABEL } from "@/lib/quotes/schema";

export function QuoteStatusControl({ id, status }: { id: string; status: string }) {
  return (
    <form action={changeQuoteStatus}>
      <input type="hidden" name="id" value={id} />
      <div className="calc-seg" role="group" aria-label="Status">
        {QUOTE_STATUSES.map((s) => (
          <button key={s} type="submit" name="status" value={s} aria-pressed={status === s} data-status={s}>
            {QUOTE_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
    </form>
  );
}

export function SendQuoteForm({ id, email, ready }: { id: string; email: string; ready: boolean }) {
  const [state, action, pending] = useActionState<QuoteToolState, FormData>(sendQuote, {});
  return (
    <form
      action={action}
      className="lead-note"
      onSubmit={(e) => {
        if (!window.confirm(`Mejla offerten med PDF till ${email}?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      {!ready && (
        <p className="efield-hint">
          Mejl från sajten är inte påslaget än (Resend och en verifierad avsändaradress, se docs/setup-forms.md). Ladda
          ner PDF:en och bifoga den i ett vanligt mejl så länge.
        </p>
      )}
      {ready && !email && <p className="efield-hint">Fyll i kundens e-postadress i offerten först och spara.</p>}
      <label htmlFor={`msg-${id}`}>Meddelande (valfritt)</label>
      <textarea
        id={`msg-${id}`}
        name="message"
        rows={4}
        placeholder="Lämnas tomt för ett standardmeddelande med hälsning, summa och giltighetstid."
        maxLength={4000}
        disabled={!ready || !email}
      />
      <div className="lead-note-foot">
        <button type="submit" className="btn btn-dark" disabled={pending || !ready || !email}>
          {pending ? "Skickar…" : `Skicka till ${email || "kunden"}`}
        </button>
      </div>
      {(state.error || state.message) && (
        <span className={`form-feedback ${state.error ? "error" : "success"}`} role="status">
          {state.error ?? state.message}
        </span>
      )}
      <span className="efield-hint">Spara offerten först: det som mejlas är den senast sparade versionen.</span>
    </form>
  );
}

export function SaveTemplateForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<QuoteToolState, FormData>(saveQuoteAsTemplate, {});
  return (
    <form action={action} className="chips-add" style={{ flexWrap: "wrap" }}>
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`tpl-${id}`}>
        Mallens namn
      </label>
      <input id={`tpl-${id}`} name="name" placeholder="Spara som mall: namn" maxLength={60} required />
      <button type="submit" className="btn btn-ghost" disabled={pending}>
        {pending ? "Sparar…" : "Spara som mall"}
      </button>
      {(state.error || state.message) && (
        <span className={`form-feedback ${state.error ? "error" : "success"}`} role="status" style={{ flexBasis: "100%" }}>
          {state.error ?? state.message}
        </span>
      )}
    </form>
  );
}

export function DeleteQuote({ id, number }: { id: string; number: number }) {
  return (
    <form
      action={deleteQuote}
      onSubmit={(e) => {
        if (!window.confirm(`Ta bort offert ${number} för gott? Det går inte att ångra.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="link-quiet" style={{ color: "var(--danger)" }}>
        Ta bort offerten
      </button>
    </form>
  );
}
