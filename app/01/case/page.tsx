import type { Metadata } from "next";
import Link from "next/link";
import Reveal from "@/components/Reveal";
import { softwareCases } from "@/lib/software-content";
import { images } from "@/lib/images";

export const metadata: Metadata = {
  title: "01 — Case",
  description: "Utfallsdrivna case från 01: situation, insats, mätbart resultat.",
  alternates: { canonical: "/01/case" },
};

export default function CaseIndex() {
  return (
    <section className="section">
      <div className="container">
        <Reveal className="section-head">
          <span className="eyebrow">01 — Case</span>
          <h2>Case studies</h2>
          <p>
            Vi är tidigt i vår resa som mjukvarubolag — den här sajten är vårt
            första publicerade case. Fler läggs till efter hand som projekt
            slutförs.
          </p>
        </Reveal>
        <div className="projects-grid reveal-group">
          {softwareCases.map((c) => (
            <Reveal
              key={c.slug}
              href={`/01/case/${c.slug}`}
              className="project-card"
            >
              <div className="project-thumb">
                <img src={images.dashboardScreen} alt={c.title} loading="lazy" />
              </div>
              <div className="project-body">
                <span className="tag">{c.client}</span>
                <h3>{c.title}</h3>
                <p>{c.summary}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 32 }}>
          <Link href="/01/brief" className="btn btn-primary">
            Bli vårt nästa case
          </Link>
        </div>
      </div>
    </section>
  );
}
