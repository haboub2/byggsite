"use client";

import { useState, useTransition } from "react";
import { revealPersonalNumberAction } from "@/app/admin/rot-actions";

/**
 * A ROT buyer's masked personal number with "Visa" for owner/admin. The
 * number is opened in the database on click and only kept in this component.
 */
export function RevealPersonalNumber({ invoiceId, index, masked }: { invoiceId: string; index: number; masked: string }) {
  const [shown, setShown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (shown) {
    return (
      <span>
        {shown}{" "}
        <button type="button" className="link-quiet" style={{ background: "none", cursor: "pointer", fontSize: 12.5 }} onClick={() => setShown(null)}>
          Dölj
        </button>
      </span>
    );
  }
  return (
    <span>
      <span className="inv-muted">{masked || "Personnummer saknas"}</span>
      {masked && (
        <>
          {" "}
          <button
            type="button"
            className="link-quiet"
            style={{ background: "none", cursor: "pointer", fontSize: 12.5 }}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await revealPersonalNumberAction(invoiceId, index);
                if (res.ok) {
                  setShown(res.value);
                  setError(null);
                } else setError(res.error);
              })
            }
          >
            {pending ? "Öppnar…" : "Visa"}
          </button>
        </>
      )}
      {error && (
        <span className="form-feedback error" role="status" style={{ display: "block", fontSize: 12.5 }}>
          {error}
        </span>
      )}
    </span>
  );
}
