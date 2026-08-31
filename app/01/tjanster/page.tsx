import type { Metadata } from "next";
import Reveal from "@/components/Reveal";
import { software01 } from "@/lib/placeholder";

export const metadata: Metadata = {
  title: "01 — Tjänster",
  description: "Webb & portaler, automation & integrationer, interna system.",
  alternates: { canonical: "/01/tjanster" },
};

export default function SoftwareServices() {
  return (
    <section className="section">
      <div className="container">
        <Reveal className="section-head">
          <span className="eyebrow">01 — Mjukvara</span>
          <h2>Tjänster</h2>
          <p>Tre områden. Full text och typiska upplägg fylls på i nästa fas.</p>
        </Reveal>
        <div className="services-grid reveal-group">
          {software01.triad.map((t) => (
            <Reveal key={t.title} className="service-card">
              <h3>{t.title}</h3>
              <p>{t.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
