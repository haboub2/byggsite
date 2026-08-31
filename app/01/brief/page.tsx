import type { Metadata } from "next";
import Reveal from "@/components/Reveal";
import LeadForm from "@/components/LeadForm";

export const metadata: Metadata = {
  title: "01 — Brief",
  description: "Berätta kort om projektet så återkommer vi med hur vi skulle angripa det.",
  alternates: { canonical: "/01/brief" },
};

export default function BriefPage() {
  return (
    <section className="section">
      <div className="container offer-layout">
        <Reveal className="offer-intro" variant="left">
          <span className="eyebrow">01 — Mjukvara</span>
          <h2>Skicka en brief</h2>
          <p>
            Beskriv läget: vad skaver, vilka system används idag, och vad ett bra
            utfall vore. Vi återkommer inom två arbetsdagar.
          </p>
          <ul className="offer-benefits">
            <li>Konkret angreppssätt, inte en säljpitch</li>
            <li>Uppskattad omfattning och upplägg</li>
            <li>Ingen kostnad, inga förpliktelser</li>
          </ul>
        </Reveal>
        <Reveal variant="right">
          <LeadForm variant="brief" />
        </Reveal>
      </div>
    </section>
  );
}
