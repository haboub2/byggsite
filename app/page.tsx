import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";
import WorkFilter from "@/components/WorkFilter";
import JsonLd from "@/components/JsonLd";
import { Icon } from "@/components/Icons";
import { websiteJsonLd } from "@/lib/seo";
import { hub, combinedWork } from "@/lib/placeholder";

export const metadata: Metadata = {
  title: "Byggly 01 — bygg & mjukvara i Halmstad",
  description:
    "Byggly 01 är ett företag, två avdelningar: Byggly renoverar och bygger hem i Halmstad, 01 bygger systemen som driver verksamheter.",
  alternates: { canonical: "/" },
};

export default function HubHome() {
  return (
    <div className="division-root" data-division="hub">
      <JsonLd data={websiteJsonLd()} />
      <Header division="hub" />

      <main>
        {/* Hero */}
        <section className="hero">
          <div className="container hero-inner" style={{ gridTemplateColumns: "1fr" }}>
            <Reveal className="hero-content" variant="hero" style={{ textAlign: "center", margin: "0 auto" }}>
              <span className="eyebrow">{hub.eyebrow}</span>
              <h1>{hub.title}</h1>
              <p className="lead" style={{ margin: "20px auto 0" }}>
                {hub.lead}
              </p>
            </Reveal>
          </div>

          <div className="container" style={{ marginTop: 48 }}>
            <div className="dept-grid reveal-group">
              {hub.departments.map((d) => (
                <Reveal
                  key={d.slug}
                  href={d.href}
                  className={`dept-card dept-card--${d.division}`}
                >
                  <span className="dept-card-icon">
                    <Icon name={d.icon} strokeWidth={1.8} />
                  </span>
                  <h3>{d.title}</h3>
                  <p>{d.body}</p>
                  <span className="dept-card-cta">{d.cta} →</span>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Stats */}
        <Reveal as="section" className="section section--alt" variant="scale">
          <div className="container">
            <div className="stats-strip">
              {hub.stats.map((s) => (
                <div key={s.label}>
                  <strong>{s.value}</strong>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* Combined work */}
        <section className="section" id="arbete">
          <div className="container">
            <Reveal className="section-head">
              <span className="eyebrow">Vårt arbete</span>
              <h2>Projekt från båda avdelningarna</h2>
              <p>Ett urval av vad Byggly och 01 nyligen levererat.</p>
            </Reveal>
            <WorkFilter items={combinedWork} />
          </div>
        </section>

        {/* Values */}
        <section className="section section--alt">
          <div className="container">
            <Reveal className="section-head">
              <span className="eyebrow">Varför Byggly 01</span>
              <h2>Samma värderingar, två discipliner</h2>
            </Reveal>
            <div className="values-grid reveal-group">
              {hub.values.map((v) => (
                <Reveal key={v.title} className="value-card">
                  <span className="value-card-icon">
                    <Icon name="check" strokeWidth={2} />
                  </span>
                  <h3>{v.title}</h3>
                  <p>{v.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <Reveal as="section" className="cta-banner">
          <div className="container cta-inner">
            <h2>Har du ett projekt i åtanke?</h2>
            <p>Oavsett om det gäller ett hus eller ett system — vi hör gärna av oss.</p>
            <Link href="/kontakt" className="btn btn-dark">
              Kom i kontakt
            </Link>
          </div>
        </Reveal>
      </main>

      <Footer division="hub" />
    </div>
  );
}
