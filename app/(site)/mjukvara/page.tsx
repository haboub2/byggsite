import type { Metadata } from "next";
import Landing from "@/components/Landing";
import JsonLd from "@/components/JsonLd";
import { softwareJsonLd, pageMetadata } from "@/lib/seo";
import { ogImage } from "@/lib/images";
import { getContent } from "@/lib/content/store";

export const metadata: Metadata = pageMetadata({
  title: "Webbyrå och systemutveckling i Göteborg",
  description:
    "Binaafy Software är en webbyrå och systemutvecklare i Göteborg: hemsidor till företag, kundportaler, integrationer och skräddarsydda system. Fast pris per etapp, kod ni äger.",
  path: "/mjukvara",
  image: ogImage("hero-software"),
});

export default async function SoftwareHome() {
  const { company } = await getContent();
  return (
    <>
      <JsonLd data={softwareJsonLd(company)} />
      <Landing side="mjukvara" />
    </>
  );
}
