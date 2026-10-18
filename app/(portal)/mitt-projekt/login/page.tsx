import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PortalLogin from "@/components/portal/PortalLogin";
import { isDemo } from "@/lib/leads";
import { getPortalUser } from "@/lib/portal/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Logga in" };

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await getPortalUser()) redirect("/mitt-projekt");
  const { lank } = await searchParams;
  const demo = isDemo();

  return (
    <main className="portal-login-page">
      <div className="portal-login-card">
        <img src="/brand/binaafy-light.svg" alt="Binaafy" width={110} height={26} className="portal-logo" />
        <span className="eyebrow eyebrow--accent">Kundportal</span>
        <h1>Mitt projekt</h1>
        <p className="portal-login-lead">Följ ditt bygge: tidplan, foton från jobbet och alla dokument på ett ställe.</p>
        {demo || isSupabaseConfigured() ? (
          <PortalLogin demo={demo} linkFailed={lank === "1"} />
        ) : (
          <p className="portal-login-hint">Portalen är inte kopplad ännu. Hör av dig till oss så hjälper vi dig.</p>
        )}
      </div>
    </main>
  );
}
