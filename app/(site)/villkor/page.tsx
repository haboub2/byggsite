import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/PageHero";
import LegalDoc, { LegalSection } from "@/components/LegalDoc";
import { pageMetadata } from "@/lib/seo";
import { getContent } from "@/lib/content/store";
import { PRODUCT_NAME, PRODUCT_PATH } from "@/lib/product";
import { TERMS_DATE, TERMS_VERSION } from "@/lib/core/org/registration";

/*
 * UTKAST FÖR JURIDISK GRANSKNING.
 *
 * Användarvillkoren för produkten (docs/juridisk-granskning-2026-10-31.md,
 * avsnitt 7, H1). Texten är skriven som ett färdigt dokument, men en jurist
 * ska granska den innan produkten säljs till företag utanför Binaafy.
 * Registreringens kryssruta (components/RegistrationForm.tsx) länkar hit och
 * till /personuppgiftsbitradesavtal; versionen som godkänns är TERMS_VERSION
 * (lib/core/org/registration.ts) och sparas med registreringen (0047).
 * Priset står inte här utan på produktsidan, som punkt 5 hänvisar till.
 */

export const metadata: Metadata = pageMetadata({
  title: "Användarvillkor",
  description: `Villkoren för att använda ${PRODUCT_NAME}: tjänsten, kundens ansvar, pris, data, tillgänglighet, ansvar, uppsägning och tvist.`,
  path: "/villkor",
  noindex: true,
});

