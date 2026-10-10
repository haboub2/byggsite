import ContentPage from "@/components/admin/content/ContentPage";
import PricingEditor from "@/components/admin/content/PricingEditor";
import { getContent } from "@/lib/content/store";
import { services } from "@/lib/placeholder";

export default async function PricingContentPage() {
  const { pricing } = await getContent();
  return (
    <ContentPage
      contentKey="pricing"
      title="Priser"
      intro="Riktpris och förklaring för varje byggtjänst, och räkneexemplen i ROT-kalkylatorn. Belopp anges inklusive moms och före ROT. ROT-reglerna (30 %, högst 50 000 kr per person) ligger i koden och ändras inte här."
      shownOn={[
        { label: "Startsidan, Vad kostar det?", href: "/#priser" },
        { label: "Tjänstesidorna", href: "/bygg/tjanster/badrumsrenovering" },
        { label: "ROT-guiden", href: "/guider/rot-avdrag-2026" },
      ]}
      data={pricing}
    >
      {(version, lastSaved) => (
        <PricingEditor
          key={version}
          lastSaved={lastSaved}
          initial={pricing}
          services={services.map((s) => ({ slug: s.slug, title: s.title }))}
        />
      )}
    </ContentPage>
  );
}
