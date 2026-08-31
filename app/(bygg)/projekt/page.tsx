import type { Metadata } from "next";
import Reveal from "@/components/Reveal";
import { featuredProjects } from "@/lib/placeholder";

export const metadata: Metadata = {
  title: "Projekt",
  description: "Ett urval av bygg- och renoveringsprojekt Byggly genomfört i Halland.",
  alternates: { canonical: "/projekt" },
};

export default function ProjektIndex() {
  return (
    <section className="section">
      <div className="container">
        <Reveal className="section-head">
          <span className="eyebrow">Vårt arbete</span>
          <h2>Projekt</h2>
          <p>Riktiga projektbilder läggs in när fotograferingen är klar.</p>
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
  );
}
