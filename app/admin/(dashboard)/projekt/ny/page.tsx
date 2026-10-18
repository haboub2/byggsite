import Link from "next/link";
import { createProjectBlank, createProjectFromQuote } from "@/app/admin/portal-actions";
import { kr, quoteTotals } from "@/lib/quotes/math";
import { listQuotes } from "@/lib/quotes/store";
import { listProjects } from "@/lib/portal/store";

export default async function NewPortalProject({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { fel } = await searchParams;
  const [accepted, projects] = await Promise.all([listQuotes({ status: "accepted" }), listProjects()]);
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
            Välj en accepterad offert så följer kund, adress och rubrik med, och offertens PDF läggs under Dokument. Projektet
            får standardfaserna för en renovering; ändra dem efteråt.
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
                  <span className="inbox-side">
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
            </div>
            <button type="submit" className="btn btn-ghost" style={{ marginTop: 16 }}>
              Skapa tomt projekt
            </button>
          </fieldset>
        </form>
      </div>
    </section>
  );
}
