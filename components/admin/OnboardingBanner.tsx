"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * "Dölj" is remembered per organisation in this browser's localStorage, not
 * in org_settings: hiding a hint is a personal preference, staff may not
 * write the settings, and nothing else needs to know. Another browser shows
 * the banner again until the guide is done.
 */
export const onboardingHiddenKey = (orgId: string) => `binaafy-onboarding-hidden:${orgId}`;

export function readHidden(orgId: string): boolean {
  try {
    return window.localStorage.getItem(onboardingHiddenKey(orgId)) === "1";
  } catch {
    return false;
  }
}

export function writeHidden(orgId: string, hidden: boolean) {
  try {
    if (hidden) window.localStorage.setItem(onboardingHiddenKey(orgId), "1");
    else window.localStorage.removeItem(onboardingHiddenKey(orgId));
  } catch {
    // localStorage blocked: the banner just comes back on the next page.
  }
}

/** The start guide as a strip under the top bar, until every step is done or the user hides it. */
export default function OnboardingBanner({ orgId, done, total, next }: { orgId: string; done: number; total: number; next: { title: string; href: string } | null }) {
  const [hidden, setHidden] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    // One-time read of a client-only store on mount; starts hidden so the server render never flashes it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(readHidden(orgId));
  }, [orgId]);

  if (hidden || pathname === "/admin/kom-igang") return null;
  return (
    <div className="onb-banner" role="region" aria-label="Kom igång">
      <div className="container onb-banner-inner">
        <span className="onb-banner-text">
          <strong>Kom igång</strong> {done} av {total} steg klara{next ? ` · Nästa: ${next.title}` : ""}
        </span>
        <span className="onb-banner-actions">
          <Link href="/admin/kom-igang" className="btn btn-dark btn-sm">
            Öppna startguiden
          </Link>
          <button
            type="button"
            className="link-quiet"
            onClick={() => {
              writeHidden(orgId, true);
              setHidden(true);
            }}
          >
            Dölj
          </button>
        </span>
      </div>
    </div>
  );
}
