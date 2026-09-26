import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Icon } from "@/components/Icons";

export default function NotFound() {
  return (
    <>
      <Header />
      <main id="main">
        <section className="phero phero--text" style={{ minHeight: "60vh", display: "flex", alignItems: "center" }}>
          <div className="container">
            <span className="eyebrow eyebrow--accent">404</span>
            <h1>Här finns inget att bygga på.</h1>
            <p className="phero-lead">Länken kan vara gammal eller felstavad. Välj en sida att fortsätta från.</p>
            <div className="phero-actions">
              <Link href="/" className="btn btn-primary">
                Bygg
                <Icon name="arrow" strokeWidth={2} />
              </Link>
              <Link href="/mjukvara" className="link-quiet">
                Software
              </Link>
              <Link href="/kontakt" className="link-quiet">
                Kontakt
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
