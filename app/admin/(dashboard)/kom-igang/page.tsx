import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { loadOnboarding } from "@/lib/core/org/onboarding-store";
import { PRODUCT_NAME } from "@/lib/product";
import OnboardingReset from "@/components/admin/OnboardingReset";

export const metadata = { title: "Kom igång" };

/** The start guide: six steps from a new organisation to its first (trial) invoice, each read from the data. */
export default async function GettingStartedPage({ searchParams }: { searchParams: Promise<{ ny?: string }> }) {
  const check = await requireRole("write");
  if (!check.ok) redirect("/admin/ekonomi");
  const [{ steps, progress }, { ny }] = await Promise.all([loadOnboarding(check.orgId, check.site), searchParams]);
  const admin = check.role === "owner" || check.role === "admin";

  return (
    <section className="sec sec--tight">
      <div className="container" style={{ maxWidth: 820 }}>
        <span className="eyebrow">{check.orgName}</span>
        <h1 className="admin-h1">Kom igång</h1>
        {ny ? (
          <p className="form-feedback" role="status" style={{ marginTop: 12 }}>
            Välkommen till {PRODUCT_NAME}. {check.orgName} är skapat och du är ägare. Gå igenom stegen nedan, uppifrån och ner.
          </p>
        ) : (
          <p className="admin-intro">Det som behövs innan första riktiga fakturan. Stegen bockas av av sig själva när uppgifterna finns.</p>
        )}

        <div className="onb-progress" aria-label={`${progress.done} av ${progress.total} steg klara`}>
          <div className="onb-bar">
            <span style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
          </div>
          <span>
            {progress.complete ? "Allt klart" : `${progress.done} av ${progress.total} klara`}
          </span>
        </div>

        <ol className="onb-steps">
          {steps.map((s, i) => (
            <li key={s.key} className={s.done ? "onb-step onb-step--done" : progress.next?.key === s.key ? "onb-step onb-step--next" : "onb-step"}>
              <span className="onb-n" aria-hidden="true">
                {s.done ? "✓" : i + 1}
              </span>
              <div className="onb-main">
                <h2>
                  {s.title} <span className="onb-status">{s.done ? "Klar" : "Ej klar"}</span>
                </h2>
                <p>{s.body}</p>
              </div>
              {s.done ? (
                <Link href={s.href} className="link-quiet">
                  Ändra
                </Link>
              ) : (
                <Link href={s.href} className={progress.next?.key === s.key ? "btn btn-primary" : "btn btn-ghost"}>
                  {s.action}
                </Link>
              )}
            </li>
          ))}
        </ol>

        {!admin && <p className="efield-hint">Företagsuppgifter, betalning, villkor och logotyp ändras av ägare och administratörer.</p>}
        {progress.complete ? (
          <p className="admin-intro" style={{ marginTop: 24 }}>
            Klart. <Link href="/admin/fakturor">Till fakturorna</Link> eller <Link href="/admin/organisation">bjud in kollegor och revisorn</Link>.
          </p>
        ) : (
          <OnboardingReset orgId={check.orgId} />
        )}
      </div>
    </section>
  );
}
