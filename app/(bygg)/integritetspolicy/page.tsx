import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = {
  title: "Integritetspolicy",
  description: "Hur Byggly 01 behandlar personuppgifter från webbplatsens formulär.",
  alternates: { canonical: "/integritetspolicy" },
  robots: { index: false },
};

export default function IntegritetspolicyPage() {
  return (
    <ComingSoon
      eyebrow="Integritet"
      title="Integritetspolicy"
      body="Fullständig GDPR-text — personuppgiftsansvarig, vad formulären samlar in, rättslig grund, lagringstid och dina rättigheter — publiceras innan lansering."
    />
  );
}
