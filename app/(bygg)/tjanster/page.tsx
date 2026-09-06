import type { Metadata } from "next";
import Reveal from "@/components/Reveal";
import { Icon } from "@/components/Icons";
import { services } from "@/lib/placeholder";

export const metadata: Metadata = {
  title: "Tjänster",
  description:
    "Bygg och renovering i Halmstad — totalrenovering, badrum, kök, tillbyggnad, tak, golv, måleri, el & VVS och projektledning.",
  alternates: { canonical: "/tjanster" },
};

export default function TjansterIndex() {
  return (
    <section className="section">
      <div className="container">
        <Reveal className="section-head">
          <span className="eyebrow">Vad vi gör</span>
          <h2>Våra tjänster</h2>
          <p>Nio områden, ett team. Välj en tjänst för detaljer och exempel.</p>
        </Reveal>
        <div className="services-grid reveal-group">
          {services.map((s) => (
            <Reveal key={s.slug} className="service-card" href={`/tjanster/${s.slug}`}>
              <div className="service-icon">
                <Icon name={s.slug} />
              </div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
