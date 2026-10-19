import Link from "next/link";
import CustomerForm from "@/components/admin/customers/CustomerForm";
import { emptyCustomer } from "@/lib/core/customers/schema";

export default function NewCustomer() {
  return (
    <section className="sec sec--tight">
      <div className="container">
        <Link href="/admin/kunder" className="link-quiet">
          ← Alla kunder
        </Link>
        <div className="inbox-head" style={{ marginTop: 16 }}>
          <div>
            <span className="eyebrow">Kunder</span>
            <h1 className="admin-h1">Ny kund</h1>
          </div>
        </div>
        <CustomerForm id={null} initial={emptyCustomer} />
      </div>
    </section>
  );
}
