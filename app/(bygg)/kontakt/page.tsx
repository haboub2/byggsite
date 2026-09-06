import type { Metadata } from "next";
import Reveal from "@/components/Reveal";
import LeadForm from "@/components/LeadForm";
import { Icon } from "@/components/Icons";
import { site } from "@/lib/placeholder";

export const metadata: Metadata = {
  title: "Kontakt",
  description: `Kontakta Byggly i Halmstad — ${site.contact.phoneDisplay}, ${site.contact.email}.`,
  alternates: { canonical: "/kontakt" },
};

export default function KontaktPage() {
  const tel = `tel:${site.contact.phone}`;
  const mail = `mailto:${site.contact.email}`;
  return (
    <section className="section">
      <div className="container contact-layout">
        <Reveal className="contact-info" variant="left">
          <span className="eyebrow">Hör av dig</span>
          <h2>Kontakta oss</h2>
          <p>Frågor om ett projekt eller våra tjänster? Skicka ett meddelande så svarar vi snart.</p>
          <ul className="contact-list">
            <li>
              <span className="ci-icon"><Icon name="user" strokeWidth={1.8} /></span>
              <div><strong>Kontaktperson</strong><span>{site.contact.person}</span></div>
            </li>
            <li>
              <span className="ci-icon"><Icon name="pin" strokeWidth={1.8} /></span>
              <div><strong>Besök oss</strong><span>{site.contact.address}</span></div>
            </li>
            <li>
              <span className="ci-icon"><Icon name="phone" strokeWidth={1.8} /></span>
              <div><strong>Ring oss</strong><span><a href={tel}>{site.contact.phoneDisplay}</a></span></div>
            </li>
            <li>
              <span className="ci-icon"><Icon name="mail" strokeWidth={1.8} /></span>
              <div><strong>Mejla oss</strong><span><a href={mail}>{site.contact.email}</a></span></div>
            </li>
            <li>
              <span className="ci-icon"><Icon name="clock" strokeWidth={1.8} /></span>
              <div><strong>Öppettider</strong><span>{site.contact.hours}</span></div>
            </li>
          </ul>
        </Reveal>
        <Reveal variant="right">
          <LeadForm variant="kontakt" />
        </Reveal>
      </div>
    </section>
  );
}
