import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { hasAccess } from "@/lib/core/org/roles";
import { todayIso } from "@/lib/quotes/schema";
import { loadPayrollOnboarding } from "@/lib/core/payroll/onboarding-store";
import { Flash } from "@/components/admin/time/parts";

export const metadata: Metadata = { title: "Kom igång med lön" };

const Check = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M5 12l5 5L20 7" />
  </svg>
);

/**
 * Kom igång med lön (docs/hr-lon.md, section 12 "Before the first real
 * payroll", phase 6): the steps from a new organisation to its first
 * payroll run, each read from the data (lib/core/payroll/onboarding.ts),
 * in the shape of the invoicing start guide. The first run unlocks when
 * every step is done; before that it can still be created, but the
 * checklist on the run says what is missing.
 */
export default async function PayrollOnboardingPage({ searchParams }: { searchParams: Promise<{ ok?: string; fel?: string }> }) {
  const check = await requireRole("payroll");
  if (!check.ok) redirect("/admin/login");
  const [sp, o] = await Promise.all([searchParams, loadPayrollOnboarding(todayIso())]);
  const admin = hasAccess(check.role, "admin");
  const left = o.total - o.done;

  return (
    <section className="sec sec--tight">
      <div className="container onb">
        <header className="onb-head">
          <span className="eyebrow eyebrow--accent">{check.orgName}</span>
          <h1 className="admin-h1">Kom igång med lön</h1>
          <p className="admin-intro">
            {left === 0 ? "Allt är klart för den första lönekörningen." : `${left} ${left === 1 ? "steg" : "steg"} kvar innan den första riktiga lönen. Besluten har lagens eller det vanliga standardvärdet tills du bekräftar dem, och körningen säger vad som saknas.`}
            {!admin && " Besluten tas av en ägare eller administratör; redovisningskonsulten räknar."}
          </p>
        </header>
        <Flash ok={sp.ok} error={sp.fel} />

        <div className="onb-progress" role="img" aria-label={`${o.done} av ${o.total} steg klara`}>
          <div className="onb-bar">
            <span style={{ width: `${Math.round((o.done / o.total) * 100)}%` }} />
          </div>
          <span>
            {o.done} av {o.total} klara
          </span>
        </div>

        <ol className="onb-steps">
          {o.steps.map((s) => (
            <li key={s.key} className={`onb-card${s.done ? " onb-card--done" : ""}${s.key === o.next?.key ? " onb-card--next" : ""}`}>
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
              ) : (
                <Link href={s.href} className={s.key === o.next?.key ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}>
                  {s.action}
                </Link>
              )}
            </li>
          ))}
        </ol>

        <div className={`onb-trial${o.complete ? " onb-trial--open" : ""}`}>
          <div>
            <h2>Sist: den första lönekörningen</h2>
            <p>
              Månad och lönedag, kontrollistan, beräkna, granska per person, låt en annan person godkänna, bankfil, bokför, stäng. Kör de två första månaderna parallellt med den gamla metoden och jämför rad för rad
              (docs/hr-lon.md, regel 9) innan lönebeskeden går ut.
            </p>
          </div>
          {o.complete ? (
            <Link href="/admin/lon" className="btn btn-primary btn-sm">
              Till lönekörningen
            </Link>
          ) : (
            <Link href="/admin/lon" className="btn btn-sm onb-trial-btn">
              Lönekörningen (stegen ovan saknas i kontrollistan)
            </Link>
          )}
        </div>

        <div className="onb-more">
          <div>
            <span className="onb-more-title">Skatteverket</span>
            <p>Arbetsgivardeklarationen laddas upp i e-tjänsten och signeras med BankID; filen görs under Lönerapporter. Prova testtjänsten först.</p>
            <Link href="/admin/rapporter">Lönerapporter</Link>
          </div>
          <div>
            <span className="onb-more-title">Fora och Collectum</span>
            <p>Teckna avtalen och hämta kundnumren; underlaget per månad görs under Lönerapporter och lämnas på deras sidor.</p>
            <Link href="/admin/installningar/lon#pension">Kundnummer</Link>
          </div>
          <div>
            <span className="onb-more-title">API och webhooks</span>
            <p>Anställda, tid, frånvaro, lönebesked och körningar finns i API:et; webhooks för godkänd lön, tid och utlägg.</p>
            <Link href="/admin/api">API</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
