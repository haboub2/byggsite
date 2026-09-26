import Photo from "./Photo";
import Blueprint from "./Blueprint";
import { Crumbs } from "./Sections";

/** Dark hero for every subpage: breadcrumb, kicker, title, lead, and an
 *  optional photo with the blueprint marks. */
export default function PageHero({
  crumbs,
  eyebrow,
  title,
  lead,
  image,
  dimH,
  dimV,
  caption,
  children,
}: {
  crumbs: { label: string; href?: string }[];
  eyebrow?: string;
  title: string;
  lead?: string;
  image?: string;
  dimH?: string;
  dimV?: string;
  caption?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className={`phero${image ? "" : " phero--text"}`}>
      <div className="container">
        <Crumbs items={crumbs} />
        <div className="phero-grid swap">
          <div>
            {eyebrow && <span className="eyebrow eyebrow--accent">{eyebrow}</span>}
            <h1>{title}</h1>
            {lead && <p className="phero-lead">{lead}</p>}
            {children && <div className="phero-actions">{children}</div>}
          </div>
          {image && (
            <Blueprint dimH={dimH} dimV={dimV} caption={caption}>
              <Photo slot={image} ratio="4 / 3" tone="dark" preload sizes="(max-width: 900px) 100vw, 45vw" />
            </Blueprint>
          )}
        </div>
      </div>
    </section>
  );
}
