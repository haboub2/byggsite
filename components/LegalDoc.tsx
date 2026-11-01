import type { ReactNode } from "react";

/**
 * The shell for the legal pages (/villkor, /personuppgiftsbitradesavtal,
 * /integritetspolicy): version and date at the top, numbered sections,
 * tables that scroll sideways on a phone. Plain markup, no animation, so
 * the text can be printed and read as a document.
 */
export default function LegalDoc({
  version,
  date,
  intro,
  children,
}: {
  version: string;
  date: string;
  /** One paragraph before the first section. */
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="legal-doc">
      <p className="legal-meta">
        <span>Version {version}</span>
        <span>Gäller från {date}</span>
      </p>
      {intro && <p>{intro}</p>}
      {children}
    </article>
  );
}

/** A numbered section: the number is part of the heading so references ("se punkt 9") work in print. */
export function LegalSection({ n, title, children }: { n: number | string; title: string; children: ReactNode }) {
  return (
    <section id={`p-${String(n).replace(/\W/g, "-").toLowerCase()}`}>
      <h2>
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

export function LegalTable({ head, rows, caption }: { head: string[]; rows: ReactNode[][]; caption?: string }) {
  return (
    <div className="legal-table-wrap">
      <table className="legal-table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
