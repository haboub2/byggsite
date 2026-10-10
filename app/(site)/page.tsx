import type { Metadata } from "next";
import Landing from "@/components/Landing";
import JsonLd from "@/components/JsonLd";
import { businessJsonLd, pageMetadata } from "@/lib/seo";
import { ogImage } from "@/lib/images";
import { getContent } from "@/lib/content/store";

export async function generateMetadata(): Promise<Metadata> {
  const { warranty } = await getContent();
  return pageMetadata({
    title: "Binaafy — bygg och renovering i Halmstad",
    absoluteTitle: true,
    description: `Byggfirma i Halmstad: renovering, badrum, kök, tillbyggnad och tak. Ett team, fast pris, ROT-avdrag på fakturan och ${warranty.bygg.sentence}.`,
    path: "/",
    image: ogImage("hero-bygg"),
  });
}

export default async function HomePage() {
  const { company, warranty } = await getContent();
  return (
    <>
      <JsonLd data={businessJsonLd(company, warranty.bygg)} />
      <Landing side="bygg" />
    </>
  );
}
