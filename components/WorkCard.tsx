import { ViewTransition } from "react";
import Link from "next/link";
import Photo from "./Photo";

/** View transition name shared by a case card's photo and the case page hero,
 *  so opening a case grows the card photo into the hero (and back). */
export const caseMorph = (slug: string) => `case-${slug}`;

const caseSlug = (href: string) => href.match(/^\/mjukvara\/case\/([^/?#]+)$/)?.[1];

export default function WorkCard({
  href,
  image,
  src,
  tag,
  title,
  desc,
  alt,
  badge,
}: {
  href: string;
  /** Image slot, or pass `src` for an uploaded photo. */
  image?: string;
  src?: string | null;
  tag: string;
  title: string;
  desc: string;
  /** Describe the photo when it isn't covered by lib/images alt text (e.g. project photos). */
  alt?: string;
  /** Short status shown on the photo, e.g. "Under utveckling". */
  badge?: string;
}) {
  const slug = caseSlug(href);
  const photo = (
    <Photo slot={image} src={src} ratio="4 / 3" sizes="(max-width: 580px) 100vw, (max-width: 900px) 50vw, 33vw" alt={alt} />
  );
  return (
    // Case cards skip the curtain after the first page, so a photo morphing
    // back from a case page lands uncovered (see Motion.tsx, data-settled).
    <Link href={href} className="work-card" data-motion-nav={slug ? "instant" : undefined}>
      <div className="work-media">
        {slug ? (
          <ViewTransition name={caseMorph(slug)} share="morph" default="none">
            {photo}
          </ViewTransition>
        ) : (
          photo
        )}
        {badge && <span className="work-badge">{badge}</span>}
      </div>
      <span className="work-tag">{tag}</span>
      <h3 className="work-title">{title}</h3>
      <p className="work-desc">{desc}</p>
    </Link>
  );
}
