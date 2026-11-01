"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const CONSENT_KEY = "binaafy-cookie-consent";
export const CONSENT_EVENT = "binaafy-consent-change";
/** Dispatched by the footer's "Cookieinställningar" link: the banner comes back so the choice can be changed (art. 7(3)). */
export const CONSENT_OPEN_EVENT = "binaafy-consent-open";

/** Reopen the banner from anywhere on the website. */
export function openCookieSettings() {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}

type Consent = "granted" | "denied";

export default function CookieConsent() {
  const [choice, setChoice] = useState<Consent | null>(null);
  const [ready, setReady] = useState(false);
  // The website's question, not the app's: never over the admin login, the portal or Min tid.
  const app = /^\/(admin|mitt-projekt|min-tid)(\/|$)/.test(usePathname() ?? "");

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
    // "Cookieinställningar" in the footer: show the banner again, whatever was chosen.
    const reopen = () => setChoice(null);
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
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

  if (app || !ready || choice !== null) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookies" aria-live="polite">
      <p>
        Vi använder endast nödvändiga cookies som standard. Godkänner du även analys-cookies
        (Google Analytics) som hjälper oss förbättra sajten? Valet sparas i din webbläsare och
        kan ändras när som helst under Cookieinställningar i sidfoten. Läs mer i vår{" "}
        <Link href="/integritetspolicy">integritetspolicy</Link>.
      </p>
      {/* Equal prominence (IMY/EDPB): the same button style for both choices. */}
      <div className="cookie-banner-actions">
        <button type="button" className="btn btn-ghost" onClick={() => choose("denied")}>
          Endast nödvändiga
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => choose("granted")}>
          Godkänn analys
        </button>
      </div>
    </div>
  );
}
