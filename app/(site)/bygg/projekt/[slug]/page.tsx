import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHero from "@/components/PageHero";
import Photo from "@/components/Photo";
import { Icon } from "@/components/Icons";
import { CtaBand } from "@/components/Sections";
import { featuredProjects, services } from "@/lib/placeholder";
import { SIDES } from "@/lib/sides";

export function generateStaticParams() {
  return featuredProjects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = featuredProjects.find((x) => x.slug === slug);
  if (!p) return {};
  return {
    title: p.title,
    description: p.desc,
    alternates: { canonical: `/bygg/projekt/${slug}` },
  };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = featuredProjects.find((x) => x.slug === slug);
  if (!p) notFound();
  const svc = services.find((s) => s.slug === p.service);

  return (
    <>
      <PageHero
        crumbs={[{ label: "Bygg", href: "/" }, { label: "Projekt", href: "/bygg/projekt" }, { label: p.title }]}
        eyebrow={p.tag}
        title={p.title}
        lead={p.desc}
      >
        {svc && (
          <Link href={`/bygg/tjanster/${svc.slug}`} className="link-quiet">
            Om {svc.title.toLowerCase()}
          </Link>
        )}
      </PageHero>

      <section className="sec">
        <div className="container">
          <div className="work work--2">
            <div>
              <Photo slot={`${p.image}-fore`} ratio="4 / 3" sizes="(max-width: 580px) 100vw, 50vw" />
              <span className="work-tag">Före</span>
            </div>
            <div>
              <Photo slot={`${p.image}-efter`} ratio="4 / 3" sizes="(max-width: 580px) 100vw, 50vw" />
              <span className="work-tag">Efter</span>
            </div>
          </div>
          <p className="prose" style={{ marginTop: 32, color: "var(--ink-2)" }}>
            Omfattning, tidplan och kundens egna ord fylls på när projektet är dokumenterat.{" "}
            <Link href="/bygg/projekt" className="link-arrow">
              Alla projekt
              <Icon name="arrow" strokeWidth={2} />
            </Link>
          </p>
        </div>
      </section>

      <CtaBand {...SIDES.bygg.closing} cta={SIDES.bygg.cta} />
    </>
  );
}
