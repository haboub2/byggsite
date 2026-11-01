"use client";

import { useActionState } from "react";
import {
  changeQuoteStatus,
  deleteQuote,
  saveQuoteAsTemplate,
  sendQuote,
  type QuoteToolState,
} from "@/app/admin/quote-actions";
import { QUOTE_STATUSES, QUOTE_STATUS_LABEL, WITHDRAWAL_DAYS, type QuoteAcceptance } from "@/lib/quotes/schema";

/**
 * Status: Utkast withdraws a sent quote (and clears the sent version),
 * Skickad records a hand-over outside the mail button, Accepterad records
 * the acceptance of exactly the sent version, Avböjd closes it. An accepted
 * quote is final: the buttons go away and the record is shown instead.
 */
export function QuoteStatusControl({ id, status, consumer, acceptance }: { id: string; status: string; consumer: boolean; acceptance: QuoteAcceptance | null }) {
  if (status === "accepted" && acceptance) {
    return (
      <div className="efield-hint">
        Accepterad {acceptance.at.slice(0, 10)}, registrerad av {acceptance.by}.
        {consumer ? (acceptance.earlyStart ? ` Kunden begärde att arbetet påbörjas under ångerfristen (${WITHDRAWAL_DAYS} dagar).` : ` Arbetet påbörjas tidigast när ångerfristen (${WITHDRAWAL_DAYS} dagar från accepten) har gått ut, om kunden inte uttryckligen begär annat.`) : ""}
        {" "}Offerten är låst; ändringar görs i en ny offert (Duplicera).
      </div>
    );
  }
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
      {consumer && status === "sent" ? (
        <label className="etoggle" style={{ marginTop: 8 }}>
          <input type="checkbox" name="earlyStart" />
          <span>Kunden har uttryckligen begärt att arbetet påbörjas under ångerfristen ({WITHDRAWAL_DAYS} dagar) och vet att utfört arbete då betalas vid ett ånger (kryssas innan Accepterad)</span>
        </label>
      ) : null}
      <span className="efield-hint">
        {status === "draft" ? "Skickad låser offerten som den version kunden fått. Ändringar därefter: Utkast (återkallar) eller Duplicera." : status === "sent" ? "Accepterad registrerar att kunden godkänt just den skickade versionen; Utkast återkallar offerten." : "Utkast öppnar offerten igen."}
      </span>
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
