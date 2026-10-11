"use client";

import { useEffect, useRef, useState } from "react";
import { CONSENT_KEY, CONSENT_EVENT } from "./CookieConsent";

const SCRIPT = "https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js";

declare global {
  interface Window {
    Trustpilot?: { loadFromElement: (el: HTMLElement, force?: boolean) => void };
  }
}

/**
 * Trustpilot's own widget (TrustBox). It loads a third-party script that can
 * set cookies, so it only mounts after the visitor accepts cookies; until
 * then `fallback` (the score as plain text, with a link) is shown instead.
 */
export default function TrustBox({
  businessUnitId,
  templateId,
  profileUrl,
  fallback,
}: {
  businessUnitId: string;
  templateId: string;
  profileUrl: string;
  fallback: React.ReactNode;
}) {
  const [granted, setGranted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => {
      try {
        setGranted(window.localStorage.getItem(CONSENT_KEY) === "granted");
      } catch {
        setGranted(false);
      }
    };
    check();
    window.addEventListener(CONSENT_EVENT, check);
    return () => window.removeEventListener(CONSENT_EVENT, check);
  }, []);

  useEffect(() => {
    if (!granted || !ref.current) return;
    const el = ref.current;
    const render = () => window.Trustpilot?.loadFromElement(el, true);
    if (window.Trustpilot) return render();
    let s = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    if (!s) {
      s = document.createElement("script");
      s.src = SCRIPT;
      s.async = true;
      document.head.appendChild(s);
    }
    s.addEventListener("load", render);
    return () => s?.removeEventListener("load", render);
  }, [granted]);

  if (!granted) return <>{fallback}</>;
  return (
    <div
      ref={ref}
      className="trustpilot-widget trustbox"
      data-locale="sv-SE"
      data-template-id={templateId}
      data-businessunit-id={businessUnitId}
      data-style-height="240px"
      data-style-width="100%"
      data-theme="light"
    >
      <a href={profileUrl} target="_blank" rel="noopener noreferrer">
        Trustpilot
      </a>
    </div>
  );
}
