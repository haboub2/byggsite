import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import PageHero from "@/components/PageHero";
import Photo from "@/components/Photo";
import Reveal from "@/components/Reveal";
import { Icon } from "@/components/Icons";
import { Stats, CtaBand, Checklist, SectionHead } from "@/components/Sections";
import { services } from "@/lib/placeholder";
import { SIDES } from "@/lib/sides";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { getPublishedProject, listPublishedProjects, resolve } from "@/lib/projects";

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
  const before = resolve(p.before);
  const after = resolve(p.after);
  const gallery = p.gallery.map(resolve).filter((g) => g !== null);
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

      {before && after && (
        <section className="sec">
          <div className="container">
            <SectionHead eyebrow="Före och efter" title="Samma rum, två veckor isär." aside="Före till vänster, efter till höger." />
            <div className="work work--2">
              <Reveal>
                <Photo src={before.url} alt={before.alt} ratio="4 / 3" sizes="(max-width: 580px) 100vw, 50vw" />
                <span className="work-tag">Före</span>
              </Reveal>
              <Reveal>
                <Photo src={after.url} alt={after.alt} ratio="4 / 3" sizes="(max-width: 580px) 100vw, 50vw" />
                <span className="work-tag">Efter</span>
              </Reveal>
            </div>
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

      {gallery.length > 0 && (
        <section className="sec">
          <div className="container">
            <SectionHead eyebrow="Bilder" title="Från bygget." />
            <div className="work reveal-group">
              {gallery.map((g) => (
                <Reveal key={g.url}>
                  <Photo src={g.url} alt={g.alt} ratio="4 / 3" sizes="(max-width: 580px) 100vw, (max-width: 900px) 50vw, 33vw" />
                </Reveal>
              ))}
            </div>
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
