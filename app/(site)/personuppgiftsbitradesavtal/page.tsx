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
 * Personuppgiftsbiträdesavtalet enligt dataskyddsförordningen art. 28(3)
 * (docs/juridisk-granskning-2026-10-31.md, avsnitt 7, H1): Binaafy är
 * biträde, det registrerade företaget personuppgiftsansvarig. Texten är
 * skriven som ett färdigt dokument, men en jurist ska granska den innan
 * produkten säljs till företag utanför Binaafy. Säkerhetsåtgärderna i
 * punkt 7 och bilaga 2 beskriver koden som den är (0023, 0024, 0029, 0035,
 * lib/api/request-log.ts); ändras koden ska texten följa med.
 * Regionerna i bilaga 1 ska stämmas av mot de faktiska projektinställningarna
 * (docs/fakturering-checklista.md, "Supabase och Vercel i EU") innan
 * dokumentet används skarpt.
 */

export const metadata: Metadata = pageMetadata({
  title: "Personuppgiftsbiträdesavtal",
  description: `Personuppgiftsbiträdesavtal enligt GDPR art. 28 mellan ${PRODUCT_NAME}s kunder (personuppgiftsansvariga) och Binaafy (biträde).`,
  path: "/personuppgiftsbitradesavtal",
  noindex: true,
});

/** Bilaga 1. Regionen anges som "EU (se aktuell lista)" tills projektinställningarna är bekräftade. */
const SUB_PROCESSORS: { name: string; purpose: string; where: string; transfer: string }[] = [
  {
    name: "Supabase, Inc.",
    purpose: "Databas, autentisering, fillagring (dokument, kvitton, avtal) och nyckelvalv (Vault) för krypterade fält.",
    where: "EU (se aktuell lista)",
    transfer: "Behandling i vald EU-region. Supportåtkomst från tredjeland sker enligt standardavtalsklausuler.",
  },
  {
    name: "Resend, Inc.",
    purpose: "Utskick av e-post från Tjänsten: inloggningslänkar och koder, fakturor, påminnelser, inbjudningar, aviseringar.",
    where: "USA, EU",
    transfer: "EU–US Data Privacy Framework och standardavtalsklausuler.",
  },
  {
    name: "Vercel, Inc.",
    purpose: "Drift av webbplatsen och Tjänsten (servrar som kör applikationen, schemalagda jobb, Vercel Web Analytics utan cookies).",
    where: "EU (se aktuell lista)",
    transfer: "EU–US Data Privacy Framework och standardavtalsklausuler.",
  },
  {
    name: "Netlify, Inc.",
    purpose: "Alternativ driftmiljö för webbplatsen och Tjänsten (används bara när driften flyttas eller för reserv).",
    where: "EU (se aktuell lista)",
    transfer: "EU–US Data Privacy Framework och standardavtalsklausuler.",
  },
  {
    name: "Google Ireland Ltd (Google Analytics 4)",
    purpose: "Besöksstatistik på den publika webbplatsen binaafy.se, bara efter besökarens samtycke i cookiebannern. Används inte i Tjänsten.",
    where: "EU, USA",
    transfer: "EU–US Data Privacy Framework och standardavtalsklausuler.",
  },
];

