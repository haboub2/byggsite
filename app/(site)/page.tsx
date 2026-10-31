import type { Metadata } from "next";
import Landing from "@/components/Landing";
import JsonLd from "@/components/JsonLd";
import { businessJsonLd, pageMetadata } from "@/lib/seo";
import { getContent } from "@/lib/content/store";

export async function generateMetadata(): Promise<Metadata> {
  const { warranty } = await getContent();
  return pageMetadata({
    title: "Binaafy — byggfirma i Göteborg, fast pris och ROT",
    absoluteTitle: true,
    description: `Byggfirma i Göteborg för renovering, badrum, kök, tillbyggnad och tak i södra och västra Sverige. Fast pris, ROT på fakturan och ${warranty.bygg.sentence}.`,
    path: "/",
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
