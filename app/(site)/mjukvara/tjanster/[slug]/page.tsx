import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import ServiceTemplate from "@/components/ServiceTemplate";
import Reveal from "@/components/Reveal";
import { Checklist } from "@/components/Sections";
import { serviceJsonLd, faqJsonLd, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { ogImage, serviceImage } from "@/lib/images";
import { getContent } from "@/lib/content/store";
import { softwareAreas, softwareProcess } from "@/lib/software-content";
import { listPublishedCases } from "@/lib/cases";

export function generateStaticParams() {
  return softwareAreas.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const area = softwareAreas.find((a) => a.slug === slug);
  if (!area) return {};
  return pageMetadata({
    title: area.seo.title,
    description: area.seo.description,
    path: `/mjukvara/tjanster/${slug}`,
    image: ogImage(serviceImage[slug]),
  });
}

export default async function SoftwareServicePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const index = softwareAreas.findIndex((a) => a.slug === slug);
  const area = softwareAreas[index];
  if (!area) notFound();
  const [{ company }, cases] = await Promise.all([getContent(), listPublishedCases()]);

  // The first published case in this area, if there is one.
  const kase = cases.find((c) => c.area === slug);
  const briefHref = `/mjukvara/brief?typ=${encodeURIComponent(area.title)}`;

  return (
    <>
      <JsonLd
        data={[
          serviceJsonLd({
            company,
            path: `/mjukvara/tjanster/${slug}`,
            title: area.seo.title,
            description: area.body,
            provider: "software",
            image: ogImage(serviceImage[slug]),
          }),
          faqJsonLd(area.faq),
          breadcrumbJsonLd([
            { name: "Software", path: "/mjukvara" },
            { name: "Tjänster", path: "/mjukvara/tjanster" },
            { name: area.title, path: `/mjukvara/tjanster/${slug}` },
          ]),
        ]}
      />
      <ServiceTemplate
        side="mjukvara"
        slug={slug}
        index={index}
        total={softwareAreas.length}
        title={area.title}
        seoTitle={area.seo.title}
        lead={area.body}
        facts={area.facts}
        included={area.included}
        includedTitle="Allt mellan första skissen och något som faktiskt används."
        steps={softwareProcess}
        related={
          kase && {
            href: `/mjukvara/case/${kase.slug}`,
            image: kase.image,
            src: kase.cover?.url,
            tag: kase.tag,
            title: kase.title,
            desc: kase.summary,
          }
        }
        faq={area.faq}
        cta={{ label: "Skicka brief", href: briefHref }}
      >
        <section className="sec">
          <div className="container split">
            <div className="split-aside">
              <span className="eyebrow">Passar er om</span>
              <h2>Känner ni igen er?</h2>
            </div>
            <div style={{ display: "grid", gap: 28 }}>
              <Checklist items={area.fitsIf} className="incl" />
              <div className="note-card">
                <span className="eyebrow">Typiskt upplägg</span>
                <strong>{area.engagement.label}</strong>
                <p>{area.engagement.body}</p>
              </div>
            </div>
          </div>
        </section>
        <section className="sec sec--alt">
          <div className="container split split--sticky">
            <div className="split-aside">
              <span className="eyebrow">Så arbetar vi</span>
              <h2>Det ni behöver veta om {area.title.toLowerCase()}.</h2>
            </div>
            <div className="article-sections">
              {area.sections.map((s, i) => (
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
