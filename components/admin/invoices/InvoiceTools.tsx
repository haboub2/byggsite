"use client";

import { useActionState, useRef, useState } from "react";
import { sendReminderAction } from "@/app/admin/reminder-actions";
import {
  correctAmountsAction,
  creditInvoiceAction,
  voidInvoiceAction,
  deleteInvoiceDraft,
  issueInvoiceAction,
  markInvoiceSent,
  registerPaymentAction,
  sendInvoice,
  type InvoiceToolState,
} from "@/app/admin/invoice-actions";

/** What the review step shows next to the PDF, formatted on the server from the saved draft. */
export type IssueSummary = {
  buyer: string;
  /** "Att betala" or, on a credit note, "Att återfå". */
  payableLabel: string;
  payable: string;
  dueDate: string | null;
  rot: string | null;
  reverseCharge: boolean;
  lines: number;
};

function Feedback({ state }: { state: InvoiceToolState }) {
  if (!state.error && !state.message) return null;
  return (
    <span className={`form-feedback ${state.error ? "error" : "success"}`} role="status">
      {state.error ?? state.message}
    </span>
  );
}

/**
 * Utfärda: the gate. Disabled while the saved draft has problems; otherwise
 * opens the review step (the PDF as it will look, and what it says) where
 * "Utfärda nu" issues it.
 */
