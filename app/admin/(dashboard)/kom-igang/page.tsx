import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { loadOnboarding } from "@/lib/core/org/onboarding-store";
import { stepRange } from "@/lib/core/org/onboarding";
import { approveDefaultTermsAction } from "@/app/admin/org-actions";
import { PRODUCT_MANUAL_URL } from "@/lib/product";
import OnboardingReset from "@/components/admin/OnboardingReset";

export const metadata = { title: "Kom igång" };

const Check = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M5 12l5 5L20 7" />
  </svg>
);

/**
 * The start guide: five steps from a new organisation to its first real
 * invoice, each read from the data, then a trial invoice to oneself that
 * unlocks when the five are done. Built after the approved mockup
 * (KomIgang.dc.html in the session's design canvas).
 */
export default async function GettingStartedPage({ searchParams }: { searchParams: Promise<{ ny?: string }> }) {
  const check = await requireRole("write");
  if (!check.ok) redirect("/admin/ekonomi");
  const [{ steps, trial, progress, settings }, { ny }] = await Promise.all([loadOnboarding(check.orgId, check.site), searchParams]);
  const admin = check.role === "owner" || check.role === "admin";
  const firstName = settings.company.signer.trim().split(/\s+/)[0];
  const left = progress.total - progress.done;
  const next = steps.find((s) => !s.done)?.key;

  return (
    <section className="sec sec--tight">
      <div className="container onb">
        <header className="onb-head">
          <span className="eyebrow eyebrow--accent">{firstName ? `Välkommen, ${firstName}` : "Välkommen"}</span>
          <h1 className="admin-h1">Kom igång med faktureringen</h1>
          <p className="admin-intro">
            {ny ? "Företaget är skapat med fakturanummer från 1, kontoplan och obrutna serier. " : ""}
            {left === 0
              ? "Alla fem steg är klara."
              : `${left === 1 ? "Ett steg" : `${["", "", "Två", "Tre", "Fyra", "Fem"][left]} steg`} kvar innan första riktiga fakturan. Du kan göra dem i vilken ordning du vill.`}
          </p>
        </header>

        <div className="onb-progress" role="img" aria-label={`${progress.done} av ${progress.total} steg klara`}>
          <div className="onb-bar">
            <span style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
          </div>
          <span>
            {progress.done} av {progress.total} klara
          </span>
        </div>

        <ol className="onb-steps">
          {steps.map((s) => (
            <li key={s.key} className={`onb-card${s.done ? " onb-card--done" : ""}${s.key === next ? " onb-card--next" : ""}`}>
              <span className="onb-n">{s.done ? <Check /> : s.n}</span>
              <div className="onb-main">
                <h2>
                  {s.title}
                  <span className="sr-only">{s.done ? ", klart" : ", inte klart"}</span>
                </h2>
                <p>{s.body}</p>
              </div>
              {s.done ? (
                <Link href={s.href} className="onb-edit">
                  Ändra
                </Link>
              ) : s.action === "approve-terms" ? (
                admin ? (
                  <form action={approveDefaultTermsAction} className="onb-actions">
                    <Link href={s.href} className="onb-edit">
                      Ändra
                    </Link>
                    <button type="submit" className={s.key === next ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}>
                      Godkänn förvalet
                    </button>
                  </form>
                ) : (
                  <Link href={s.href} className="btn btn-ghost btn-sm">
                    Visa
                  </Link>
                )
              ) : (
                <Link href={s.href} className={s.key === next ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}>
                  {s.action}
                </Link>
              )}
            </li>
          ))}
        </ol>

        <div className={`onb-trial${trial.unlocked ? " onb-trial--open" : ""}`}>
          <div>
            <h2>{trial.done ? "Provfakturan finns" : "Sist: en provfaktura till dig själv"}</h2>
            <p>
              1 kr till din egen e-post. Du ser PDF:en, Swish-QR:en, kundens betalsida och verifikatet under Ekonomi. Kreditera den efteråt, så är
              serien ren.
            </p>
          </div>
          {trial.done ? (
            <Link href="/admin/fakturor" className="btn btn-sm onb-trial-btn">
              Till fakturorna
            </Link>
          ) : trial.unlocked ? (
            <Link href={trial.href} className="btn btn-primary btn-sm">
              Skapa provfakturan
            </Link>
          ) : (
            <span className="btn btn-sm onb-trial-btn" aria-disabled="true">
              Låst tills steg {stepRange(trial.waitingFor)} är {trial.waitingFor.length === 1 ? "klart" : "klara"}
            </span>
          )}
        </div>

        <div className="onb-more">
          <div>
            <span className="onb-more-title">Bjud in kollegor</span>
            <p>Personal skapar fakturor, revisorn läser bokföringen. Roller styr vad var och en ser.</p>
            <Link href="/admin/organisation">Organisation</Link>
          </div>
          <div>
            <span className="onb-more-title">Bankfilen</span>
            <p>Beställ Bankgiro Inbetalningar med OCR hos banken. Sedan matchas betalningarna själva.</p>
            <Link href="/admin/fakturor/bank">Läs hur</Link>
          </div>
          <div>
            <span className="onb-more-title">Manualen</span>
            <p>Steg för steg med skärmbilder: fakturor, ROT, påminnelser, rättelser, export.</p>
            {PRODUCT_MANUAL_URL ? <a href={PRODUCT_MANUAL_URL}>Öppna manualen</a> : <span className="onb-soon">Kommer snart som webbsida</span>}
          </div>
        </div>

        {!admin && <p className="efield-hint">Företagsuppgifter, betalning, villkor och logotyp ändras av ägare och administratörer.</p>}
        {progress.complete ? (
          <p className="efield-hint">Allt är klart, och guiden visas inte längre överst i admin.</p>
        ) : (
          <OnboardingReset orgId={check.orgId} />
        )}
      </div>
    </section>
  );
}
