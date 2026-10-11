import ContentPage from "@/components/admin/content/ContentPage";
import ReviewsEditor from "@/components/admin/content/ReviewsEditor";
import { getContent } from "@/lib/content/store";

export default async function ReviewsContentPage() {
  const { reviews } = await getContent();
  return (
    <ContentPage
      contentKey="reviews"
      title="Omdömen"
      intro="Era sidor på Trustpilot, Google och Reco, med betyg och antal omdömen som ni läser av där, och utvalda citat. Siffrorna uppdateras inte av sig själva: skriv in nya när de ändras."
      shownOn={[{ label: "Omdömen", href: "/omdomen" }]}
      data={reviews}
    >
      {(version, lastSaved) => <ReviewsEditor key={version} lastSaved={lastSaved} initial={reviews} />}
    </ContentPage>
  );
}