export function IssueInvoiceForm({ id, problems, isCredit, summary }: { id: string; problems: string[]; isCredit: boolean; summary: IssueSummary }) {
  const [state, action, pending] = useActionState<InvoiceToolState, FormData>(issueInvoiceAction, {});
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState(0);
  const blocked = problems.length > 0;
  const shown = state.problems ?? problems;
  const what = isCredit ? "kreditfakturan" : "fakturan";
  return (
    <div>
      <button
        type="button"
        className="btn btn-primary quote-aside-btn"
        disabled={blocked}
        onClick={() => {
          setPreview((n) => n + 1);
          dialog.current?.showModal();
        }}
      >
        {isCredit ? "Utfärda kreditfakturan…" : "Utfärda fakturan…"}
      </button>
      {shown.length > 0 && (
        <ul className="inv-problems" aria-label="Det här saknas">
          {shown.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {!blocked && shown.length === 0 && <span className="efield-hint">Allt momslagen kräver finns. Spara eventuella ändringar först; det är den sparade versionen som utfärdas.</span>}

      <dialog ref={dialog} className="inv-dialog inv-dialog--wide" aria-labelledby={`review-${id}`}>
        <div className="inv-review">
          <div className="inv-review-pdf">{preview > 0 && <iframe key={preview} src={`/admin/fakturor/${id}/pdf#navpanes=0&view=FitH`} title="Förhandsvisning av PDF:en" />}</div>
          <form action={action} className="inv-review-side">
            <input type="hidden" name="id" value={id} />
            <h2 id={`review-${id}`} className="inv-dialog-h">Granska {what}</h2>
            <dl className="inv-review-facts">
              <div>
                <dt>Kund</dt>
                <dd>{summary.buyer || "Saknas"}</dd>
              </div>
              <div>
                <dt>{summary.payableLabel}</dt>
                <dd>
                  <strong>{summary.payable}</strong>
                </dd>
              </div>
              {summary.dueDate && (
                <div>
                  <dt>Förfallodag</dt>
                  <dd>{summary.dueDate}</dd>
                </div>
              )}
              <div>
                <dt>ROT-avdrag</dt>
                <dd>{summary.rot ?? "Nej"}</dd>
              </div>
              <div>
                <dt>Omvänd moms</dt>
                <dd>{summary.reverseCharge ? "Ja, köparen redovisar momsen" : "Nej"}</dd>
              </div>
              <div>
                <dt>Rader</dt>
                <dd>{summary.lines}</dd>
              </div>
            </dl>
            <p className="inv-dialog-text">
              När du utfärdar låses {what} och får nästa nummer i serien. Den kan sedan aldrig ändras: fel uppgifter rättas med en ändringsfaktura och fel belopp med en kreditfaktura.
            </p>
            <p className="efield-hint">Det är den sparade versionen som utfärdas. Har du ändrat något i redigeraren, stäng och spara först.</p>
            {state.problems && state.problems.length > 0 && (
              <ul className="inv-problems">
                {state.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <Feedback state={state} />
            <div className="inv-dialog-actions">
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? "Utfärdar…" : "Utfärda nu"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => dialog.current?.close()} disabled={pending}>
                Tillbaka
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  );
}

/** Makulera: only an issued invoice that never reached the customer. Reason required; the ledger is reversed. */
export function VoidInvoiceForm({ id, number }: { id: string; number: string }) {
  const [state, action, pending] = useActionState<InvoiceToolState, FormData>(voidInvoiceAction, {});
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <div>
      <button type="button" className="btn btn-ghost quote-aside-btn" onClick={() => dialog.current?.showModal()}>
        Makulera…
      </button>
      <dialog ref={dialog} className="inv-dialog" aria-labelledby={`void-${id}`}>
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <h2 id={`void-${id}`} className="inv-dialog-h">
            Makulera faktura {number}?
          </h2>
          <p className="inv-dialog-text">
            Fakturan har inte skickats till kunden. Den blir ogiltig men finns kvar med sitt nummer, så nummerserien förblir obruten. Bokföringen vänds med en rättelsepost daterad i dag, och PDF:en stämplas MAKULERAD.
          </p>
          <div className="efield">
            <label htmlFor={`reason-${id}`}>Varför makuleras den?</label>
            <textarea id={`reason-${id}`} name="reason" rows={3} maxLength={500} required placeholder="Till exempel: fel kund, fakturerad två gånger." />
          </div>
          <Feedback state={state} />
          <div className="inv-dialog-actions">
            <button type="submit" className="btn btn-danger" disabled={pending}>
              {pending ? "Makulerar…" : `Makulera faktura ${number}`}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => dialog.current?.close()} disabled={pending}>
              Avbryt
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

/** Rätta belopp: credit in full, issued at once, and a new draft with the same content. */
export function CorrectAmountsForm({ id, number, amount, blocked }: { id: string; number: string; amount: string; blocked: string | null }) {
  const [state, action, pending] = useActionState<InvoiceToolState, FormData>(correctAmountsAction, {});
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <div>
      <button type="button" className="btn btn-ghost quote-aside-btn" onClick={() => dialog.current?.showModal()} disabled={Boolean(blocked)} title={blocked ?? undefined}>
        Rätta belopp…
      </button>
      {blocked && <span className="efield-hint">{blocked}</span>}
      <dialog ref={dialog} className="inv-dialog" aria-labelledby={`amounts-${id}`}>
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <h2 id={`amounts-${id}`} className="inv-dialog-h">
            Rätta beloppen på faktura {number}
          </h2>
          <p className="inv-dialog-text">En utfärdad faktura ändras aldrig. Så här går det till:</p>
          <ol className="inv-dialog-steps">
            <li>
              En <strong>kreditfaktura för hela beloppet</strong>, {amount}, skapas och utfärdas direkt med nästa nummer i serien. Den bokförs, och faktura {number} markeras som krediterad.
            </li>
            <li>
              Ett <strong>nytt utkast</strong> skapas med samma kund, rader, referenser och villkor, och texten &quot;Ersätter faktura {number}, krediterad med …&quot;.
            </li>
            <li>Utkastet öppnas i redigeraren. Rätta beloppen där och utfärda det; det får då ett eget nummer.</li>
          </ol>
          <p className="efield-hint">Skicka både kreditfakturan och den nya fakturan till kunden.</p>
          {state.problems && state.problems.length > 0 && (
            <ul className="inv-problems">
              {state.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <Feedback state={state} />
          <div className="inv-dialog-actions">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Krediterar…" : "Kreditera och skapa nytt utkast"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => dialog.current?.close()} disabled={pending}>
              Avbryt
            </button>
          </div>
        </form>
      </dialog>
    </div>
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
