import type { Metadata } from "next";
import Link from "next/link";
import LoginForm from "@/components/admin/LoginForm";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeAdminNext } from "@/lib/core/org/roles";
import { PRODUCT_NAME } from "@/lib/product";

export const metadata: Metadata = {
  title: { absolute: `Logga in — ${PRODUCT_NAME}` },
  robots: { index: false, follow: false },
};

/**
 * One login for every company, after the approved mockup (LoggaIn.dc.html):
 * the product's name, not the website's, since the page is the same
 * whichever organisation the user belongs to. The website's cookie banner
 * stays away (components/CookieConsent.tsx).
 */
export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; lank?: string }> }) {
  const configured = isSupabaseConfigured();
  const { next, lank } = await searchParams;
  const back = safeAdminNext(typeof next === "string" ? next : null) ?? undefined;
  const registering = !!back?.startsWith("/admin/registrera/");

  return (
    <div className="login-page">
      <header className="login-top">
        <Link href="/fakturering" className="login-brand">
          {PRODUCT_NAME}
        </Link>
        <Link href="/registrera" className="login-top-link">
          Registrera företag
        </Link>
      </header>

      <main className="login-main">
        <div className="login-col">
          <div>
            <h1>Logga in</h1>
            <p className="login-lead">Vi mejlar en länk som loggar in dig. Inget lösenord att komma ihåg.</p>
          </div>
          {lank && (
            <p className="form-feedback error" role="alert">
              {registering
                ? "Länken i mejlet är redan använd eller har gått ut. Skicka en ny inloggningslänk till samma adress, så skapas företaget när du öppnar den."
                : "Länken i mejlet är redan använd eller har gått ut. Skicka en ny nedan."}
            </p>
          )}
          <LoginForm next={back} />
          {!configured && (
            <p className="efield-hint">
              Supabase är inte konfigurerat ännu. Skapa ett projekt, kör migrationerna i <code>supabase/migrations</code>, och sätt{" "}
              <code>NEXT_PUBLIC_SUPABASE_URL</code> / <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> i miljövariablerna.
            </p>
          )}
          <p className="login-new">
            Nytt företag? <Link href="/registrera">Registrera på två minuter</Link>
          </p>
        </div>
      </main>

      <footer className="login-foot">
        <span>{PRODUCT_NAME} · Binaafy AB</span>
        <Link href="/integritetspolicy">Integritetspolicy</Link>
      </footer>
    </div>
  );
}
