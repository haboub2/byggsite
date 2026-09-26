import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/PageHero";
import JsonLd from "@/components/JsonLd";
import Photo from "@/components/Photo";
import Reveal from "@/components/Reveal";
import { Icon } from "@/components/Icons";
import { SectionHead, CtaBand } from "@/components/Sections";
import { breadcrumbJsonLd, pageMetadata, abs } from "@/lib/seo";
import { hasImage, ogImage } from "@/lib/images";
import { team, values, trustPoints } from "@/lib/placeholder";

export const metadata: Metadata = pageMetadata({
  title: "Om Binaafy — bygg och mjukvara i Halmstad",
  description:
    "Binaafy är ett företag i Halmstad med två verksamheter: vi bygger och renoverar hem i Halland, och bygger system som tar bort dubbelarbete för företag.",
  path: "/om-oss",
  image: ogImage("about-workshop"),
});

function initials(name: string) {
  const parts = name.split(" ");
  return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

const STORY = [
  {
    heading: "Varför två verksamheter",
    body: "Vi startade som en bygg- och renoveringsfirma i Halmstad. Efter hand blev det tydligt att samma sak som gör ett bygge bra — tydlig planering, rätt verktyg, en person som tar ansvar för helheten — även löser problem som inte har med betong och kakel att göra: krångliga interna processer, manuellt dubbelarbete, system som inte pratar med varandra. Software föddes ur det, som en egen verksamhet inom samma företag.",
  },
  {
    heading: "Hur vi jobbar",
    body: "Oavsett sida gäller samma princip: en kontaktperson, ett fast pris innan arbetet startar, och en tidplan vi håller. På byggsidan tar vi helhetsansvar — egen personal plus kvalitetssäkrade underentreprenörer där det behövs. På mjukvarusidan levererar vi system i drift, inte bara demos, och står kvar efter lansering.",
  },
  {
    heading: "Legala uppgifter",
    body: "Binaafy innehar F-skattsedel, ansvarsförsäkring och ID06 för samtliga byggarbetsplatser. Organisationsnummer publiceras här så snart bolagsregistreringen är klar.",
  },
];

export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "AboutPage",
            url: abs("/om-oss"),
            about: { "@id": abs("/#org") },
            mainEntity: { "@id": abs("/#org") },
          },
          breadcrumbJsonLd([{ name: "Om oss", path: "/om-oss" }]),
        ]}
      />
      <PageHero
        crumbs={[{ label: "Om oss" }]}
        eyebrow="Om Binaafy"
        title="Ett företag. Två sätt att bygga."
        lead="Vi renoverar och bygger hem i Halmstad, och vi bygger system som driver verksamheter. Samma team, samma standard — oavsett om resultatet är ett badrum eller ett internt verktyg."
        image="about-workshop"
        dimH="Verkstad"
        caption="Hantverk och kod under samma tak"
      >
        <Link href="/" className="btn btn-primary">
          Bygg
          <Icon name="arrow" strokeWidth={2} />
        </Link>
        <Link href="/mjukvara" className="btn btn-ghost" style={{ color: "var(--on-dark)", borderColor: "var(--line-dark-strong)" }}>
          Software
          <Icon name="arrow" strokeWidth={2} />
        </Link>
      </PageHero>

      <section className="sec">
        <div className="container">
          <SectionHead eyebrow="Teamet" title="Byggingenjörer och en dataingenjör, vid samma bord." />
          <div className="team reveal-group">
            {team.map((p) => (
              <Reveal key={p.name} className="team-card">
                {hasImage(p.image) ? (
                  <Photo slot={p.image} ratio="4 / 5" sizes="(max-width: 480px) 100vw, 33vw" alt={p.name} />
                ) : (
                  <div className="monogram" aria-hidden="true">
                    {initials(p.name)}
                  </div>
                )}
                <span className="team-side">{p.division === "bygg" ? "Bygg" : "Software"}</span>
                <h3>{p.name}</h3>
                <span className="team-role">{p.role}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec--alt">
        <div className="container split split--sticky">
          <div className="split-aside">
            <span className="eyebrow">Historien</span>
            <h2>Samma hantverkstänk, två discipliner.</h2>
            <div className="trust">
              {trustPoints.map((t) => (
                <span key={t}>
                  <Icon name="check" strokeWidth={2.2} />
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="article-sections">
            {STORY.map((s, i) => (
              <Reveal as="section" key={s.heading}>
                <span className="n">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h2>{s.heading}</h2>
                  <p>
                    {s.body}
                    {i === STORY.length - 1 && (
                      <>
                        {" "}Läs mer i vår <Link href="/integritetspolicy" className="link-quiet">integritetspolicy</Link>.
                      </>
                    )}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="container">
          <SectionHead eyebrow="Värderingar" title="Det vi aldrig kompromissar med." />
          <ul className="values reveal-group">
            {values.map((v) => (
              <Reveal as="li" key={v.title}>
                <h3>{v.title}</h3>
                <p>{v.body}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <CtaBand
        eyebrow="Hör av dig"
        title="Bygg, system eller båda?"
        body="Vi svarar gärna på frågor om ett projekt, oavsett sida."
        cta={{ label: "Kontakta oss", href: "/kontakt" }}
      />
    </>
  );
}
