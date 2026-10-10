import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageHero from "@/components/PageHero";
import JsonLd from "@/components/JsonLd";
import Reveal from "@/components/Reveal";
import { Stats, Bridge, CtaBand } from "@/components/Sections";
import { softwareCases } from "@/lib/software-content";
import { SIDES } from "@/lib/sides";
import { articleJsonLd, breadcrumbJsonLd, pageMetadata, CONTENT_UPDATED } from "@/lib/seo";
import { ogImage } from "@/lib/images";

export function generateStaticParams() {
  return softwareCases.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const c = softwareCases.find((x) => x.slug === slug);
  if (!c) return {};
  return pageMetadata({
    title: c.title,
    description: c.summary,
    path: `/mjukvara/case/${slug}`,
    image: ogImage(c.image),
    type: "article",
  });
}

export default async function CasePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const c = softwareCases.find((x) => x.slug === slug);
  if (!c) notFound();
  const cfg = SIDES.mjukvara;

  const sections = [
    { heading: "Situation", body: c.situation },
    { heading: "Insats", body: c.insats },
    {
      heading: "Tekniken bakom",
      body: `Byggt med ${c.stack.join(", ")}. Kodbasen ägs av Binaafy — ingen inlåsning hos en extern leverantör.`,
    },
  ];

  return (
    <>
      <JsonLd
        data={[
          articleJsonLd({
            path: `/mjukvara/case/${slug}`,
            title: c.title,
            description: c.summary,
            published: CONTENT_UPDATED,
            image: ogImage(c.image),
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
        eyebrow={c.client}
        title={c.title}
        lead={c.summary}
        image={c.image}
        dimH="Resultat"
        caption={c.stack.join(" · ")}
      />

      <div className="container">
        <Stats items={c.resultat.map((r) => ({ value: r.label, label: r.desc }))} />
      </div>

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
