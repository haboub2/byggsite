import ContentPage from "@/components/admin/content/ContentPage";
import WarrantyEditor from "@/components/admin/content/WarrantyEditor";
import { getContent } from "@/lib/content/store";
import { services } from "@/lib/placeholder";
import { softwareAreas } from "@/lib/software-content";

export default async function WarrantyContentPage() {
  const { warranty } = await getContent();
  return (
    <ContentPage
      contentKey="warranty"
      title="Garanti"
      intro="En standardgaranti för Bygg och en för Software, och en garanti för varje tjänst. Den korta formen visas i faktarutan, meningen i texterna: under Det här ingår, i processen och i vanliga frågor."
      shownOn={[
        { label: "Startsidan", href: "/" },
        { label: "Software", href: "/mjukvara" },
        { label: "Tjänstesidorna", href: "/bygg/tjanster/badrumsrenovering" },
      ]}
      data={warranty}
    >
      {(version, lastSaved) => (
        <WarrantyEditor
          key={version}
          lastSaved={lastSaved}
          initial={warranty}
          groups={[
            { side: "bygg", title: "Bygg", services: services.map((s) => ({ slug: s.slug, title: s.title })) },
            { side: "software", title: "Software", services: softwareAreas.map((a) => ({ slug: a.slug, title: a.title })) },
          ]}
        />
      )}
    </ContentPage>
  );
}
