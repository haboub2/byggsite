import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/PageHero";
import WorkCard from "@/components/WorkCard";
import Reveal from "@/components/Reveal";
import { Icon } from "@/components/Icons";
import { CtaBand } from "@/components/Sections";
import { softwareCases } from "@/lib/software-content";
import { SIDES } from "@/lib/sides";

export const metadata: Metadata = {
  title: "Case — Software",
  description: "Case från Binaafy Software: situation, insats och mätbart resultat.",
  alternates: { canonical: "/mjukvara/case" },
};

export default function CaseIndex() {
  const cfg = SIDES.mjukvara;
  return (
    <>
      <PageHero
        crumbs={[{ label: "Software", href: "/mjukvara" }, { label: "Case" }]}
        eyebrow="Case"
        title="Byggt och i drift."
        lead="Vi är tidigt i vår resa som mjukvaruverksamhet. Den här sajten är vårt första publicerade case — fler läggs till när projekt slutförs."
      />
      <section className="sec">
        <div className="container work reveal-group">
          {softwareCases.map((c) => (
            <Reveal key={c.slug}>
              <WorkCard href={`/mjukvara/case/${c.slug}`} image={c.image} tag={c.client} title={c.title} desc={c.summary} />
            </Reveal>
          ))}
          <Reveal className="work-empty">
            <span className="eyebrow">Nästa case</span>
            <p>Vi tar in ett fåtal nya uppdrag i taget. Berätta vad som kostar er tid idag.</p>
            <Link href="/mjukvara/brief" className="link-arrow">
              Skicka en brief
              <Icon name="arrow" strokeWidth={2} />
            </Link>
          </Reveal>
        </div>
      </section>
      <CtaBand {...cfg.closing} cta={cfg.cta} />
    </>
  );
}
