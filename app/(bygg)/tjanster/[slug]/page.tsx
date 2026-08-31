import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ComingSoon from "@/components/ComingSoon";
import { services } from "@/lib/placeholder";

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
  if (!svc) notFound();

  return (
    <ComingSoon
      eyebrow="Tjänst"
      title={`${svc.title} i Halmstad`}
      body={`${svc.desc} Den fullständiga tjänstesidan med pris, tidplan och vanliga frågor byggs i nästa fas.`}
      backHref="/tjanster"
      backLabel="Alla tjänster"
    />
  );
}
