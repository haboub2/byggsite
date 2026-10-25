"use client";

import { useActionState, useRef, useState } from "react";
import { openCaseAction, sendDemandAction, updateCaseAction } from "@/app/admin/collection-actions";
import type { InvoiceToolState } from "@/app/admin/invoice-actions";
import { recipientsText, type Recipients } from "@/lib/core/invoices/recipients";

/** Amounts formatted on the server: label, optional detail, value. */
export type AmountRow = { label: string; detail?: string; value: string };

function Feedback({ state }: { state: InvoiceToolState }) {
  if (!state.error && !state.message) return null;
  return (
    <span className={`form-feedback ${state.error ? "error" : "success"}`} role="status">
      {state.error ?? state.message}
    </span>
  );
}

function Amounts({ rows, total, totalLabel }: { rows: AmountRow[]; total: string; totalLabel: string }) {
  return (
    <dl className="qsum">
      {rows.map((r) => (
        <div key={r.label}>
          <dt>
            {r.label}
            {r.detail ? <small className="inv-muted" style={{ display: "block", fontSize: 12.5 }}>{r.detail}</small> : null}
          </dt>
          <dd>{r.value}</dd>
        </div>
      ))}
      <div className="qsum-pay">
        <dt>{totalLabel}</dt>
        <dd>{total}</dd>
      </div>
    </dl>
  );
}

/**
 * Inkassokrav: the creditor's own demand under 5 § inkassolagen. A dialog
 * with what it asks for, the last day to pay (at least eight days and four
 * bank days), a preview of the letter, and mail or record.
 */
