import { notFound, redirect } from "next/navigation";
import PortalTabs from "@/components/portal/PortalTabs";
import { portalSignOut } from "@/app/(portal)/portal-actions";
import { getPortalUser } from "@/lib/portal/auth";
import { formatRange } from "@/lib/portal/format";
import { currentPhase, pendingChangeOrders, PROJECT_STATUS_LABEL, progressPercent } from "@/lib/portal/schema";
import { getProjectBundle } from "@/lib/portal/store";
import { isOpen, listInvoicesForPortal } from "@/lib/core/invoices/store";

/** Dark header with name, address and progress; tabs below (desktop) or at the bottom (phone). */
export default async function PortalProjectLayout({
  params,
  children,
}: Readonly<{ params: Promise<{ id: string }>; children: React.ReactNode }>) {
  const user = await getPortalUser();
  if (!user) redirect("/mitt-projekt/login");
  const { id } = await params;
  const bundle = await getProjectBundle(id);
  if (!bundle) notFound();
  const { project, phases, changeOrders } = bundle;
  const unpaid = (await listInvoicesForPortal(project.id).catch(() => [])).filter((inv) => isOpen(inv)).length;
  const pct = progressPercent(phases);
  const phase = project.current_phase || currentPhase(phases)?.name || (project.status === "active" ? "Pågår" : PROJECT_STATUS_LABEL[project.status]);

  return (
    <>
      <header className="portal-head">
        <div className="portal-wrap">
          <div className="portal-head-top">
            <img src="/brand/binaafy-light.svg" alt="Binaafy" width={95} height={22} />
            <form action={portalSignOut}>
              <button type="submit" className="portal-signout">
                Logga ut
              </button>
            </form>
          </div>
          <span className="eyebrow">{PROJECT_STATUS_LABEL[project.status]}</span>
          <h1>{project.title}</h1>
          {project.address && <p className="portal-address">{project.address}</p>}
          <div className="portal-progress" role="img" aria-label={`${pct} % klart`}>
            <span className="portal-progress-bar">
              <span style={{ width: `${pct}%` }} />
            </span>
            <span className="portal-progress-text">
              <strong>{phase}</strong>
              <span>
                {pct} % · {formatRange(project.starts_on, project.ends_on) || "datum kommer"}
              </span>
            </span>
          </div>
        </div>
      </header>
      <div className="portal-body">
        <div className="portal-wrap portal-grid">
          <PortalTabs id={project.id} pending={pendingChangeOrders(changeOrders).length} unpaid={unpaid} />
          <main className="portal-main" id="main">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
