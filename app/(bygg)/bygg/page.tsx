import type { Metadata } from "next";
import Link from "next/link";
import Reveal from "@/components/Reveal";
import HeroVisual from "@/components/HeroVisual";
import CursorGlow from "@/components/CursorGlow";
import LeadForm from "@/components/LeadForm";
import JsonLd from "@/components/JsonLd";
import { Icon } from "@/components/Icons";
import { businessJsonLd } from "@/lib/seo";
import {
  site,
  heroBygg,
  trustPoints,
  services,
  processSteps,
  featuredProjects,
  faq,
} from "@/lib/placeholder";

export const metadata: Metadata = {
  title: "Byggfirma i Halmstad — renovering, badrum & kök",
  description:
    "Byggly är din byggfirma i Halmstad för totalrenovering, badrum, kök, tillbyggnad och takarbeten. Certifierat hantverk, fast pris och 5 års garanti.",
  alternates: { canonical: "/bygg" },
};

export default function ByggHome() {
  const tel = `tel:${site.contact.phone}`;
  const mail = `mailto:${site.contact.email}`;

  return (
    <>
      <JsonLd data={businessJsonLd()} />
      <CursorGlow />

      {/* Hero */}
      <section className="hero">
        <div className="container hero-inner">
          <Reveal className="hero-content" variant="left">
            <span className="eyebrow">{heroBygg.eyebrow}</span>
            <h1>
              {heroBygg.titleLead}
              <span className="hl">{heroBygg.titleHl}</span>
              {heroBygg.titleTail}
            </h1>
            <p className="lead">{heroBygg.lead}</p>
            <div className="hero-actions">
              <Link href="/offert" className="btn btn-primary">
                Begär en kostnadsfri offert
              </Link>
              <Link href="/tjanster" className="btn btn-ghost">
                Se våra tjänster
              </Link>
            </div>
            <ul className="hero-stats">
              {heroBygg.stats.map((s) => (
                <li key={s.label}>
                  <strong>{s.value}</strong>
                  <span>{s.label}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal variant="right">
            <HeroVisual />
          </Reveal>
        </div>
      </section>

      {/* Trust bar */}
      <Reveal className="trust-bar" variant="scale">
        <div className="container trust-inner">
          <span>Anlitade av privatpersoner &amp; företag</span>
          <div className="trust-points">
            {trustPoints.map((t) => (
              <span key={t}>✓ {t}</span>
            ))}
          </div>
        </div>
      </Reveal>

      {/* Services */}
      <section className="section" id="tjanster">
        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">Vad vi gör</span>
            <h2>Våra tjänster</h2>
            <p>Bygg och renovering från start till slut, skött av ett dedikerat team.</p>
          </Reveal>
          <div className="services-grid reveal-group">
            {services.map((s) => (
              <Reveal key={s.slug} className="service-card" href={`/tjanster/${s.slug}`}>
                <div className="service-icon">
                  <Icon name={s.slug} />
                </div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="section section--alt" id="process">
        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">Enkelt &amp; transparent</span>
            <h2>Så funkar det</h2>
            <p>Från första kontakt till färdigt projekt i fyra tydliga steg.</p>
          </Reveal>
          <ol className="process-grid reveal-group">
            {processSteps.map((p) => (
              <Reveal as="li" key={p.n} className="process-step">
                <span className="step-num">{p.n}</span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Featured projects */}
      <section className="section" id="projekt">
        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">Vårt arbete</span>
            <h2>Utvalda projekt</h2>
            <p>Ett urval av vad vi nyligen byggt och renoverat i Halland.</p>
          </Reveal>
          <div className="projects-grid reveal-group">
            {featuredProjects.map((p) => (
              <Reveal key={p.slug} className="project-card" href={`/projekt/${p.slug}`}>
                <div className={`project-thumb ${p.thumb}`} />
                <div className="project-body">
                  <span className="tag">{p.tag}</span>
                  <h3>{p.title}</h3>
                  <p>{p.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Offer */}
      <section className="section section--alt" id="offert">
        <div className="container offer-layout">
          <Reveal className="offer-intro" variant="left">
            <span className="eyebrow">Kostnadsfritt &amp; utan förpliktelser</span>
            <h2>Begär din offert</h2>
            <p>
              Fyll i uppgifterna om ditt projekt så återkommer vi med en skräddarsydd
              offert inom 24 timmar.
            </p>
            <ul className="offer-benefits">
              <li>Detaljerad, specificerad prissättning</li>
              <li>Inga dolda kostnader</li>
              <li>Svar inom en arbetsdag</li>
            </ul>
            <div className="offer-contact-card">
              <p>Vill du hellre prata?</p>
              <a href={tel} className="offer-phone">
                {site.contact.phoneDisplay}
              </a>
              <a href={mail}>{site.contact.email}</a>
            </div>
          </Reveal>
          <Reveal variant="right">
            <LeadForm variant="offert" />
          </Reveal>
        </div>
      </section>

      {/* Contact */}
      <section className="section" id="kontakt">
        <div className="container contact-layout">
          <Reveal className="contact-info" variant="left">
            <span className="eyebrow">Hör av dig</span>
            <h2>Kontakta oss</h2>
            <p>
              Frågor om ett projekt eller våra tjänster? Skicka ett meddelande så
              svarar vi snart.
            </p>
            <ul className="contact-list">
              <li>
                <span className="ci-icon"><Icon name="user" strokeWidth={1.8} /></span>
                <div>
                  <strong>Kontaktperson</strong>
                  <span>{site.contact.person}</span>
                </div>
              </li>
              <li>
                <span className="ci-icon"><Icon name="pin" strokeWidth={1.8} /></span>
                <div>
                  <strong>Besök oss</strong>
                  <span>{site.contact.address}</span>
                </div>
              </li>
              <li>
                <span className="ci-icon"><Icon name="phone" strokeWidth={1.8} /></span>
                <div>
                  <strong>Ring oss</strong>
                  <span>
                    <a href={tel}>{site.contact.phoneDisplay}</a>
                  </span>
                </div>
              </li>
              <li>
                <span className="ci-icon"><Icon name="mail" strokeWidth={1.8} /></span>
                <div>
                  <strong>Mejla oss</strong>
                  <span>
                    <a href={mail}>{site.contact.email}</a>
                  </span>
                </div>
              </li>
              <li>
                <span className="ci-icon"><Icon name="clock" strokeWidth={1.8} /></span>
                <div>
                  <strong>Öppettider</strong>
                  <span>{site.contact.hours}</span>
                </div>
              </li>
            </ul>
          </Reveal>
          <Reveal variant="right">
            <LeadForm variant="kontakt" />
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="section section--alt" id="faq">
        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">Vanliga frågor</span>
            <h2>Frågor &amp; svar</h2>
            <p>Det kunder oftast undrar om bygg och renovering med Byggly.</p>
          </Reveal>
          <div className="faq-list reveal-group">
            {faq.map((item) => (
              <Reveal as="details" key={item.q} className="faq-item">
                <summary>{item.q}</summary>
                <div className="faq-body">
                  <p>{item.a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <Reveal as="section" className="cta-banner">
        <div className="container cta-inner">
          <h2>Redo att starta ditt projekt?</h2>
          <p>Få en kostnadsfri offert utan förpliktelser, anpassad efter dina behov.</p>
          <Link href="/offert" className="btn btn-dark">
            Begär en offert
          </Link>
        </div>
      </Reveal>
    </>
  );
}
