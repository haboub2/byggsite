import type { Metadata } from "next";
import Landing from "@/components/Landing";
import JsonLd from "@/components/JsonLd";
import { softwareJsonLd, pageMetadata } from "@/lib/seo";
import { ogImage } from "@/lib/images";
import { getContent } from "@/lib/content/store";

export const metadata: Metadata = pageMetadata({
  title: "Webbutveckling, automation och interna system",
  description:
    "Binaafy Software bygger webbplatser, kundportaler, integrationer och interna system som tar bort dubbelarbete. Fast pris per etapp, kod ni äger.",
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
