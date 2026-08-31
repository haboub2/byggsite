import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ComingSoon from "@/components/ComingSoon";
import { featuredProjects } from "@/lib/placeholder";

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
    alternates: { canonical: `/projekt/${slug}` },
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

  return (
    <ComingSoon
      eyebrow={p.tag}
      title={p.title}
      body={`${p.desc} Före/efter-bilder, omfattning och kundomdöme fylls på i nästa fas.`}
      backHref="/projekt"
      backLabel="Alla projekt"
    />
  );
}
