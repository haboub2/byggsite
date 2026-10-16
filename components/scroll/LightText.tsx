import { Fragment } from "react";

/** A paragraph whose words brighten one after another as it scrolls past;
 *  the words in `highlight` turn orange. Real text: readable without JS. */
export default function LightText({ text, highlight, className = "" }: { text: string; highlight?: string; className?: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  const hl = highlight ? highlight.split(/\s+/) : [];
  // Index range of the highlighted phrase, if it occurs in the text.
  let start = -1;
  if (hl.length) {
    for (let i = 0; i + hl.length <= words.length; i++) {
      if (hl.every((h, j) => words[i + j] === h)) {
        start = i;
        break;
      }
    }
  }
  return (
    <p className={`lit ${className}`.trim()} data-scroll="cross" style={{ "--n": words.length } as React.CSSProperties}>
      {words.map((w, i) => (
        <Fragment key={i}>
          {i > 0 && " "}
          <span className={start >= 0 && i >= start && i < start + hl.length ? "lit-w lit-hl" : "lit-w"} style={{ "--i": i } as React.CSSProperties}>
            {w}
          </span>
        </Fragment>
      ))}
    </p>
  );
}
