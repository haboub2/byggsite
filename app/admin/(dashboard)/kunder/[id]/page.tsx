import Link from "next/link";
import { notFound } from "next/navigation";
import CustomerForm from "@/components/admin/customers/CustomerForm";
import { archiveCustomerAction } from "@/app/admin/customer-actions";
import { customerLabel } from "@/lib/core/customers/schema";
import { getCustomer } from "@/lib/core/customers/store";
import { INVOICE_STATUS_LABEL, invoiceLabel, listInvoices } from "@/lib/core/invoices/store";
import { formatOre } from "@/lib/core/money";

export default async function EditCustomer({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ skapad?: string }> }) {
  const { id } = await params;
  const { skapad } = await searchParams;
  const customer = await getCustomer(id);
  if (!customer) notFound();
  const invoices = await listInvoices({ customerId: id });
  const { id: _id, createdAt: _c, updatedAt: _u, ...initial } = customer;
  void _id;
  void _c;
  void _u;

  return (
    <section className="sec sec--tight">
      <div className="container">
        <Link href="/admin/kunder" className="link-quiet">
          ← Alla kunder
        </Link>
        <div className="inbox-head" style={{ marginTop: 16 }}>
          <div>
            <span className="eyebrow">Kund</span>
            <h1 className="admin-h1">{customerLabel(customer)}</h1>
          </div>
          <div className="lead-quick">
            <Link href={`/admin/fakturor/ny?kund=${customer.id}`} className="btn btn-primary">
              Ny faktura
            </Link>
          </div>
        </div>
        {skapad && <p className="admin-flash">Kunden är skapad.</p>}

        <div className="quote-layout">
          <CustomerForm id={customer.id} initial={initial} />
          <aside className="lead-aside quote-aside">
            <div>
              <h2 className="lead-h2">Fakturor</h2>
              {invoices.length === 0 ? (
                <p className="efield-hint">Inga fakturor än.</p>
              ) : (
                <ul className="inv-list">
                  {invoices.map((inv) => (
                    <li key={inv.id}>
                      <Link href={`/admin/fakturor/${inv.id}`} className="link-quiet">
                        {invoiceLabel(inv)}
                      </Link>
                      <span>
                        {INVOICE_STATUS_LABEL[inv.status]} · {formatOre(inv.payableOre, { decimals: 0, currency: true })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <form
              action={archiveCustomerAction}
              onSubmit={undefined}
            >
              <input type="hidden" name="id" value={customer.id} />
              <button type="submit" className="link-quiet" style={{ color: "var(--danger)" }} disabled={invoices.length > 0} title={invoices.length > 0 ? "Kunder med fakturor arkiveras inte." : undefined}>
                Ta bort kunden
              </button>
            </form>
          </aside>
        </div>
      </div>
    </section>
  );
}
