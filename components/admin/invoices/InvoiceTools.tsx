"use client";

import { useActionState } from "react";
import { sendReminderAction } from "@/app/admin/reminder-actions";
import {
  creditInvoiceAction,
  deleteInvoiceDraft,
  issueInvoiceAction,
  markInvoiceSent,
  registerPaymentAction,
  sendInvoice,
  type InvoiceToolState,
} from "@/app/admin/invoice-actions";

/** Utfärda: the gate. Disabled while the saved draft has problems; lists them. */
export function IssueInvoiceForm({ id, problems, isCredit }: { id: string; problems: string[]; isCredit: boolean }) {
  const [state, action, pending] = useActionState<InvoiceToolState, FormData>(issueInvoiceAction, {});
  const blocked = problems.length > 0;
  const shown = state.problems ?? problems;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Utfärda ${isCredit ? "kreditfakturan" : "fakturan"}? Den får sitt nummer och låses. Fel rättas sedan bara med kreditfaktura.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn btn-primary quote-aside-btn" disabled={pending || blocked}>
        {pending ? "Utfärdar…" : isCredit ? "Utfärda kreditfakturan" : "Utfärda fakturan"}
      </button>
      {shown.length > 0 && (
        <ul className="inv-problems" aria-label="Det här saknas">
          {shown.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {!blocked && shown.length === 0 && <span className="efield-hint">Allt momslagen kräver finns. Spara eventuella ändringar först; det är den sparade versionen som utfärdas.</span>}
      {(state.error || state.message) && (
        <span className={`form-feedback ${state.error ? "error" : "success"}`} role="status">
          {state.error ?? state.message}
        </span>
      )}
    </form>
  );
}

export function SendInvoiceForm({ id, email, ready }: { id: string; email: string; ready: boolean }) {
  const [state, action, pending] = useActionState<InvoiceToolState, FormData>(sendInvoice, {});
  return (
    <form
      action={action}
      className="lead-note"
      onSubmit={(e) => {
        if (!window.confirm(`Mejla fakturan med PDF till ${email}?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      {!ready && (
        <p className="efield-hint">
          Mejl från sajten är inte påslaget (Resend och en verifierad avsändaradress, se docs/setup-forms.md). Ladda ner PDF:en, mejla den själv och markera som skickad nedan.
        </p>
      )}
      {ready && !email && <p className="efield-hint">Kunden saknar e-postadress.</p>}
      <label htmlFor={`msg-${id}`}>Meddelande (valfritt)</label>
      <textarea id={`msg-${id}`} name="message" rows={3} placeholder="Lämnas tomt för ett standardmeddelande med belopp, förfallodatum och OCR." maxLength={4000} disabled={!ready || !email} />
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
    </form>
  );
}

export function MarkSentForm({ id }: { id: string }) {
  return (
    <form action={markInvoiceSent} className="chips-add" style={{ flexWrap: "wrap" }}>
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`to-${id}`}>
        Skickad hur
      </label>
      <input id={`to-${id}`} name="to" placeholder="Markera som skickad: hur (post, mejl…)" maxLength={80} />
      <button type="submit" className="btn btn-ghost">
        Markera skickad
      </button>
    </form>
  );
}

const METHOD_LABEL: Record<string, string> = { bankgiro: "Bankgiro", swish: "Swish", card: "Kort", manual: "Annat" };

export function RegisterPaymentForm({ id, remainingKronor, today }: { id: string; remainingKronor: string; today: string }) {
  const [state, action, pending] = useActionState<InvoiceToolState, FormData>(registerPaymentAction, {});
  return (
    <form action={action} className="lead-note">
      <input type="hidden" name="id" value={id} />
      <div className="egrid">
        <div className="efield">
          <label htmlFor={`amt-${id}`}>Belopp, kr</label>
          <input id={`amt-${id}`} name="amount" inputMode="decimal" defaultValue={remainingKronor} required />
        </div>
        <div className="efield">
          <label htmlFor={`date-${id}`}>Betaldatum</label>
          <input id={`date-${id}`} name="paidOn" type="date" defaultValue={today} required />
        </div>
        <div className="efield">
          <label htmlFor={`method-${id}`}>Sätt</label>
          <select id={`method-${id}`} name="method" defaultValue="bankgiro">
            {Object.entries(METHOD_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="efield">
          <label htmlFor={`ref-${id}`}>Referens (valfritt)</label>
          <input id={`ref-${id}`} name="reference" placeholder="OCR, Swish-ref…" maxLength={80} />
        </div>
      </div>
      <div className="lead-note-foot">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Registrerar…" : "Registrera betalning"}
        </button>
      </div>
      {(state.error || state.message) && (
        <span className={`form-feedback ${state.error ? "error" : "success"}`} role="status">
          {state.error ?? state.message}
        </span>
      )}
    </form>
  );
}

/** Påminn: mails the reminder with the PDF, or just records one sent some other way. */
export function SendReminderForm({ id, email, ready, summary }: { id: string; email: string; ready: boolean; summary: string }) {
  const [state, action, pending] = useActionState<InvoiceToolState, FormData>(sendReminderAction, {});
  return (
    <form
      action={action}
      className="lead-note"
      onSubmit={(e) => {
        const mode = (e.currentTarget.querySelector("input[name=mode]:checked") as HTMLInputElement | null)?.value;
        if (!window.confirm(mode === "mail" ? `Mejla påminnelsen till ${email}? Avgift och ränta bokförs.` : "Registrera påminnelsen utan att mejla? Avgift och ränta bokförs.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <p className="efield-hint">{summary}</p>
      <div style={{ display: "grid", gap: 6, margin: "8px 0" }}>
        <label className="etoggle" style={{ marginTop: 0 }}>
          <input type="radio" name="mode" value="mail" defaultChecked={ready && Boolean(email)} disabled={!ready || !email} />
          <span>Mejla påminnelsen med PDF{email ? ` till ${email}` : ""}</span>
        </label>
        <label className="etoggle" style={{ marginTop: 0 }}>
          <input type="radio" name="mode" value="record" defaultChecked={!ready || !email} />
          <span>Registrera bara (skickad på annat sätt)</span>
        </label>
      </div>
      <div className="lead-note-foot">
        <button type="submit" className="btn btn-dark" disabled={pending}>
          {pending ? "Skickar…" : "Påminn"}
        </button>
      </div>
      {(state.error || state.message) && (
        <span className={`form-feedback ${state.error ? "error" : "success"}`} role="status">
          {state.error ?? state.message}
        </span>
      )}
    </form>
  );
}

export function CreditInvoiceButton({ id, number }: { id: string; number: string }) {
  return (
    <form
      action={creditInvoiceAction}
      onSubmit={(e) => {
        if (!window.confirm(`Skapa en kreditfaktura som speglar faktura ${number}? Den blir ett utkast du kan ändra innan du utfärdar den.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn btn-ghost quote-aside-btn">
        Kreditera…
      </button>
    </form>
  );
}

export function DeleteDraft({ id }: { id: string }) {
  return (
    <form
      action={deleteInvoiceDraft}
      onSubmit={(e) => {
        if (!window.confirm("Ta bort utkastet? Det går inte att ångra.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="link-quiet" style={{ color: "var(--danger)" }}>
        Ta bort utkastet
      </button>
    </form>
  );
}
