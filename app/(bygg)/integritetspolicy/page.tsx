import type { Metadata } from "next";
import Reveal from "@/components/Reveal";
import { site } from "@/lib/placeholder";

export const metadata: Metadata = {
  title: "Integritetspolicy",
  description: "Hur Byggly 01 behandlar personuppgifter från webbplatsens formulär.",
  alternates: { canonical: "/integritetspolicy" },
  robots: { index: false },
};

const SECTIONS = [
  {
    heading: "Personuppgiftsansvarig",
    body: `Byggly 01 (nedan "vi", "oss") är personuppgiftsansvarig för de personuppgifter som samlas in via byggly.se. Frågor om denna policy eller dina personuppgifter skickas till ${site.contact.email}.`,
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
    body: "Uppgifterna hanteras av behörig personal hos Byggly 01 och lagras hos våra tekniska leverantörer (databas- och e-posttjänster) som agerar personuppgiftsbiträden under skriftligt biträdesavtal. Vi säljer aldrig dina uppgifter vidare till tredje part.",
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

export default function IntegritetspolicyPage() {
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 780 }}>
        <Reveal>
          <span className="eyebrow">Integritet</span>
          <h1 style={{ fontSize: "clamp(2rem, 4.2vw, 3rem)", marginTop: 16 }}>
            Integritetspolicy
          </h1>
          <p className="lead" style={{ maxWidth: "none", marginTop: 16 }}>
            Den här sidan beskriver hur Byggly 01 samlar in, använder och
            skyddar personuppgifter som lämnas via webbplatsens formulär,
            i enlighet med EU:s dataskyddsförordning (GDPR).
          </p>
        </Reveal>

        <div className="service-article" style={{ marginTop: 40 }}>
          {SECTIONS.map((s) => (
            <Reveal as="section" key={s.heading}>
              <h2>{s.heading}</h2>
              <p>{s.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
