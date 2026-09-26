import type { Metadata } from "next";
import FormPage from "@/components/FormPage";

export const metadata: Metadata = {
  title: "Begär offert",
  description:
    "Kostnadsfri och specificerad offert på ditt bygg- eller renoveringsprojekt i Halmstad — svar inom 24 timmar.",
  alternates: { canonical: "/bygg/offert" },
};

export default async function OffertPage({
  searchParams,
}: {
  searchParams: Promise<{ tjanst?: string }>;
}) {
  const { tjanst } = await searchParams;
  return (
    <FormPage
      crumbs={[{ label: "Bygg", href: "/" }, { label: "Begär offert" }]}
      eyebrow="Kostnadsfritt och utan förpliktelser"
      title="Berätta om ditt projekt."
      lead="Två minuter i formuläret. Vi återkommer inom 24 timmar och bokar ett kostnadsfritt hembesök."
      benefits={["Specificerad offert med fast pris", "Inga dolda kostnader", "ROT-avdrag direkt på fakturan", "Svar inom en arbetsdag"]}
      variant="offert"
      defaultService={tjanst ?? ""}
    />
  );
}
