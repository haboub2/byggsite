import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import PageHero from "@/components/PageHero";
import { Register, Bridge, CtaBand } from "@/components/Sections";
import { services } from "@/lib/placeholder";
import { serviceExtras } from "@/lib/services-content";
import { SIDES } from "@/lib/sides";

export const metadata: Metadata = pageMetadata({
  title: "Bygg och renovering — alla tjänster",
  description:
    "Totalrenovering, badrum, kök, tillbyggnad, tak, golv, måleri och projektledning i södra och västra Sverige. Ett team, fast pris och ROT-avdrag.",
  path: "/bygg/tjanster",
});

export default function ByggServicesIndex() {
  const cfg = SIDES.bygg;
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Bygg", path: "/" }, { name: "Tjänster", path: "/bygg/tjanster" }])} />
      <PageHero
        crumbs={[{ label: "Bygg", href: "/" }, { label: "Tjänster" }]}
        eyebrow="Våra tjänster"
        title="Nio tjänster, ett team."
        titleContext="Byggfirma i Göteborg: bygg och renovering i södra och västra Sverige"
        lead="Från ett nytt golv till ett helt hus. Allt görs av samma team, med en kontaktperson och ett fast pris."
      />
      <section className="sec sec--tight">
        <div className="container split">
          <div className="split-aside">
            <span className="eyebrow">Så jobbar vi</span>
            <h2>Ett avtal, ett fast pris, en garanti.</h2>
          </div>
          <div className="article-sections">
            <p>
              Binaafy är en byggfirma i Göteborg som tar hela ansvaret för renoveringen: rivning, stomme,
              snickerier, golv, kakel och montering gör vi med egen personal, och el, VVS och våtrum utförs
              av behöriga specialister som vi har arbetat med länge. Du skriver ett avtal med oss, får en
              specificerad offert med fast pris efter ett kostnadsfritt hembesök, och ROT-avdraget dras
              direkt på fakturan.
            </p>
            <p>
              Vi utgår från Göteborg och tar uppdrag i Västra Götaland, Halland och Skåne. Priserna nedan
              är riktpriser inklusive moms före ROT; det bindande priset står i offerten. Vill du räkna
              själv finns vår <Link href="/guider/rot-avdrag-2026">guide om ROT-avdraget 2026</Link> och
              en <Link href="/guider/checklista-infor-renovering">checklista inför renoveringen</Link>.
              Vill du se vad vi byggt finns <Link href="/referenser">referenser med före- och efterbilder</Link>.
            </p>
          </div>
        </div>
      </section>
      <section className="sec">
        <div className="container">
          <Register
            expand={false}
            name="bygg-index"
            items={services.map((s) => ({
              title: s.title,
              meta: serviceExtras[s.slug]?.meta ?? "",
              body: s.desc,
              href: `/bygg/tjanster/${s.slug}`,
            }))}
          />
        </div>
      </section>
      <section className="sec sec--tight">
        <div className="container">
          <Bridge {...cfg.bridge} />
        </div>
      </section>
      <CtaBand {...cfg.closing} cta={cfg.cta} />
    </>
  );
}
