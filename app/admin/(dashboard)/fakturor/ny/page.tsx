import Link from "next/link";
import { createInvoiceAction } from "@/app/admin/invoice-actions";
import { customerLabel } from "@/lib/core/customers/schema";
import { listCustomers } from "@/lib/core/customers/store";
import { CUSTOMER_TYPE_LABEL } from "@/lib/core/documents/invoice";
import { getQuote } from "@/lib/quotes/store";
import { quoteTotals, kr } from "@/lib/quotes/math";
import { QUOTE_STATUS_LABEL } from "@/lib/quotes/schema";

export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ offert?: string; kund?: string; fel?: string }> }) {
  const { offert, kund, fel } = await searchParams;
  const [quote, customers] = await Promise.all([offert ? getQuote(offert) : null, listCustomers()]);

  return (
    <section className="sec sec--tight">
      <div className="container">
        <Link href="/admin/fakturor" className="link-quiet">
          ← Alla fakturor
        </Link>
        <div className="inbox-head" style={{ marginTop: 16 }}>
          <div>
            <span className="eyebrow">Fakturor</span>
            <h1 className="admin-h1">Ny faktura</h1>
            <p className="admin-intro">Utkastet går att ändra fritt. Numret sätts först när du utfärdar.</p>
          </div>
        </div>
        {fel === "offert" && <p className="form-feedback error">Offerten hittades inte.</p>}
        {fel === "kund" && <p className="form-feedback error">Välj en kund.</p>}

        <div className="tpl-grid" style={{ marginTop: 28 }}>
          {quote && (
            <form action={createInvoiceAction} className="tpl-card tpl-card--own">
              <input type="hidden" name="offert" value={quote.id} />
              <strong>Från offert {quote.number}</strong>
              <span>
                {quote.data.customer.company || quote.data.customer.name}
                {quote.data.title ? ` · ${quote.data.title}` : ""} · {QUOTE_STATUS_LABEL[quote.status]}
              </span>
              <em>
                {quote.data.items.length} rader · {kr(quoteTotals(quote.data).pay)}
                {quote.data.rot && quote.data.customer.type === "privat" ? " efter ROT" : ""}
              </em>
              <span className="efield-hint">Kunden läggs i kundregistret om den inte redan finns. Rader, kundtyp, ROT-personer och villkor följer med.</span>
              <button type="submit" className="btn btn-primary">
                Skapa utkast från offerten
              </button>
            </form>
          )}

          <form action={createInvoiceAction} className="tpl-card">
            <strong>För en kund i registret</strong>
            <div className="efield" style={{ marginTop: 8 }}>
              <label htmlFor="kund">Kund</label>
              <select id="kund" name="kund" defaultValue={kund ?? ""} required>
                <option value="">Välj kund…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {customerLabel(c)}
                    {c.type !== "privat" && c.company ? ` (${c.name})` : ""} · {CUSTOMER_TYPE_LABEL[c.type].replace(" (omvänd betalningsskyldighet)", "")}
                  </option>
                ))}
              </select>
            </div>
            <span className="efield-hint">
              Saknas kunden?{" "}
              <Link href="/admin/kunder/ny" className="link-quiet">
                Lägg till kund
              </Link>
              .
            </span>
            <button type="submit" className="btn btn-dark" disabled={customers.length === 0}>
              Skapa tomt utkast
            </button>
          </form>

          {!quote && (
            <div className="tpl-card">
              <strong>Från en accepterad offert</strong>
              <span>Öppna offerten under Offerter och välj Skapa faktura i sidopanelen. Då följer kund, rader och ROT med.</span>
              <Link href="/admin/offerter?status=accepted" className="btn btn-ghost">
                Visa accepterade offerter
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
