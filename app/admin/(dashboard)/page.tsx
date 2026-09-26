import type { Metadata } from "next";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Admin — översikt",
  robots: { index: false, follow: false },
};

const SECTIONS = [
  { title: "Företag", body: "NAP, öppettider, sociala länkar, juridisk info — content_blocks.site." },
  { title: "Bygg", body: "Hero, stats, process, FAQ och tjänsteordning — content_blocks.bygg + services." },
  { title: "Software", body: "Hero, stats och tjänster — content_blocks.software." },
  { title: "Projekt", body: "CRUD för projects, ladda upp bilder till Storage." },
  { title: "Galleri", body: "CRUD för gallery_images." },
  { title: "Leads", body: "Tabell över offert/kontakt/brief-inskick, status och CSV-export." },
];

export default function AdminDashboard() {
  return (
    <section className="sec">
      <div className="container">
        <div>
          <span className="eyebrow">Admin</span>
          <h1 style={{ fontSize: 40, marginTop: 8 }}>Översikt</h1>
          <p style={{ marginTop: 12, color: "var(--ink-2)", maxWidth: "60ch" }}>
            Inloggning och behörighet fungerar. Formulären för varje sektion byggs i nästa
            fas, mot den riktiga datan i Supabase.
          </p>
        </div>
        <div className="admin-grid reveal-group">
          {SECTIONS.map((s) => (
            <Reveal key={s.title} className="admin-card">
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