export function DemandForm({
  id,
  number,
  rows,
  total,
  defaultPayBy,
  minPayBy,
  recipients,
  ready,
}: {
  id: string;
  number: string;
  rows: AmountRow[];
  total: string;
  defaultPayBy: string;
  minPayBy: string;
  recipients: Recipients;
  ready: boolean;
}) {
  const [state, action, pending] = useActionState<InvoiceToolState, FormData>(sendDemandAction, {});
  const dialog = useRef<HTMLDialogElement>(null);
  const [payBy, setPayBy] = useState(defaultPayBy);
  const email = recipientsText(recipients);
  const canMail = ready && recipients.to.length > 0;
  return (
    <div>
      <button type="button" className="btn btn-ghost quote-aside-btn" onClick={() => dialog.current?.showModal()}>
        Skicka inkassokrav…
      </button>
      <dialog ref={dialog} className="inv-dialog" aria-labelledby={`demand-${id}`}>
        <form
          action={action}
          onSubmit={(e) => {
            const mode = (e.currentTarget.querySelector("input[name=mode]:checked") as HTMLInputElement | null)?.value;
            if (!window.confirm(mode === "mail" ? `Mejla inkassokravet till ${email}? Inkassoavgiften och räntan bokförs.` : "Registrera inkassokravet utan att mejla? Inkassoavgiften och räntan bokförs.")) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <h2 id={`demand-${id}`} className="inv-dialog-h">
            Inkassokrav för faktura {number}
          </h2>
          <p className="inv-dialog-text">
            Ett eget inkassokrav enligt inkassolagen, med rubriken Inkassokrav, fordran, ränta och lagstadgad inkassoavgift. Det skickas en gång; efter det får fakturan inga fler påminnelser, och betalar kunden inte kan den lämnas till inkasso.
          </p>
          <Amounts rows={rows} total={total} totalLabel="Att betala" />
          <div className="efield">
            <label htmlFor={`payby-${id}`}>Sista betalningsdag</label>
            <input id={`payby-${id}`} name="payBy" type="date" min={minPayBy} value={payBy} onChange={(e) => setPayBy(e.target.value)} required />
            <span className="efield-hint">Minst {minPayBy}: åtta dagar, och fyra bankdagar från att kravet kommer fram.</span>
          </div>
          <a href={`/admin/fakturor/${id}/inkassokrav?betala=${payBy}`} target="_blank" rel="noopener" className="link-quiet">
            Förhandsgranska inkassokravet (PDF)
          </a>
          <div style={{ display: "grid", gap: 6 }}>
            <label className="etoggle" style={{ marginTop: 0 }}>
              <input type="radio" name="mode" value="mail" defaultChecked={canMail} disabled={!canMail} />
              <span>Mejla kravet med PDF{email ? ` till ${email}` : ""}</span>
            </label>
            <label className="etoggle" style={{ marginTop: 0 }}>
              <input type="radio" name="mode" value="record" defaultChecked={!canMail} />
              <span>Registrera bara (skickat med post eller på annat sätt)</span>
            </label>
          </div>
          <Feedback state={state} />
          <div className="inv-dialog-actions">
            <button type="submit" className="btn btn-primary" disabled={pending || Boolean(state.ok)}>
              {pending ? "Skickar…" : "Skicka inkassokrav"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => dialog.current?.close()} disabled={pending}>
              {state.ok ? "Stäng" : "Avbryt"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

/** Lämna till inkasso: the claim as of today, the agency (optional now) and a note; creates the case. */
export function OpenCaseForm({ id, number, rows, total, asOf, blocked }: { id: string; number: string; rows: AmountRow[]; total: string; asOf: string; blocked: string | null }) {
  const [state, action, pending] = useActionState<InvoiceToolState, FormData>(openCaseAction, {});
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <div>
      <button type="button" className="btn btn-ghost quote-aside-btn" onClick={() => dialog.current?.showModal()} disabled={Boolean(blocked)} title={blocked ?? undefined}>
        Lämna till inkasso…
      </button>
      {blocked && <span className="efield-hint">{blocked}</span>}
      <dialog ref={dialog} className="inv-dialog" aria-labelledby={`case-${id}`}>
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <h2 id={`case-${id}`} className="inv-dialog-h">
            Lämna faktura {number} till inkasso
          </h2>
          <p className="inv-dialog-text">
            Fakturan markeras Hos inkasso och får inga fler påminnelser. Du får ett underlag att ladda ner: fakturan, påminnelserna och inkassokravet som PDF, en sammanställning och en CSV-rad som går att ladda upp hos inkassobolaget. Betalningar registreras som vanligt; när fakturan är betald stängs ärendet.
          </p>
          <Amounts rows={rows} total={total} totalLabel={`Fordran ${asOf}`} />
          <div className="efield">
            <label htmlFor={`agency-${id}`}>Inkassobolag (valfritt nu)</label>
            <input id={`agency-${id}`} name="agency" maxLength={120} placeholder="Fylls i när du har lämnat ärendet" />
          </div>
          <div className="efield">
            <label htmlFor={`note-${id}`}>Anteckning (valfritt)</label>
            <textarea id={`note-${id}`} name="note" rows={2} maxLength={1000} placeholder="Till exempel: kunden har inte svarat på samtal." />
          </div>
          <Feedback state={state} />
          <div className="inv-dialog-actions">
            <button type="submit" className="btn btn-primary" disabled={pending || Boolean(state.ok)}>
              {pending ? "Skapar…" : "Skapa ärende och underlag"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => dialog.current?.close()} disabled={pending}>
              {state.ok ? "Stäng" : "Avbryt"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

/** An open case: download the package, mark it sent to the agency (or change agency and case number), or close it. */
export function CaseControls({ caseId, reference, status, agency, externalRef }: { caseId: string; reference: string; status: string; agency: string; externalRef: string }) {
  const [sent, sendAction, sending] = useActionState<InvoiceToolState, FormData>(updateCaseAction, {});
  const [closed, closeAction, closing] = useActionState<InvoiceToolState, FormData>(updateCaseAction, {});
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <a href={`/admin/fakturor/inkasso/${caseId}/underlag`} className="btn btn-primary quote-aside-btn">
        Ladda ner underlaget (zip)
      </a>
      <form action={sendAction} className="lead-note">
        <input type="hidden" name="case" value={caseId} />
        <input type="hidden" name="action" value="sent" />
        <label htmlFor={`agency-${caseId}`}>Inkassobolag</label>
        <input id={`agency-${caseId}`} name="agency" defaultValue={agency} maxLength={120} required placeholder="Bolagets namn" />
        <label htmlFor={`ext-${caseId}`}>Deras ärendenummer (valfritt)</label>
        <input id={`ext-${caseId}`} name="externalRef" defaultValue={externalRef} maxLength={80} />
        <div className="lead-note-foot">
          <button type="submit" className="btn btn-dark" disabled={sending}>
            {sending ? "Sparar…" : status === "sent" ? "Spara" : "Markera skickat till bolaget"}
          </button>
        </div>
        <Feedback state={sent} />
      </form>
      <button type="button" className="link-quiet" style={{ justifySelf: "start" }} onClick={() => dialog.current?.showModal()}>
        Avsluta ärendet utan betalning…
      </button>
      <dialog ref={dialog} className="inv-dialog" aria-labelledby={`close-${caseId}`}>
        <form action={closeAction}>
          <input type="hidden" name="case" value={caseId} />
          <input type="hidden" name="action" value="closed" />
          <h2 id={`close-${caseId}`} className="inv-dialog-h">
            Avsluta ärende {reference}?
          </h2>
          <p className="inv-dialog-text">
            Till exempel om ärendet återkallas från inkassobolaget eller fordran skrivs av. Fakturan är då inte längre hos inkasso. Betalas den ska du inte avsluta här: registrera betalningen, så stängs ärendet av sig självt.
          </p>
          <div className="efield">
            <label htmlFor={`why-${caseId}`}>Varför avslutas det?</label>
            <textarea id={`why-${caseId}`} name="note" rows={3} maxLength={1000} required placeholder="Till exempel: återkallat, kunden har bestridit fakturan." />
          </div>
          <Feedback state={closed} />
          <div className="inv-dialog-actions">
            <button type="submit" className="btn btn-danger" disabled={closing || Boolean(closed.ok)}>
              {closing ? "Avslutar…" : "Avsluta ärendet"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => dialog.current?.close()} disabled={closing}>
              {closed.ok ? "Stäng" : "Avbryt"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
