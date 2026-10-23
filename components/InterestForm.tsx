"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HONEYPOT } from "@/lib/schema";
import { TOOLS, TOOL_LABEL, VOLUMES, VOLUME_LABEL } from "@/lib/interest-schema";
import { submitInterest, type InterestState } from "@/app/(site)/fakturering/actions";

const INITIAL: InterestState = { status: "idle", attempt: 0 };

/** Interest registration for the invoicing product (/fakturering). */
export default function InterestForm({ product, email }: { product: string; email: string }) {
  const [state, action, pending] = useActionState(submitInterest, INITIAL);
  const v = state.values ?? {};
  const [tool, setTool] = useState(v.currentTool ?? "");
  const thanks = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === "done") thanks.current?.focus();
  }, [state.status]);

  if (state.status === "done") {
    return (
      <div className="interest-thanks" ref={thanks} tabIndex={-1} role="status">
        <span className="eyebrow eyebrow--accent">Tack</span>
        <h3>Vi har fått din anmälan.</h3>
        <p>
          Vi hör av oss när {product} är redo för fler företag, och gärna innan dess för att höra hur ni fakturerar i dag. Du
          förbinder dig inte till något.
        </p>
      </div>
    );
  }

  return (
    // The key remounts the form after a failed attempt, so the fields get back what was typed.
    <form key={state.attempt} className="form" action={action} noValidate>
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="if-website">Lämna tomt</label>
        <input id="if-website" name={HONEYPOT} type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <SourceFields />

      <div className="form-row">
        <div className="field">
          <label htmlFor="if-company">Företag *</label>
          <input id="if-company" name="company" type="text" autoComplete="organization" required defaultValue={v.company} />
        </div>
        <div className="field">
          <label htmlFor="if-name">Namn *</label>
          <input id="if-name" name="name" type="text" autoComplete="name" required defaultValue={v.name} />
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label htmlFor="if-email">E-post *</label>
          <input id="if-email" name="email" type="email" autoComplete="email" required defaultValue={v.email} />
        </div>
        <div className="field">
          <label htmlFor="if-phone">Telefon</label>
          <input id="if-phone" name="phone" type="tel" autoComplete="tel" defaultValue={v.phone} />
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label htmlFor="if-volume">Fakturor per månad, ungefär *</label>
          <select id="if-volume" name="volume" required defaultValue={v.volume ?? ""}>
            <option value="">Välj…</option>
            {VOLUMES.map((x) => (
              <option key={x} value={x}>
                {VOLUME_LABEL[x]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="if-tool">Fakturerar i dag med *</label>
          <select id="if-tool" name="currentTool" required value={tool} onChange={(e) => setTool(e.target.value)}>
            <option value="">Välj…</option>
            {TOOLS.map((x) => (
              <option key={x} value={x}>
                {TOOL_LABEL[x]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {tool === "annat" && (
        <div className="field">
          <label htmlFor="if-tool-other">Vilket program?</label>
          <input id="if-tool-other" name="currentToolOther" type="text" defaultValue={v.currentToolOther} />
        </div>
      )}

      <div className="field">
        <label htmlFor="if-priority">Vad är viktigast för dig?</label>
        <textarea
          id="if-priority"
          name="priority"
          rows={4}
          placeholder="Till exempel delfakturor, ROT, att slippa skriva samma sak två gånger …"
          defaultValue={v.priority}
        />
      </div>

      <label className="checkbox">
        <input type="checkbox" name="consent" required defaultChecked={v.consent === "on"} />
        <span>
          Ni får kontakta mig om {product}. Jag har läst <Link href="/integritetspolicy">integritetspolicyn</Link>. *
        </span>
      </label>

      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Skickar…" : "Anmäl intresse"}
      </button>
      <p className={`form-feedback ${state.status === "error" ? "error" : ""}`} role="status" aria-live="polite">
        {state.status === "error" ? (
          <>
            {state.message}
            {state.offerMail && (
              <>
                {" "}
                <a href={`mailto:${email}`}>{email}</a>
              </>
            )}
          </>
        ) : null}
      </p>
    </form>
  );
}

/** Attribution: the page, referrer and UTM tags the visitor arrived with. */
function SourceFields() {
  const [src, setSrc] = useState<Record<string, string>>({});
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    // Read once on mount; the values only exist in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSrc({
      src_page: window.location.pathname,
      src_referrer: document.referrer,
      src_utm_source: p.get("utm_source") ?? "",
      src_utm_medium: p.get("utm_medium") ?? "",
      src_utm_campaign: p.get("utm_campaign") ?? "",
    });
  }, []);
  return (
    <>
      {Object.entries(src).map(([k, val]) => (
        <input key={k} type="hidden" name={k} value={val} />
      ))}
    </>
  );
}
