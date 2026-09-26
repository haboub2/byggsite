/** Orange drafting marks around a photo: corner brackets, a horizontal and a
 *  vertical dimension line, and a small-caps caption underneath. Taken from
 *  the folded-beam B in the logo; used the same way on both sides. */
export default function Blueprint({
  children,
  dimH,
  dimV,
  caption,
  className = "",
}: {
  children: React.ReactNode;
  dimH?: string;
  dimV?: string;
  caption?: string;
  className?: string;
}) {
  return (
    <figure className={`bp ${className}`.trim()} data-motion="draw">
      <div className="bp-frame">
        {children}
        <span className="bp-corner bp-corner--tr" aria-hidden="true" />
        <span className="bp-corner bp-corner--bl" aria-hidden="true" />
        {dimH && (
          <span className="bp-dim bp-dim--h" aria-hidden="true">
            <span>{dimH}</span>
          </span>
        )}
        {dimV && (
          <span className="bp-dim bp-dim--v" aria-hidden="true">
            <span>{dimV}</span>
          </span>
        )}
      </div>
      {caption && <figcaption className="bp-caption">{caption}</figcaption>}
    </figure>
  );
}