export default async function PersonuppgiftsbitradesavtalPage() {
  const { company } = await getContent();
  const provider = `${company.legalName}${company.orgNr ? ` (org.nr ${company.orgNr})` : ""}`;
  const address = `${company.street}, ${company.postalCode} ${company.city}`;

  return (
    <>
      <PageHero
        crumbs={[{ label: "Personuppgiftsbiträdesavtal" }]}
        eyebrow="Juridik"
        title="Personuppgiftsbiträdesavtal"
        lead={`Avtalet enligt dataskyddsförordningen artikel 28 mellan det företag som använder ${PRODUCT_NAME} och Binaafy.`}
      />
      <section className="sec">
        <div className="container">
          <LegalDoc
            version={TERMS_VERSION}
            date={TERMS_DATE}
            intro={
              <>
                Detta personuppgiftsbiträdesavtal (nedan &quot;Biträdesavtalet&quot;) är en del av <Link href="/villkor">användarvillkoren</Link> för{" "}
                {PRODUCT_NAME} (nedan &quot;Tjänsten&quot;) och ingås mellan det företag som registrerar ett konto i Tjänsten (nedan den
                &quot;Personuppgiftsansvarige&quot;) och {provider}, {address} (nedan &quot;Biträdet&quot;). Det gäller från den dag kontot registreras och
                så länge Biträdet behandlar personuppgifter för den Personuppgiftsansvariges räkning.
              </>
            }
          >
            <LegalSection n={1} title="Bakgrund och syfte">
              <p>
                Den Personuppgiftsansvarige använder Tjänsten för fakturering, offerter, kundportal, personal, tid, lön och API. I Tjänsten lägger den
                Personuppgiftsansvarige in personuppgifter om sina kunder, sin personal och sina portalanvändare. Biträdet behandlar dessa uppgifter för
                den Personuppgiftsansvariges räkning. Biträdesavtalet uppfyller kraven i artikel 28.3 i Europaparlamentets och rådets förordning (EU)
                2016/679 (dataskyddsförordningen) och reglerar parternas skyldigheter vid behandlingen.
              </p>
              <p>
                Begreppen personuppgift, behandling, personuppgiftsansvarig, personuppgiftsbiträde, registrerad, personuppgiftsincident och
                tillsynsmyndighet har den betydelse som anges i dataskyddsförordningen. Tillsynsmyndighet för båda parter är Integritetsskyddsmyndigheten
                (IMY).
              </p>
            </LegalSection>

            <LegalSection n={2} title="Behandlingens föremål, varaktighet, art och ändamål">
              <p>
                <strong>Föremål:</strong> de personuppgifter som den Personuppgiftsansvarige lägger in i Tjänsten eller som Tjänsten skapar ur dem
                (punkt 3). <strong>Varaktighet:</strong> så länge avtalet om Tjänsten gäller och därefter den tid som behövs för återlämning och radering
                enligt punkt 11. <strong>Art:</strong> lagring, strukturering, beräkning, sammanställning till dokument (fakturor, lönebesked,
                deklarationer, intyg), utskick via e-post, utlämning via API och portaler till de mottagare den Personuppgiftsansvarige anger, kryptering,
                säkerhetskopiering och radering. <strong>Ändamål:</strong> att tillhandahålla Tjänstens funktioner till den Personuppgiftsansvarige, så
                att den kan fakturera sina kunder, begära skattereduktion (ROT), driva projekt med sina kunder, administrera sin personal, rapportera tid,
                beräkna och betala lön, lämna arbetsgivardeklaration, föra bokföring och koppla egna system via API.
              </p>
            </LegalSection>

            <LegalSection n={3} title="Kategorier av personuppgifter och registrerade">
              <LegalTable
                caption="Kategorier av registrerade och personuppgifter"
                head={["Registrerade", "Personuppgifter", "Särskilda kategorier"]}
                rows={[
                  [
                    "Den Personuppgiftsansvariges anställda och uppdragstagare",
                    "Namn, personnummer, adress, e-post, telefon, födelsedatum, bankkonto, anställningsform, lön och löneart, skatteuppgifter (tabell, jämkning), arbetad tid och stämplingar, frånvaro, utlägg och kvitton, förmåner, lönebesked, arbetsgivarintyg, anställningsavtal och andra signerade dokument, anteckningar.",
                    "Frånvaro på grund av sjukdom och vård av barn samt datum för läkarintyg är uppgifter om hälsa (art. 9). Den Personuppgiftsansvarige behandlar dem med stöd av art. 9.2 b (arbetsrätt och social trygghet).",
                  ],
                  [
                    "Den Personuppgiftsansvariges kunder och deras kontaktpersoner",
                    "Namn, adress, e-post, telefon, organisationsnummer, fakturor, betalningar, påminnelser, offerter, projekt. För ROT-avdrag: köparens personnummer och fastighetsbeteckning eller bostadsrättsförenings organisationsnummer och lägenhetsnummer.",
                    "Inga.",
                  ],
                  [
                    "Användare av kundportalen (Mitt projekt)",
                    "Namn, e-post, inloggningar, de projekt personen är inbjuden till, meddelanden och godkännanden i portalen.",
                    "Inga.",
                  ],
                  [
                    "Den Personuppgiftsansvariges användare i Tjänsten",
                    "Namn, e-post, roll, händelser i loggboken (vem gjorde vad och när), API-nycklar den Personuppgiftsansvarige skapat.",
                    "Inga. För kontouppgifterna är Biträdet självt personuppgiftsansvarig (integritetspolicyn).",
                  ],
                  [
                    "Den Personuppgiftsansvariges API-anrop",
                    "Metod, sökväg, status, svarstid, idempotensnyckel och begärande-id per anrop. Aldrig anropets innehåll, frågesträng eller nyckel.",
                    "Inga.",
                  ],
                ]}
              />
            </LegalSection>

            <LegalSection n={4} title="Biträdets skyldigheter: instruktioner">
              <p>
                Biträdet behandlar personuppgifterna endast enligt dokumenterade instruktioner från den Personuppgiftsansvarige. Tjänstens funktioner, så
                som de beskrivs i användarvillkoren, dokumentationen och Tjänsten själv, utgör den Personuppgiftsansvariges instruktioner; den
                Personuppgiftsansvarige ger instruktionerna genom att använda funktionerna (till exempel att utfärda en faktura, skicka ett lönebesked,
                bjuda in en portalanvändare eller skapa en API-nyckel). Ytterligare instruktioner lämnas skriftligen till Biträdets kontaktadress i
                punkt 14 och ska rymmas inom Tjänstens funktioner; Biträdet får debitera skälig ersättning för instruktioner som kräver arbete utanför
                Tjänsten.
              </p>
              <p>
                Biträdet ska omedelbart informera den Personuppgiftsansvarige om Biträdet anser att en instruktion strider mot dataskyddsförordningen
                eller annan dataskyddslagstiftning. Biträdet behandlar inte uppgifterna för egna ändamål. Om unionsrätten eller svensk rätt kräver att
                Biträdet behandlar uppgifterna på annat sätt ska Biträdet underrätta den Personuppgiftsansvarige innan behandlingen sker, om inte lagen
                förbjuder det.
              </p>
              <p>
                Biträdet överför inte personuppgifter till ett land utanför EU/EES annat än enligt punkt 9.
              </p>
            </LegalSection>

            <LegalSection n={5} title="Den Personuppgiftsansvariges skyldigheter">
              <p>
                Den Personuppgiftsansvarige ansvarar för att det finns rättslig grund för behandlingen, för att de registrerade informeras enligt
                artiklarna 13 och 14, för att uppgifterna som läggs in är riktiga och inte fler än ändamålet kräver, för att hantera de registrerades
                begäranden om sina rättigheter och för att bestämma gallringstider inom de ramar Tjänsten ger. Den Personuppgiftsansvarige ansvarar för
                vilka användare, roller, portalanvändare och API-nycklar den ger tillgång till uppgifterna.
              </p>
            </LegalSection>

            <LegalSection n={6} title="Konfidentialitet">
              <p>
                Biträdet ska se till att endast personer som behöver tillgång till personuppgifterna för att fullgöra Biträdesavtalet får sådan tillgång,
                och att dessa personer har åtagit sig tystnadsplikt eller omfattas av lagstadgad tystnadsplikt. Tystnadsplikten gäller även efter att
                Biträdesavtalet har upphört. Biträdets personal får bara öppna krypterade fält (personnummer, bankkonto) när det krävs för support som den
                Personuppgiftsansvarige begärt, och varje sådan läsning skrivs i den Personuppgiftsansvariges loggbok.
              </p>
            </LegalSection>

            <LegalSection n={7} title="Säkerhetsåtgärder (artikel 32)">
              <p>
                Biträdet ska vidta de tekniska och organisatoriska åtgärder som krävs för en säkerhetsnivå som är lämplig i förhållande till risken, med
                beaktande av att Tjänsten behandlar personnummer, bankkonton och uppgifter om hälsa. Åtgärderna i Tjänsten är i dag:
              </p>
              <ul>
                <li>
                  <strong>Kryptering av de känsligaste fälten.</strong> Personnummer (ROT-köpare och personal) och personalens bankkonton lagras krypterade
                  (pgcrypto, AES-256) med nycklar som ligger i databasens nyckelvalv (Supabase Vault) och aldrig lämnar databasen. Nyckeln härleds per
                  organisation, så en kryptotext kan inte öppnas i en annan organisation.
                </li>
                <li>
                  <strong>Loggade dekrypteringar.</strong> Ett personnummer eller bankkonto kan bara öppnas i klartext av organisationens ägare eller
                  administratör, genom särskilda databasfunktioner, och varje läsning skrivs som en händelse i organisationens loggbok.
                </li>
                <li>
                  <strong>Maskering.</strong> I användargränssnittet, i API:t, i portalerna och i PDF-dokumenten visas personnummer som ÅÅÅÅMMDD-XXXX.
                  Bankkonton, adresser och anteckningar om personal lämnar aldrig API:t.
                </li>
                <li>
                  <strong>Åtkomst per organisation.</strong> Varje rad i databasen hör till en organisation och skyddas av radnivåsäkerhet (row-level
                  security): en användare, en API-nyckel eller en portalanvändare kan bara nå sin egen organisations rader.
                </li>
                <li>
                  <strong>Åtkomst per roll.</strong> Personal- och löneuppgifter läses bara av rollerna ägare, administratör och redovisningskonsult, och
                  skrivs bara av ägare och administratör; en anställd ser sina egna rader. API-nycklar har scope, och lön kräver ett eget scope som inga
                  fakturanycklar har.
                </li>
                <li>
                  <strong>Inloggning utan lösenord.</strong> Engångslänk eller engångskod till e-postadressen, med begränsad giltighetstid; ingen
                  lösenordsdatabas att läcka. Registreringar och inloggningsförsök är hastighetsbegränsade.
                </li>
                <li>
                  <strong>Kryptering under överföring.</strong> All trafik mellan användare, applikation, databas och e-posttjänst går över TLS.
                </li>
                <li>
                  <strong>Sparsam loggning.</strong> API-loggen sparar metod, sökväg, status och svarstid, aldrig anropets innehåll, frågesträng eller
                  nyckel, och gallras efter {API_LOG_RETENTION_DAYS} dagar. Webbplatsens formulär sparar inte besökarens IP-adress.
                </li>
                <li>
                  <strong>Oföränderliga dokument.</strong> Utfärdade fakturor, godkända lönebesked och signerade dokument kan inte ändras eller raderas;
                  databasen vaktar det med triggers, inte bara applikationen. Dokumentfiler lagras i privata buckets och skrivs en gång.
                </li>
                <li>
                  <strong>Spårbarhet.</strong> Varje ändring av betydelse (ny person, ny anställningsversion, godkänd lönekörning, utfärdad faktura,
                  dekryptering) blir en händelse med vem, vad och när.
                </li>
                <li>
                  <strong>Säkerhetskopior och återställning.</strong> Databasen säkerhetskopieras regelbundet hos databasleverantören i samma region som
                  databasen. Biträdets egen åtkomst till produktionsmiljön är begränsad till namngivna personer.
                </li>
              </ul>
              <p>
                Biträdet får ändra och förbättra åtgärderna så länge säkerhetsnivån inte sänks. På begäran lämnar Biträdet en aktuell beskrivning av
                åtgärderna (bilaga 2).
              </p>
            </LegalSection>

            <LegalSection n={8} title="Underbiträden">
              <p>
                Den Personuppgiftsansvarige ger Biträdet ett allmänt förhandstillstånd att anlita de underbiträden som anges i bilaga 1 och att byta ut
                eller lägga till underbiträden. Biträdet ska meddela den Personuppgiftsansvarige via e-post till kontots ägare minst trettio (30) dagar
                innan ett nytt underbiträde börjar behandla personuppgifter, med underbiträdets namn, uppgift och plats för behandlingen. Den
                Personuppgiftsansvarige får inom den tiden invända på sakliga grunder; kan parterna inte enas får den Personuppgiftsansvarige säga upp
                avtalet om Tjänsten till den dag det nya underbiträdet börjar användas, utan uppsägningstid.
              </p>
              <p>
                Biträdet ska genom skriftligt avtal ålägga varje underbiträde samma skyldigheter i fråga om dataskydd som Biträdet har enligt detta
                Biträdesavtal, särskilt om lämpliga säkerhetsåtgärder. Om ett underbiträde inte fullgör sina skyldigheter är Biträdet fullt ansvarigt
                gentemot den Personuppgiftsansvarige för underbiträdets fullgörande.
              </p>
            </LegalSection>

            <LegalSection n={9} title="Överföring till tredjeland">
              <p>
                Personuppgifterna lagras och behandlas i EU/EES. Överföring till ett land utanför EU/EES (inklusive fjärråtkomst för support från ett
                sådant land) får bara ske om den omfattas av kapitel V i dataskyddsförordningen: ett beslut om adekvat skyddsnivå från
                EU-kommissionen (för USA: mottagare certifierade under EU–US Data Privacy Framework), EU-kommissionens standardavtalsklausuler (2021/914)
                med den bedömning av mottagarlandet som klausulerna kräver, eller en annan överföringsmekanism i artikel 46. Vilken mekanism som används
                för respektive underbiträde anges i bilaga 1. Biträdet ska informera den Personuppgiftsansvarige om en mekanism upphör att gälla och då
                utan dröjsmål ersätta den eller upphöra med överföringen.
              </p>
            </LegalSection>

            <LegalSection n={10} title="Bistånd till den Personuppgiftsansvarige">
              <h3>De registrerades rättigheter</h3>
              <p>
                Biträdet ska, med hänsyn till behandlingens art och så långt det är möjligt, bistå den Personuppgiftsansvarige med lämpliga tekniska och
                organisatoriska åtgärder så att den Personuppgiftsansvarige kan fullgöra sin skyldighet att svara på begäranden om de registrerades
                rättigheter i kapitel III (tillgång, rättelse, radering, begränsning, dataportabilitet, invändning). Tjänstens funktioner för att
                visa, exportera, rätta och radera uppgifter samt den anställdes egen portal (Min tid) med lönebesked, intyg och dokument är det
                primära biståndet. En registrerad som vänder sig direkt till Biträdet hänvisas till den Personuppgiftsansvarige, och Biträdet
                underrättar den Personuppgiftsansvarige om begäran utan dröjsmål.
              </p>
              <h3>Säkerhet, incidenter, konsekvensbedömning och förhandssamråd (artiklarna 32–36)</h3>
              <p>
                Biträdet ska bistå den Personuppgiftsansvarige med att fullgöra skyldigheterna i artiklarna 32–36, med beaktande av behandlingens art och
                den information Biträdet har tillgång till. Biträdet ska underrätta den Personuppgiftsansvarige om en personuppgiftsincident som rör
                dess personuppgifter utan onödigt dröjsmål efter att Biträdet fått kännedom om den, med målet inom fyrtioåtta (48) timmar, så att den
                Personuppgiftsansvarige hinner anmäla incidenten till IMY inom 72 timmar enligt artikel 33. Underrättelsen går till kontots ägare och
                ska, så långt det är känt, beskriva incidentens art, kategorier och ungefärligt antal registrerade och uppgifter som berörs, de sannolika
                konsekvenserna, de åtgärder Biträdet vidtagit eller föreslår och en kontaktperson. Uppgifter som inte är kända vid underrättelsen lämnas
                så snart de blir kända. Biträdet dokumenterar alla incidenter och bistår vid en konsekvensbedömning eller ett förhandssamråd som gäller
                Tjänsten med den information om behandlingen som Biträdet har.
              </p>
            </LegalSection>

            <LegalSection n={11} title="Radering och återlämning">
              <p>
                När avtalet om Tjänsten har upphört kan den Personuppgiftsansvarige under nittio (90) dagar exportera alla sina personuppgifter ur
                Tjänsten (CSV, JSON, SIE och PDF). Därefter raderar Biträdet personuppgifterna och befintliga kopior, inklusive säkerhetskopior inom
                den tid de roterar, och bekräftar raderingen skriftligen på begäran. Undantag gäller för uppgifter som Biträdet enligt unionsrätten eller
                svensk rätt måste bevara (till exempel Biträdets egen bokföring av avtalet) och för händelser i Biträdets drift- och säkerhetsloggar som inte
                går att skilja ut per organisation; dessa gallras enligt sina egna tider. Den Personuppgiftsansvarige ansvarar själv för att bevara det
                som bokföringslagen och arbetsrätten kräver.
              </p>
              <p>
                Under avtalstiden raderar Biträdet uppgifter när den Personuppgiftsansvarige gör det i Tjänsten, med de begränsningar som följer av att
                utfärdade fakturor, godkända lönebesked och signerade dokument inte kan raderas; sådana handlingar gallras när den Personuppgiftsansvariges
                lagstadgade bevarandetid gått ut.
              </p>
            </LegalSection>

            <LegalSection n={12} title="Granskning och information">
              <p>
                Biträdet ska ge den Personuppgiftsansvarige tillgång till all information som krävs för att visa att skyldigheterna i artikel 28 har
                fullgjorts, i första hand genom denna text, bilagorna, Tjänstens dokumentation och loggbok samt på begäran en skriftlig redogörelse. Den
                Personuppgiftsansvarige, eller en oberoende revisor som den utser och som Biträdet inte har sakliga skäl att avvisa, får granska Biträdets
                behandling högst en gång per tolv (12) månader, efter skriftlig begäran minst trettio (30) dagar i förväg, under kontorstid och utan att
                andra kunders uppgifter röjs. Visar granskningen brister avhjälper Biträdet dem; annars står den Personuppgiftsansvarige för
                granskningens kostnader. Krav från IMY på granskning tillgodoses alltid.
              </p>
            </LegalSection>

            <LegalSection n={13} title="Ansvar och avtalstid">
              <p>
                För ansvar mellan parterna gäller ansvarsbegränsningen i användarvillkoren (punkt 10), i den mån den inte strider mot artikel 82 i
                dataskyddsförordningen. Biträdesavtalet gäller så länge Biträdet behandlar personuppgifter för den Personuppgiftsansvariges räkning och
                upphör när raderingen enligt punkt 11 är genomförd. Ändringar av Biträdesavtalet meddelas enligt användarvillkorens punkt 12. Vid motstrid
                mellan Biträdesavtalet och användarvillkoren gäller Biträdesavtalet i frågor om personuppgifter.
              </p>
            </LegalSection>

            <LegalSection n={14} title="Kontakt">
              <p>
                Instruktioner, invändningar mot underbiträden, begäran om granskning och frågor om Biträdesavtalet lämnas till {company.legalName},{" "}
                {address}, e-post <a href={`mailto:${company.email}`}>{company.email}</a>. Incidenter rapporteras till samma adress med ämnesraden
                &quot;Personuppgiftsincident&quot;.
              </p>
            </LegalSection>

            <LegalSection n="Bilaga 1" title="Underbiträden">
              <p>
                Underbiträden som Biträdet anlitar vid versionen ovan. Ändringar meddelas enligt punkt 8. &quot;EU (se aktuell lista)&quot; betyder att
                tjänsten är konfigurerad för en EU-region och att den exakta regionen anges i den aktuella lista som lämnas på begäran.
              </p>
              <LegalTable
                caption="Underbiträden"
                head={["Underbiträde", "Uppgift", "Plats för behandlingen", "Överföringsmekanism (kap. V)"]}
                rows={SUB_PROCESSORS.map((s) => [s.name, s.purpose, s.where, s.transfer])}
              />
            </LegalSection>

            <LegalSection n="Bilaga 2" title="Tekniska och organisatoriska åtgärder">
              <p>
                Åtgärderna i punkt 7 utgör bilaga 2. En aktuell och mer detaljerad beskrivning (vilka tabeller och fält som är krypterade, vilka roller och
                scope som finns, hur loggboken fungerar) finns i Tjänstens dokumentation och lämnas på begäran till den Personuppgiftsansvarige.
              </p>
            </LegalSection>
          </LegalDoc>
        </div>
      </section>
    </>
  );
}
