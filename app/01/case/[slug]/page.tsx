import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Reveal from "@/components/Reveal";
import JsonLd from "@/components/JsonLd";
import { softwareCases } from "@/lib/software-content";
import { SITE_URL } from "@/lib/env";

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
  return {
    title: c.title,
    description: c.summary,
    alternates: { canonical: `/01/case/${slug}` },
  };
}

export default async function CasePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const c = softwareCases.find((x) => x.slug === slug);
  if (!c) notFound();

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: c.title,
          about: c.client,
          author: { "@type": "Organization", name: "01" },
          url: `${SITE_URL}/01/case/${slug}`,
        }}
      />

      <section className="service-hero">
        <div className="container">
          <Reveal className="service-crumbs" as="nav">
            <Link href="/01/case">Case</Link>
            <span>/</span>
            <span>{c.title}</span>
          </Reveal>
          <Reveal>
            <span className="eyebrow">{c.client}</span>
            <h1>{c.title}</h1>
            <p className="lead">{c.summary}</p>
          </Reveal>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="stats-strip reveal-group" style={{ maxWidth: 700, margin: "0 auto 50px" }}>
            {c.resultat.map((r) => (
              <Reveal key={r.desc}>
                <strong>{r.label}</strong>
                <span>{r.desc}</span>
              </Reveal>
            ))}
          </div>

          <div className="service-article">
            <Reveal as="section">
              <h2>Situation</h2>
              <p>{c.situation}</p>
            </Reveal>
            <Reveal as="section">
              <h2>Insats</h2>
              <p>{c.insats}</p>
            </Reveal>
            <Reveal as="section">
              <h2>Tekniken bakom</h2>
              <p>
                Byggt med {c.stack.join(", ")}. Kodbasen ägs av Byggly 01 —
                ingen inlåsning hos en extern leverantör.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <Reveal as="section" className="cta-banner">
        <div className="container cta-inner">
          <h2>Har ni ett liknande behov?</h2>
          <p>Berätta kort om läget så återkommer vi med hur vi skulle angripa det.</p>
          <Link href="/01/brief" className="btn btn-dark">
            Skicka en brief
          </Link>
        </div>
      </Reveal>
    </>
  );
}
