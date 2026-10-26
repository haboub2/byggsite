import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import PageHero from "@/components/PageHero";
import ProjectSpotlight from "@/components/ProjectSpotlight";
import { Icon } from "@/components/Icons";
import { Stats, CtaBand, Checklist, SectionHead } from "@/components/Sections";
import { services } from "@/lib/placeholder";
import { SIDES } from "@/lib/sides";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { getPublishedProject, listPublishedProjects, projectPhotos, resolve } from "@/lib/projects";

export async function generateStaticParams() {
  return (await listPublishedProjects()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPublishedProject(slug);
  if (!p) return {};
  const service = services.find((s) => s.slug === p.service);
  return pageMetadata({
    title: [p.title, service?.title.toLowerCase(), p.location].filter(Boolean).join(" — "),
    description: p.summary,
    path: `/bygg/projekt/${slug}`,
    image: resolve(p.cover)?.url,
    type: "article",
  });
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPublishedProject(slug);
  if (!p) notFound();

  const service = services.find((s) => s.slug === p.service);
  const cover = resolve(p.cover);
  const shots = projectPhotos(p);
  const others = (await listPublishedProjects()).map((o) => ({
    href: `/bygg/projekt/${o.slug}`,
    title: o.title,
    category: services.find((s) => s.slug === o.service)?.title ?? null,
    thumb: resolve(o.cover)!.url,
    current: o.slug === p.slug,
  }));
  const facts = [
    service && { value: service.title, label: "tjänst" },
    p.location && { value: p.location, label: "ort" },
    p.year && { value: String(p.year), label: "år" },
    p.duration && { value: p.duration, label: "byggtid" },
  ].filter((f): f is { value: string; label: string } => Boolean(f));

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Bygg", path: "/" },
          { name: "Projekt", path: "/bygg/projekt" },
          { name: p.title, path: `/bygg/projekt/${slug}` },
        ])}
      />
      <PageHero
        crumbs={[{ label: "Bygg", href: "/" }, { label: "Projekt", href: "/bygg/projekt" }, { label: p.title }]}
        eyebrow={[service?.title, p.location, p.year].filter(Boolean).join(" · ")}
        title={p.title}
        lead={p.summary}
        imageSrc={cover?.url}
        imageAlt={cover?.alt}
        caption={[p.location, p.year].filter(Boolean).join(" ")}
      >
        {service && (
          <Link href={`/bygg/tjanster/${service.slug}`} className="link-quiet">
            Om {service.title.toLowerCase()}
          </Link>
        )}
      </PageHero>

      {facts.length > 0 && (
        <div className="container">
          <Stats items={facts} />
        </div>
      )}

      {shots.photos.length > 0 && (
        <section className="sec on-dark">
          <div className="container">
            <SectionHead
              eyebrow="Bilder från jobbet"
              title={shots.beforeIndex !== null ? "Före, under och efter." : "Så blev det."}
              aside="Klicka i bildraden eller använd pilarna för att gå igenom jobbet."
            />
            <ProjectSpotlight {...shots} projects={others} />
          </div>
        </section>
      )}

      {p.scope.length > 0 && (
        <section className="sec">
          <div className="container split">
            <div className="split-aside">
              <span className="eyebrow">Det här gjorde vi</span>
              <h2>Omfattning</h2>
            </div>
            <Checklist items={p.scope} />
          </div>
        </section>
      )}

      {p.testimonial && (
        <section className="sec on-dark">
          <div className="container">
            <figure className="quote">
              <blockquote>”{p.testimonial.quote}”</blockquote>
              <figcaption>{p.testimonial.author}</figcaption>
            </figure>
          </div>
        </section>
      )}

      <section className="sec sec--tight">
        <div className="container">
          <Link href="/bygg/projekt" className="link-arrow">
            Alla projekt
            <Icon name="arrow" strokeWidth={2} />
          </Link>
        </div>
      </section>

      <CtaBand {...SIDES.bygg.closing} cta={SIDES.bygg.cta} />
    </>
  );
}
