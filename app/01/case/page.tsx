import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = {
  title: "01 — Case",
  description: "Utfallsdrivna case från 01: situation, insats, mätbart resultat.",
  alternates: { canonical: "/01/case" },
};

export default function CaseIndex() {
  return (
    <ComingSoon
      eyebrow="01 — Case"
      title="Case studies"
      body="Utfallsdrivna case — situation, insats och mätbart resultat — publiceras här. Den här sajten är 01:s första."
      backHref="/01"
      backLabel="Till 01"
    />
  );
}
