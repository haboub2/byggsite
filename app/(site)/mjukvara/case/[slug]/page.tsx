import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHero from "@/components/PageHero";
import JsonLd from "@/components/JsonLd";
import Lightbox from "@/components/Lightbox";
import Reveal from "@/components/Reveal";
import { Icon } from "@/components/Icons";
import { Stats, Bridge, CtaBand, SectionHead } from "@/components/Sections";
import { getPublishedCase, listPublishedCases } from "@/lib/cases";
import { SIDES } from "@/lib/sides";
import { articleJsonLd, breadcrumbJsonLd, pageMetadata, CONTENT_UPDATED } from "@/lib/seo";
import { ogImage } from "@/lib/images";

export async function generateStaticParams() {
  return (await listPublishedCases()).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const c = await getPublishedCase(slug);
  if (!c) return {};
  return pageMetadata({
    title: c.title,
    description: c.summary,
    path: `/mjukvara/case/${slug}`,
    image: c.cover?.url ?? (c.image ? ogImage(c.image) : undefined),
    type: "article",
  });
}

export default async function CasePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const c = await getPublishedCase(slug);
  if (!c) notFound();
  const cfg = SIDES.mjukvara;

  const sections = [
    c.situation && { heading: "Situationen", body: c.situation },
    c.solution && { heading: "Vad vi byggde", body: c.solution },
    c.stack.length > 0 && { heading: "Tekniken bakom", body: `Byggt med ${c.stack.join(", ")}.` },
  ].filter((s): s is { heading: string; body: string } => Boolean(s));

  return (
    <>
      <JsonLd
        data={[
          articleJsonLd({
            path: `/mjukvara/case/${slug}`,
            title: c.title,
            description: c.summary,
            published: CONTENT_UPDATED,
            image: c.cover?.url ?? (c.image ? ogImage(c.image) : undefined),
            about: c.client,
          }),
          breadcrumbJsonLd([
            { name: "Software", path: "/mjukvara" },
            { name: "Case", path: "/mjukvara/case" },
            { name: c.title, path: `/mjukvara/case/${slug}` },
          ]),
        ]}
      />
      <PageHero
        crumbs={[{ label: "Software", href: "/mjukvara" }, { label: "Case", href: "/mjukvara/case" }, { label: c.title }]}
        eyebrow={[c.tag, c.client].filter(Boolean).join(" · ")}
        title={c.title}
        lead={c.summary}
        image={c.cover ? undefined : c.image}
        imageSrc={c.cover?.url}
        imageAlt={c.cover?.alt}
        dimH="Resultat"
        caption={c.stack.join(" · ")}
      >
        {c.url && (
          <a href={c.url} target="_blank" rel="noopener noreferrer" className="link-quiet">
            Besök {c.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
          </a>
        )}
      </PageHero>

      {c.metrics.length > 0 && (
        <div className="container">
          <Stats items={c.metrics} />
        </div>
      )}

      {sections.length > 0 && (
        <section className="sec">
          <div className="container split split--sticky">
            <div className="split-aside">
              <span className="eyebrow">Caset</span>
              <h2>Från problem till system i drift.</h2>
            </div>
            <div className="article-sections">
              {sections.map((s, i) => (
                <Reveal as="section" key={s.heading}>
                  <span className="n">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h2>{s.heading}</h2>
                    <p>{s.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {c.testimonial && (
        <section className="sec on-dark">
          <div className="container">
            <figure className="quote">
              <blockquote>”{c.testimonial.quote}”</blockquote>
              <figcaption>{c.testimonial.author}</figcaption>
            </figure>
          </div>
        </section>
      )}

      {c.gallery.length > 0 && (
        <section className="sec">
          <div className="container">
            <SectionHead eyebrow="Bilder" title="Så ser det ut." />
            <Lightbox images={c.gallery} />
          </div>
        </section>
      )}

      <section className="sec sec--tight">
        <div className="container">
          <Link href="/referenser" className="link-arrow">
            Alla referenser
            <Icon name="arrow" strokeWidth={2} />
          </Link>
        </div>
      </section>

      <section className="sec sec--tight">
        <div className="container">
          <Bridge {...cfg.bridge} />
        </div>
      </section>

      <CtaBand
        eyebrow="Har ni ett liknande behov?"
        title="Bli vårt nästa case."
        body="Berätta kort om läget så återkommer vi med hur vi skulle angripa det."
        cta={cfg.cta}
      />
    </>
  );
}
