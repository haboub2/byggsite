import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import ServiceTemplate from "@/components/ServiceTemplate";
import Reveal from "@/components/Reveal";
import { ServicePricing } from "@/components/Pricing";
import { serviceJsonLd, faqJsonLd, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { services, processSteps, featuredProjects } from "@/lib/placeholder";
import { servicesContent, serviceExtras, serviceSeo } from "@/lib/services-content";
import { hasImage, ogImage, serviceImage } from "@/lib/images";

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
  const seo = serviceSeo[slug];
  if (!svc || !seo) return {};
  return pageMetadata({
    title: seo.title,
    description: seo.description,
    path: `/bygg/tjanster/${slug}`,
    image: ogImage(serviceImage[slug]),
  });
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

  // Only link a project once it has real photos.
  const project = featuredProjects.find((p) => p.service === slug && hasImage(p.image));
  const offertHref = `/bygg/offert?tjanst=${encodeURIComponent(svc.title)}`;

  return (
    <>
      <JsonLd
        data={[
          serviceJsonLd({
            path: `/bygg/tjanster/${slug}`,
            title: serviceSeo[slug]?.title ?? svc.title,
            description: content.lead,
            provider: "bygg",
            image: ogImage(serviceImage[slug]),
          }),
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
        seoTitle={serviceSeo[slug]?.title}
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
        <ServicePricing slug={slug} />
      </ServiceTemplate>
    </>
  );
}
