import Photo from "./Photo";
import Blueprint from "./Blueprint";
import { Crumbs } from "./Sections";

/** Dark hero for every subpage: breadcrumb, kicker, title, lead, and an
 *  optional photo with the blueprint marks. */
export default function PageHero({
  crumbs,
  eyebrow,
  title,
  titleContext,
  lead,
  image,
  imageSrc,
  imageAlt,
  dimH,
  dimV,
  caption,
  children,
}: {
  crumbs: { label: string; href?: string }[];
  eyebrow?: string;
  title: string;
  /** Appended to the h1 for screen readers and search engines, e.g. the full
   *  service name and town when the visible title is a short word. */
  titleContext?: string;
  lead?: string;
  /** Image slot (lib/images.ts)… */
  image?: string;
  /** …or an uploaded photo. */
  imageSrc?: string | null;
  imageAlt?: string;
  dimH?: string;
  dimV?: string;
  caption?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className={`phero${image || imageSrc ? "" : " phero--text"}`}>
      <div className="container">
        <Crumbs items={crumbs} />
        <div className="phero-grid swap">
          <div>
            {eyebrow && <span className="eyebrow eyebrow--accent">{eyebrow}</span>}
            <h1>
              {title}
              {titleContext && <span className="sr-only"> — {titleContext}</span>}
            </h1>
            {lead && <p className="phero-lead">{lead}</p>}
            {children && <div className="phero-actions">{children}</div>}
          </div>
          {(image || imageSrc) && (
            <Blueprint dimH={dimH} dimV={dimV} caption={caption}>
              <Photo
                slot={image}
                src={imageSrc}
                alt={imageAlt}
                ratio="4 / 3"
                tone="dark"
                preload
                sizes="(max-width: 900px) 100vw, 45vw"
              />
            </Blueprint>
          )}
        </div>
      </div>
    </section>
  );
}
