import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import WorkCard from "@/components/WorkCard";
import Reveal from "@/components/Reveal";
import { CtaBand } from "@/components/Sections";
import { featuredProjects } from "@/lib/placeholder";
import { SIDES } from "@/lib/sides";

export const metadata: Metadata = {
  title: "Projekt",
  description: "Ett urval av bygg- och renoveringsprojekt vi genomfört i Halland.",
  alternates: { canonical: "/bygg/projekt" },
};

export default function ProjectsIndex() {
  const cfg = SIDES.bygg;
  return (
    <>
      <PageHero
        crumbs={[{ label: "Bygg", href: "/" }, { label: "Projekt" }]}
        eyebrow="Vårt arbete"
        title="Nyligen byggt i Halland."
        lead="Ett urval av våra jobb. Före- och efterbilder läggs in efter hand som fotograferingen blir klar."
      />
      <section className="sec">
        <div className="container work reveal-group">
          {featuredProjects.map((p) => (
            <Reveal key={p.slug}>
              <WorkCard href={`/bygg/projekt/${p.slug}`} image={p.image} tag={p.tag} title={p.title} desc={p.desc} />
            </Reveal>
          ))}
        </div>
      </section>
      <CtaBand {...cfg.closing} cta={cfg.cta} />
    </>
  );
}
