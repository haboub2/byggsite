import type { Metadata } from "next";
import Landing from "@/components/Landing";
import JsonLd from "@/components/JsonLd";
import { businessJsonLd, websiteJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: "Binaafy — bygg och renovering i Halmstad" },
  description:
    "Binaafy renoverar, bygger om och bygger nytt i Halmstad med omnejd. Ett team, en kontaktperson, fast pris och 5 års garanti.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <JsonLd data={[websiteJsonLd(), businessJsonLd()]} />
      <Landing side="bygg" />
    </>
  );
}
