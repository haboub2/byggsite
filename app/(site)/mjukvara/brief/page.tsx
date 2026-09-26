import type { Metadata } from "next";
import FormPage from "@/components/FormPage";

export const metadata: Metadata = {
  title: "Skicka brief — Software",
  description: "Berätta kort om projektet så återkommer vi inom två arbetsdagar med hur vi skulle angripa det.",
  alternates: { canonical: "/mjukvara/brief" },
};

export default async function BriefPage({
  searchParams,
}: {
  searchParams: Promise<{ typ?: string }>;
}) {
  const { typ } = await searchParams;
  return (
    <FormPage
      crumbs={[{ label: "Software", href: "/mjukvara" }, { label: "Skicka brief" }]}
      eyebrow="Ingen kostnad, inga förpliktelser"
      title="Vad kostar er tid idag?"
      lead="Beskriv läget: vad skaver, vilka system används idag, och vad ett bra utfall vore. Vi återkommer inom två arbetsdagar."
      benefits={["Ett konkret angreppssätt, inte en säljpitch", "Uppskattad omfattning och fast pris per etapp", "Samma personer bygger det ni köper"]}
      variant="brief"
      defaultService={typ ?? ""}
    />
  );
}
