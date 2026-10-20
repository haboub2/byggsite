import ContentPage from "@/components/admin/content/ContentPage";
import QuoteSettingsEditor from "@/components/admin/content/QuoteSettingsEditor";
import { getContent } from "@/lib/content/store";

export default async function QuoteSettingsPage() {
  const { quote } = await getContent();
  return (
    <ContentPage
      contentKey="quote"
      title="Offertuppgifter"
      intro="Standardtexterna för villkoren per sida, giltighetstid, försäkring och undertecknarens titel. Säljaren, betalningsuppgifterna, F-skatt, betalningsvillkoren och undertecknaren hämtas från Inställningar; tills de sparats där gäller Företaget och fälten här. Nya offerter fylls i med texterna här; i en enskild offert går allt att ändra."
      shownOn={[{ label: "Offerterna", href: "/admin/offerter" }]}
      data={quote}
    >
      {(version, lastSaved) => <QuoteSettingsEditor key={version} lastSaved={lastSaved} initial={quote} />}
    </ContentPage>
  );
}
