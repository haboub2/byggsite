import type { Metadata } from "next";
import LoginForm from "@/components/admin/LoginForm";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeAdminNext } from "@/lib/core/org/roles";
import { PRODUCT_NAME } from "@/lib/product";

export const metadata: Metadata = {
  title: { absolute: `Logga in — ${PRODUCT_NAME}` },
  robots: { index: false, follow: false },
};

/**
 * One login for every company: the product's name, not the website's, since
 * the page is the same whichever organisation the user belongs to.
 */
export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; lank?: string }> }) {
  const configured = isSupabaseConfigured();
  const { next, lank } = await searchParams;
  const back = safeAdminNext(typeof next === "string" ? next : null) ?? undefined;
  const registering = !!back?.startsWith("/admin/registrera/");

  return (
    <div>
      <main>
        <section className="sec" style={{ minHeight: "70vh", display: "flex", alignItems: "center" }}>
          <div className="container" style={{ maxWidth: 480 }}>
            <div style={{ marginBottom: 32 }}>
              <span className="eyebrow">{PRODUCT_NAME}</span>
              <h1 style={{ fontSize: 40, marginTop: 8 }}>Logga in</h1>
            </div>
            {lank && (
              <p className="form-feedback error" role="alert" style={{ marginBottom: 20 }}>
                {registering
                  ? "Länken i mejlet är redan använd eller har gått ut. Begär en ny inloggningslänk till samma adress, så skapas företaget när du öppnar den."
                  : "Länken i mejlet är redan använd eller har gått ut. Begär en ny nedan."}
              </p>
            )}
            <LoginForm next={back} startWithLink={!!lank} />
            {!configured && (
              <p className="efield-hint" style={{ marginTop: 24 }}>
                Supabase är inte konfigurerat ännu. Skapa ett projekt, kör migrationerna i{" "}
                <code>supabase/migrations</code>, och sätt{" "}
                <code>NEXT_PUBLIC_SUPABASE_URL</code> /{" "}
                <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> i miljövariablerna.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
