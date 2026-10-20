import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { listMyMemberships } from "@/lib/core/org/current";
import { hasAccess, ROLE_LABEL, type Access } from "@/lib/core/org/roles";
import { signOut } from "@/app/admin/actions";
import AdminNav from "@/components/admin/AdminNav";
import OrgSwitcher from "@/components/admin/OrgSwitcher";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Any member gets in; what each role may open is decided by the proxy
  // (lib/core/org/roles.ts) and each page and action checks again.
  const check = await requireRole("read");
  if (!check.ok && check.reason === "signed-out") redirect("/admin/login");

  if (!check.ok) {
    return (
      <main>
        <section className="sec" style={{ textAlign: "center" }}>
          <div className="container">
            <p>{check.email} är inloggad men är inte medlem i någon organisation.</p>
            <p style={{ marginTop: 8 }}>
              <Link href="/admin/ny-organisation">Starta en organisation</Link> eller be om en inbjudan.
            </p>
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

  const orgs = (await listMyMemberships()).map((m) => ({ id: m.orgId, name: m.name }));
  const access = (["read", "write", "admin", "owner"] as Access[]).filter((a) => hasAccess(check.role, a));

  return (
    <div className="admin">
      <header className="admin-bar">
        <div className="container">
          <Link href="/admin" aria-label="Förfrågningar">
            <img src="/brand/binaafy-light.svg" alt="Binaafy admin" width={95} height={22} />
          </Link>
          <div className="admin-bar-right">
            {orgs.length > 1 ? (
              <OrgSwitcher current={check.orgId} orgs={orgs} />
            ) : (
              <span className="admin-user">{check.orgName}</span>
            )}
            <span className="admin-user">
              {check.email} · {ROLE_LABEL[check.role].toLowerCase()}
            </span>
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
      <AdminNav access={access} />
      {check.demo && (
        <p className="admin-demo">
          Demoläge: exempeldata, bara på din egen dator. Ändringar sparas inte på riktigt förrän Supabase är kopplat
          (docs/setup-forms.md).
        </p>
      )}
      <main>{children}</main>
    </div>
  );
}
