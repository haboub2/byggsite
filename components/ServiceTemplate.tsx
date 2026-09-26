import Link from "next/link";
import PageHero from "./PageHero";
import WorkCard from "./WorkCard";
import { Icon } from "./Icons";
import { Stats, SectionHead, Steps, Faq, Bridge, CtaBand, Checklist } from "./Sections";
import { SIDES, type Side } from "@/lib/sides";
import { serviceImage } from "@/lib/images";
import { projectsReady } from "@/lib/projects";
import { guideBySlug, guidesFor } from "@/lib/guides";
import { services } from "@/lib/placeholder";
import { softwareAreas } from "@/lib/software-content";
import { getContent } from "@/lib/content/store";
import { fillWarranty } from "@/lib/content/schema";

type Work = { href: string; image: string; tag: string; title: string; desc: string };

/** One template for every service page on both sides. The side-specific
 *  middle (long-form copy for Bygg, fit + engagement for Software) comes in
 *  as children. */
export default async function ServiceTemplate({
  side,
  slug,
  index,
  total,
  title,
  seoTitle,
  lead,
  facts,
  included,
  includedTitle,
  steps,
  related,
  faq,
  cta,
  children,
}: {
  side: Side;
  slug: string;
  index: number;
  total: number;
  title: string;
  /** Full search phrase, e.g. "Badrumsrenovering i Halmstad". */
  seoTitle?: string;
  lead: string;
  facts: { value: string; label: string }[];
  included: string[];
  includedTitle: string;
  steps: { n: string; title: string; body: string }[];
  related?: Work;
  faq: { q: string; a: string }[];
  cta: { label: string; href: string };
  children?: React.ReactNode;
}) {
  const cfg = SIDES[side];
  const { warranty } = await getContent();
  // Each service has its own warranty (editable in /admin), shown as the
  // fourth fact, under "Det här ingår", and wherever a text says {garanti}.
  const w = warranty.services[slug] ?? (side === "bygg" ? warranty.bygg : warranty.software);
  const allFacts = [...facts.slice(0, 3), { value: w.short, label: "garanti" }];
  const filledSteps = steps.map((s) => ({ ...s, body: fillWarranty(s.body, w) }));
  const filledFaq = faq.map((f) => ({ ...f, a: fillWarranty(f.a, w) }));
  const base = side === "bygg" ? "/bygg" : "/mjukvara";
  // Internal links: guides for this service and the other services on the same side.
  const readMore = (guidesFor[slug] ?? []).flatMap((g) => {
    const guide = guideBySlug(g);
    return guide ? [{ label: guide.title, href: `/guider/${guide.slug}` }] : [];
  });
  const siblings = (side === "bygg" ? services.map((s) => ({ slug: s.slug, title: s.title })) : softwareAreas)
    .filter((s) => s.slug !== slug)
    .map((s) => ({ label: s.title, href: `${base}/tjanster/${s.slug}` }));
  const secondary =
    side === "bygg" && !projectsReady() ? { label: "Alla tjänster", href: "/bygg/tjanster" } : cfg.heroSecondary;

  return (
    <>
      <PageHero
        crumbs={[
          { label: cfg.label, href: cfg.home },
          { label: "Tjänster", href: `${base}/tjanster` },
          { label: title },
        ]}
        eyebrow={`Tjänst ${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`}
        title={title}
        titleContext={seoTitle && seoTitle !== title ? seoTitle : undefined}
        lead={lead}
        image={serviceImage[slug]}
        dimH={title}
        caption={side === "bygg" ? "Koncept — material och ljus" : "Koncept — struktur och flöde"}
      >
        <Link href={cta.href} className="btn btn-primary">
          {cta.label}
          <Icon name="arrow" strokeWidth={2} />
        </Link>
        <Link href={secondary.href} className="link-quiet">
          {secondary.label}
        </Link>
      </PageHero>

      <div className="container">
        <Stats items={allFacts} />
      </div>

      <section className="sec">
        <div className="container split">
          <div className="split-aside">
            <span className="eyebrow">Det här ingår</span>
            <h2>{includedTitle}</h2>
            <p className="warranty-note">
              <Icon name="shield" strokeWidth={1.8} />
              <span>
                <strong>Garanti:</strong> {w.sentence}.
              </span>
            </p>
          </div>
          <Checklist items={included} />
        </div>
      </section>

      {children}

      <section className="sec sec--alt">
        <div className="container">
          <SectionHead eyebrow="Så går det till" title={side === "bygg" ? "Fyra steg, inga överraskningar." : "Från brief till drift."} />
          <Steps items={filledSteps} />
        </div>
      </section>

      <section className="sec">
        <div className="container split">
          <div className="split-aside">
            {related ? (
              <>
                <span className="eyebrow" style={{ display: "block", marginBottom: 16 }}>
                  {side === "bygg" ? "Relaterat projekt" : "Relaterat case"}
                </span>
                <WorkCard {...related} />
              </>
            ) : (
              <>
                <span className="eyebrow">Vanliga frågor</span>
                <h2>Frågor om {title.toLowerCase()}</h2>
              </>
            )}
          </div>
          <div>
            {related && (
              <span className="eyebrow" style={{ display: "block", marginBottom: 16 }}>
                Vanliga frågor
              </span>
            )}
            <Faq items={filledFaq} name={`faq-${slug}`} />
          </div>
        </div>
      </section>

      <section className="sec sec--tight">
        <div className="container guide-links">
          {readMore.length > 0 && (
            <nav aria-label="Guider">
              <span className="eyebrow">Läs mer</span>
              <ul>
                {readMore.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="link-arrow">
                      {l.label}
                      <Icon name="arrow" strokeWidth={2} />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <nav aria-label="Fler tjänster">
            <span className="eyebrow">Fler tjänster</span>
            <ul className="chip-links">
              {siblings.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      <section className="sec sec--tight">
        <div className="container">
          <Bridge {...cfg.bridge} />
        </div>
      </section>

      <CtaBand
        eyebrow={cfg.closing.eyebrow}
        title={CLOSING_TITLE[slug] ?? cfg.closing.title}
        body={cfg.closing.body}
        cta={cta}
      />
    </>
  );
}

const CLOSING_TITLE: Record<string, string> = {
  totalrenovering: "Vad vill du renovera?",
  badrumsrenovering: "Dags för ett nytt badrum?",
  koksrenovering: "Dags för ett nytt kök?",
  tillbyggnad: "Hur mycket mer yta behöver du?",
  tak: "Hur mår ditt tak?",
  golv: "Vilket golv vill du ha?",
  maleri: "Vad ska målas?",
  "el-vvs": "Vad behöver installeras?",
};
