import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import PageHero from "@/components/PageHero";
import { Register, CtaBand } from "@/components/Sections";
import { guides } from "@/lib/guides";
import { breadcrumbJsonLd, pageMetadata, abs } from "@/lib/seo";
import { SIDES } from "@/lib/sides";

export const metadata: Metadata = pageMetadata({
  title: "Guider om renovering, ROT-avdrag och system",
  description:
    "Raka svar om renovering, ROT-avdrag 2026, badrumsrenovering och att välja mellan standardsystem och eget system — från folk som gör jobbet.",
  path: "/guider",
});

export default function GuidesIndex() {
  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            url: abs("/guider"),
            name: "Guider",
            hasPart: guides.map((g) => ({ "@type": "Article", headline: g.title, url: abs(`/guider/${g.slug}`) })),
          },
          breadcrumbJsonLd([{ name: "Guider", path: "/guider" }]),
        ]}
      />
      <PageHero
        crumbs={[{ label: "Guider" }]}
        eyebrow="Guider"
        title="Raka svar innan du bestämmer dig."
        lead="Vad ett ROT-avdrag faktiskt blir, hur en badrumsrenovering går till och när ett eget system lönar sig. Skrivet av folk som gör jobbet."
      />
      <section className="sec">
        <div className="container">
          <Register
            expand={false}
            name="guides"
            items={guides.map((g) => ({
              title: g.title,
              meta: `${g.side === "bygg" ? "Bygg" : "Software"} · ${g.readingMinutes} min`,
              body: g.description,
              href: `/guider/${g.slug}`,
            }))}
          />
        </div>
      </section>
      <CtaBand {...SIDES.bygg.closing} cta={SIDES.bygg.cta} />
    </>
  );
}
