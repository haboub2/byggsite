import type { Metadata } from "next";
import Landing from "@/components/Landing";
import JsonLd from "@/components/JsonLd";
import { businessJsonLd, pageMetadata } from "@/lib/seo";
import { ogImage } from "@/lib/images";

export const metadata: Metadata = pageMetadata({
  title: "Binaafy — bygg och renovering i Halmstad",
  absoluteTitle: true,
  description:
    "Byggfirma i Halmstad: renovering, badrum, kök, tillbyggnad och tak. Ett team, en kontaktperson, fast pris, ROT-avdrag på fakturan och 5 års garanti.",
  path: "/",
  image: ogImage("hero-bygg"),
});

export default function HomePage() {
  return (
    <>
      <JsonLd data={businessJsonLd()} />
      <Landing side="bygg" />
    </>
  );
}
