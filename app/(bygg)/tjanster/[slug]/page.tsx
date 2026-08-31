import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Reveal from "@/components/Reveal";
import { Icon } from "@/components/Icons";
import JsonLd from "@/components/JsonLd";
import { serviceJsonLd, faqJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { services } from "@/lib/placeholder";
import { servicesContent } from "@/lib/services-content";

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const svc = services.find((s) => s.slug === slug);
  if (!svc) return {};
  return {
    title: `${svc.title} i Halmstad`,
    description: svc.desc,
    alternates: { canonical: `/tjanster/${slug}` },
  };
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const svc = services.find((s) => s.slug === slug);
  const content = servicesContent[slug];
  if (!svc || !content) notFound();

  const offertHref = `/offert?tjanst=${encodeURIComponent(svc.title)}`;

  return (
    <>
      <JsonLd
        data={[
          serviceJsonLd({ slug, title: svc.title, description: svc.desc }),
          faqJsonLd(content.faq),
          breadcrumbJsonLd([
            { name: "Hem", path: "/bygg" },
            { name: "Tjänster", path: "/tjanster" },
            { name: svc.title, path: `/tjanster/${slug}` },
          ]),
        ]}
      />

      <section className="service-hero">
        <div className="container">
          <Reveal className="service-crumbs" as="nav">
            <Link href="/tjanster">Tjänster</Link>
            <span>/</span>
            <span>{svc.title}</span>
          </Reveal>
          <Reveal variant="up">
            <div className="service-icon" style={{ marginBottom: 8 }}>
              <Icon name={slug} />
            </div>
            <h1>{svc.title} i Halmstad</h1>
            <p className="lead">{content.lead}</p>
            <div className="service-cta-row">
              <Link href={offertHref} className="btn btn-primary">
                Begär offert för {svc.title.toLowerCase()}
              </Link>
              <Link href="/projekt" className="btn btn-ghost">
                Se exempel på projekt
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container service-article">
          {content.sections.map((s) => (
            <Reveal as="section" key={s.heading}>
              <h2>{s.heading}</h2>
              <p>{s.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section section--alt">
        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">Vanliga frågor</span>
            <h2>Frågor om {svc.title.toLowerCase()}</h2>
          </Reveal>
          <div className="faq-list reveal-group">
            {content.faq.map((item) => (
              <Reveal as="details" key={item.q} className="faq-item">
                <summary>{item.q}</summary>
                <div className="faq-body">
                  <p>{item.a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Reveal as="section" className="cta-banner">
        <div className="container cta-inner">
          <h2>Redo att komma igång med {svc.title.toLowerCase()}?</h2>
          <p>Kostnadsfri offert utan förpliktelser, svar inom 24 timmar.</p>
          <Link href={offertHref} className="btn btn-dark">
            Begär en offert
          </Link>
        </div>
      </Reveal>
    </>
  );
}
