import ContentPage from "@/components/admin/content/ContentPage";
import QuoteSettingsEditor from "@/components/admin/content/QuoteSettingsEditor";
import { getContent } from "@/lib/content/store";

export default async function QuoteSettingsPage() {
  const { quote } = await getContent();
  return (
    <ContentPage
      contentKey="quote"
      title="Offertuppgifter"
      intro="Det som står på varje offert utöver företagsnamn, adress och org.nr (som hämtas från Företaget): betalningsuppgifter, F-skatt, undertecknare och standardtexterna för villkoren. Nya offerter fylls i med texterna här; i en enskild offert går allt att ändra."
      shownOn={[{ label: "Offerterna", href: "/admin/offerter" }]}
      data={quote}
    >
      {(version, lastSaved) => <QuoteSettingsEditor key={version} lastSaved={lastSaved} initial={quote} />}
    </ContentPage>
  );
}
