"use client";

import { useState, type FormEvent } from "react";

type Variant = "offert" | "kontakt" | "brief";

const CONFIG: Record<
  Variant,
  { endpoint: string; submit: string; success: string }
> = {
  offert: {
    endpoint: "/api/offert",
    submit: "Skicka offertförfrågan",
    success:
      "Tack! Vi har tagit emot din förfrågan och återkommer med en offert inom 24 timmar.",
  },
  kontakt: {
    endpoint: "/api/contact",
    submit: "Skicka meddelande",
    success: "Tack för ditt meddelande — vi hör av oss inom kort.",
  },
  brief: {
    endpoint: "/api/brief",
    submit: "Skicka brief",
    success: "Tack! Vi läser igenom och återkommer inom två arbetsdagar.",
  },
};

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LeadForm({
  variant,
  defaultService = "",
}: {
  variant: Variant;
  defaultService?: string;
}) {
  const cfg = CONFIG[variant];
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; kind: "" | "success" | "error" }>({
    msg: "",
    kind: "",
  });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;

    if (!data.name?.trim() || !emailRe.test(data.email ?? "") || !data.message?.trim()) {
      setFeedback({ msg: "Fyll i namn, en giltig e-post och ett meddelande.", kind: "error" });
      return;
    }

    setBusy(true);
    setFeedback({ msg: "", kind: "" });
    try {
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, division: variant === "brief" ? "01" : "bygg" }),
      });
      if (!res.ok) throw new Error();
      form.reset();
      setFeedback({ msg: cfg.success, kind: "success" });
    } catch {
      setFeedback({
        msg: "Formuläret är inte kopplat än. Ring 079-304 97 37 eller mejla info@byggly.se så länge.",
        kind: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      {variant === "brief" && (
        <div className="form-row">
          <div className="field">
            <label htmlFor="lf-company">Företag</label>
            <input id="lf-company" name="company" type="text" autoComplete="organization" />
          </div>
          <div className="field">
            <label htmlFor="lf-tooling">Nuvarande verktyg</label>
            <input id="lf-tooling" name="tooling" type="text" placeholder="Excel, Fortnox, …" />
          </div>
        </div>
      )}

      <div className="form-row">
        <div className="field">
          <label htmlFor="lf-name">Namn *</label>
          <input id="lf-name" name="name" type="text" autoComplete="name" required />
        </div>
        <div className="field">
          <label htmlFor="lf-phone">Telefon{variant === "kontakt" ? "" : " *"}</label>
          <input
            id="lf-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required={variant !== "kontakt"}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label htmlFor="lf-email">E-post *</label>
          <input id="lf-email" name="email" type="email" autoComplete="email" required />
        </div>
        {variant === "offert" && (
          <div className="field">
            <label htmlFor="lf-service">Typ av projekt *</label>
            <select id="lf-service" name="service" defaultValue={defaultService} required>
              <option value="">Välj en tjänst…</option>
              <option>Totalrenovering</option>
              <option>Kök</option>
              <option>Badrum</option>
              <option>Tillbyggnad</option>
              <option>Takarbeten</option>
              <option>Golvläggning</option>
              <option>Måleri</option>
              <option>El / VVS</option>
              <option>Annat</option>
            </select>
          </div>
        )}
        {variant === "brief" && (
          <div className="field">
            <label htmlFor="lf-type">Typ av projekt *</label>
            <select id="lf-type" name="service" required>
              <option value="">Välj…</option>
              <option>Webb &amp; portal</option>
              <option>Automation / integration</option>
              <option>Internt system</option>
              <option>Annat</option>
            </select>
          </div>
        )}
      </div>

      {(variant === "offert" || variant === "brief") && (
        <div className="form-row">
          <div className="field">
            <label htmlFor="lf-budget">Uppskattad budget</label>
            <select id="lf-budget" name="budget">
              <option value="">Vet inte än</option>
              <option>Under 100 000 kr</option>
              <option>100 000 – 300 000 kr</option>
              <option>300 000 – 600 000 kr</option>
              <option>600 000 kr+</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="lf-timeline">Önskad start</label>
            <select id="lf-timeline" name="timeline">
              <option value="">Flexibel</option>
              <option>Så snart som möjligt</option>
              <option>Inom 1–3 månader</option>
              <option>3–6 månader</option>
              <option>Planerar bara</option>
            </select>
          </div>
        </div>
      )}

      {variant === "kontakt" && (
        <div className="field">
          <label htmlFor="lf-subject">Ämne</label>
          <input id="lf-subject" name="subject" type="text" />
        </div>
      )}

      <div className="field">
        <label htmlFor="lf-message">
          {variant === "kontakt" ? "Meddelande *" : "Projektbeskrivning *"}
        </label>
        <textarea id="lf-message" name="message" rows={4} required />
      </div>

      <label className="checkbox">
        <input type="checkbox" name="consent" required />
        <span>Jag godkänner att bli kontaktad angående min förfrågan. *</span>
      </label>

      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? "Skickar…" : cfg.submit}
      </button>
      <p className={`form-feedback ${feedback.kind}`} role="status" aria-live="polite">
        {feedback.msg}
      </p>
    </form>
  );
}
