import type { Metadata } from "next";
import Reveal from "@/components/Reveal";
import LeadForm from "@/components/LeadForm";
import { site } from "@/lib/placeholder";

export const metadata: Metadata = {
  title: "Begär offert",
  description:
    "Kostnadsfri och specificerad offert på ditt bygg- eller renoveringsprojekt i Halmstad — svar inom 24 timmar.",
  alternates: { canonical: "/offert" },
};

export default function OffertPage() {
  return (
    <section className="section">
      <div className="container offer-layout">
        <Reveal className="offer-intro" variant="left">
          <span className="eyebrow">Kostnadsfritt &amp; utan förpliktelser</span>
          <h2>Begär din offert</h2>
          <p>
            Fyll i uppgifterna om ditt projekt så återkommer vi med en skräddarsydd
            offert inom 24 timmar.
          </p>
          <ul className="offer-benefits">
            <li>Detaljerad, specificerad prissättning</li>
            <li>Inga dolda kostnader</li>
            <li>Svar inom en arbetsdag</li>
          </ul>
          <div className="offer-contact-card">
            <p>Vill du hellre prata?</p>
            <a href={`tel:${site.contact.phone}`} className="offer-phone">
              {site.contact.phoneDisplay}
            </a>
            <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>
          </div>
        </Reveal>
        <Reveal variant="right">
          <LeadForm variant="offert" />
        </Reveal>
      </div>
    </section>
  );
}
