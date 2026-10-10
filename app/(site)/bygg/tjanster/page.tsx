import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import PageHero from "@/components/PageHero";
import { Register, Bridge, CtaBand } from "@/components/Sections";
import { services } from "@/lib/placeholder";
import { serviceExtras } from "@/lib/services-content";
import { SIDES } from "@/lib/sides";

export const metadata: Metadata = pageMetadata({
  title: "Bygg och renovering i Halmstad — alla tjänster",
  description:
    "Totalrenovering, badrum, kök, tillbyggnad, tak, golv, måleri, el och VVS samt projektledning i Halmstad och Halland. Ett team, fast pris och ROT-avdrag.",
  path: "/bygg/tjanster",
});

export default function ByggServicesIndex() {
  const cfg = SIDES.bygg;
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Bygg", path: "/" }, { name: "Tjänster", path: "/bygg/tjanster" }])} />
      <PageHero
        crumbs={[{ label: "Bygg", href: "/" }, { label: "Tjänster" }]}
        eyebrow="Register"
        title="Nio tjänster, ett team."
        lead="Från ett nytt golv till ett helt hus. Allt görs av samma team, med en kontaktperson och ett fast pris."
      />
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
