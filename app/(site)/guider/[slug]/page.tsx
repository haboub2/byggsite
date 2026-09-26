import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import PageHero from "@/components/PageHero";
import Reveal from "@/components/Reveal";
import RotCalculator from "@/components/RotCalculator";
import { Icon } from "@/components/Icons";
import { Faq, CtaBand } from "@/components/Sections";
import { presets } from "@/components/Pricing";
import { guides, guideBySlug } from "@/lib/guides";
import { articleJsonLd, breadcrumbJsonLd, faqJsonLd, pageMetadata } from "@/lib/seo";
import { ogImage } from "@/lib/images";
import { SIDES } from "@/lib/sides";

const dateSv = (iso: string) =>
  new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });

export function generateStaticParams() {
  return guides.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const g = guideBySlug(slug);
  if (!g) return {};
  return pageMetadata({
    title: g.title,
    description: g.description,
    path: `/guider/${slug}`,
    image: ogImage(g.image),
    type: "article",
  });
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const g = guideBySlug(slug);
  if (!g) notFound();
  const cfg = SIDES[g.side];

  return (
    <>
      <JsonLd
        data={[
          articleJsonLd({
            path: `/guider/${slug}`,
            title: g.title,
            description: g.description,
            published: g.published,
            modified: g.updated,
            image: ogImage(g.image),
          }),
          faqJsonLd(g.faq),
          breadcrumbJsonLd([
            { name: "Guider", path: "/guider" },
            { name: g.title, path: `/guider/${slug}` },
          ]),
        ]}
      />
      <PageHero
        crumbs={[{ label: "Guider", href: "/guider" }, { label: g.title }]}
        eyebrow={`Guide · ${g.readingMinutes} min läsning`}
        title={g.title}
        lead={g.description}
        image={g.image}
        caption={`Uppdaterad ${dateSv(g.updated)}`}
      />

      <section className="sec">
        <div className="container split split--sticky">
          <aside className="split-aside">
            <div className="guide-answer">
              <span className="eyebrow eyebrow--accent">Kort svar</span>
              <p>{g.answer}</p>
            </div>
            <p className="article-meta">
              Av {cfg.label === "Bygg" ? "Binaafy Bygg" : "Binaafy Software"} ·{" "}
              <time dateTime={g.updated}>uppdaterad {dateSv(g.updated)}</time>
            </p>
          </aside>
          <article className="guide-body">
            {g.sections.map((s, i) => (
              <Reveal as="section" key={s.heading}>
                <h2>{s.heading}</h2>
                {s.paragraphs.map((p) => (
                  <p key={p.slice(0, 40)}>{p}</p>
                ))}
                {s.list && (
                  <ul>
                    {s.list.map((li) => (
                      <li key={li.slice(0, 40)}>{li}</li>
                    ))}
                  </ul>
                )}
                {g.calculatorAfter === i && (
                  <div className="guide-calc">
                    <RotCalculator presets={presets()} />
                  </div>
                )}
              </Reveal>
            ))}
          </article>
        </div>
      </section>

      <section className="sec sec--alt">
        <div className="container split">
          <div className="split-aside">
            <span className="eyebrow">Vanliga frågor</span>
            <h2>Snabba svar</h2>
          </div>
          <Faq items={g.faq} name={`faq-${slug}`} />
        </div>
      </section>

      <section className="sec sec--tight">
        <div className="container guide-links">
          <div>
            <span className="eyebrow">Läs vidare</span>
            <ul>
              {g.related.map((r) => (
                <li key={r.href}>
                  <Link href={r.href} className="link-arrow">
                    {r.label}
                    <Icon name="arrow" strokeWidth={2} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {g.sources && (
            <div>
              <span className="eyebrow">Källor</span>
              <ul>
                {g.sources.map((s) => (
                  <li key={s.href}>
                    <a href={s.href} className="link-quiet" rel="noopener" target="_blank">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <CtaBand {...cfg.closing} cta={cfg.cta} />
    </>
  );
}
