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
    <div>
      <main>
        <section className="sec" style={{ minHeight: "70vh", display: "flex", alignItems: "center" }}>
          <div className="container" style={{ maxWidth: 480 }}>
            <div style={{ marginBottom: 32 }}>
              <span className="eyebrow">Binaafy</span>
              <h1 style={{ fontSize: 40, marginTop: 8 }}>Admin</h1>
            </div>
            {configured ? (
              <LoginForm />
            ) : (
              <p style={{ color: "var(--ink-2)" }}>
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
