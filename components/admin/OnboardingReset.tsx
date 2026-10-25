"use client";

import { useEffect, useState } from "react";
import { readHidden, writeHidden } from "./OnboardingBanner";

/** On the guide itself: hide the banner over admin, or bring it back after "Dölj". */
export default function OnboardingReset({ orgId }: { orgId: string }) {
  const [hidden, setHidden] = useState<boolean | null>(null);
  useEffect(() => {
    // One-time read of a client-only store on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(readHidden(orgId));
  }, [orgId]);
  if (hidden === null) return null;
  const toggle = () => {
    writeHidden(orgId, !hidden);
    setHidden(!hidden);
  };
  return (
    <p className="efield-hint">
      {hidden ? "Guiden är dold i menyn i den här webbläsaren. " : "Guiden försvinner från menyn när alla steg är klara. "}
      <button type="button" className="onb-hide" onClick={toggle}>
        {hidden ? "Visa den igen" : "Dölj den nu"}
      </button>
    </p>
  );
}
