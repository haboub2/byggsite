import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/admin/actions";

export default async function AdminDashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const { data: admin } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!admin) {
    return (
      <div className="division-root" data-division="bygg">
        <main>
          <section className="section" style={{ textAlign: "center" }}>
            <div className="container">
              <p>{user.email} är inloggad men saknar admin-behörighet.</p>
              <form action={signOut} style={{ marginTop: 16 }}>
                <button type="submit" className="btn btn-ghost">
                  Logga ut
                </button>
              </form>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="division-root" data-division="bygg">
      <header className="site-header scrolled">
        <div className="container header-inner">
          <span className="logo">
            <span className="logo-text">
              Byggly<strong>&nbsp;01</strong> Admin
            </span>
          </span>
          <form action={signOut}>
            <button type="submit" className="btn btn-ghost">
              Logga ut
            </button>
          </form>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
