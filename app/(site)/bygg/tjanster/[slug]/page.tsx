import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import ServiceTemplate from "@/components/ServiceTemplate";
import Reveal from "@/components/Reveal";
import { serviceJsonLd, faqJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { services, processSteps, featuredProjects } from "@/lib/placeholder";
import { servicesContent, serviceExtras } from "@/lib/services-content";

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
    alternates: { canonical: `/bygg/tjanster/${slug}` },
  };
}

export default async function ByggServicePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const index = services.findIndex((s) => s.slug === slug);
  const svc = services[index];
  const content = servicesContent[slug];
  const extras = serviceExtras[slug];
  if (!svc || !content || !extras) notFound();

  const project = featuredProjects.find((p) => p.service === slug);
  const offertHref = `/bygg/offert?tjanst=${encodeURIComponent(svc.title)}`;

  return (
    <>
      <JsonLd
        data={[
          serviceJsonLd({ path: `/bygg/tjanster/${slug}`, title: svc.title, description: svc.desc, provider: "bygg" }),
          faqJsonLd(content.faq),
          breadcrumbJsonLd([
            { name: "Bygg", path: "/" },
            { name: "Tjänster", path: "/bygg/tjanster" },
            { name: svc.title, path: `/bygg/tjanster/${slug}` },
          ]),
        ]}
      />
      <ServiceTemplate
        side="bygg"
        slug={slug}
        index={index}
        total={services.length}
        title={svc.title}
        lead={content.lead}
        facts={extras.facts}
        included={extras.included}
        includedTitle={`Allt som hör till ${svc.title.toLowerCase()}, under ett ansvar.`}
        steps={processSteps}
        related={
          project && {
            href: `/bygg/projekt/${project.slug}`,
            image: project.image,
            tag: project.tag,
            title: project.title,
            desc: project.desc,
          }
        }
        faq={content.faq}
        cta={{ label: `Begär offert`, href: offertHref }}
      >
        <section className="sec">
          <div className="container split split--sticky">
            <div className="split-aside">
              <span className="eyebrow">Så arbetar vi</span>
              <h2>Det du behöver veta om {svc.title.toLowerCase()}.</h2>
            </div>
            <div className="article-sections">
              {content.sections.map((s, i) => (
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
      </ServiceTemplate>
    </>
  );
}
