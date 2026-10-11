import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/PageHero";
import JsonLd from "@/components/JsonLd";
import Reveal from "@/components/Reveal";
import Stars from "@/components/Stars";
import TrustBox from "@/components/TrustBox";
import { Icon } from "@/components/Icons";
import { CtaBand, SectionHead } from "@/components/Sections";
import { getContent } from "@/lib/content/store";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import type { ReviewPlatform } from "@/lib/content/schema";

export const metadata: Metadata = pageMetadata({
  title: "Omdömen — vad kunderna säger om Binaafy",
  description:
    "Omdömen om Binaafy från Trustpilot, Google och andra plattformar, och vad våra kunder säger om bygg- och mjukvaruprojekten vi gjort.",
  path: "/omdomen",
});

const fmtRating = (r: number) => r.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });

function PlatformCard({ p }: { p: ReviewPlatform }) {
  return (
    <div className="review-platform">
      <span className="eyebrow">{p.name}</span>
      {p.rating !== null ? (
        <>
          <strong className="review-score">
            {fmtRating(p.rating)}
            <small> av 5</small>
          </strong>
          <Stars rating={p.rating} />
        </>
      ) : (
        <strong className="review-score review-score--empty">Nya omdömen välkomnas</strong>
      )}
      <p className="review-meta">
        {p.count !== null && `${p.count.toLocaleString("sv-SE")} ${p.count === 1 ? "omdöme" : "omdömen"}`}
        {p.count !== null && p.updated && " · "}
        {p.updated && `uppdaterat ${fmtDate(p.updated)}`}
      </p>
      <div className="review-links">
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="link-arrow">
          Läs omdömena
          <Icon name="arrow" strokeWidth={2} />
        </a>
        {p.reviewUrl && (
          <a href={p.reviewUrl} target="_blank" rel="noopener noreferrer" className="link-quiet">
            Lämna ett omdöme
          </a>
        )}
      </div>
    </div>
  );
}

export default async function ReviewsPage() {
  const { reviews } = await getContent();
  const { platforms, quotes, trustbox } = reviews;
  const trustpilot = platforms.find((p) => p.name.toLowerCase() === "trustpilot");
  const hasWidget = Boolean(trustpilot && trustbox.businessUnitId && trustbox.templateId);
  const others = platforms.filter((p) => !(hasWidget && p === trustpilot));
  const empty = platforms.length === 0 && quotes.length === 0;

  return (
    <>
      {/* No AggregateRating markup: Google ignores self-hosted ratings for a business's own site. */}
      <JsonLd data={[breadcrumbJsonLd([{ name: "Omdömen", path: "/omdomen" }])]} />
      <PageHero
        crumbs={[{ label: "Omdömen" }]}
        eyebrow="Vad kunderna säger"
        title="Omdömen."
        lead="Vi ber varje kund om ett ärligt omdöme när jobbet är klart. Här ser du vad de har skrivit — på plattformar vi inte styr över."
      />

      <section className="sec">
        <div className="container">
          {empty ? (
            <div className="work-empty review-empty">
              <span className="eyebrow">Kommer snart</span>
              <p>
                Vi har precis börjat samla omdömen. Vill du se vad vi har gjort under tiden? Titta på våra{" "}
                <Link href="/referenser" className="link-quiet">
                  referenser
                </Link>
                .
              </p>
            </div>
          ) : (
            <>
              {hasWidget && trustpilot && (
                <Reveal className="review-trustbox">
                  <TrustBox
                    businessUnitId={trustbox.businessUnitId}
                    templateId={trustbox.templateId}
                    profileUrl={trustpilot.url}
                    fallback={<PlatformCard p={trustpilot} />}
                  />
                </Reveal>
              )}
              {others.length > 0 && (
                <div className="review-platforms reveal-group">
                  {others.map((p) => (
                    <Reveal key={p.name}>
                      <PlatformCard p={p} />
                    </Reveal>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {quotes.length > 0 && (
        <section className="sec sec--alt">
          <div className="container">
            <SectionHead eyebrow="I kundernas ord" title="Utdrag ur omdömena." />
            <ul className="review-quotes reveal-group">
              {quotes.map((q, i) => (
                <Reveal as="li" key={`${q.author}-${i}`}>
                  <figure>
                    {q.rating !== null && <Stars rating={q.rating} size={15} />}
                    <blockquote>”{q.quote}”</blockquote>
                    <figcaption>
                      {q.author}
                      {q.platform && <span> · via {q.platform}</span>}
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      )}

      <CtaBand
        eyebrow="Har du anlitat oss?"
        title="Berätta hur det gick."
        body="Ett ärligt omdöme hjälper nästa kund att välja – och oss att bli bättre."
        cta={{ label: "Kontakta oss", href: "/kontakt" }}
      />
    </>
  );
}