export default async function VillkorPage() {
  const { company } = await getContent();
  const provider = `${company.legalName}${company.orgNr ? ` (org.nr ${company.orgNr})` : ""}`;
  const address = `${company.street}, ${company.postalCode} ${company.city}`;

  return (
    <>
      <PageHero
        crumbs={[{ label: "Användarvillkor" }]}
        eyebrow="Juridik"
        title="Användarvillkor"
        lead={`Villkoren för att använda ${PRODUCT_NAME}. De gäller mellan Binaafy och det företag som registrerar ett konto.`}
      />
      <section className="sec">
        <div className="container">
          <LegalDoc
            version={TERMS_VERSION}
            date={TERMS_DATE}
            intro={
              <>
                Dessa villkor gäller för {PRODUCT_NAME} (nedan &quot;Tjänsten&quot;), som tillhandahålls av {provider}, {address} (nedan &quot;Binaafy&quot;,
                &quot;vi&quot;). Genom att registrera ett konto bekräftar den som registrerar att hen är behörig att teckna avtal för företagets räkning och att
                företaget godkänner villkoren och det <Link href="/personuppgiftsbitradesavtal">personuppgiftsbiträdesavtal</Link> som hör till dem.
              </>
            }
          >
            <LegalSection n={1} title="Parter och definitioner">
              <p>
                <strong>Kunden</strong> är det företag (juridisk person med organisationsnummer) som registrerar ett konto i Tjänsten. Tjänsten riktar sig
                till näringsidkare och inte till konsumenter. <strong>Användare</strong> är de fysiska personer som Kunden ger tillgång till Tjänsten:
                ägare, administratörer, personal, redovisningskonsult, anställda och de kunder till Kunden som bjuds in till kundportalen.{" "}
                <strong>Kunddata</strong> är all information som Kunden och dess Användare lägger in i Tjänsten eller som Tjänsten skapar ur den: kunder,
                offerter, fakturor, betalningar, projekt, personal, tid, löner, dokument och händelselogg. <strong>Avtalet</strong> är dessa villkor,
                personuppgiftsbiträdesavtalet och den prisuppgift som gällde när Kunden registrerade sig eller senare bytte paket.
              </p>
            </LegalSection>

            <LegalSection n={2} title="Tjänsten">
              <p>
                Tjänsten är ett webbaserat system för byggföretag med fakturering (inklusive ROT, omvänd skattskyldighet, påminnelser och betalplaner),
                offerter, kundportal för Kundens kunder, personal och anställningar, tidrapportering, lön och arbetsgivardeklaration, bokföringsunderlag
                (SIE) samt ett API med webhooks. Vilka funktioner som ingår i Kundens paket framgår av produktsidan och av Kundens inställningar. Vi
                utvecklar Tjänsten löpande och kan lägga till, ändra och ta bort funktioner, under förutsättning att Tjänstens huvudsakliga ändamål består.
              </p>
              <p>
                Tjänsten är ett verktyg. Den räknar enligt de regler (moms, ROT, dröjsmålsränta, skattetabeller, arbetsgivaravgifter, kollektivavtalens
                ersättningar) som vi har lagt in och daterat, men den ersätter inte Kundens egen bedömning, Kundens redovisningskonsult eller myndigheternas
                besked.
              </p>
            </LegalSection>

            <LegalSection n={3} title="Kundens ansvar för innehållet">
              <p>
                Kunden ansvarar för att de uppgifter som läggs in i Tjänsten är riktiga och för att det som Tjänsten skapar ur dem (fakturor, kreditfakturor,
                lönebesked, arbetsgivardeklarationer, ROT-begäran, bokföringsunderlag, intyg) granskas och godkänns av Kunden innan det används. Kunden
                ansvarar för att dess fakturor, löner, deklarationer och övriga handlingar uppfyller bokföringslagen, mervärdesskattelagen, skatteförfarandelagen,
                arbetsrättslig lagstiftning och tillämpliga kollektivavtal.
              </p>
              <p>
                Allt som skickas från Tjänsten skickas i Kundens namn. Kunden är borgenär för sina fakturor, arbetsgivare för sin personal och avsändare av
                sina påminnelser och inkassokrav. Binaafy bedriver inte inkassoverksamhet och driver inte in fordringar för Kundens räkning (inkassolagen
                2 §); Tjänsten tillhandahåller bara underlag och utskick som Kunden själv beslutar om. Kunden ansvarar för att dess utskick av påminnelser,
                avgifter och inkassokrav följer inkassolagen, lagen om ersättning för inkassokostnader m.m. och IMY:s allmänna råd om inkasso.
              </p>
              <p>
                Kunden ansvarar för att den har rätt att lägga in personuppgifter om sina kunder, sin personal och sina portalanvändare i Tjänsten, och för
                att informera dem enligt dataskyddsförordningen. Hur Binaafy behandlar personuppgifterna för Kundens räkning regleras i
                personuppgiftsbiträdesavtalet.
              </p>
            </LegalSection>

            <LegalSection n={4} title="Konto, roller och åtkomst">
              <p>
                Kontot skapas av den som registrerar företaget; den personen blir kontots ägare. Ägaren och administratörer kan bjuda in Användare och ge
                dem roller (ägare, administratör, personal, redovisningskonsult, endast läsning, anställd) som styr vad de ser och får göra. Kunden ansvarar
                för vilka Användare som bjuds in, för att ta bort Användare som inte längre ska ha tillgång och för allt som görs i Kundens organisation med
                en behörig Användares inloggning eller med Kundens API-nycklar.
              </p>
              <p>
                Inloggning sker med engångslänk eller engångskod till Användarens e-postadress. Användaren ansvarar för att e-postkontot är skyddat. Kunden
                ska utan dröjsmål meddela oss om en inloggning, en API-nyckel eller en webhook-hemlighet misstänks ha kommit i orätta händer; vi kan då
                spärra den.
              </p>
              <p>
                Tjänsten får inte användas för att skicka oönskad e-post, för att lägga in uppgifter som Kunden saknar rätt att behandla, för att kringgå
                Tjänstens säkerhetsfunktioner eller för att belasta Tjänsten på ett sätt som stör andra kunder. API:et får användas inom de anropsgränser som
                anges i API-dokumentationen.
              </p>
            </LegalSection>

            <LegalSection n={5} title="Pris och betalning">
              <p>
                Priset för Tjänsten är det som anges för Kundens paket på{" "}
                <Link href={PRODUCT_PATH}>produktsidan</Link> när Kunden registrerar sig eller byter paket. Priser anges exklusive moms. Avgiften
                faktureras i förskott per kalendermånad med trettio (30) dagars betalningstid. Vid sen betalning utgår dröjsmålsränta enligt räntelagen
                och lagstadgad påminnelseavgift. Är avgiften obetald mer än trettio (30) dagar efter förfallodagen får vi, efter skriftlig påminnelse,
                stänga av Kundens tillgång till Tjänsten till dess betalning sker; Kunddata finns kvar under avstängningen.
              </p>
              <p>
                Vi får ändra priset med trettio (30) dagars skriftligt varsel till den e-postadress som Kundens ägare har angett. Ett ändrat pris gäller
                från nästa faktureringsperiod efter att varselperioden gått ut. Kunden som inte godtar ändringen får säga upp Avtalet till den dagen det
                nya priset börjar gälla.
              </p>
            </LegalSection>

            <LegalSection n={6} title="Kunddata, äganderätt och export">
              <p>
                Kunddata tillhör Kunden. Binaafy får bara behandla Kunddata för att tillhandahålla, driva, säkra och förbättra Tjänsten, för att fullgöra
                Avtalet och för att uppfylla rättsliga skyldigheter. Vi använder inte Kunddata för att träna modeller, för marknadsföring till Kundens
                kunder eller personal, och vi lämnar inte ut Kunddata till tredje part annat än till de underleverantörer som anges i
                personuppgiftsbiträdesavtalet eller när lag eller myndighetsbeslut kräver det.
              </p>
              <p>
                Kunden kan när som helst under avtalstiden exportera sin Kunddata ur Tjänsten: fakturor och kunder som CSV och JSON, bokföringsunderlag som
                SIE, fakturor, lönebesked och intyg som PDF samt ett arkiv med alla utfärdade dokument. Samma export är tillgänglig under nittio (90)
                dagar efter att Avtalet har upphört (punkt 11).
              </p>
            </LegalSection>

            <LegalSection n={7} title="Tillgänglighet, drift och säkerhetskopior">
              <p>
                Vi strävar efter att Tjänsten ska vara tillgänglig dygnet runt, men lämnar ingen garanti för oavbruten eller felfri drift. Planerade
                driftavbrott för underhåll förläggs om möjligt utanför kontorstid och meddelas i förväg i Tjänsten eller via e-post. Vi ansvarar inte för
                avbrott som beror på Kundens egen utrustning eller internetanslutning, på tredje parts tjänster utanför vår kontroll eller på force
                majeure.
              </p>
              <p>
                Databasen säkerhetskopieras regelbundet hos vår databasleverantör och kopiorna sparas i samma region som databasen. Säkerhetskopiorna
                är till för att återställa Tjänsten efter ett fel, inte för att återställa uppgifter som en Användare själv har tagit bort. Utfärdade
                fakturor, lönebesked och signerade dokument kan inte ändras eller raderas i Tjänsten; en rättelse görs som en ny handling, så som
                bokföringslagen kräver.
              </p>
            </LegalSection>

            <LegalSection n={8} title="Personuppgifter">
              <p>
                När Kunden lägger in personuppgifter om sina kunder, sin personal och sina portalanvändare är Kunden personuppgiftsansvarig och Binaafy
                personuppgiftsbiträde. Behandlingen regleras av <Link href="/personuppgiftsbitradesavtal">personuppgiftsbiträdesavtalet</Link>, som är en
                del av Avtalet. För uppgifter om Kundens Användare som vi behöver för kontot (namn, e-postadress, inloggningar, API-nycklar) är Binaafy
                personuppgiftsansvarig; det beskrivs i vår <Link href="/integritetspolicy">integritetspolicy</Link>.
              </p>
            </LegalSection>

            <LegalSection n={9} title="Immateriella rättigheter och sekretess">
              <p>
                Binaafy äger Tjänsten, dess kod, design, dokumentation och varumärken. Kunden får en icke-exklusiv, icke överlåtbar rätt att använda Tjänsten
                under avtalstiden för sin egen verksamhet. Kunden får inte kopiera, dekompilera eller vidareförsälja Tjänsten. De handlingar som Tjänsten
                skapar ur Kunddata tillhör Kunden.
              </p>
              <p>
                Vardera parten ska hålla den andra partens konfidentiella information hemlig och bara använda den för Avtalets ändamål. Skyldigheten
                gäller under avtalstiden och tre (3) år därefter, för personuppgifter utan tidsgräns.
              </p>
            </LegalSection>

            <LegalSection n={10} title="Ansvarsbegränsning">
              <p>
                Binaafys sammanlagda ansvar gentemot Kunden under Avtalet är, oavsett grund, begränsat till ett belopp motsvarande de avgifter Kunden har
                betalat för Tjänsten under de tolv (12) månaderna närmast före den händelse som kravet grundas på. Binaafy ansvarar inte för indirekt
                skada eller följdskada, såsom utebliven vinst, förlorad omsättning, förlust av data som Kunden hade kunnat exportera, skattetillägg,
                förseningsavgifter, ränta eller krav från tredje part, såvida inte skadan har orsakats av grov vårdslöshet eller uppsåt.
              </p>
              <p>
                Begränsningarna gäller inte vid grov vårdslöshet eller uppsåt, vid intrång i tredje parts immateriella rättigheter som orsakas av Tjänsten
                i sig, och inte i den mån ansvar inte kan begränsas enligt tvingande lag. Krav ska framställas skriftligen utan oskäligt dröjsmål och
                senast sex (6) månader efter att Kunden upptäckte eller borde ha upptäckt grunden för kravet.
              </p>
              <p>
                Kunden ansvarar för och ska hålla Binaafy skadeslöst för krav från tredje part som grundas på innehållet i Kundens fakturor, löner,
                deklarationer, utskick och inlagda personuppgifter (punkt 3).
              </p>
            </LegalSection>

            <LegalSection n={11} title="Avtalstid och uppsägning">
              <p>
                Avtalet gäller tills vidare från registreringen. Vardera parten får säga upp Avtalet skriftligen med trettio (30) dagars uppsägningstid,
                Kunden genom Tjänsten eller via e-post till adressen i punkt 14, Binaafy via e-post till Kundens ägare. Avgift som betalats för tid efter
                upphörandet återbetalas inte, med undantag för uppsägning enligt punkt 5 andra stycket eller punkt 12.
              </p>
              <p>
                Binaafy får säga upp Avtalet med omedelbar verkan om Kunden väsentligt bryter mot Avtalet och inte rättar sig inom fjorton (14) dagar
                efter skriftlig anmaning, om Kunden försätts i konkurs eller inleder företagsrekonstruktion eller likvidation, eller om Tjänsten används på
                ett sätt som är olagligt eller skadar Binaafy, Tjänsten eller andra kunder.
              </p>
              <p>
                När Avtalet har upphört stängs Kundens inloggningar och API-nycklar. Kunden kan exportera sin Kunddata enligt punkt 6 under nittio (90)
                dagar efter upphörandet. Därefter raderar Binaafy Kunddata och säkerhetskopiorna av den, med undantag för det som Binaafy måste behålla
                enligt lag (till exempel Binaafys egna fakturor till Kunden). Kunden ansvarar själv för att behålla fakturor, lönebesked, bokföringsunderlag
                och personalhandlingar under den tid bokföringslagen (7 kap.) och annan lag kräver; Tjänsten är inte Kundens arkiv efter att Avtalet har
                upphört.
              </p>
            </LegalSection>

            <LegalSection n={12} title="Ändringar av villkoren">
              <p>
                Binaafy får ändra dessa villkor och personuppgiftsbiträdesavtalet. Ändringar meddelas via e-post till Kundens ägare minst trettio (30)
                dagar innan de börjar gälla, med den nya versionen och dess versionsnummer. En ändring som bara är till Kundens fördel, som krävs av lag eller
                som gäller en ny funktion kan gälla direkt. Kunden som inte godtar en ändring får säga upp Avtalet till den dag ändringen börjar gälla;
                fortsatt användning efter den dagen innebär att ändringen är godtagen. Vilken version Kunden godkände vid registreringen sparas med
                kontot.
              </p>
            </LegalSection>

            <LegalSection n={13} title="Tillämplig lag och tvist">
              <p>
                Svensk lag gäller för Avtalet, utan tillämpning av dess lagvalsregler. Tvist med anledning av Avtalet ska avgöras av svensk allmän domstol
                med Göteborgs tingsrätt som första instans. Parterna ska dock först försöka lösa tvisten genom förhandling.
              </p>
            </LegalSection>

            <LegalSection n={14} title="Kontakt">
              <p>
                Frågor om villkoren, uppsägning och fakturor ställs till {company.legalName}, {address}, e-post{" "}
                <a href={`mailto:${company.email}`}>{company.email}</a>.
              </p>
            </LegalSection>
          </LegalDoc>
        </div>
      </section>
    </>
  );
}
