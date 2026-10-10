import Link from "next/link";
import { Icon } from "./Icons";
import Reveal from "./Reveal";

/* Presentational building blocks shared by both sides. All server components;
   the only interactivity (register rows, FAQ) uses native <details>. */

export function Stats({ items }: { items: { value: string; label: string }[] }) {
  return (
    <div className="stats">
      {items.map((s) => (
        <div className="stat" key={s.label}>
          <span className="stat-value">{s.value}</span>
          <span className="stat-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

export function SectionHead({
  eyebrow,
  title,
  aside,
  as: Tag = "h2",
}: {
  eyebrow: string;
  title: string;
  aside?: React.ReactNode;
  as?: "h1" | "h2";
}) {
  return (
    <Reveal className="sec-head">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <Tag>{title}</Tag>
      </div>
      {aside && (typeof aside === "string" ? <p>{aside}</p> : aside)}
    </Reveal>
  );
}

export type RegisterItem = { title: string; meta: string; body: string; href: string };

/** Numbered service index. `expand` rows open in place (landing page);
 *  otherwise every row is a plain link (service index pages). */
export function Register({
  items,
  expand = true,
  name,
}: {
  items: RegisterItem[];
  expand?: boolean;
  name: string;
}) {
  return (
    <div className="reg">
      {items.map((item, i) => {
        const n = String(i + 1).padStart(2, "0");
        if (!expand) {
          return (
            <div className="reg-row" key={item.href}>
              <Link href={item.href} className="reg-link">
                <span className="reg-num">{n}</span>
                <span className="reg-title">{item.title}</span>
                <span className="reg-meta">{item.meta}</span>
                <Icon name="arrow-up-right" className="reg-arrow" strokeWidth={1.6} />
              </Link>
            </div>
          );
        }
        return (
          <details className="reg-row" key={item.href} name={name}>
            <summary>
              <span className="reg-num">{n}</span>
              <span className="reg-title">{item.title}</span>
              <span className="reg-meta">{item.meta}</span>
              <Icon name="chevron" className="reg-arrow" strokeWidth={1.6} />
            </summary>
            <div className="reg-body">
              <div>
                <p>{item.body}</p>
                <Link href={item.href} className="link-arrow">
                  Läs mer om {item.title.toLowerCase()}
                  <Icon name="arrow" strokeWidth={2} />
                </Link>
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function Steps({ items }: { items: { n: string; title: string; body: string }[] }) {
  return (
    <ol className="steps reveal-group">
      {items.map((s) => (
        <Reveal as="li" className="step" key={s.n}>
          <span className="step-n">{s.n}</span>
          <h3>{s.title}</h3>
          <p>{s.body}</p>
        </Reveal>
      ))}
    </ol>
  );
}

export function Faq({ items, name }: { items: { q: string; a: string }[]; name: string }) {
  return (
    <div className="faq">
      {items.map((item) => (
        <details className="faq-item" key={item.q} name={name}>
          <summary>
            {item.q}
            <Icon name="plus" strokeWidth={1.6} />
          </summary>
          <p className="faq-a">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

export function Bridge({
  title,
  body,
  link,
  icon,
}: {
  title: string;
  body: string;
  link: { label: string; href: string };
  icon: string;
}) {
  return (
    <Reveal className="bridge">
      <span className="bridge-ic" aria-hidden="true">
        <Icon name={icon} strokeWidth={1.8} />
      </span>
      <div className="bridge-text">
        <strong>{title}</strong>
        <span>{body}</span>
      </div>
      <Link href={link.href} className="link-arrow">
        {link.label}
        <Icon name="arrow" strokeWidth={2} />
      </Link>
    </Reveal>
  );
}

export function CtaBand({
  eyebrow,
  title,
  body,
  cta,
}: {
  eyebrow: string;
  title: string;
  body: string;
  cta: { label: string; href: string };
}) {
  return (
    <section className="cta-band">
      <div className="container cta-band-inner">
        <div>
          <span className="eyebrow eyebrow--dark">{eyebrow}</span>
          <h2>{title}</h2>
          <p>{body}</p>
        </div>
        <Link href={cta.href} className="btn btn-primary">
          {cta.label}
          <Icon name="arrow" strokeWidth={2} />
        </Link>
      </div>
    </section>
  );
}

export function Checklist({ items, className = "incl" }: { items: string[]; className?: string }) {
  return (
    <ul className={className}>
      {items.map((x) => (
        <li key={x}>
          <Icon name="check" strokeWidth={2.2} />
          <span>{x}</span>
        </li>
      ))}
    </ul>
  );
}

export function Crumbs({
  items,
  light = false,
}: {
  items: { label: string; href?: string }[];
  light?: boolean;
}) {
  return (
    <nav className={`crumbs${light ? " crumbs--light" : ""}`} aria-label="Brödsmulor">
      {items.map((c, i) => (
        <span key={c.label} style={{ display: "contents" }}>
          {i > 0 && <span className="sep" aria-hidden="true">/</span>}
          {c.href ? (
            <Link href={c.href}>{c.label}</Link>
          ) : (
            <span aria-current="page">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
