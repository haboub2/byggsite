import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/PageHero";
import JsonLd from "@/components/JsonLd";
import Reveal from "@/components/Reveal";
import InterestForm from "@/components/InterestForm";
import { Icon } from "@/components/Icons";
import { SectionHead, Checklist } from "@/components/Sections";
import { breadcrumbJsonLd, pageMetadata, abs } from "@/lib/seo";
import { PRODUCT_NAME, PRODUCT_PATH } from "@/lib/product";
import { getContent } from "@/lib/content/store";

const DESCRIPTION =
  "Fakturering byggd för byggföretag: ROT-avdrag med filen till Skatteverket, betalplaner för större jobb, inbetalningar som prickas av automatiskt och fakturor som följer bokförings- och momslagen.";

export const metadata: Metadata = pageMetadata({
  title: `${PRODUCT_NAME} — fakturering för byggföretag`,
  description: DESCRIPTION,
  path: PRODUCT_PATH,
  // The name already says Binaafy; skip the " | Binaafy" suffix.
  absoluteTitle: true,
});

const BENEFITS = [
  {
    title: "ROT utan extraarbete",
    body: "Avdraget räknas ut på fakturan, och filen till Skatteverket skapas automatiskt.",
  },
  {
    title: "Betalplaner för större jobb",
    body: "Dela upp projektet i delbetalningar. Varje del blir en faktura när etappen är klar.",
  },
  {
    title: "Betalningar prickas av själva",
    body: "Läs in bankens fil över inbetalningar, så markeras rätt fakturor som betalda.",
  },
  {
    title: "Rätt enligt lagen",
    body: "Fakturorna följer bokförings- och momslagen. Fel rättas med kreditfaktura, aldrig genom att skriva över.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Offerten blir faktura",
    body: "När kunden har godkänt offerten blir den en faktura med en knapp. Kund, rader och ROT följer med.",
  },
  {
    n: "02",
    title: "Kunden betalar",
    body: "Fakturan mejlas med OCR-nummer och Swish-kod. Kunden ser den också i sin egen portal.",
  },
  {
    n: "03",
    title: "Allt stäms av",
    body: "Inbetalningar matchas mot fakturorna, påminnelser går ut för det som är sent och bokföringen är klar för revisorn.",
  },
];

const INCLUDED = [
  "Fakturor och offerter med era uppgifter",
  "ROT-avdrag direkt på fakturan",
  "ROT-filen till Skatteverket skapas automatiskt",
  "Betalplaner med delfakturor",
  "OCR-nummer och Swish-kod på varje faktura",
  "Inbetalningar prickas av från bankens fil",
  "Påminnelser med avgift och dröjsmålsränta",
  "Kreditfaktura och rättelser på rätt sätt",
  "Kundportal där kunden ser och betalar sina fakturor",
  "Bokföringen sköts i bakgrunden",
  "Fil till revisorn eller bokföringsprogrammet",
  "Avslutade månader låses mot ändringar",
  "E-faktura till kunder som kräver det",
  "Flera användare, även revisorn, med olika behörighet",
  "Kundernas personnummer sparas krypterat",
  "Allt kan exporteras när ni vill",
];

/** Prices are excl. VAT; the packages run for 12 months, then continue monthly. */
const PLANS = [
  {
    name: "Fakturering",
    lead: "För er som redan har en hemsida.",
    price: "490",
    setup: "Ingen uppstartsavgift",
    cta: { label: "Registrera företaget", href: "/registrera" },
    items: [
      "Offert, faktura, ÄTA och ROT",
      "Betalplaner och delfakturor",
      "Kundportal för era kunder",
      "Ingen bindningstid",
    ],
  },
  {
    name: "Start",
    lead: "Hemsida och fakturering i ett.",
    price: "1 490",
    setup: "4 900 kr i uppstart",
    featured: true,
    cta: { label: "Boka en demo", href: "#intresse" },
    items: [
      "Allt i Fakturering",
      "Hemsida med upp till 5 sidor, byggd av oss",
      "Offertformulär och referenser med bilder",
      "Drift, säkerhet och backup",
      "Live inom 3 veckor",
    ],
  },
  {
    name: "Bygg Pro",
    lead: "För er som vill ha mer hjälp.",
    price: "2 290",
    setup: "9 900 kr i uppstart",
    cta: { label: "Boka en demo", href: "#intresse" },
    items: [
      "Allt i Start",
      "Fler sidor, en per tjänst",
      "Google-företagsprofil uppsatt",
      "2 timmars ändringar i månaden",
      "Genomgång med oss varje kvartal",
    ],
  },
];

