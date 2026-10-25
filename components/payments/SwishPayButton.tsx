"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

type Target = { token: string } | { invoiceId: string; projectId: string };
type Status = "CREATED" | "PAID" | "DECLINED" | "ERROR" | "CANCELLED";
type Phase =
  | { kind: "idle" }
  | { kind: "phone" }
  | { kind: "starting" }
  | { kind: "waiting"; id: string; flow: "mcommerce" | "ecommerce" }
  | { kind: "paid" }
  | { kind: "failed"; message: string };

const POLL_MS = 2000;
const GIVE_UP_MS = 4 * 60_000;
const isPhone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const noSubscribe = () => () => {};

/**
 * "Betala med Swish" (Swish Handel). On a phone: a payment request without
 * a number, and the Swish app opens with it; Swish brings the customer back
 * here with ?swish=<id>, and the page picks up the waiting state. On a
 * computer: the customer types the mobile number and approves in the app.
 * Either way the page polls /api/swish/betalningar/<id> until Swish's
 * callback (or the status check behind that route) says how it went.
 */
export function SwishPayButton({ target, amountLabel, resumeKey }: { target: Target; amountLabel: string; resumeKey: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [payer, setPayer] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The server renders the computer version; the phone switches after hydration.
  const phone = useSyncExternalStore(noSubscribe, isPhone, () => false);

  const waitingId = phase.kind === "waiting" ? phase.id : null;

  // Poll our own status route while waiting; it asks Swish itself if the callback is late.
  useEffect(() => {
    if (!waitingId) return;
    let stopped = false;
    let timer = 0;
    const startedAt = Date.now();
    const tick = async () => {
      if (stopped) return;
      if (Date.now() - startedAt > GIVE_UP_MS) {
        setPhase({ kind: "failed", message: "Vi har inte fått något svar från Swish. Kontrollera i appen om betalningen gick igenom innan du försöker igen." });
        return;
      }
      try {
        const res = await fetch(`/api/swish/betalningar/${waitingId}`, { cache: "no-store" });
        if (res.ok && !stopped) {
          const s = (await res.json()) as { status: Status; message: string | null };
          if (s.status === "PAID") {
            setPhase({ kind: "paid" });
            router.refresh();
            return;
          }
          if (s.status !== "CREATED") {
            setPhase({ kind: "failed", message: s.message ?? (s.status === "DECLINED" ? "Betalningen avböjdes i Swish." : s.status === "CANCELLED" ? "Betalningen avbröts." : "Swish kunde inte genomföra betalningen.") });
            return;
          }
        }
      } catch {
        // A dropped connection on the phone while switching apps: try again.
      }
      if (!stopped) timer = window.setTimeout(() => void tick(), POLL_MS);
    };
    timer = window.setTimeout(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [waitingId, router]);

  const wait = useCallback((id: string, flow: "mcommerce" | "ecommerce") => setPhase({ kind: "waiting", id, flow }), []);

  // Back from the Swish app: ?swish=<id>&sf=<resumeKey>.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const id = p.get("swish");
    if (id && /^[0-9A-F]{32}$/.test(id) && (p.get("sf") ?? "") === resumeKey) {
      // Deferred so the state update is not synchronous inside the effect.
      const t = window.setTimeout(() => wait(id, "mcommerce"), 0);
      return () => window.clearTimeout(t);
    }
  }, [resumeKey, wait]);

  async function start(withPhone: boolean) {
    setError(null);
    setPhase({ kind: "starting" });
    try {
      const res = await fetch("/api/swish/betalningar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...target, ...(withPhone ? { payer } : {}) }),
      });
      const data = (await res.json()) as { swishId?: string; flow?: "mcommerce" | "ecommerce"; token?: string | null; error?: string };
      if (!res.ok || !data.swishId) {
        setError(data.error ?? "Swish kunde inte nås.");
        setPhase({ kind: withPhone ? "phone" : "idle" });
        return;
      }
      if (data.flow === "mcommerce" && data.token) {
        const back = new URL(window.location.href);
        back.searchParams.set("swish", data.swishId);
        back.searchParams.set("sf", resumeKey);
        wait(data.swishId, "mcommerce");
        window.location.href = `swish://paymentrequest?token=${encodeURIComponent(data.token)}&callbackurl=${encodeURIComponent(back.toString())}`;
        return;
      }
      wait(data.swishId, data.flow ?? "ecommerce");
    } catch {
      setError("Swish kunde inte nås. Försök igen.");
      setPhase({ kind: withPhone ? "phone" : "idle" });
    }
  }

  async function cancel(id: string) {
    await fetch(`/api/swish/betalningar/${id}`, { method: "DELETE" }).catch(() => null);
    setPhase({ kind: "failed", message: "Betalningen avbröts." });
  }

  if (phase.kind === "paid") return <p className="swish-pay-done">Betalningen är mottagen. Tack!</p>;

  if (phase.kind === "waiting")
    return (
      <div className="swish-pay" aria-live="polite">
        <p className="swish-pay-wait">
          <span className="swish-spinner" aria-hidden="true" />
          {phase.flow === "mcommerce" ? "Godkänn betalningen i Swish-appen." : "Öppna Swish på din mobil och godkänn betalningen."}
        </p>
        <button type="button" className="link-quiet" onClick={() => void cancel(phase.id)}>
          Avbryt
        </button>
      </div>
    );

  if (phase.kind === "phone" || (phase.kind === "starting" && payer))
    return (
      <form
        className="swish-pay"
        onSubmit={(e) => {
          e.preventDefault();
          void start(true);
        }}
      >
        <div className="field">
          <label htmlFor={`swish-payer-${resumeKey}`}>Mobilnummer kopplat till Swish</label>
          <input id={`swish-payer-${resumeKey}`} type="tel" inputMode="tel" autoComplete="tel" placeholder="070-123 45 67" value={payer} onChange={(e) => setPayer(e.target.value)} required autoFocus />
        </div>
        <div className="lead-quick">
          <button type="submit" className="btn btn-primary" disabled={phase.kind === "starting"}>
            {phase.kind === "starting" ? "Skickar …" : `Skicka ${amountLabel} till Swish`}
          </button>
          <button type="button" className="link-quiet" onClick={() => setPhase({ kind: "idle" })}>
            Tillbaka
          </button>
        </div>
        {error && <p className="form-feedback error">{error}</p>}
      </form>
    );

  return (
    <div className="swish-pay">
      {phase.kind === "failed" && <p className="form-feedback error">{phase.message}</p>}
      <div className="lead-quick">
        <button type="button" className="btn btn-primary" disabled={phase.kind === "starting"} onClick={() => (phone ? void start(false) : setPhase({ kind: "phone" }))}>
          {phase.kind === "starting" ? "Startar Swish …" : `Betala ${amountLabel} med Swish`}
        </button>
        <button type="button" className="link-quiet" onClick={() => setPhase({ kind: "phone" })}>
          {phone ? "Betala från en annan mobil" : "Ange mobilnummer"}
        </button>
      </div>
      {error && <p className="form-feedback error">{error}</p>}
    </div>
  );
}
