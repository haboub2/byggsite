"use client";

import { useState, useTransition } from "react";
import { revealPnrAction } from "@/app/admin/hr-actions";

/** ÅÅÅÅMMDD-XXXX until clicked; the click asks the database, which logs the reveal. */
export function PnrReveal({ employeeId, masked, canReveal }: { employeeId: string; masked: string; canReveal: boolean }) {
  const [shown, setShown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!masked) return <span className="hr-muted">Inget personnummer</span>;
  if (shown) return <span className="hr-pnr">{shown}</span>;
  return (
    <span className="hr-pnr">
      {masked}{" "}
      {canReveal && (
        <button
          type="button"
          className="link-quiet"
          disabled={pending}
          aria-label="Visa personnumret (visningen loggas)"
          title="Visningen loggas i personens historik."
          onClick={() =>
            start(async () => {
              const r = await revealPnrAction(employeeId);
              if (r.pnr) setShown(r.pnr);
              else setError(r.error ?? "Kunde inte visa.");
            })
          }
        >
          {pending ? "Hämtar…" : "Visa"}
        </button>
      )}
      {error && <span className="efield-error"> {error}</span>}
    </span>
  );
}
