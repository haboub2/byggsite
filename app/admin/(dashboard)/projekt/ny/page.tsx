import Link from "next/link";
import { createProjectBlank, createProjectFromQuote, removePhaseTemplateAction } from "@/app/admin/portal-actions";
import { formatDays } from "@/lib/workdays";
import { kr, quoteTotals } from "@/lib/quotes/math";
import { listQuotes } from "@/lib/quotes/store";
import { BUILT_IN_PHASE_TEMPLATES, guessPhaseTemplate, templateValue } from "@/lib/portal/phase-templates";
import type { SavedPhaseTemplate } from "@/lib/portal/schema";
import { listPhaseTemplates, listProjects } from "@/lib/portal/store";

const total = (phases: { days: number }[]) => formatDays(phases.reduce((n, p) => n + p.days, 0));

/** The phase template a new project starts from; the quote title preselects one. */
function TemplateSelect({ saved, value, id }: { saved: SavedPhaseTemplate[]; value: string; id?: string }) {
  return (
    <select name="template" defaultValue={value} id={id} aria-label="Mall för tidplanen">
      <optgroup label="Mallar">
        {BUILT_IN_PHASE_TEMPLATES.map((t) => (
          <option key={t.key} value={templateValue(t)}>
            {t.name} ({total(t.phases)})
          </option>
        ))}
      </optgroup>
      {saved.length > 0 && (
        <optgroup label="Egna mallar">
          {saved.map((t) => (
            <option key={t.id} value={templateValue(t)}>
              {t.name}
              {t.job_type ? `, ${t.job_type}` : ""} ({total(t.phases)})
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

export default async function NewPortalProject({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { fel } = await searchParams;
  const [accepted, projects, saved] = await Promise.all([listQuotes({ status: "accepted" }), listProjects(), listPhaseTemplates()]);
  const taken = new Set(projects.map((p) => p.quote_id).filter(Boolean));
  const free = accepted.filter((q) => !taken.has(q.id));
  const error = fel === "offert" ? "Offerten finns inte längre." : typeof fel === "string" ? fel : null;

  return (
    <section className="sec sec--tight">
      <div className="container" style={{ maxWidth: 860 }}>
        <Link href="/admin/projekt" className="link-quiet">
          ← Alla byggprojekt
        </Link>
        <div style={{ marginTop: 18 }}>
          <span className="eyebrow">Admin</span>
          <h1 className="admin-h1">Nytt projekt</h1>
          <p className="admin-intro">
            Välj en accepterad offert så följer kund, adress och rubrik med, och offertens PDF läggs under Dokument. Välj en mall
            för tidplanen och ett startdatum, så räknas datumen fram. Dagarna per fas justeras efteråt.
          </p>
        </div>
        {error && (
          <p className="form-feedback error" role="alert" style={{ marginTop: 14 }}>
            {error}
          </p>
        )}

        <h2 className="admin-h2" style={{ marginTop: 32 }}>
          Från en accepterad offert
        </h2>
        {free.length === 0 ? (
          <div className="inbox-empty">
            <p>
              Inga accepterade offerter utan projekt. Sätt status <em>Accepterad</em> på offerten under{" "}
              <Link href="/admin/offerter" className="link-quiet">Offerter</Link>, så dyker den upp här.
            </p>
          </div>
        ) : (
          <ul className="inbox-list">
            {free.map((q) => (
              <li key={q.id}>
                <form action={createProjectFromQuote} className="inbox-row portal-pick">
                  <input type="hidden" name="quote" value={q.id} />
                  <span className="inbox-status">{q.number}</span>
                  <span className="inbox-main">
                    <strong>{q.data.customer.company || q.data.customer.name || "Utan kund"}</strong>
                    <span className="inbox-meta">
                      {q.data.title}
                      {q.data.customer.city ? ` · ${q.data.customer.city}` : ""} · {kr(quoteTotals(q.data).pay)}
                    </span>
                  </span>
                  <span className="inbox-side portal-pick-side">
                    <TemplateSelect saved={saved} value={guessPhaseTemplate(q.data.title)} />
                    <input type="date" name="starts_on" aria-label="Startdatum" />
                    <button type="submit" className="btn btn-dark">
                      Skapa projekt
                    </button>
                  </span>
                </form>
              </li>
            ))}
          </ul>
        )}

        <h2 className="admin-h2" style={{ marginTop: 40 }}>
          Utan offert
        </h2>
        <form action={createProjectBlank} className="editor" noValidate>
          <fieldset className="efieldset">
            <div className="egrid egrid--three">
              <div className="efield">
                <label htmlFor="n-title">Projektnamn</label>
                <input id="n-title" name="title" required maxLength={120} placeholder="Badrumsrenovering" />
              </div>
              <div className="efield">
                <label htmlFor="n-customer">Kund</label>
                <input id="n-customer" name="customer_name" maxLength={120} />
              </div>
              <div className="efield">
                <label htmlFor="n-address">Adress</label>
                <input id="n-address" name="address" maxLength={160} />
              </div>
              <div className="efield">
                <label htmlFor="n-template">Mall för tidplanen</label>
                <TemplateSelect saved={saved} value="builtin:badrum" id="n-template" />
              </div>
              <div className="efield">
                <label htmlFor="n-start">Startdatum</label>
                <input id="n-start" name="starts_on" type="date" />
                <span className="efield-hint">Kan sättas senare.</span>
              </div>
              <div className="efield">
                <span className="efield-label">Lördagar</span>
                <label className="tl-check">
                  <input type="checkbox" name="works_saturdays" />
                  <span>Vi jobbar lördagar</span>
                </label>
              </div>
            </div>
            <button type="submit" className="btn btn-ghost" style={{ marginTop: 16 }}>
              Skapa tomt projekt
            </button>
          </fieldset>
        </form>

        {saved.length > 0 && (
          <>
            <h2 className="admin-h2" style={{ marginTop: 40 }}>
              Egna mallar
            </h2>
            <p className="admin-shown">Sparade från ett projekts tidplan med Spara som mall.</p>
            <ul className="portal-members">
              {saved.map((t) => (
                <li key={t.id}>
                  <span>
                    <strong>{t.name}</strong>
                    {t.job_type ? ` · ${t.job_type}` : ""}
                  </span>
                  <span className="inbox-meta">
                    {t.phases.length} faser · {total(t.phases)}
                  </span>
                  <form action={removePhaseTemplateAction}>
                    <input type="hidden" name="template" value={t.id} />
                    <button type="submit" className="link-quiet">
                      Ta bort
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
