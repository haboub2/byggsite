import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/leads";
import { CreateOrganizationForm } from "@/components/admin/org/OrgForms";

export const metadata: Metadata = { title: "Ny organisation", robots: { index: false, follow: false } };

/**
 * Start an organisation: any signed-in user, member or not. The database
 * function create_organization (0021) makes the caller owner and sets up the
 * number series, the chart of accounts and the settings row.
 */
export default async function NewOrganisationPage() {
  if (!isDemo()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/admin/login?next=/admin/ny-organisation");
  }
  return (
    <main>
      <section className="sec" style={{ minHeight: "70vh" }}>
        <div className="container" style={{ maxWidth: 520 }}>
          <span className="eyebrow">Fakturering</span>
          <h1 style={{ fontSize: 36, marginTop: 8 }}>Ny organisation</h1>
          <p style={{ color: "var(--ink-2)", margin: "12px 0 24px" }}>
            Ett eget företag med egna kunder, fakturor, nummerserier och bokföring. Du blir ägare och kan bjuda in fler. Fakturanumren börjar på 1.
          </p>
          <CreateOrganizationForm />
          <p style={{ marginTop: 24 }}>
            <Link href="/admin" className="link-quiet">
              Tillbaka
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
