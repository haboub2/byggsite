import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import ServiceTemplate from "@/components/ServiceTemplate";
import { Checklist } from "@/components/Sections";
import { serviceJsonLd, faqJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { softwareAreas, softwareProcess, softwareCases } from "@/lib/software-content";

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
  return {
    title: `${area.title} — Software`,
    description: area.body,
    alternates: { canonical: `/mjukvara/tjanster/${slug}` },
  };
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

  const kase = slug === "webb" ? softwareCases[0] : undefined;
  const briefHref = `/mjukvara/brief?typ=${encodeURIComponent(area.title)}`;

  return (
    <>
      <JsonLd
        data={[
          serviceJsonLd({ path: `/mjukvara/tjanster/${slug}`, title: area.title, description: area.body, provider: "software" }),
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
        lead={area.body}
        facts={area.facts}
        included={area.included}
        includedTitle="Allt mellan första skissen och något som faktiskt används."
        steps={softwareProcess}
        related={
          kase && {
            href: `/mjukvara/case/${kase.slug}`,
            image: kase.image,
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
      </ServiceTemplate>
    </>
  );
}
