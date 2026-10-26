import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/PageHero";
import WorkCard from "@/components/WorkCard";
import Reveal from "@/components/Reveal";
import RefFilter from "@/components/RefFilter";
import JsonLd from "@/components/JsonLd";
import { Icon } from "@/components/Icons";
import { CtaBand } from "@/components/Sections";
import { services } from "@/lib/placeholder";
import { listPublishedCases } from "@/lib/cases";
import { statusTitle } from "@/lib/case-schema";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { listPublishedProjects, resolve } from "@/lib/projects";

/** Each side shows at least this many cards; missing ones are empty slots
 *  that disappear as real references are added. */
const MIN_PER_SIDE = 3;

export const metadata: Metadata = pageMetadata({
  title: "Referenser — bygg och software",
  description:
    "Referenser från våra bygg- och renoveringsprojekt och från systemen vi byggt åt företag. Bilder, beskrivning av arbetet och vad kunderna tycker.",
  path: "/referenser",
});

function EmptySlot({ side }: { side: "bygg" | "software" }) {
  const bygg = side === "bygg";
  return (
    <Reveal className="work-empty ref-card" data-side={side}>
      <span className="eyebrow">{bygg ? "Bygg" : "Software"} · kommer snart</span>
      <p>
        {bygg
          ? "Här lägger vi upp bilder och kundens omdöme från ett av våra senaste jobb."
          : "Här beskriver vi ett av systemen vi byggt — problemet, lösningen och resultatet."}
      </p>
      <Link href={bygg ? "/bygg/offert" : "/mjukvara/brief"} className="link-arrow">
        {bygg ? "Begär offert" : "Skicka en brief"}
        <Icon name="arrow" strokeWidth={2} />
      </Link>
    </Reveal>
  );
}

export default async function ReferencesPage() {
  const [projects, cases] = await Promise.all([listPublishedProjects(), listPublishedCases()]);
  const byggSlots = Math.max(0, MIN_PER_SIDE - projects.length);
  const softwareSlots = Math.max(0, MIN_PER_SIDE - cases.length);

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd([{ name: "Referenser", path: "/referenser" }])]} />
      <PageHero
        crumbs={[{ label: "Referenser" }]}
        eyebrow="Vårt arbete"
        title="Referenser."
        lead="Hem vi har renoverat och system vi har byggt. Klicka på en referens för att se bilder, vad vi gjorde och vad kunden tycker."
      />
      <section className="sec">
        <div className="container">
          <RefFilter>
            <div className="work reveal-group">
              {projects.map((p) => (
                <Reveal key={`b-${p.slug}`} className="ref-card" data-side="bygg">
                  <WorkCard
                    href={`/bygg/projekt/${p.slug}`}
                    src={resolve(p.cover)?.url}
                    alt={p.cover?.alt}
                    tag={["Bygg", services.find((s) => s.slug === p.service)?.title, p.location, p.year]
                      .filter(Boolean)
                      .join(" · ")}
                    title={p.title}
                    desc={p.testimonial?.quote ? `”${p.testimonial.quote}”` : p.summary}
                  />
                </Reveal>
              ))}
              {Array.from({ length: byggSlots }, (_, i) => (
                <EmptySlot key={`bs-${i}`} side="bygg" />
              ))}
              {cases.map((c) => (
                <Reveal key={`s-${c.slug}`} className="ref-card" data-side="software">
                  <WorkCard
                    href={`/mjukvara/case/${c.slug}`}
                    image={c.image}
                    src={c.cover?.url}
                    alt={c.cover?.alt}
                    tag={["Software", c.tag, c.client].filter(Boolean).join(" · ")}
                    badge={c.status === "dev" ? statusTitle(c.status) : undefined}
                    title={c.title}
                    desc={c.testimonial?.quote ? `”${c.testimonial.quote}”` : c.summary}
                  />
                </Reveal>
              ))}
              {Array.from({ length: softwareSlots }, (_, i) => (
                <EmptySlot key={`ss-${i}`} side="software" />
              ))}
            </div>
          </RefFilter>
        </div>
      </section>
      <CtaBand
        eyebrow="Nästa referens"
        title="Ditt projekt kan bli nästa."
        body="Berätta vad du vill bygga eller förbättra, så återkommer vi med ett förslag och ett fast pris."
        cta={{ label: "Kontakta oss", href: "/kontakt" }}
      />
    </>
  );
}
