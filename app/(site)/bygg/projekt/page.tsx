import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import WorkCard from "@/components/WorkCard";
import Reveal from "@/components/Reveal";
import { CtaBand } from "@/components/Sections";
import { featuredProjects } from "@/lib/placeholder";
import { SIDES } from "@/lib/sides";
import { pageMetadata } from "@/lib/seo";
import { projectsReady } from "@/lib/projects";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "Projekt — bygg och renovering i Halland",
    description: "Ett urval av bygg- och renoveringsprojekt vi genomfört i Halmstad och Halland, med före- och efterbilder.",
    path: "/bygg/projekt",
    // Kept out of search until the projects have real photos.
    noindex: !projectsReady(),
  });
}

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
              <WorkCard
                href={`/bygg/projekt/${p.slug}`}
                image={p.image}
                tag={p.tag}
                title={p.title}
                desc={p.desc}
                alt={`${p.title}: ${p.tag.toLowerCase()}`}
              />
            </Reveal>
          ))}
        </div>
      </section>
      <CtaBand {...cfg.closing} cta={cfg.cta} />
    </>
  );
}
