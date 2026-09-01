import type { Metadata } from "next";
import Link from "next/link";
import Reveal from "@/components/Reveal";
import CursorGlow from "@/components/CursorGlow";
import LeadForm from "@/components/LeadForm";
import JsonLd from "@/components/JsonLd";
import { Icon } from "@/components/Icons";
import { businessJsonLd } from "@/lib/seo";
import { images } from "@/lib/images";
import {
  site,
  heroBygg,
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

const featuredSlugs = ["totalrenovering", "badrumsrenovering", "koksrenovering", "tillbyggnad", "golv", "maleri"];
const highlightServices = featuredSlugs
  .map((slug) => services.find((s) => s.slug === slug))
  .filter((s): s is (typeof services)[number] => Boolean(s));

const featureStrip = [
  { icon: "house", title: "Renovering", body: "Kärnkompetens" },
  { icon: "tools", title: "Material", body: "Håller länge" },
  { icon: "clock", title: "I tid", body: "Alltid punktligt" },
  { icon: "check", title: "Transparent", body: "Alltid tydligt" },
];

const byggStats = [
  { icon: "house", value: heroBygg.stats[1].value, label: heroBygg.stats[1].label },
  { icon: "clock", value: heroBygg.stats[0].value, label: heroBygg.stats[0].label },
  { icon: "check", value: heroBygg.stats[2].value, label: heroBygg.stats[2].label },
  { icon: "grid", value: `${services.length}`, label: "Tjänsteområden" },
];

export default function ByggHome() {
  const tel = `tel:${site.contact.phone}`;
  const mail = `mailto:${site.contact.email}`;

  return (
    <>
      <JsonLd data={businessJsonLd()} />
      <CursorGlow />

      {/* Hero */}
      <section className="bygg-hero">
        <div className="container bygg-hero-grid">
          <Reveal variant="left">
            <span className="eyebrow">{heroBygg.eyebrow}</span>
            <h1 className="bygg-hh">
              {heroBygg.titleLead}
              <span className="g">{heroBygg.titleHl}</span>
              {heroBygg.titleTail}
            </h1>
            <p className="bygg-hero-lead">{heroBygg.lead}</p>
            <div className="hero-actions">
              <Link href="/offert" className="btn btn-primary">
                Se våra tjänster
                <Icon name="arrow" strokeWidth={2.4} />
              </Link>
              <Link href="/projekt" className="btn btn-ghost">
                Se vårt arbete
              </Link>
            </div>
            <div className="bygg-op-by">
              <span className="ic">
                <Icon name="tools" strokeWidth={1.8} />
              </span>
              <div>
                <strong>Certifierat &amp; försäkrat team</strong>
                <span>F-skatt · ID06 · Ansvarsförsäkring</span>
              </div>
            </div>
          </Reveal>
          <Reveal variant="right">
            <div className="bygg-hero-photo">
              <img src={images.byggHeroKitchen} alt="" />
              <div className="bygg-feature-strip">
                {featureStrip.map((f) => (
                  <div className="f" key={f.title}>
                    <span className="ic">
                      <Icon name={f.icon} strokeWidth={2} />
                    </span>
                    <div>
                      <strong>{f.title}</strong>
                      <span>{f.body}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* What we do */}
      <section className="bygg-whatwedo">
        <div className="container bygg-ww-grid">
          <Reveal variant="left">
            <span className="eyebrow">Vad vi gör</span>
            <h2>Våra tjänster</h2>
            <p>Bygg och renovering från start till slut, skött av ett dedikerat team.</p>
            <div className="bygg-svc-grid reveal-group">
              {highlightServices.map((s) => (
                <Reveal key={s.slug} className="bygg-svc-card" href={`/tjanster/${s.slug}`}>
                  <span className="ic">
                    <Icon name={s.slug} strokeWidth={1.7} />
                  </span>
                  <h3>{s.title}</h3>
                  <p>{s.desc.split(" — ")[0].split(".")[0]}</p>
                </Reveal>
              ))}
            </div>
            <Link href="/tjanster" className="btn-dark-sm">
              Alla våra tjänster
              <Icon name="arrow" strokeWidth={2.4} />
            </Link>
          </Reveal>

          <Reveal variant="right">
            <div className="bygg-ww-head-row">
              <div>
                <span className="eyebrow">Vårt senaste arbete</span>
                <h2>Renoveringsprojekt</h2>
              </div>
              <Link href="/projekt">
                Visa alla
                <Icon name="arrow" strokeWidth={2.4} />
              </Link>
            </div>
            <div className="bygg-proj-grid reveal-group">
              {featuredProjects.slice(0, 2).map((p) => (
                <Reveal key={p.slug} className="bygg-proj-card" href={`/projekt/${p.slug}`}>
                  <img src={p.image} alt={p.title} loading="lazy" />
                  <div className="b">
                    <span>{p.tag}</span>
                    <h3>{p.title}</h3>
                  </div>
                </Reveal>
              ))}
            </div>
            <div className="bygg-dots" aria-hidden="true">
              <span className="on" />
              <span />
              <span />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Process + stats split */}
      <div className="bygg-split">
        <div className="bygg-split-process">
          <span className="eyebrow">Vår process</span>
          <h2>Enkelt &amp; transparent</h2>
          <ol className="bygg-steps">
            {processSteps.map((p) => (
              <li className="bygg-step" key={p.n}>
                <span className="circle">
                  <Icon name={p.n === "01" ? "projektledning" : p.n === "02" ? "user" : p.n === "03" ? "tools" : "check"} strokeWidth={1.8} />
                </span>
                <span className="n">{p.n}</span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="bygg-split-stats">
          {byggStats.map((s) => (
            <div className="bygg-stat" key={s.label}>
              <span className="ic">
                <Icon name={s.icon} strokeWidth={1.8} />
              </span>
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA band */}
      <div className="bygg-cta-band">
        <div className="bygg-cta-inner">
          <div className="l">
            <span className="ic">
              <Icon name="house" strokeWidth={1.8} />
            </span>
            <div>
              <h2>Har du ett projekt i åtanke?</h2>
              <p>Boka en kostnadsfri konsultation, helt utan förpliktelser.</p>
            </div>
          </div>
          <Link href="/offert" className="btn btn-primary">
            Boka kostnadsfri konsultation
          </Link>
        </div>
      </div>

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
