"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export const CONSENT_KEY = "byggly-cookie-consent";
export const CONSENT_EVENT = "byggly-consent-change";

type Consent = "granted" | "denied";

export default function CookieConsent() {
  const [choice, setChoice] = useState<Consent | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(CONSENT_KEY);
    } catch {
      // localStorage unavailable (private mode, blocked) — treat as no choice yet
    }
    // One-time read of a client-only store on mount, not a derived-state loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoice(stored === "granted" || stored === "denied" ? stored : null);
    setReady(true);
  }, []);

  function choose(value: Consent) {
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // ignore — Analytics will just stay off if it can't read the choice back
    }
    setChoice(value);
    window.dispatchEvent(new Event(CONSENT_EVENT));
  }

  if (!ready || choice !== null) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookies" aria-live="polite">
      <p>
        Vi använder endast nödvändiga cookies som standard. Godkänner du även analys-cookies
        som hjälper oss förbättra sajten? Läs mer i vår{" "}
        <Link href="/integritetspolicy">integritetspolicy</Link>.
      </p>
      <div className="cookie-banner-actions">
        <button type="button" className="btn btn-ghost" onClick={() => choose("denied")}>
          Endast nödvändiga
        </button>
        <button type="button" className="btn btn-primary" onClick={() => choose("granted")}>
          Godkänn
        </button>
      </div>
    </div>
  );
}
