import Link from "next/link";
import { customerLabel } from "@/lib/core/customers/schema";
import { listCustomers } from "@/lib/core/customers/store";
import { CUSTOMER_TYPE_LABEL } from "@/lib/core/documents/invoice";

export default async function CustomersList({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const customers = await listCustomers(q);
  return (
    <section className="sec sec--tight">
      <div className="container">
        <div className="inbox-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1>Kunder</h1>
            <p className="admin-intro">Kundregistret som fakturor, betalningar och ROT-historik hänger på. Kundtypen styr moms och ROT på fakturan.</p>
          </div>
          <Link href="/admin/kunder/ny" className="btn btn-primary">
            Ny kund
          </Link>
        </div>

        <form className="inbox-filters" action="/admin/kunder" method="get">
          <label className="sr-only" htmlFor="k-q">
            Sök
          </label>
          <input id="k-q" name="q" type="search" placeholder="Sök namn, företag, e-post eller ort…" defaultValue={q} />
          <button type="submit" className="btn btn-dark">
            Sök
          </button>
          {q && (
            <Link href="/admin/kunder" className="link-quiet">
              Rensa
            </Link>
          )}
        </form>

        {customers.length === 0 ? (
          <div className="inbox-empty">
            <p>{q ? "Ingen kund matchar." : "Inga kunder än. Lägg till den första, eller skapa en faktura från en offert så läggs kunden till automatiskt."}</p>
          </div>
        ) : (
          <ul className="inbox-list">
            {customers.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/kunder/${c.id}`} className="inbox-row">
                  <span className="inbox-status">{CUSTOMER_TYPE_LABEL[c.type].replace(" (omvänd betalningsskyldighet)", "")}</span>
                  <span className="inbox-main">
                    <strong>{customerLabel(c)}</strong>
                    <span className="inbox-meta">
                      {c.type !== "privat" && c.company ? `${c.name} · ` : ""}
                      {[c.email, c.phone, c.city].filter(Boolean).join(" · ")}
                      {c.orgNr ? ` · ${c.orgNr}` : ""}
                    </span>
                  </span>
                  <span className="inbox-side">
                    <span>{c.defaultTermsDays} dagar</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
