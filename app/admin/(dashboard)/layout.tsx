import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/admin";
import { signOut } from "@/app/admin/actions";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const check = await checkAdmin();
  if (!check.ok && check.reason === "signed-out") redirect("/admin/login");

  if (!check.ok) {
    return (
      <main>
        <section className="sec" style={{ textAlign: "center" }}>
          <div className="container">
            <p>{check.email} är inloggad men saknar admin-behörighet.</p>
            <form action={signOut} style={{ marginTop: 16 }}>
              <button type="submit" className="btn btn-ghost">
                Logga ut
              </button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="admin">
      <header className="admin-bar">
        <div className="container">
          <Link href="/admin" aria-label="Förfrågningar">
            <img src="/brand/binaafy-light.svg" alt="Binaafy admin" width={95} height={22} />
          </Link>
          <div className="admin-bar-right">
            <span className="admin-user">{check.email}</span>
            {!check.demo && (
              <form action={signOut}>
                <button type="submit" className="btn btn-ghost">
                  Logga ut
                </button>
              </form>
            )}
          </div>
        </div>
      </header>
      {check.demo && (
        <p className="admin-demo">
          Demoläge: exempeldata, bara på din egen dator. Koppla Supabase enligt docs/setup-forms.md för riktiga
          förfrågningar.
        </p>
      )}
      <main>{children}</main>
    </div>
  );
}
