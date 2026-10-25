import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/PageHero";
import Reveal from "@/components/Reveal";
import RegistrationForm from "@/components/RegistrationForm";
import { pageMetadata } from "@/lib/seo";
import { PRODUCT_NAME, PRODUCT_PATH } from "@/lib/product";

export const metadata: Metadata = pageMetadata({
  title: `Registrera företaget — ${PRODUCT_NAME}`,
  description: `Kom igång med ${PRODUCT_NAME}: registrera byggföretaget, få en inloggningslänk och följ startguiden till första fakturan.`,
  path: "/registrera",
  absoluteTitle: true,
  noindex: true,
});

const NEXT = [
  { n: "01", title: "Länk i mejlen", body: "Öppna länken så skapas företagets konto, med dig som ägare." },
  { n: "02", title: "Startguiden", body: "Företagsuppgifter, bankgiro eller Swish, villkor och logotyp. Ett par minuter." },
  { n: "03", title: "Provfaktura", body: "Skicka en första faktura till dig själv och se hur kunden får den." },
];

/** Self-registration for a new company (0033). Linked from /fakturering and the login page. */
export default function RegisterPage() {
  return (
    <>
      <PageHero
        crumbs={[{ label: "Fakturering", href: PRODUCT_PATH }, { label: "Registrera" }]}
        eyebrow={PRODUCT_NAME}
        title="Registrera företaget"
        lead="Ingen inbjudan behövs. Fyll i fyra uppgifter, öppna länken i mejlet och följ startguiden till er första faktura."
      />
      <section className="sec sec--alt">
        <div className="container">
          <div className="form-layout">
            <Reveal className="form-intro">
              <span className="eyebrow eyebrow--accent">Kom igång</span>
              <h2>Ert eget konto</h2>
              <p>Egna kunder, fakturor, nummerserier och bokföring. Fakturanumren börjar på 1, och ni kan bjuda in kollegor och revisorn när ni är igång.</p>
            </Reveal>
            <Reveal className="form-main">
              <RegistrationForm product={PRODUCT_NAME} />
            </Reveal>
            <Reveal className="form-aside">
              <div className="note-card">
                <span className="eyebrow">Sedan</span>
                <ol className="reg-next">
                  {NEXT.map((s) => (
                    <li key={s.n}>
                      <strong>{s.title}</strong>
                      <p>{s.body}</p>
                    </li>
                  ))}
                </ol>
                <p>
                  Vill ni hellre prata först? <Link href={`${PRODUCT_PATH}#intresse`}>Anmäl intresse</Link> så hör vi av oss.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}
