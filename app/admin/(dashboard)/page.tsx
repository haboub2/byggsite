import type { Metadata } from "next";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Admin — översikt",
  robots: { index: false, follow: false },
};

const SECTIONS = [
  { title: "Företag", body: "NAP, öppettider, sociala länkar, juridisk info — content_blocks.site." },
  { title: "Bygg", body: "Hero, stats, process, FAQ och tjänsteordning — content_blocks.bygg + services." },
  { title: "01", body: "Hero, stats och tjänstetriad — content_blocks.software." },
  { title: "Projekt", body: "CRUD för projects, ladda upp bilder till Storage." },
  { title: "Galleri", body: "CRUD för gallery_images." },
  { title: "Leads", body: "Tabell över offert/kontakt/brief-inskick, status och CSV-export." },
];

export default function AdminDashboard() {
  return (
    <section className="section">
      <div className="container">
        <div className="section-head" style={{ textAlign: "left", margin: 0, maxWidth: "none" }}>
          <span className="eyebrow">Admin</span>
          <h2>Översikt</h2>
          <p>
            Inloggning och behörighet fungerar. Formulären för varje sektion byggs i nästa
            fas, mot den riktiga datan i Supabase.
          </p>
        </div>
        <div className="services-grid reveal-group" style={{ marginTop: 32 }}>
          {SECTIONS.map((s) => (
            <Reveal key={s.title} className="service-card">
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
