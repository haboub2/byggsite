import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/PageHero";
import LegalDoc, { LegalSection, LegalTable } from "@/components/LegalDoc";
import { pageMetadata } from "@/lib/seo";
import { getContent } from "@/lib/content/store";
import { PRODUCT_NAME } from "@/lib/product";
import { API_LOG_RETENTION_DAYS } from "@/lib/api/request-log";
import { TERMS_DATE, TERMS_VERSION } from "@/lib/core/org/registration";

/*
 * UTKAST FÖR JURIDISK GRANSKNING.
 *
 * Integritetspolicyn för webbplatsen och produkten (docs/juridisk-
 * granskning-2026-10-31.md, avsnitt 7, H2 och M4). Texten är skriven som ett
 * färdigt dokument, men en jurist ska granska den innan produkten säljs till
 * företag utanför Binaafy. Den beskriver koden som den är: formulären
 * (lib/lead-handler.ts sparar ingen IP-adress), registreringen (0033 sparar
 * IP:n), krypteringen (0023, 0024, 0035), API-loggen (lib/api/request-log.ts)
 * och cookiebannern (components/CookieConsent.tsx, components/Analytics.tsx).
 * Gallringstiderna i punkt 8 är de som produkten lovar; den schemalagda
 * gallringen för annat än API-loggen är inte byggd än (granskningen, M1).
 */

export const metadata: Metadata = pageMetadata({
  title: "Integritetspolicy",
  description: `Hur Binaafy behandlar personuppgifter på webbplatsen, i ${PRODUCT_NAME}, i kundportalen och i personalportalen, enligt GDPR.`,
  path: "/integritetspolicy",
  noindex: true,
});

