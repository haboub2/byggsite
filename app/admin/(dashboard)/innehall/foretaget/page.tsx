import ContentPage from "@/components/admin/content/ContentPage";
import CompanyEditor from "@/components/admin/content/CompanyEditor";
import { getContent } from "@/lib/content/store";

export default async function CompanyContentPage() {
  const { company, warranty } = await getContent();
  return (
    <ContentPage
      contentKey="company"
      title="Företaget"
      intro="Namn, adress, kontaktuppgifter, område och siffrorna under startsidornas rubrik. Ändra på ett ställe så uppdateras sidfoten, kontaktsidan, formulären, Google-data och llms.txt."
      shownOn={[
        { label: "Startsidan", href: "/" },
        { label: "Kontakt", href: "/kontakt" },
        { label: "Sidfoten", href: "/om-oss" },
      ]}
      data={company}
    >
      {(version, lastSaved) => (
        <CompanyEditor
          key={version}
          lastSaved={lastSaved}
          initial={company}
          warranty={{ bygg: warranty.bygg.short, software: warranty.software.short }}
        />
      )}
    </ContentPage>
  );
}
