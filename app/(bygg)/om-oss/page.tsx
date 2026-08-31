import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = {
  title: "Om oss",
  description:
    "Byggly 01 — ett företag, två grenar. Byggly bygger och renoverar; 01 bygger mjukvaran.",
  alternates: { canonical: "/om-oss" },
};

export default function OmOss() {
  return (
    <ComingSoon
      eyebrow="Om oss"
      title="Ett företag, två grenar"
      body="Byggly är byggsidan, 01 är mjukvarusidan — samma bolag, samma hantverkstänk. Team, org.nr (tillkommer), F-skatt, ansvarsförsäkring och ID06 presenteras här i nästa fas."
    />
  );
}
