import Link from "next/link";
import Photo from "../Photo";
import { Icon } from "../Icons";

type Card = { title: string; meta: string; body: string; href: string; slot: string };

/** One full card per service; each new card slides up and stacks on the last. */
export default function StackCards({ items }: { items: Card[] }) {
  return (
    <div className="stack" data-stack>
      {items.map((c, i) => (
        <article className="stack-card" key={c.href} data-stack-card style={{ "--i": i } as React.CSSProperties}>
          <div className="stack-text">
            <span className="stack-meta">
              {String(i + 1).padStart(2, "0")} · {c.meta}
            </span>
            <h3>{c.title}</h3>
            <p>{c.body}</p>
            <Link href={c.href} className="link-arrow">
              Läs mer om {c.title.toLowerCase()}
              <Icon name="arrow" strokeWidth={2} />
            </Link>
          </div>
          <div className="stack-photo">
            <Photo slot={c.slot} ratio="auto" tone="dark" sizes="(max-width: 760px) 100vw, 45vw" curtain={false} />
          </div>
        </article>
      ))}
    </div>
  );
}
