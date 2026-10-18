import Link from "next/link";
import { formatWhen } from "@/lib/admin-format";
import { formatRange } from "@/lib/portal/format";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, type ProjectStatus } from "@/lib/portal/schema";
import { listProjects } from "@/lib/portal/store";

export default async function PortalProjectsList({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = PROJECT_STATUSES.includes(params.status as ProjectStatus) ? (params.status as ProjectStatus) : undefined;
  const all = await listProjects();
  const shown = status ? all.filter((p) => p.status === status) : all;
  const count = (s?: ProjectStatus) => (s ? all.filter((p) => p.status === s).length : all.length);

  return (
    <section className="sec sec--tight">
      <div className="container">
        <div className="inbox-head">
          <div>
            <span className="eyebrow">Admin</span>
            <h1>Byggprojekt</h1>
            <p className="admin-intro">
              Varje pågående jobb som kunden följer i <Link href="/mitt-projekt" className="link-quiet">Mitt projekt</Link>: tidplan,
              foton och dokument. Skapa projektet från en accepterad offert, bjud sedan in kunden.
            </p>
          </div>
          <Link href="/admin/projekt/ny" className="btn btn-primary">
            Nytt projekt
          </Link>
        </div>

        <nav className="inbox-tabs" aria-label="Status">
          <Link href="/admin/projekt" aria-current={!status ? "page" : undefined}>
            Alla <span>{count()}</span>
          </Link>
          {PROJECT_STATUSES.map((s) => (
            <Link key={s} href={`/admin/projekt?status=${s}`} aria-current={status === s ? "page" : undefined}>
              {PROJECT_STATUS_LABEL[s]} <span>{count(s)}</span>
            </Link>
          ))}
        </nav>

        {shown.length === 0 ? (
          <div className="inbox-empty">
            <p>{all.length === 0 ? "Inga projekt än. Skapa det första från en accepterad offert." : "Inga projekt med den statusen."}</p>
          </div>
        ) : (
          <ul className="inbox-list">
            {shown.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/projekt/${p.id}`} className="inbox-row" data-status={p.status}>
                  <span className="inbox-status">{PROJECT_STATUS_LABEL[p.status]}</span>
                  <span className="inbox-main">
                    <strong>{p.title}</strong>
                    <span className="inbox-meta">
                      {[p.customer_name, p.address].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="inbox-side">
                    <strong>{formatRange(p.starts_on, p.ends_on) || "Inga datum"}</strong>
                    <time dateTime={p.updated_at}>{formatWhen(p.updated_at)}</time>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
