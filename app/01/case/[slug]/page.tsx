import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = {
  title: "01 — Case",
  alternates: { canonical: "/01/case" },
};

export default function CasePage() {
  return (
    <ComingSoon
      eyebrow="01 — Case"
      title="Case"
      body="Den här case-sidan byggs i nästa fas."
      backHref="/01/case"
      backLabel="Alla case"
    />
  );
}
