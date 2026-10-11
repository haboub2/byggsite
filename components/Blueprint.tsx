/** Orange drafting marks around a photo: two corner brackets and an optional
 *  small-caps caption underneath (only for real information: place and year,
 *  last update, tech stack). Taken from
 *  the folded-beam B in the logo; used the same way on both sides. */
export default function Blueprint({
  children,
  caption,
  className = "",
}: {
  children: React.ReactNode;
  caption?: string;
  className?: string;
}) {
  return (
    <figure className={`bp ${className}`.trim()} data-motion="draw">
      <div className="bp-frame">
        {children}
        <span className="bp-corner bp-corner--tr" aria-hidden="true" />
        <span className="bp-corner bp-corner--bl" aria-hidden="true" />
      </div>
      {caption && <figcaption className="bp-caption">{caption}</figcaption>}
    </figure>
  );
}
