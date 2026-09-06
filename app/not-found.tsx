import Link from "next/link";

export default function NotFound() {
  return (
    <div className="division-root" data-division="bygg">
      <main>
        <section className="section">
          <div className="container" style={{ textAlign: "center", maxWidth: 560 }}>
            <span className="eyebrow">404</span>
            <h1 style={{ margin: "16px 0", fontSize: "clamp(2rem, 5vw, 3rem)" }}>
              Sidan hittades inte
            </h1>
            <p style={{ color: "var(--muted)", marginBottom: 28 }}>
              Länken kan vara gammal eller felstavad.
            </p>
            <Link href="/" className="btn btn-primary">
              Till startsidan
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
