import Link from "next/link";
import PageHero from "./PageHero";
import WorkCard from "./WorkCard";
import { Icon } from "./Icons";
import { Stats, SectionHead, Steps, Faq, Bridge, CtaBand, Checklist } from "./Sections";
import { SIDES, type Side } from "@/lib/sides";
import { serviceImage } from "@/lib/images";
import { projectsReady } from "@/lib/projects";

type Work = { href: string; image: string; tag: string; title: string; desc: string };

/** One template for every service page on both sides. The side-specific
 *  middle (long-form copy for Bygg, fit + engagement for Software) comes in
 *  as children. */
export default function ServiceTemplate({
  side,
  slug,
  index,
  total,
  title,
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
  const base = side === "bygg" ? "/bygg" : "/mjukvara";
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
        <Stats items={facts} />
      </div>

      <section className="sec">
        <div className="container split">
          <div className="split-aside">
            <span className="eyebrow">Det här ingår</span>
            <h2>{includedTitle}</h2>
          </div>
          <Checklist items={included} />
        </div>
      </section>

      {children}

      <section className="sec sec--alt">
        <div className="container">
          <SectionHead eyebrow="Så går det till" title={side === "bygg" ? "Fyra steg, inga överraskningar." : "Från brief till drift."} />
          <Steps items={steps} />
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
            <Faq items={faq} name={`faq-${slug}`} />
          </div>
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
