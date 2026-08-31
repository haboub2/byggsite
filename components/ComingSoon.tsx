import Link from "next/link";
import Reveal from "./Reveal";

export default function ComingSoon({
  eyebrow,
  title,
  body,
  backHref = "/",
  backLabel = "Till startsidan",
}: {
  eyebrow: string;
  title: string;
  body: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <section className="section">
      <div className="container">
        <Reveal className="section-head">
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <p>{body}</p>
          <p style={{ marginTop: 24 }}>
            <Link href={backHref} className="btn btn-primary">
              {backLabel}
            </Link>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
