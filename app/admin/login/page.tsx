import type { Metadata } from "next";
import LoginForm from "@/components/admin/LoginForm";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Admin — logga in",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  const configured = isSupabaseConfigured();

  return (
    <div className="division-root" data-division="bygg">
      <main>
        <section className="section" style={{ minHeight: "70vh", display: "flex", alignItems: "center" }}>
          <div className="container" style={{ maxWidth: 480 }}>
            <div className="section-head" style={{ marginBottom: 32 }}>
              <span className="eyebrow">Byggly 01</span>
              <h2>Admin</h2>
            </div>
            {configured ? (
              <LoginForm />
            ) : (
              <p style={{ textAlign: "center", color: "var(--muted)" }}>
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
