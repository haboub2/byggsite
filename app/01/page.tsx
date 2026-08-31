import type { Metadata } from "next";
import Link from "next/link";
import Reveal from "@/components/Reveal";
import JsonLd from "@/components/JsonLd";
import { softwareJsonLd } from "@/lib/seo";
import { software01 } from "@/lib/placeholder";

export const metadata: Metadata = {
  title: "Mjukvara, system & automation",
  description:
    "01 är Byggly:s mjukvarugren — webb, automation och interna system byggda med samma hantverkstänk som på byggsidan.",
  alternates: { canonical: "/01" },
};

export default function SoftwareHome() {
  return (
    <>
      <JsonLd data={softwareJsonLd()} />

      <section className="hero">
        <div className="container hero-inner">
          <Reveal className="hero-content" variant="left">
            <span className="eyebrow">{software01.eyebrow}</span>
            <h1>{software01.title}</h1>
            <p className="lead">{software01.lead}</p>
            <div className="hero-actions">
              <Link href="/01/brief" className="btn btn-primary">
                Starta ett projekt
              </Link>
              <Link href="/01/case" className="btn btn-ghost">
                Se case
              </Link>
            </div>
            <ul className="hero-stats">
              {software01.stats.map((s) => (
                <li key={s.label}>
                  <strong>{s.value}</strong>
                  <span>{s.label}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section className="section" id="tjanster">
        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">Vad 01 gör</span>
            <h2>Tre sätt vi hjälper</h2>
            <p>Samma sak varje gång: mindre dubbelarbete, system som håller.</p>
          </Reveal>
          <div className="services-grid reveal-group">
            {software01.triad.map((t) => (
              <Reveal key={t.title} className="service-card">
                <h3>{t.title}</h3>
                <p>{t.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Reveal as="section" className="cta-banner">
        <div className="container cta-inner">
          <h2>Har du ett system som skaver?</h2>
          <p>Berätta kort om läget så återkommer vi med hur vi skulle angripa det.</p>
          <Link href="/01/brief" className="btn btn-dark">
            Skicka en brief
          </Link>
        </div>
      </Reveal>
    </>
  );
}
