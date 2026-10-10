import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import WorkCard from "@/components/WorkCard";
import Reveal from "@/components/Reveal";
import { CtaBand } from "@/components/Sections";
import { services } from "@/lib/placeholder";
import { SIDES } from "@/lib/sides";
import { pageMetadata } from "@/lib/seo";
import { listPublishedProjects, resolve } from "@/lib/projects";

export async function generateMetadata(): Promise<Metadata> {
  const projects = await listPublishedProjects();
  return pageMetadata({
    title: "Projekt — bygg och renovering i Halland",
    description: "Ett urval av bygg- och renoveringsprojekt vi genomfört i Halmstad och Halland, med före- och efterbilder.",
    path: "/bygg/projekt",
    image: resolve(projects[0]?.cover ?? null)?.url,
    // Kept out of search until there is a real project to show.
    noindex: projects.length === 0,
  });
}

export default async function ProjectsIndex() {
  const projects = await listPublishedProjects();
  const cfg = SIDES.bygg;
  return (
    <>
      <PageHero
        crumbs={[{ label: "Bygg", href: "/" }, { label: "Projekt" }]}
        eyebrow="Vårt arbete"
        title="Nyligen byggt i Halland."
        lead={
          projects.length
            ? "Ett urval av våra jobb, med före- och efterbilder där vi har dem."
            : "Här visar vi snart våra projekt, med före- och efterbilder."
        }
      />
      {projects.length > 0 && (
        <section className="sec">
          <div className="container work reveal-group">
            {projects.map((p) => (
              <Reveal key={p.slug}>
                <WorkCard
                  href={`/bygg/projekt/${p.slug}`}
                  src={resolve(p.cover)?.url}
                  alt={p.cover?.alt}
                  tag={[services.find((s) => s.slug === p.service)?.title, p.location].filter(Boolean).join(" · ") || "Projekt"}
                  title={p.title}
                  desc={p.summary}
                />
              </Reveal>
            ))}
          </div>
        </section>
      )}
      <CtaBand {...cfg.closing} cta={cfg.cta} />
    </>
  );
}
