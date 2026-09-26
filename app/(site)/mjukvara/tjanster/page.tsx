import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import { Register, Bridge, CtaBand } from "@/components/Sections";
import { softwareAreas, techStack } from "@/lib/software-content";
import { SIDES } from "@/lib/sides";

export const metadata: Metadata = {
  title: "Tjänster — Software",
  description:
    "Webb och portaler, automation och integrationer, interna system — tre sätt vi tar bort dubbelarbete och bygger system som håller.",
  alternates: { canonical: "/mjukvara/tjanster" },
};

export default function SoftwareServicesIndex() {
  const cfg = SIDES.mjukvara;
  return (
    <>
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
