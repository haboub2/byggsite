"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Icon } from "./Icons";
import { HONEYPOT } from "@/lib/schema";
import { websitePackages, websiteCare, formatSek } from "@/lib/website-packages";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Package cards and the order form for /mjukvara/kop-hemsida. They share the
 *  chosen package: "Välj" on a card selects it and scrolls to the form. The
 *  order posts to /api/brief, so it lands with the other Software leads. */
export default function WebsiteOrder({ contact }: { contact: { phone: string; phoneDisplay: string; email: string } }) {
  const [chosen, setChosen] = useState("foretag");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const pkg = websitePackages.find((p) => p.slug === chosen) ?? websitePackages[1];

  function choose(slug: string) {
    setChosen(slug);
    setDone(false);
    document.getElementById("bestall")?.scrollIntoView({ behavior: "smooth", block: "start" });
    nameRef.current?.focus({ preventScroll: true });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    if (!data.name?.trim() || !emailRe.test(data.email ?? "") || !data.phone?.trim()) {
      setError("Fyll i namn, telefon och en giltig e-post.");
      return;
    }
    if (data.consent !== "on") {
      setError("Kryssa i att du godkänner att bli kontaktad.");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const label = `Hemsida — ${pkg.name} (${pkg.from ? "från " : ""}${formatSek(pkg.price)})`;
    const body = {
      ...data,
      service: label,
      message: data.message?.trim() || `Beställning av hemsidepaketet ${pkg.name}.`,
      source: {
        utm_source: params.get("utm_source"),
        utm_medium: params.get("utm_medium"),
        utm_campaign: params.get("utm_campaign"),
        referrer: document.referrer || null,
        page: window.location.pathname,
      },
    };

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        if (res.status === 400 && json?.error) {
          setError(json.error);
          return;
        }
        throw new Error(String(res.status));
      }
      form.reset();
      setDone(true);
    } catch {
      setError(`Något gick fel när beställningen skulle skickas. Ring ${contact.phoneDisplay} eller mejla ${contact.email} så länge.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="sec" id="paket">
        <div className="container">
          <div className="sec-head">
            <div>
              <span className="eyebrow">Paket och priser</span>
              <h2>Välj paket. Fast pris, inga överraskningar.</h2>
            </div>
            <p>Alla priser exkl. moms. Osäker? Välj Företag — vi justerar vid startmötet och bekräftar priset innan något startar.</p>
          </div>
          <div className="pkg-grid">
            {websitePackages.map((p) => (
              <article key={p.slug} className={`pkg${p.popular ? " pkg--popular" : ""}${chosen === p.slug ? " is-chosen" : ""}`}>
                {p.popular && <span className="pkg-badge">Mest vald</span>}
                <h3 className="pkg-name">{p.name}</h3>
                <p className="pkg-tagline">{p.tagline}</p>
                <p className="pkg-price">
                  <small className="pkg-price-pre">{p.from ? "Från" : "Fast pris"}</small>
                  <strong>{formatSek(p.price)}</strong>
                  <small>exkl. moms</small>
                </p>
                <ul className="pkg-meta">
                  <li>
                    <Icon name="grid" strokeWidth={1.8} />
                    {p.pages}
                  </li>
                  <li>
                    <Icon name="clock" strokeWidth={1.8} />
                    {p.delivery}
                  </li>
                </ul>
                <a
                  href="#bestall"
                  className={`btn btn-block ${p.popular ? "btn-primary" : "btn-dark"}`}
                  onClick={(e) => {
                    e.preventDefault();
                    choose(p.slug);
                  }}
                >
                  Välj {p.name}
                  <Icon name="arrow" strokeWidth={2} />
                </a>
                <ul className="pkg-features">
                  {p.features.map((f) =>
                    f.endsWith(":") ? (
                      <li key={f} className="pkg-features-lead">{f}</li>
                    ) : (
                      <li key={f}>
                        <Icon name="check" strokeWidth={2.2} />
                        <span>{f}</span>
                      </li>
                    )
                  )}
                </ul>
              </article>
            ))}
          </div>
          <p className="pkg-foot">
            <strong>Drift och support efter lansering:</strong> {websiteCare.price}. {websiteCare.body}
          </p>
        </div>
      </section>

      <section className="sec sec--alt" id="bestall">
        <div className="container order">
          <div className="order-intro">
            <span className="eyebrow eyebrow--accent">Beställ — ingen betalning nu</span>
            <h2>Två minuter, sedan tar vi det härifrån.</h2>
            <p>
              Skicka beställningen så ringer vi inom 24 timmar på vardagar, bekräftar omfattningen och skickar ett fast pris
              att godkänna. Arbetet startar först när ni sagt ja.
            </p>
          </div>

          {done ? (
            <div className="form order-done" role="status">
              <span className="order-done-ic" aria-hidden="true">
                <Icon name="check" strokeWidth={2.4} />
              </span>
              <h3>Tack — beställningen är mottagen.</h3>
              <p>
                Vi ringer inom 24 timmar på vardagar för att boka startmötet för {pkg.name}-paketet. En bekräftelse är på väg
                till din mejl.
              </p>
              <button type="button" className="link-arrow" onClick={() => setDone(false)}>
                Skicka en till beställning
              </button>
            </div>
          ) : (
            <form className="form order-form" onSubmit={onSubmit} noValidate>
              <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
                <label htmlFor="wo-website">Lämna tomt</label>
                <input id="wo-website" name={HONEYPOT} type="text" tabIndex={-1} autoComplete="off" />
              </div>

              <fieldset className="order-pick">
                <legend>Paket</legend>
                {websitePackages.map((p) => (
                  <label key={p.slug} className="order-pick-opt">
                    <input type="radio" name="paket" value={p.slug} checked={chosen === p.slug} onChange={() => setChosen(p.slug)} />
                    <span className="order-pick-name">{p.name}</span>
                    <span className="order-pick-price">
                      {p.from ? "från " : ""}
                      {formatSek(p.price)}
                    </span>
                  </label>
                ))}
              </fieldset>

              <div className="form-row">
                <div className="field">
                  <label htmlFor="wo-name">Namn *</label>
                  <input ref={nameRef} id="wo-name" name="name" type="text" autoComplete="name" required />
                </div>
                <div className="field">
                  <label htmlFor="wo-company">Företag</label>
                  <input id="wo-company" name="company" type="text" autoComplete="organization" />
                </div>
              </div>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="wo-phone">Telefon *</label>
                  <input id="wo-phone" name="phone" type="tel" autoComplete="tel" required />
                </div>
                <div className="field">
                  <label htmlFor="wo-email">E-post *</label>
                  <input id="wo-email" name="email" type="email" autoComplete="email" required />
                </div>
              </div>
              <div className="field">
                <label htmlFor="wo-site">Nuvarande hemsida (om ni har en)</label>
                <input id="wo-site" name="currentSite" type="text" inputMode="url" placeholder="www.exempel.se" />
              </div>
              <div className="field">
                <label htmlFor="wo-message">Något vi bör veta? (valfritt)</label>
                <textarea id="wo-message" name="message" rows={3} placeholder="Era tjänster, orter ni jobbar i, önskat datum…" />
              </div>

              <label className="checkbox">
                <input type="checkbox" name="consent" required />
                <span>
                  Jag godkänner att bli kontaktad om beställningen och har läst{" "}
                  <Link href="/integritetspolicy">integritetspolicyn</Link>. *
                </span>
              </label>

              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? "Skickar…" : `Beställ ${pkg.name} — ${pkg.from ? "från " : ""}${formatSek(pkg.price)}`}
              </button>
              <p className={`form-feedback${error ? " error" : ""}`} role="status" aria-live="polite">
                {error}
              </p>
            </form>
          )}

          <aside className="order-summary" aria-label="Sammanfattning">
            <span className="eyebrow">Ni har valt</span>
            <strong className="order-summary-name">{pkg.name}</strong>
            <p className="order-summary-price">
              {pkg.from ? "från " : ""}
              {formatSek(pkg.price)} <small>exkl. moms</small>
            </p>
            <ul>
              <li>{pkg.pages}</li>
              <li>{pkg.delivery}</li>
              {pkg.features
                .filter((f) => !f.endsWith(":"))
                .slice(0, 4)
                .map((f) => (
                  <li key={f}>{f}</li>
                ))}
            </ul>
            <div className="order-summary-trust">
              <span><Icon name="shield" strokeWidth={1.8} /> Ingen betalning vid beställning</span>
              <span><Icon name="code" strokeWidth={1.8} /> Ni äger koden och domänen</span>
            </div>
            <p className="order-summary-call">
              Hellre prata först? <a href={`tel:${contact.phone}`}>{contact.phoneDisplay}</a>
            </p>
          </aside>
        </div>
      </section>
    </>
  );
}