export default async function IntegritetspolicyPage() {
  const { company } = await getContent();
  const controller = `${company.legalName}${company.orgNr ? ` (org.nr ${company.orgNr})` : ""}`;
  const address = `${company.street}, ${company.postalCode} ${company.city}`;

  return (
    <>
      <PageHero
        crumbs={[{ label: "Integritetspolicy" }]}
        eyebrow="Integritet"
        title="Integritetspolicy"
        lead={`Så behandlar Binaafy personuppgifter på webbplatsen binaafy.se, i ${PRODUCT_NAME}, i kundportalen Mitt projekt och i personalportalen Min tid, enligt EU:s dataskyddsförordning (GDPR).`}
      />
      <section className="sec">
        <div className="container">
          <LegalDoc
            version={TERMS_VERSION}
            date={TERMS_DATE}
            intro={
              <>
                {controller}, {address} (nedan &quot;Binaafy&quot;, &quot;vi&quot;) är personuppgiftsansvarig för de behandlingar som beskrivs i punkterna
                1, 2 och 9. För uppgifter som andra företag lägger in i {PRODUCT_NAME} är det företaget personuppgiftsansvarigt och Binaafy
                personuppgiftsbiträde (punkterna 3–6). Frågor om policyn och om dina uppgifter skickas till{" "}
                <a href={`mailto:${company.email}`}>{company.email}</a>.
              </>
            }
          >
            <LegalSection n={1} title="Webbplatsens formulär">
              <p>
                Via formulären för offertförfrågan, kontakt och brief samlar vi in namn, telefonnummer, e-postadress och det du själv skriver om ditt
                projekt (typ av tjänst, budget, tidsram, meddelande). Vi sparar också vilken sida du skickade formuläret från, varifrån du kom till
                webbplatsen och eventuella kampanjparametrar (UTM) i adressen, för att förstå varifrån förfrågningar kommer. Din IP-adress används bara
                i stunden för att begränsa antalet formulär som kan skickas från samma adress; den sparas inte med förfrågan.
              </p>
              <p>
                Ändamålet är att besvara din förfrågan, ta fram en offert och, om du beställer, fullgöra avtalet. Den rättsliga grunden är att
                behandlingen är nödvändig för att vidta åtgärder på din begäran innan ett avtal ingås och för att fullgöra avtalet (artikel 6.1 b), samt
                vårt berättigade intresse av att följa upp förfrågningar och förstå var de kommer ifrån (artikel 6.1 f). Kryssrutan i formuläret är en
                bekräftelse på att du har tagit del av den här policyn, inte ett samtycke; vi sparar tidpunkten när du kryssade i den.
              </p>
            </LegalSection>

            <LegalSection n={2} title={`Användare i ${PRODUCT_NAME}`}>
              <p>
                När ett företag registrerar sig i {PRODUCT_NAME} och när en användare bjuds in till ett företags konto behandlar vi användarens namn,
                e-postadress, roll och organisation, tidpunkter för inloggning och för inloggningslänkar och koder, de API-nycklar och webhooks
                användaren skapar (nyckeln sparas som ett hashvärde och visas en gång) samt loggboken över vad användaren gör i kontot (till exempel
                &quot;utfärdade faktura 1042&quot;). Vid registreringen sparar vi också vilken version av användarvillkoren och
                personuppgiftsbiträdesavtalet som godkändes, när, och IP-adressen som skickade registreringen, för att kunna visa vad som godkändes och
                förhindra missbruk.
              </p>
              <p>
                För dessa uppgifter är Binaafy personuppgiftsansvarig. Ändamålet är att tillhandahålla kontot, logga in användaren säkert, kunna visa
                företaget vem som gjorde vad och kunna visa vilket avtal företaget ingick. Rättslig grund är avtalet med företaget (artikel 6.1 b, när
                användaren är företagets företrädare) och vårt och företagets berättigade intresse av säker inloggning och spårbarhet (artikel 6.1 f).
                Vi skickar inte marknadsföring till användare utan samtycke, med undantag för driftmeddelanden och ändringar av villkoren som vi är
                skyldiga att meddela.
              </p>
            </LegalSection>

            <LegalSection n={3} title="Uppgifter som företag lägger in i produkten">
              <p>
                De företag som använder {PRODUCT_NAME} lägger in uppgifter om sina kunder (namn, kontaktuppgifter, fakturor, betalningar, offerter,
                projekt), sin personal (namn, personnummer, adress, bankkonto, anställning, lön, tid, frånvaro, utlägg, lönebesked, intyg, avtal) och
                sina portalanvändare. För dessa uppgifter är företaget personuppgiftsansvarigt och Binaafy personuppgiftsbiträde. Vi behandlar dem bara
                enligt företagets instruktioner, det vill säga genom produktens funktioner, och enligt det{" "}
                <Link href="/personuppgiftsbitradesavtal">personuppgiftsbiträdesavtal</Link> som varje företag godkänner vid registreringen.
                Biträdesavtalet anger vilka kategorier av uppgifter det gäller, hur de skyddas, vilka underleverantörer som används och vad som händer
                när avtalet upphör.
              </p>
              <p>
                Är du anställd hos, kund till eller leverantör åt ett företag som använder produkten vänder du dig till det företaget för att utöva dina
                rättigheter (punkt 10): det är din arbetsgivare eller avtalspart som avgör vad som ska rättas, raderas eller lämnas ut. Hör du av dig
                till oss vidarebefordrar vi din begäran till företaget och berättar det för dig.
              </p>
            </LegalSection>

            <LegalSection n={4} title="Kundportalen Mitt projekt">
              <p>
                I kundportalen följer ett byggföretags kunder sitt projekt: tidplan, foton, dokument, ändringar och fakturor. Portalanvändaren bjuds in av
                företaget med sin e-postadress och loggar in med en engångskod eller länk. Vi behandlar e-postadress, namn, inloggningstillfällen, de
                projekt personen är inbjuden till och det personen godkänner eller skriver i portalen. Det företag som driver projektet är
                personuppgiftsansvarigt för portalens innehåll och Binaafy är biträde enligt punkt 3. Personnummer och fastighetsbeteckningar som lämnats
                för ROT visas aldrig i portalen.
              </p>
            </LegalSection>

            <LegalSection n={5} title="Personalportalen Min tid">
              <p>
                I Min tid stämplar en anställd in och ut på projekt, rapporterar tid och frånvaro, svarar på pass, lämnar utlägg med kvitton och läser
                sina lönebesked, arbetsgivarintyg och signerade dokument. Uppgifterna hör till arbetsgivarens personal- och löneadministration;
                arbetsgivaren är personuppgiftsansvarig och Binaafy biträde enligt punkt 3. Stämpelklockan sparar tidpunkt och projekt, inte var du befinner
                dig; portalen använder ingen platsinformation. Frånvaro på grund av sjukdom och vård av barn är uppgifter om hälsa; arbetsgivaren behandlar
                dem för att betala sjuklön och lämna uppgifter till Försäkringskassan och Skatteverket, och bara ägare, administratör och
                redovisningskonsult hos arbetsgivaren ser dem.
              </p>
            </LegalSection>

            <LegalSection n={6} title="ROT-avdrag: personnummer och fastighetsbeteckning">
              <p>
                När ett byggföretag fakturerar med ROT-avdrag anger köparen personnummer och fastighetsbeteckning (eller bostadsrättsföreningens
                organisationsnummer och lägenhetsnummer). Ändamålet är att företaget ska kunna begära skattereduktion hos Skatteverket enligt 67 kap.
                inkomstskattelagen; uppgifterna är de Skatteverket kräver i begäran. Personnumret lagras krypterat i databasen och i fakturadokumentet, visas
                maskerat (ÅÅÅÅMMDD-XXXX) i produkten, i API:t, i PDF-dokumenten och i kundportalen, och kan bara öppnas i klartext av företagets ägare
                eller administratör när begäran till Skatteverket skapas; varje sådan öppning loggas. Uppgifterna hör till fakturan och sparas med
                bokföringen i sju år efter räkenskapsårets slut.
              </p>
            </LegalSection>

            <LegalSection n={7} title="Underleverantörer och var uppgifterna behandlas">
              <p>
                Uppgifterna lagras i EU hos vår databasleverantör Supabase (databas, inloggning, fillagring, nyckelvalv). Webbplatsen och produkten körs
                hos Vercel, med Netlify som alternativ driftmiljö. E-post från webbplatsen och produkten (inloggningslänkar, fakturor, påminnelser,
                aviseringar) skickas via Resend. Besöksstatistik på webbplatsen kommer från Vercel Web Analytics och, efter samtycke, Google Analytics
                (punkt 9). Leverantörerna är personuppgiftsbiträden till oss under skriftliga biträdesavtal och behandlar uppgifterna bara för att leverera
                sin tjänst. Vi säljer aldrig personuppgifter.
              </p>
              <p>
                Resend, Vercel, Netlify och Google är amerikanska bolag. Överföring till USA sker med stöd av EU-kommissionens beslut om adekvat
                skyddsnivå för mottagare certifierade under EU–US Data Privacy Framework och, som komplement, EU-kommissionens standardavtalsklausuler.
                Den fullständiga listan med plats för behandlingen och överföringsmekanism per leverantör finns i bilaga 1 till{" "}
                <Link href="/personuppgiftsbitradesavtal">personuppgiftsbiträdesavtalet</Link>.
              </p>
            </LegalSection>

            <LegalSection n={8} title="Hur länge uppgifterna sparas">
              <LegalTable
                caption="Gallringstider"
                head={["Uppgifter", "Sparas", "Grund"]}
                rows={[
                  ["Förfrågningar via webbplatsens formulär som inte leder till ett uppdrag", "24 månader från förfrågan", "Uppföljning; berättigat intresse"],
                  ["Offerter som inte leder till en beställning", "24 månader från offertens datum", "Uppföljning; berättigat intresse"],
                  [
                    "Fakturor, betalningar, lönebesked, arbetsgivardeklarationer, tidrapporter och annat som ligger till grund för bokföringen",
                    "7 år efter utgången av det räkenskapsår de hör till",
                    "Bokföringslagen 7 kap.; skatteförfarandelagen",
                  ],
                  [
                    "Personalakter: anställningsavtal, anställningsversioner, skatteuppgifter, intyg, frånvaro",
                    "Till 7 år efter att anställningen upphört",
                    "Bokföringslagen; arbetsrättsliga krav och möjliga anspråk",
                  ],
                  ["Konto i produkten: namn, e-post, roll, loggbok", "Så länge kontot finns och därefter 90 dagar för export (villkoren punkt 11)", "Avtalet"],
                  ["Registrering: godkänd villkorsversion, tidpunkt, IP-adress", "Så länge företagets konto finns", "Kunna visa vilket avtal som ingicks"],
                  ["API-logg (metod, sökväg, status, svarstid)", `${API_LOG_RETENTION_DAYS} dagar`, "Felsökning och missbruksskydd; berättigat intresse"],
                  ["Ditt cookieval", "I din webbläsares localStorage tills du rensar den eller ändrar valet", "Komma ihåg valet"],
                ]}
              />
              <p>
                När tiden gått ut raderas uppgifterna eller avidentifieras så att de inte längre kan knytas till en person. Ett företag som lämnar
                produkten kan exportera alla sina uppgifter under 90 dagar; därefter raderar vi dem (personuppgiftsbiträdesavtalet punkt 11), och
                företaget ansvarar självt för att bevara det bokföringslagen kräver.
              </p>
            </LegalSection>

            <LegalSection n={9} title="Cookies och besöksstatistik">
              <p>
                Webbplatsen sätter inga spårningscookies utan ditt val. För besöksstatistik används alltid Vercel Web Analytics, som inte sätter några
                cookies och bara samlar in sammanställd, anonymiserad statistik (vilka sidor som besöks, från vilket land, vilken typ av enhet).
              </p>
              <p>
                Google Analytics 4 laddas bara om du väljer &quot;Godkänn analys&quot; i cookiebannern. Då sätter Google cookies (_ga och _ga_*) som
                känner igen din webbläsare mellan besök, och uppgifter om dina sidvisningar skickas till Google. Rättslig grund är ditt samtycke (artikel
                6.1 a och lagen om elektronisk kommunikation 9 kap. 28 §). Väljer du &quot;Endast nödvändiga&quot; laddas Google Analytics inte. Ditt
                val sparas i webbläsarens localStorage under nyckeln binaafy-cookie-consent och inte i någon databas hos oss.
              </p>
              <p>
                Du kan när som helst ändra eller återkalla ditt val via länken Cookieinställningar längst ner på varje sida; då visas bannern igen.
                Återkallar du samtycket slutar Google Analytics laddas från och med nästa sidvisning; cookies som redan satts kan du ta bort i
                webbläsarens inställningar. Inloggningen i produkten och portalerna använder nödvändiga cookies för sessionen, som inte kräver samtycke.
              </p>
            </LegalSection>

            <LegalSection n={10} title="Dina rättigheter och kontakt">
              <p>
                Du har rätt att få tillgång till de personuppgifter vi har om dig (registerutdrag), att få felaktiga uppgifter rättade, att få uppgifter
                raderade när de inte längre behövs för ändamålet eller när du återkallar ett samtycke, att begära att behandlingen begränsas, att få ut
                uppgifter du lämnat i ett maskinläsbart format (dataportabilitet) och att invända mot behandling som grundas på berättigat intresse. För
                uppgifter som ett annat företag lagt in i produkten vänder du dig till det företaget (punkt 3); vi hjälper det företaget att svara.
              </p>
              <p>
                Kontakta oss på <a href={`mailto:${company.email}`}>{company.email}</a> eller {company.legalName}, {address}. Vi svarar inom en månad.
                Anser du att vi behandlar dina uppgifter felaktigt har du rätt att lämna in ett klagomål till Integritetsskyddsmyndigheten (IMY),
                Box 8114, 104 20 Stockholm, imy@imy.se, www.imy.se.
              </p>
              <p>
                Ändrar vi policyn väsentligt uppdaterar vi versionen och datumet överst och meddelar registrerade användare i produkten via e-post.
              </p>
            </LegalSection>
          </LegalDoc>
        </div>
      </section>
    </>
  );
}
