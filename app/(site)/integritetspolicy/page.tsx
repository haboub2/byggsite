import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import { pageMetadata } from "@/lib/seo";
import Reveal from "@/components/Reveal";
import { getContent } from "@/lib/content/store";

export const metadata: Metadata = pageMetadata({
  title: "Integritetspolicy",
  description: "Hur Binaafy samlar in, använder och skyddar personuppgifter från webbplatsens formulär, enligt GDPR.",
  path: "/integritetspolicy",
  noindex: true,
});

const sections = (email: string) => [
  {
    heading: "Personuppgiftsansvarig",
    body: `Binaafy (nedan "vi", "oss") är personuppgiftsansvarig för de personuppgifter som samlas in via binaafy.se. Frågor om denna policy eller dina personuppgifter skickas till ${email}.`,
  },
  {
    heading: "Vilka uppgifter vi samlar in",
    body: "Via formulären för offertförfrågan, kontakt och brief samlar vi in namn, telefonnummer, e-postadress och den information du själv skriver om ditt projekt (t.ex. typ av tjänst, budget, tidsram och meddelande). Vi samlar även in tekniska uppgifter som IP-adress, sidan du kom ifrån och eventuella UTM-parametrar, i syfte att förstå varifrån förfrågningar kommer.",
  },
  {
    heading: "Varför vi behandlar uppgifterna",
    body: "Uppgifterna används för att kunna besvara din förfrågan, ta fram en offert, och i förekommande fall fullfölja ett avtal om utfört arbete. Den rättsliga grunden är antingen ditt samtycke (när du skickar in ett formulär) eller vårt berättigade intresse av att kunna hantera förfrågningar och affärsrelationer effektivt.",
  },
  {
    heading: "Hur länge uppgifterna sparas",
    body: "Förfrågningar som inte leder till ett uppdrag sparas i upp till 24 månader för uppföljning, och raderas därefter. Uppgifter kopplade till ett genomfört uppdrag sparas så länge som krävs enligt bokföringslagen och andra tillämpliga lagkrav, normalt sju år.",
  },
  {
    heading: "Vem som har tillgång till uppgifterna",
    body: "Uppgifterna hanteras av behörig personal hos Binaafy och lagras hos våra tekniska leverantörer (databas- och e-posttjänster) som agerar personuppgiftsbiträden under skriftligt biträdesavtal. Vi säljer aldrig dina uppgifter vidare till tredje part.",
  },
  {
    heading: "Dina rättigheter",
    body: "Du har rätt att begära ett registerutdrag över vilka uppgifter vi har om dig, rätt att få felaktiga uppgifter rättade, rätt att begära radering, och rätt att invända mot behandling som baseras på berättigat intresse. Kontakta oss på e-postadressen ovan för att utöva någon av dessa rättigheter. Du har också rätt att klaga till Integritetsskyddsmyndigheten (IMY) om du anser att vi behandlar dina uppgifter felaktigt.",
  },
  {
    heading: "Cookies",
    body: "Webbplatsen använder i dagsläget inga spårningscookies. Om analysverktyg (t.ex. Google Analytics) aktiveras i framtiden kommer det föregås av ett samtyckesbanner där du aktivt kan välja bort icke-nödvändig spårning, och den här policyn uppdateras i samband med det.",
  },
];

export default async function IntegritetspolicyPage() {
  const { company } = await getContent();
  return (
    <>
      <PageHero
        crumbs={[{ label: "Integritetspolicy" }]}
        eyebrow="Integritet"
        title="Integritetspolicy"
        lead="Så samlar Binaafy in, använder och skyddar personuppgifter som lämnas via webbplatsens formulär, i enlighet med EU:s dataskyddsförordning (GDPR)."
      />
      <section className="sec">
        <div className="container">
          <div className="article-sections" style={{ maxWidth: 860 }}>
            {sections(company.email).map((s, i) => (
              <Reveal as="section" key={s.heading}>
                <span className="n">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h2>{s.heading}</h2>
                  <p>{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
