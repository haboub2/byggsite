import { ViewTransition } from "react";
import Link from "next/link";
import Photo from "./Photo";
import Blueprint from "./Blueprint";
import WorkCard from "./WorkCard";
import Reveal from "./Reveal";
import { Icon } from "./Icons";
import { Stats, SectionHead, Register, Steps, Faq, Bridge, CtaBand, type RegisterItem } from "./Sections";
import { Craft, PhotoBand } from "./PhotoSections";
import { PricingSection } from "./Pricing";
import { hasImage } from "@/lib/images";
import { listPublishedProjects, resolve } from "@/lib/projects";
import { SIDES, type Side } from "@/lib/sides";
import { services, processSteps, faq as byggFaq } from "@/lib/placeholder";
import { getContent } from "@/lib/content/store";
import { fillWarranty } from "@/lib/content/schema";
import { serviceExtras } from "@/lib/services-content";
import {
  softwareAreas,
  softwareProcess,
  softwareCases,
  softwareFaq,
} from "@/lib/software-content";

/** Landing page for one side. Both sides share this template; the two
 *  headline lines double as the Bygg / Software switch. */
export default async function Landing({ side }: { side: Side }) {
  const cfg = SIDES[side];
  const isBygg = side === "bygg";
  const [{ company, warranty }, projects] = await Promise.all([getContent(), listPublishedProjects()]);
  const w = isBygg ? warranty.bygg : warranty.software;
  const stats = [...(isBygg ? company.byggStats : company.softwareStats), { value: w.short, label: "garanti" }];
  const steps = (isBygg ? processSteps : softwareProcess).map((s) => ({ ...s, body: fillWarranty(s.body, w) }));
  const faq = (isBygg ? byggFaq : softwareFaq).map((f) => ({ ...f, a: fillWarranty(f.a, w) }));
  const secondary =
    isBygg && projects.length === 0 ? { label: "Se vad det kostar", href: "#priser" } : cfg.heroSecondary;

  const register: RegisterItem[] = isBygg
    ? services.map((s) => ({
        title: s.title,
        meta: serviceExtras[s.slug]?.meta ?? "",
        body: s.desc,
        href: `/bygg/tjanster/${s.slug}`,
      }))
    : softwareAreas.map((a) => ({
        title: a.title,
        meta: a.meta,
        body: a.body,
        href: `/mjukvara/tjanster/${a.slug}`,
      }));

  // Projects come from /admin and only appear with a real cover photo; cases
  // need a real screenshot. Stock images never stand in for our own work.
  const shownWork = isBygg
    ? projects
        .filter((p) => p.featured)
        .slice(0, 3)
        .map((p) => ({
          href: `/bygg/projekt/${p.slug}`,
          src: resolve(p.cover)?.url,
          alt: p.cover?.alt,
          tag: services.find((s) => s.slug === p.service)?.title ?? "Projekt",
          title: p.title,
          desc: p.summary,
        }))
    : softwareCases
        .filter((c) => hasImage(c.image))
        .map((c) => ({ href: `/mjukvara/case/${c.slug}`, image: c.image, tag: c.tag, title: c.title, desc: c.summary }));

  const lines: { key: Side; word: string; href: string }[] = [
    { key: "bygg", word: SIDES.bygg.word, href: SIDES.bygg.home },
    { key: "mjukvara", word: SIDES.mjukvara.word, href: SIDES.mjukvara.home },
  ];

  return (
    <>
      <section className="lhero" data-motion-nav="instant">
        <div className="container lhero-grid">
          <div>
            <p className="eyebrow eyebrow--dark">{cfg.topic}</p>
            <ViewTransition name="hero-lines" share="auto" default="none">
              <div className="lhero-lines">
                {lines.map((l) =>
                  l.key === side ? (
                    <h1 key={l.key} className="lhero-line" aria-current="true">
                      Vi bygger <span className="lhero-word">{l.word}</span>.
                      <span className="sr-only"> {cfg.topic}.</span>
                    </h1>
                  ) : (
                    <Link key={l.key} href={l.href} scroll={false} className="lhero-line">
                      Vi bygger <span className="lhero-word">{l.word}</span>.{" "}
                      <span className="lhero-go">
                        Visa {SIDES[l.key].label}
                        <Icon name="arrow" strokeWidth={2} />
                      </span>
                    </Link>
                  )
                )}
              </div>
            </ViewTransition>
            <ViewTransition name="hero-lead" share="auto" default="none">
              <div>
                <p className="lhero-lead">{cfg.lead}</p>
                <div className="lhero-actions">
                  <Link href={cfg.heroCta.href} className="btn btn-primary">
                    {cfg.heroCta.label}
                    <Icon name="arrow" strokeWidth={2} />
                  </Link>
                  <Link href={secondary.href} className="link-quiet">
                    {secondary.label}
                  </Link>
                </div>
              </div>
            </ViewTransition>
          </div>

          <ViewTransition name="hero-media" share="auto" default="none">
            <div className="lhero-media">
              <Blueprint dimH={cfg.hero.dimH} dimV={cfg.hero.dimV} caption={cfg.hero.caption}>
                <Photo slot={cfg.hero.image} ratio="4 / 5" tone="dark" preload sizes="(max-width: 900px) 100vw, 44vw" />
              </Blueprint>
            </div>
          </ViewTransition>
        </div>
      </section>

      <div className="container">
        <Stats items={stats} />
      </div>

      <section className="sec">
        <div className="container">
          <SectionHead eyebrow={cfg.register.eyebrow} title={cfg.register.title} aside={cfg.register.aside} />
          <Register items={register} name={`reg-${side}`} />
        </div>
      </section>

      <Craft {...cfg.craft} />

      <section className="sec sec--alt">
        <div className="container">
          <SectionHead
            eyebrow="Så går det till"
            title={isBygg ? "Fyra steg, inga överraskningar." : "Från brief till drift."}
          />
          <Steps items={steps} />
        </div>
      </section>

      {isBygg && <PricingSection />}

      {(shownWork.length > 0 || !isBygg) && (
        <section className="sec">
          <div className="container">
            <SectionHead
              eyebrow={cfg.work.eyebrow}
              title={cfg.work.title}
              aside={
                <Link href={cfg.work.all.href} className="link-arrow">
                  {cfg.work.all.label}
                  <Icon name="arrow" strokeWidth={2} />
                </Link>
              }
            />
            <div className="work reveal-group">
              {shownWork.map((w) => (
                <Reveal key={w.href}>
                  <WorkCard {...w} />
                </Reveal>
              ))}
              {!isBygg && (
                <Reveal className="work-empty">
                  <span className="eyebrow">Nästa case</span>
                  <p>Vi tar in ett fåtal nya uppdrag i taget. Berätta vad som kostar er tid idag.</p>
                  <Link href="/mjukvara/brief" className="link-arrow">
                    Skicka en brief
                    <Icon name="arrow" strokeWidth={2} />
                  </Link>
                </Reveal>
              )}
            </div>
          </div>
        </section>
      )}

      <PhotoBand {...cfg.band} />

      <section className="sec">
        <div className="container split">
          <div className="split-aside">
            <span className="eyebrow">Vanliga frågor</span>
            <h2>{isBygg ? "Det folk brukar undra." : "Det företag brukar undra."}</h2>
            <p>
              Hittar du inte svaret? Ring{" "}
              <a href={`tel:${company.phone}`} className="link-quiet">{company.phoneDisplay}</a> eller{" "}
              <Link href="/kontakt" className="link-quiet">skriv till oss</Link>.
            </p>
          </div>
          <Faq items={faq} name={`faq-${side}`} />
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
