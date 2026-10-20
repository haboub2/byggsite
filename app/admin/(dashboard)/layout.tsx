import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { listMyMemberships } from "@/lib/core/org/current";
import { hasAccess, ROLE_LABEL, type Access } from "@/lib/core/org/roles";
import { signOut } from "@/app/admin/actions";
import AdminTopBar from "@/components/admin/AdminTopBar";
import { loadNavCounts } from "@/lib/admin/today";

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
  const access = (["read", "write", "admin", "owner", "site"] as Access[]).filter((a) => hasAccess(check.role, a, check.site));

  const counts = await loadNavCounts(access);

  return (
    <div className="admin">
      <AdminTopBar
        access={access}
        counts={counts}
        orgName={check.orgName}
        orgId={check.orgId}
        orgs={orgs}
        email={check.email}
        roleLabel={ROLE_LABEL[check.role].toLowerCase()}
        demo={check.demo}
      />
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
