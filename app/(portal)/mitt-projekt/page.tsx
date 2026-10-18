import Link from "next/link";
import { redirect } from "next/navigation";
import { portalSignOut } from "@/app/(portal)/portal-actions";
import { getPortalUser } from "@/lib/portal/auth";
import { formatRange } from "@/lib/portal/format";
import { PROJECT_STATUS_LABEL } from "@/lib/portal/schema";
import { listProjectsForUser } from "@/lib/portal/store";

/** One project → straight in. Several → pick. None → explain. */
export default async function PortalHome() {
  const user = await getPortalUser();
  if (!user) redirect("/mitt-projekt/login");
  const projects = await listProjectsForUser();
  if (projects.length === 1) redirect(`/mitt-projekt/${projects[0].id}`);

  return (
    <main className="portal-login-page">
      <div className="portal-login-card portal-login-card--wide">
        <img src="/brand/binaafy-light.svg" alt="Binaafy" width={110} height={26} className="portal-logo" />
        <span className="eyebrow eyebrow--accent">Kundportal</span>
        <h1>{projects.length ? "Dina projekt" : "Inget projekt än"}</h1>
        {projects.length === 0 ? (
          <p className="portal-login-lead">
            {user.email} är inloggad men hör inte till något projekt ännu. Är du nyss inbjuden kan det ta en stund; annars hör av
            dig till oss.
          </p>
        ) : (
          <ul className="portal-list">
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/mitt-projekt/${p.id}`}>
                  <strong>{p.title}</strong>
                  <span>
                    {p.address || PROJECT_STATUS_LABEL[p.status]}
                    {formatRange(p.starts_on, p.ends_on) ? ` · ${formatRange(p.starts_on, p.ends_on)}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <form action={portalSignOut} style={{ marginTop: 24 }}>
          <button type="submit" className="link-quiet portal-signout">
            Logga ut
          </button>
        </form>
      </div>
    </main>
  );
}
