import type { Metadata } from "next";
import Link from "next/link";
import Reveal from "@/components/Reveal";
import { softwareAreas } from "@/lib/software-content";

export const metadata: Metadata = {
  title: "01 — Tjänster",
  description:
    "Webb & portaler, automation & integrationer, interna system — tre sätt 01 tar bort dubbelarbete och bygger system som håller.",
  alternates: { canonical: "/01/tjanster" },
};

export default function SoftwareServices() {
  return (
    <>
      <section className="section" style={{ paddingBottom: 0 }}>
        <div className="container" style={{ maxWidth: 780 }}>
          <Reveal>
            <span className="eyebrow">01 — Mjukvara</span>
            <h1 style={{ fontSize: "clamp(2rem, 4.2vw, 3rem)", marginTop: 16 }}>
              Tre sätt vi tar bort dubbelarbete
            </h1>
            <p className="lead" style={{ maxWidth: "none", marginTop: 16 }}>
              Vi väljer aldrig teknik för teknikens skull. Varje engagemang
              börjar med att kartlägga vad som faktiskt kostar tid idag, och
              vilken av de tre formerna nedan som löser det billigast.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container" style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 900, margin: "0 auto" }}>
          {softwareAreas.map((area) => (
            <Reveal key={area.slug} className="service-card" style={{ padding: 32 }}>
              <h2 style={{ fontSize: "1.4rem", marginBottom: 10 }}>{area.title}</h2>
              <p style={{ marginBottom: 18 }}>{area.body}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 24 }}>
                <div>
                  <strong style={{ fontFamily: "var(--font-head)", fontSize: ".92rem" }}>
                    Passar dig om
                  </strong>
                  <ul className="offer-benefits" style={{ marginTop: 12 }}>
                    {area.fitsIf.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
                <div className="offer-contact-card" style={{ marginTop: 0 }}>
                  <p>Typiskt upplägg</p>
                  <span className="offer-phone" style={{ fontSize: "1.15rem" }}>
                    {area.engagement.label}
                  </span>
                  <p style={{ color: "#e7e8ec", fontSize: ".92rem", marginTop: 8 }}>
                    {area.engagement.body}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <Reveal as="section" className="cta-banner">
        <div className="container cta-inner">
          <h2>Vet du redan vilket som passar?</h2>
          <p>Skicka en kort brief så återkommer vi med ett konkret upplägg.</p>
          <Link href="/01/brief" className="btn btn-dark">
            Skicka en brief
          </Link>
        </div>
      </Reveal>
    </>
  );
}