export default async function InvoicingPage() {
  const { company } = await getContent();
  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: PRODUCT_NAME,
            url: abs(PRODUCT_PATH),
            applicationCategory: "BusinessApplication",
            operatingSystem: "Webb",
            inLanguage: "sv-SE",
            description: DESCRIPTION,
            publisher: { "@id": abs("/#org") },
          },
          breadcrumbJsonLd([{ name: "Fakturering", path: PRODUCT_PATH }]),
        ]}
      />
      <PageHero
        crumbs={[{ label: "Fakturering" }]}
        eyebrow={PRODUCT_NAME}
        title="Fakturering byggd för byggföretag"
        lead="ROT, betalplaner och bankmatchning i samma verktyg, och allt lagligt rätt. Från godkänd offert till betald faktura utan att skriva något två gånger."
      >
        <Link href="/registrera" className="btn btn-primary">
          Registrera företaget
          <Icon name="arrow" strokeWidth={2} />
        </Link>
        <Link
          href="#priser"
          className="btn btn-ghost"
          style={{ color: "var(--on-dark)", borderColor: "var(--line-dark-strong)" }}
        >
          Se priser
        </Link>
      </PageHero>

      <section className="sec">
        <div className="container">
          <SectionHead
            eyebrow="Varför"
            title="Gjort för hur ett bygge faktureras"
            aside="I Word skrivs varje faktura för hand. I Fortnox är fakturan ett tillägg till bokföringen. Här börjar fakturan i jobbet ni redan har offererat."
          />
          <ul className="values reveal-group">
            {BENEFITS.map((b) => (
              <Reveal as="li" key={b.title}>
                <h3>{b.title}</h3>
                <p>{b.body}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec sec--alt" id="sa-fungerar-det">
        <div className="container">
          <SectionHead eyebrow="Så fungerar det" title="Tre steg från offert till betalt" />
          <div className="fakt-how">
            <ol className="steps steps--stack">
              {STEPS.map((s) => (
                <Reveal as="li" className="step" key={s.n}>
                  <span className="step-n">{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </Reveal>
              ))}
            </ol>
            <Reveal className="fakt-figure">
              <FlowIllustration />
            </Reveal>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="container">
          <SectionHead eyebrow="Det här ingår" title="Allt för fakturan, inget ni måste lära er" />
          <Checklist items={INCLUDED} />
        </div>
      </section>

      <section className="sec sec--alt" id="priser">
        <div className="container">
          <SectionHead
            eyebrow="Paket och priser"
            title="Ett pris. Vi har ansvaret."
            aside="Vi bygger hemsidan, sätter upp faktureringen och sköter allt efteråt: drift, säkerhet, ändringar och support. Ni ringer oss."
          />
          <div className="founder">
            <strong>De första 5 företagen: 0 kr i uppstart och 1 290 kr/mån för Start.</strong>
            <span>I gengäld får vi visa er som referens.</span>
          </div>
          <ul className="plans reveal-group">
            {PLANS.map((p) => (
              <Reveal as="li" key={p.name} className={p.featured ? "plan plan--featured" : "plan"}>
                {p.featured && <span className="plan-tag">Mest valt</span>}
                <h3>{p.name}</h3>
                <p className="plan-lead">{p.lead}</p>
                <p className="plan-price">
                  <strong>{p.price}</strong> kr/mån
                </p>
                <p className="plan-setup">{p.setup}</p>
                <Checklist items={p.items} className="plan-items" />
                <Link href={p.cta.href} className={p.featured ? "btn btn-primary btn-block" : "btn btn-ghost btn-block"}>
                  {p.cta.label}
                </Link>
              </Reveal>
            ))}
          </ul>
          <p className="plans-note">
            Alla priser exkl. moms. Start och Bygg Pro gäller i 12 månader och fortsätter sedan månad för månad. Ändringar
            utöver det som ingår kostar 700 kr/h. Domänen är er, och all data kan exporteras när ni vill.
          </p>
        </div>
      </section>

      <section className="sec" id="intresse">
        <div className="container">
          <div className="form-layout">
            <Reveal className="form-intro">
              <span className="eyebrow eyebrow--accent">Gratis demo · 20 min</span>
              <h2>Se hur det funkar för er firma</h2>
              <p>
                Berätta kort om ert företag. Vi hör av oss och visar hela vägen från offert till betald faktura. Det kostar
                inget och ni förbinder er inte till något.
              </p>
            </Reveal>
            <Reveal className="form-main">
              <InterestForm product={PRODUCT_NAME} email={company.email} />
            </Reveal>
            <Reveal className="form-aside">
              <div className="note-card">
                <span className="eyebrow">Läget</span>
                <strong>Vi använder det själva på Binaafy.</strong>
                <p>Nu vill vi veta om fler vill ha det.</p>
                <p>De första 5 företagen betalar ingen uppstart.</p>
                <p>
                  Vill ni börja direkt? <Link href="/registrera">Registrera företaget</Link> och följ startguiden.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}

/** The invoice's path: quote → invoice → paid, with the ROT share going to Skatteverket. */
function FlowIllustration() {
  const node = (x: number, y: number, title: string, sub: string, dark = false) => (
    <g className={dark ? "fakt-node fakt-node--dark" : "fakt-node"}>
      <rect x={x} y={y} width="170" height="68" rx="6" />
      <text x={x + 16} y={y + 30} className="fakt-node-title">
        {title}
      </text>
      <text x={x + 16} y={y + 50} className="fakt-node-sub">
        {sub}
      </text>
    </g>
  );
  return (
    <svg
      className="fakt-flow"
      viewBox="0 0 400 330"
      role="img"
      aria-labelledby="fakt-flow-title"
    >
      <title id="fakt-flow-title">
        Fakturans väg: godkänd offert blir faktura, kunden betalar sin del, ROT-delen begärs från Skatteverket, och allt
        hamnar i bokföringen.
      </title>
      <defs>
        <marker id="fakt-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" className="fakt-arrowhead" />
        </marker>
      </defs>

      <path d="M182 54H216" className="fakt-edge" markerEnd="url(#fakt-arrow)" />
      <path d="M305 90V164" className="fakt-edge" markerEnd="url(#fakt-arrow)" />
      <path d="M260 90C260 128 105 126 105 164" className="fakt-edge fakt-edge--rot" markerEnd="url(#fakt-arrow)" />
      <text x="104" y="112" className="fakt-edge-label">
        ROT-delen
      </text>
      <text x="314" y="132" className="fakt-edge-label">
        kundens del
      </text>
      <path d="M105 236V262" className="fakt-edge" markerEnd="url(#fakt-arrow)" />
      <path d="M305 236V268C305 278 296 284 284 284" className="fakt-edge" markerEnd="url(#fakt-arrow)" />

      {node(10, 20, "Offert", "godkänd av kunden")}
      {node(220, 20, "Faktura", "ROT, OCR, Swish")}
      {node(20, 166, "Skatteverket", "filen skapas själv")}
      {node(220, 166, "Betald", "prickad mot banken")}
      <g className="fakt-node fakt-node--dark">
        <rect x="60" y="264" width="220" height="56" rx="6" />
        <text x="76" y="297" className="fakt-node-title">
          Bokfört och klart
        </text>
      </g>
    </svg>
  );
}
