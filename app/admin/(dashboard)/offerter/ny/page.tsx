import Link from "next/link";
import { createQuoteFromTemplate, deleteSavedTemplate } from "@/app/admin/quote-actions";
import { getLead } from "@/lib/leads";
import { templateGroups } from "@/lib/quotes/templates";
import { listSavedTemplates } from "@/lib/quotes/store";
import { QUOTE_DIVISION_LABEL, type QuoteDivision } from "@/lib/quotes/schema";

export default async function NewQuote({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string; fel?: string }>;
}) {
  const { lead: leadId, fel } = await searchParams;
  const [lead, saved] = await Promise.all([leadId ? getLead(leadId) : null, listSavedTemplates()]);
  const divisions: QuoteDivision[] = lead?.division === "01" ? ["01", "bygg"] : ["bygg", "01"];

  return (
    <section className="sec sec--tight">
      <div className="container">
        <Link href="/admin/offerter" className="link-quiet">
          ← Alla offerter
        </Link>
        <div className="inbox-head" style={{ marginTop: 16 }}>
          <div>
            <span className="eyebrow">Offerter</span>
            <h1 className="admin-h1">Ny offert</h1>
            <p className="admin-intro">
              Välj en mall att utgå från. Raderna, texterna och villkoren går att ändra fritt efteråt.
              {lead ? ` Kunduppgifterna fylls i från förfrågan av ${lead.name || lead.email}.` : ""}
            </p>
          </div>
        </div>
        {fel === "mall" && <p className="form-feedback error">Mallen hittades inte. Välj en annan.</p>}

        {divisions.map((division) => {
          const own = saved.filter((t) => t.division === division);
          const groups = templateGroups(division);
          return (
            <section key={division} className="tpl-division">
              <h2 className="admin-h2">{QUOTE_DIVISION_LABEL[division]}</h2>
              {groups.map((g) => (
                <div key={g.group} className="tpl-group">
                  <h3 className="lead-h2">{g.group}</h3>
                  <div className="tpl-grid">
                    {g.templates.map((t) => (
                      <form key={t.key} action={createQuoteFromTemplate} className="tpl-card">
                        <input type="hidden" name="template" value={t.key} />
                        {leadId && <input type="hidden" name="lead" value={leadId} />}
                        <strong>{t.name}</strong>
                        <span>{t.description}</span>
                        <em>{t.items.length > 0 ? `${t.items.length} rader` : "Inga rader"}</em>
                        <button type="submit" className="btn btn-dark">
                          Använd mallen
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
              ))}
              {own.length > 0 && (
                <div className="tpl-group">
                  <h3 className="lead-h2">Egna mallar</h3>
                  <div className="tpl-grid">
                    {own.map((t) => (
                      <div key={t.id} className="tpl-card tpl-card--own">
                        <form action={createQuoteFromTemplate} className="tpl-card-main">
                          <input type="hidden" name="template" value={`saved:${t.id}`} />
                          {leadId && <input type="hidden" name="lead" value={leadId} />}
                          <strong>{t.name}</strong>
                          <span>{t.data.title || "Egen mall"}</span>
                          <em>{t.data.items.length} rader</em>
                          <button type="submit" className="btn btn-dark">
                            Använd mallen
                          </button>
                        </form>
                        <form action={deleteSavedTemplate}>
                          <input type="hidden" name="id" value={t.id} />
                          <button type="submit" className="link-quiet" aria-label={`Ta bort mallen ${t.name}`}>
                            Ta bort
                          </button>
                        </form>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        })}
        <p className="efield-hint" style={{ marginTop: 20 }}>
          Egna mallar skapar du från en färdig offert med ”Spara som mall”.
        </p>
      </div>
    </section>
  );
}
