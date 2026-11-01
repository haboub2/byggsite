"use client";

import { openCookieSettings } from "./CookieConsent";

/** Footer link that brings the cookie banner back, so consent can be withdrawn as easily as it was given. */
export default function CookieSettingsLink() {
  return (
    <button type="button" onClick={openCookieSettings}>
      Cookieinställningar
    </button>
  );
}
