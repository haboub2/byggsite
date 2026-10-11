/** A house elevation drawn by the scroll, line by line, with the dimensions
 *  last. pathLength="1" lets the CSS drive every line from the same --p. */
const LINES = [
  "M40 330 H480",
  "M80 330 V170 L260 60 L440 170 V330",
  "M80 170 H440",
  "M120 330 V250 H180 V330",
  "M230 210 H300 V280 H230 Z M265 210 V280 M230 245 H300",
  "M340 210 H410 V280 H340 Z M375 210 V280 M340 245 H410",
  "M330 104 V60 H360 V122",
];
const DIMS = ["M80 352 H440 M80 344 V360 M440 344 V360", "M462 60 V330 M454 60 H470 M454 330 H470"];

export default function BlueprintDraw({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  const total = LINES.length + DIMS.length;
  return (
    <section className="sec bpd" data-scroll="cross">
      <div className="container bpd-grid">
        <svg viewBox="0 0 520 380" role="img" aria-label="Linjeritning av en husfasad med mått">
          {LINES.map((d, i) => (
            <path key={d} d={d} pathLength={1} className="bpd-ln" style={{ "--s": i / total } as React.CSSProperties} />
          ))}
          {DIMS.map((d, i) => (
            <path key={d} d={d} pathLength={1} className="bpd-ln bpd-ln--dim" style={{ "--s": (LINES.length + i) / total } as React.CSSProperties} />
          ))}
          <text x="226" y="374" className="bpd-dim">9 600 mm</text>
          <text x="472" y="196" className="bpd-dim" transform="rotate(90 472 196)">6 200 mm</text>
        </svg>
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2 className="bpd-title">{title}</h2>
          <p className="bpd-body">{body}</p>
        </div>
      </div>
    </section>
  );
}
