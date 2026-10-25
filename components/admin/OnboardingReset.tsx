"use client";

import { useEffect, useState } from "react";
import { readHidden, writeHidden } from "./OnboardingBanner";

/** On the guide itself: hide the banner, or bring it back after "Dölj". */
export default function OnboardingReset({ orgId }: { orgId: string }) {
  const [hidden, setHidden] = useState<boolean | null>(null);
  useEffect(() => {
    // One-time read of a client-only store on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(readHidden(orgId));
  }, [orgId]);
  if (hidden === null) return null;
  return (
    <p className="efield-hint" style={{ marginTop: 24 }}>
      {hidden ? "Påminnelsen överst i admin är dold i den här webbläsaren. " : "Påminnelsen överst i admin visas tills alla steg är klara. "}
      <button
        type="button"
        className="link-quiet"
        onClick={() => {
          writeHidden(orgId, !hidden);
          setHidden(!hidden);
        }}
      >
        {hidden ? "Visa den igen" : "Dölj den"}
      </button>
    </p>
  );
}
