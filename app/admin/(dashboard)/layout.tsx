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
      <div>
        <main>
          <section className="sec" style={{ textAlign: "center" }}>
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
    <div>
      <header className="admin-bar">
        <div className="container">
          <img src="/brand/binaafy-light.svg" alt="Binaafy admin" width={95} height={22} />
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
