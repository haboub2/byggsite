"use client";

import { useEffect, useState } from "react";
import { GoogleAnalytics } from "@next/third-parties/google";
import { CONSENT_KEY, CONSENT_EVENT } from "./CookieConsent";

/** The site's GA4 property. A measurement ID is public; NEXT_PUBLIC_GA_ID
 *  overrides it, and dev builds leave it off so local visits aren't counted. */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || (process.env.NODE_ENV === "production" ? "G-XENCYFPZ15" : "");

/** GA4, gated on a measurement ID and on cookie consent. Mounts only after
 *  both are true — no tracking script loads before the visitor opts in. */
export default function Analytics() {
  const gaId = GA_ID;
  const [granted, setGranted] = useState(false);

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

  if (!gaId || !granted) return null;
  return <GoogleAnalytics gaId={gaId} />;
}
