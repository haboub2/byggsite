import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";
import WorkFilter from "@/components/WorkFilter";
import TrustBadges from "@/components/TrustBadges";
import JsonLd from "@/components/JsonLd";
import { Icon } from "@/components/Icons";
import { websiteJsonLd } from "@/lib/seo";
import { hub, combinedWork } from "@/lib/placeholder";
import { images } from "@/lib/images";

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
      <Header division="hub" dark />

      <main>
        {/* Hero — diagonal photo split, department chooser */}
        <section className="hub-hero">
          <div className="hub-hero-panes">
            <div className="hub-pane hub-pane--left">
              <img src={images.hubHeroCode} alt="" />
            </div>
            <div className="hub-pane hub-pane--right">
              <img src={images.hubHeroVilla} alt="" />
            </div>
          </div>
          <div className="hub-seam-glow" aria-hidden="true" />
          <div className="hub-seam-line" aria-hidden="true" />

          <div className="hub-hero-inner container">
            <span className="eyebrow">{hub.eyebrow}</span>
            <h1 className="hub-headline">
              Två discipliner.
              <br />
              <span className="g">En vision.</span>
            </h1>
            <p className="lead">{hub.lead}</p>
            <Link href="#arbete" className="btn-ghost-dark">
              Utforska vårt arbete
              <Icon name="arrow" strokeWidth={2.4} />
            </Link>
          </div>

          <p className="hub-dept-label">Välj en avdelning att utforska</p>
          <div className="hub-dept-row">
            {hub.departments.map((d) => (
              <Link key={d.slug} href={d.href} className={`hub-dept-btn hub-dept-btn--${d.division}`}>
                <span className="ic">
                  <Icon name={d.icon} strokeWidth={1.8} />
                </span>
                <span className="tx">
                  <strong>{d.title}</strong>
                  <span>{d.body.split(" — ")[0].split(".")[0]}</span>
                </span>
                <Icon name="arrow" strokeWidth={2.2} className="arrow" />
              </Link>
            ))}
          </div>
        </section>

        {/* Bento: intro, photo, both divisions, stats, featured work, promises — one grid */}
        <section className="bento-section">
          <div className="container">
            <Reveal className="bento-head">
              <span className="eyebrow">Om Byggly 01</span>
              <h2>Ett företag, sett från alla vinklar</h2>
              <p>Två discipliner, samma standard — här är helheten i ett svep.</p>
            </Reveal>

            <div className="bento reveal-group">
              <Reveal as="div" className="tile tile--intro">
                <div>
                  <span className="eyebrow" style={{ marginBottom: 0 }}>
                    Vår historia
                  </span>
                  <h3>
                    Vi bygger lösningar.
                    <br />
                    Vi bygger <span className="g">förtroende</span>.
                  </h3>
                  <p>{hub.lead}</p>
                </div>
                <Link href="/om-oss" className="go">
                  Läs mer om oss
                  <Icon name="arrow" strokeWidth={2.4} />
                </Link>
              </Reveal>

              <Reveal as="div" className="tile tile--photo">
                <img src={images.projectKitchen} alt="" />
                <span className="play" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </Reveal>

              {hub.departments.map((d, i) => (
                <Reveal
                  key={d.slug}
                  href={d.href}
                  className={`tile tile--${d.division === "bygg" ? "bygg" : "software"}`}
                >
                  <span className="split" aria-hidden="true" />
                  <span className="seam" aria-hidden="true" />
                  <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                  <h3>{d.title}</h3>
                  <p>{d.body.split(" — ")[0].split(".")[0]}</p>
                </Reveal>
              ))}

              {hub.stats.map((s) => (
                <Reveal as="div" key={s.label} className="tile tile--stat">
                  <strong>{s.value}</strong>
                  <span>{s.label}</span>
                </Reveal>
              ))}

              {combinedWork
                .filter((w) => w.slug === "radhus-vallas" || w.slug === "byggly01-site")
                .map((w) => (
                  <Reveal key={w.slug} href={w.href} className="tile tile--proj">
                    <img src={w.image} alt="" />
                    <div className="cap">
                      <span>{w.division === "bygg" ? "Bygg" : "01"}</span>
                      <strong>{w.title}</strong>
                    </div>
                  </Reveal>
                ))}

              <Reveal as="div" className="tile tile--values">
                <span className="eyebrow" style={{ color: "var(--bygg-on-dark)" }}>
                  Vi lovar
                </span>
                <div className="vlist">
                  {hub.values.map((v) => (
                    <span className="v" key={v.title}>
                      <Icon name="check" strokeWidth={2.4} />
                      {v.body}
                    </span>
                  ))}
                </div>
              </Reveal>
            </div>

            <TrustBadges />
          </div>
        </section>

        {/* Combined work */}
        <section className="section section--alt" id="arbete">
          <div className="container">
            <Reveal className="section-head">
              <span className="eyebrow">Vårt arbete</span>
              <h2>Projekt från båda avdelningarna</h2>
              <p>Ett urval av vad Byggly och 01 nyligen levererat.</p>
            </Reveal>
            <WorkFilter items={combinedWork} />
          </div>
        </section>

        {/* CTA bar */}
        <div className="hub-cta-bar">
          <div className="hub-cta-bar-inner">
            <div className="l">
              <span className="ic" aria-hidden="true">
                <Icon name="house" strokeWidth={1.8} />
              </span>
              <div>
                <h2>Har du ett projekt i åtanke?</h2>
                <p>Oavsett om det gäller ett hus eller ett system — vi hör gärna av oss.</p>
              </div>
            </div>
            <Link href="/kontakt" className="btn btn-primary">
              Kom i kontakt
            </Link>
          </div>
        </div>
      </main>

      <Footer division="hub" />
    </div>
  );
}
