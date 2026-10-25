import type { Metadata } from "next";
import RegistrationForm from "@/components/RegistrationForm";
import { pageMetadata } from "@/lib/seo";
import { PRODUCT_NAME } from "@/lib/product";

export const metadata: Metadata = pageMetadata({
  title: `Registrera ditt byggföretag — ${PRODUCT_NAME}`,
  description: `Kom igång med ${PRODUCT_NAME}: registrera byggföretaget, få en inloggningslänk och följ startguiden till första fakturan.`,
  path: "/registrera",
  absoluteTitle: true,
  noindex: true,
});

const STEPS = [
  "Fyll i företag och e-post här.",
  "Klicka på länken i mejlet. Den loggar in dig och skapar företaget.",
  "Startguiden tar dig genom bankgiro, logotyp och första kunden, och slutar med en provfaktura till dig själv.",
];

/**
 * Self-registration for a new company (0033), after the approved mockup
 * (Main.dc.html in the session's design canvas): the steps on the left, the
 * form on the right. Linked from /fakturering and the login page.
 */
export default function RegisterPage() {
  return (
    <section className="sec reg-page">
      <div className="container reg-layout">
        <div className="reg-intro">
          <span className="eyebrow eyebrow--accent">Kom igång på fem minuter</span>
          <h1>Registrera ditt byggföretag</h1>
          <p className="reg-lead">
            Inget lösenord, inget kort. Du får en länk till din e-post, klickar på den, och företaget är igång med egna fakturanummer, bokföring och
            kundportal.
          </p>
          <ol className="reg-steps">
            {STEPS.map((s, i) => (
              <li key={s}>
                <span aria-hidden="true">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <p className="reg-honest">
            Vi använder systemet själva på Binaafy AB. Pris sätts tillsammans med de första företagen, och du kan ta med dig all data i CSV, PDF och
            JSON om du slutar.
          </p>
        </div>
        <RegistrationForm product={PRODUCT_NAME} />
      </div>
    </section>
  );
}
