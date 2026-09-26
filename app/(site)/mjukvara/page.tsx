import type { Metadata } from "next";
import Landing from "@/components/Landing";
import JsonLd from "@/components/JsonLd";
import { softwareJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Software — webb, automation och interna system",
  description:
    "Binaafy Software bygger webb, automation och interna verktyg som tar bort dubbelarbete. Fast pris per etapp, egen kod som ni äger.",
  alternates: { canonical: "/mjukvara" },
};

export default function SoftwareHome() {
  return (
    <>
      <JsonLd data={softwareJsonLd()} />
      <Landing side="mjukvara" />
    </>
  );
}
