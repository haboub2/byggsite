import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import FormPage from "@/components/FormPage";

export const metadata: Metadata = pageMetadata({
  title: "Begär offert på bygg eller renovering i Halmstad",
  description:
    "Kostnadsfri, specificerad offert med fast pris på ditt bygg- eller renoveringsprojekt i Halmstad. Svar inom 24 timmar och kostnadsfritt hembesök.",
  path: "/bygg/offert",
});

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
