import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import PageHero from "@/components/PageHero";
import { Register, Bridge, CtaBand } from "@/components/Sections";
import { softwareAreas, techStack } from "@/lib/software-content";
import { SIDES } from "@/lib/sides";

export const metadata: Metadata = pageMetadata({
  title: "Mjukvarutjänster — webb, automation och interna system",
  description:
    "Webbutveckling och kundportaler, automation och systemintegration, interna verksamhetssystem. Tre sätt vi tar bort dubbelarbete, med fast pris per etapp.",
  path: "/mjukvara/tjanster",
});

export default function SoftwareServicesIndex() {
  const cfg = SIDES.mjukvara;
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: "Software", path: "/mjukvara" }, { name: "Tjänster", path: "/mjukvara/tjanster" }])} />
      <PageHero
        crumbs={[{ label: "Software", href: "/mjukvara" }, { label: "Tjänster" }]}
        eyebrow="Register"
        title="Tre sätt att ta bort dubbelarbete."
        lead="Vi väljer aldrig teknik för teknikens skull. Varje uppdrag börjar med att kartlägga vad som faktiskt kostar tid idag, och vilken av de tre formerna som löser det billigast."
      />
      <section className="sec">
        <div className="container">
          <Register
            expand={false}
            name="sw-index"
            items={softwareAreas.map((a) => ({
              title: a.title,
              meta: a.meta,
              body: a.body,
              href: `/mjukvara/tjanster/${a.slug}`,
            }))}
          />
          <p className="eyebrow" style={{ marginTop: 32 }}>
            Byggt med {techStack.join(" · ")}
          </p>
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
