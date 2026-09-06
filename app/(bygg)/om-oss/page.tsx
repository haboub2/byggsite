import type { Metadata } from "next";
import Link from "next/link";
import Reveal from "@/components/Reveal";
import JsonLd from "@/components/JsonLd";
import TrustBadges from "@/components/TrustBadges";
import { SITE_URL } from "@/lib/env";
import { team } from "@/lib/placeholder";

function initials(name: string) {
  const parts = name.split(" ");
  return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

export const metadata: Metadata = {
  title: "Om oss",
  description:
    "Byggly 01 — ett företag, två avdelningar. Byggly bygger och renoverar hem i Halmstad; 01 bygger mjukvaran.",
  alternates: { canonical: "/om-oss" },
};

export default function OmOss() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          "@id": `${SITE_URL}/#org`,
          name: "Byggly 01",
          legalName: "Byggly 01",
          foundingDate: "2026",
          url: SITE_URL,
          department: [{ "@id": `${SITE_URL}/#business` }, { "@id": `${SITE_URL}/#software` }],
        }}
      />

      <section className="section" style={{ paddingBottom: 0 }}>
        <div className="container" style={{ maxWidth: 780 }}>
          <Reveal>
            <span className="eyebrow">Om oss</span>
            <h1 style={{ fontSize: "clamp(2rem, 4.2vw, 3rem)", marginTop: 16 }}>
              Ett företag, två avdelningar
            </h1>
            <p className="lead" style={{ maxWidth: "none", marginTop: 16 }}>
              Byggly 01 driver bygg- och renoveringsprojekt i Halmstad genom{" "}
              <strong>Byggly</strong>, och bygger digitala system genom{" "}
              <strong>01</strong>. Samma bolag, samma hantverkstänk — oavsett om
              resultatet är ett renoverat badrum eller ett internt system som
              sparar timmar varje vecka.
            </p>
            <TrustBadges />
          </Reveal>
        </div>
      </section>

      <section className="section" id="teamet">
        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">Teamet</span>
            <h2>Vilka vi är</h2>
            <p>Tre personer, en standard — oavsett om det gäller ett hus eller ett system.</p>
          </Reveal>
          <div className="team-grid reveal-group">
            {team.map((p) => (
              <Reveal as="div" key={p.name} className="team-card">
                <span className={`team-avatar team-avatar--${p.division}`} aria-hidden="true">
                  {initials(p.name)}
                </span>
                <h3>{p.name}</h3>
                <span className="team-role">{p.role}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--alt service-article">
        <div className="container service-article">
          <Reveal as="section">
            <h2>Varför två avdelningar</h2>
            <p>
              Byggly startade som en vanlig bygg- och renoveringsfirma i
              Halmstad. Efter hand blev det tydligt att samma sak som gör ett
              bygge bra — tydlig planering, rätt verktyg, en person som tar
              ansvar för helheten — även löser problem som inte har med
              betong och kakel att göra: krångliga interna processer,
              tidskrävande manuellt arbete, system som inte pratar med
              varandra. 01 föddes ur det, som en egen avdelning inom samma
              företag.
            </p>
          </Reveal>
          <Reveal as="section">
            <h2>Hur vi jobbar</h2>
            <p>
              Oavsett avdelning gäller samma princip: en kontaktperson, ett
              fast pris innan arbetet startar, och en tidplan vi håller.
              Byggly tar helhetsansvar för renoveringsprojekt — egen personal
              plus kvalitetssäkrade underentreprenörer där det behövs. 01
              bygger och levererar system i produktion, inte bara demos, och
              står kvar efter lansering.
            </p>
          </Reveal>
          <Reveal as="section">
            <h2>Legala uppgifter</h2>
            <p>
              Byggly 01 innehar F-skattsedel, ansvarsförsäkring och ID06 för
              samtliga byggarbetsplatser. Organisationsnummer publiceras här
              så snart bolagsregistreringen är klar. Fullständig legal
              information och kontaktuppgifter till personuppgiftsansvarig
              finns på vår{" "}
              <Link href="/integritetspolicy">integritetspolicy</Link>.
            </p>
          </Reveal>
        </div>
      </section>

      <Reveal as="section" className="cta-banner">
        <div className="container cta-inner">
          <h2>Vill du veta mer om ett specifikt projekt?</h2>
          <p>Vi svarar gärna på frågor om bygg, mjukvara, eller båda delarna.</p>
          <Link href="/kontakt" className="btn btn-dark">
            Kontakta oss
          </Link>
        </div>
      </Reveal>
    </>
  );
}
