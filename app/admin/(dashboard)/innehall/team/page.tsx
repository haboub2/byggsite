import ContentPage from "@/components/admin/content/ContentPage";
import TeamEditor from "@/components/admin/content/TeamEditor";
import { getContent } from "@/lib/content/store";

export default async function TeamContentPage() {
  const { team } = await getContent();
  return (
    <ContentPage
      contentKey="team"
      title="Team"
      intro="Personerna på Om oss: namn, roll, verksamhet och porträtt. Utan porträtt visas initialerna. Ta porträtten mot en ljus vägg med ljus från sidan, så blir de lika."
      shownOn={[{ label: "Om oss", href: "/om-oss" }]}
      data={team}
    >
      {(version, lastSaved) => <TeamEditor key={version} initial={team} lastSaved={lastSaved} />}
    </ContentPage>
  );
}
