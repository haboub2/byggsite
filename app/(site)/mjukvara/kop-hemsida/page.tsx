import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import PageHero from "@/components/PageHero";
import Reveal from "@/components/Reveal";
import WebsiteOrder from "@/components/WebsiteOrder";
import { Icon } from "@/components/Icons";
import { Stats, SectionHead, Steps, Faq, Bridge } from "@/components/Sections";
import { abs, faqJsonLd, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { ogImage } from "@/lib/images";
import { getContent } from "@/lib/content/store";
import {
  websitePackages,
  websiteIncluded,
  websiteSteps,
  websiteSections,
  websiteFaq,
  formatSek,
} from "@/lib/website-packages";

const PATH = "/mjukvara/kop-hemsida";
const from = formatSek(Math.min(...websitePackages.map((p) => p.price)));

export const metadata: Metadata = pageMetadata({
  title: `Köp hemsida till företag — fast pris från ${from.replace(/ /g, " ")}`,
  description:
    "Köp en snabb, mobilanpassad hemsida till ditt företag. Tre paket med fast pris, SEO från start, klar på 2–3 veckor och ni äger allt. Beställ på två minuter.",
  path: PATH,
  image: ogImage("webb-hero"),
});

/** The packages as a Service with priced offers, so search engines can show prices. */
function offersJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": abs(`${PATH}#service`),
    serviceType: "Webbdesign och webbutveckling",
    name: "Hemsida till företag",
    description:
      "Färdiga hemsidepaket för företag med fast pris: design i er profil, mobilanpassning, SEO och publicering. Byggt i Next.js, koden ägs av kunden.",
    provider: { "@id": abs("/#software") },
    areaServed: { "@type": "Country", name: "Sverige" },
    url: abs(PATH),
    offers: websitePackages.map((p) => ({
      "@type": "Offer",
      name: `Hemsida ${p.name}`,
      description: p.tagline,
      url: abs(`${PATH}#paket`),
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        ...(p.from ? { minPrice: p.price } : { price: p.price }),
        priceCurrency: "SEK",
        valueAddedTaxIncluded: false,
      },
    })),
  };
}

export default async function BuyWebsitePage() {
  const { company } = await getContent();
  return (
    <>
      <JsonLd
        data={[
          offersJsonLd(),
          faqJsonLd(websiteFaq),
          breadcrumbJsonLd([
            { name: "Software", path: "/mjukvara" },
            { name: "Köp hemsida", path: PATH },
          ]),
        ]}
      />
      <PageHero
        crumbs={[{ label: "Software", href: "/mjukvara" }, { label: "Köp hemsida" }]}
        eyebrow={`Fast pris från ${from} exkl. moms`}
        title="Köp hemsida som ger nya kunder."
        titleContext="hemsida till företag med fast pris"
        lead="Välj ett paket, skicka beställningen på två minuter, och ha en snabb, snygg hemsida som syns på Google inom två till tre veckor. Fast pris, inga licensavgifter — och ni äger allt."
        image="webb-hero"
        caption="Next.js · Mobil först · SEO från start"
      >
        <a href="#paket" className="btn btn-primary" data-magnetic>
          Se paket och priser
          <Icon name="arrow" strokeWidth={2} />
        </a>
        <a href={`tel:${company.phone}`} className="link-quiet">
          Hellre prata? {company.phoneDisplay}
        </a>
      </PageHero>

      <section className="sec sec--tight">
        <div className="container">
          <Stats
            items={[
              { value: "3", label: `paket med fast pris, från ${from}` },
              { value: "2–3 v", label: "från startmöte till lansering" },
              { value: "100 %", label: "ni äger kod, domän och innehåll" },
              { value: "24 h", label: "svar på er beställning" },
            ]}
          />
        </div>
      </section>

      <WebsiteOrder contact={{ phone: company.phone, phoneDisplay: company.phoneDisplay, email: company.email }} />

      <section className="sec">
        <div className="container">
          <SectionHead
            eyebrow="Ingår i alla paket"
            title="Allt en företagshemsida behöver."
            aside="Inga tillval för det självklara. Det här får ni oavsett paket."
          />
          <ul className="perk-grid reveal-group">
            {websiteIncluded.map((x) => (
              <Reveal as="li" key={x.title} className="perk">
                <span className="perk-ic" aria-hidden="true">
                  <Icon name={x.icon} strokeWidth={1.8} />
                </span>
                <h3>{x.title}</h3>
                <p>{x.body}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec sec--alt">
        <div className="container">
          <SectionHead
            eyebrow="Så går det till"
            title="Från beställning till lansering."
            aside="Ni lägger några timmar totalt. Resten gör vi."
          />
          <Steps items={websiteSteps} />
        </div>
      </section>

      <section className="sec">
        <div className="container split split--sticky">
          <div className="split-aside">
            <span className="eyebrow">Bra att veta</span>
            <h2>Att köpa hemsida till företaget.</h2>
            <p>Pris, teknik, Google och vad ni behöver ta fram själva — svaren innan ni bestämmer er.</p>
            <a href="#paket" className="link-arrow" style={{ marginTop: 20 }}>
              Till paketen
              <Icon name="arrow" strokeWidth={2} />
            </a>
          </div>
          <div className="article-sections">
            {websiteSections.map((s, i) => (
              <Reveal as="section" key={s.heading}>
                <span className="n">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h2>{s.heading}</h2>
                  <p>{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec--alt">
        <div className="container split">
          <div className="split-aside">
            <span className="eyebrow">Vanliga frågor</span>
            <h2>Frågor om att köpa hemsida.</h2>
          </div>
          <Faq items={websiteFaq} name="kop-hemsida-faq" />
        </div>
      </section>

      <section className="sec sec--tight">
        <div className="container">
          <Bridge
            title="Behöver ni mer än en hemsida?"
            body="Kundportaler, bokning, integrationer och interna system bygger vi också, med fast pris per etapp."
            links={[
              { label: "Webb och portaler", href: "/mjukvara/tjanster/webb" },
              { label: "Skicka en brief", href: "/mjukvara/brief" },
            ]}
            icon="code"
          />
        </div>
      </section>

      <section className="cta-band">
        <div className="container cta-band-inner">
          <div>
            <span className="eyebrow eyebrow--dark">Redo?</span>
            <h2>Er nya hemsida kan vara live om tre veckor.</h2>
            <p>Välj paket nu, ingen betalning förrän ni godkänt priset.</p>
          </div>
          <a href="#paket" className="btn btn-primary" data-magnetic>
            Välj paket
            <Icon name="arrow" strokeWidth={2} />
          </a>
        </div>
      </section>
    </>
  );
}
