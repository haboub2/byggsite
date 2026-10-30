import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { ACCESS_LEVELS, hasAccess } from "@/lib/core/org/roles";
import { formatOre } from "@/lib/core/money";
import { formatWhen } from "@/lib/admin-format";
import { loadToday, type TodoKind } from "@/lib/admin/today";

export const metadata: Metadata = { title: "Idag" };

const TAG_TONE: Record<TodoKind, string> = {
  lead: "idag-tag--warm",
  quote: "idag-tag--cool",
  phase: "idag-tag--warm",
  photo: "idag-tag--quiet",
  change: "idag-tag--cool",
  invoice: "idag-tag--alert",
  hr: "idag-tag--warm",
};

const kr = (n: number) => `${Math.round(n).toLocaleString("sv-SE").replace(/ /g, " ")} kr`;

/** The admin's start page: what is waiting on you, each with its next step one click away. */
export default async function TodayPage() {
  const check = await requireRole("read");
  if (!check.ok) redirect("/admin/login");
  const access = ACCESS_LEVELS.filter((a) => hasAccess(check.role, a, check.site));
  const canWrite = access.includes("write");
  const d = await loadToday(access);
  const now = new Date();
  const dayLabel = new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Stockholm" }).format(now);
  const hour = Number(new Intl.DateTimeFormat("sv-SE", { hour: "numeric", hour12: false, timeZone: "Europe/Stockholm" }).format(now));
  const greeting = hour < 10 ? "God morgon" : hour < 17 ? "Hej" : "God kväll";

  return (
    <section className="idag">
      <div className="idag-head">
        <div>
          <p className="idag-label">{dayLabel}</p>
          <h1 className="idag-h1">{greeting}</h1>
        </div>
        {canWrite && (
          <div className="idag-quick">
            <Link href="/admin/projekt" className="btn btn-primary">
              Dagens uppdatering
            </Link>
            <Link href="/admin/offerter/ny" className="btn btn-ghost">
              Ny offert
            </Link>
            <Link href="/admin/fakturor/ny" className="btn btn-ghost">
              Ny faktura
            </Link>
          </div>
        )}
      </div>

      <div className="idag-kpis">
        {canWrite && (
          <Link href="/admin?status=new" className="idag-kpi">
            <span className="idag-label">Nya förfrågningar</span>
            <strong>{d.newLeads}</strong>
            <span>i inkorgen</span>
          </Link>
        )}
        {canWrite && (
          <Link href="/admin/offerter?status=sent" className="idag-kpi">
            <span className="idag-label">Offerter ute</span>
            <strong>{kr(d.quotesOut.amount)}</strong>
            <span>{d.quotesOut.count} väntar på svar</span>
          </Link>
        )}
        <Link href="/admin/projekt" className="idag-kpi">
          <span className="idag-label">Pågående projekt</span>
          <strong>{d.activeProjects}</strong>
          <span>{d.lateProjects ? `${d.lateProjects} försenade` : "inga förseningar"}</span>
        </Link>
        <Link href="/admin/fakturor?flik=overdue" className={d.overdue.count ? "idag-kpi idag-kpi--alert" : "idag-kpi"}>
          <span className="idag-label">Förfallet</span>
          <strong>{formatOre(d.overdue.ore, { decimals: 0, currency: true })}</strong>
          <span>{d.overdue.count === 1 ? "1 faktura" : `${d.overdue.count} fakturor`}</span>
        </Link>
      </div>

      <div className="idag-cols">
        <section className="idag-card idag-todo">
          <div className="idag-card-head">
            <h2>Att göra nu</h2>
            <span>{d.todos.length === 0 ? "allt är gjort" : `${d.todos.length} saker`}</span>
          </div>
          {d.todos.length === 0 ? (
            <p className="idag-empty">Inget väntar på dig just nu. Nya förfrågningar, försenade faser, förfallna fakturor och personal med LAS-klockor eller avtal som går ut dyker upp här.</p>
          ) : (
            <ul>
              {d.todos.map((t) => (
                <li key={t.id}>
                  <span className={`idag-tag ${TAG_TONE[t.kind]}`}>{t.tag}</span>
                  <div className="idag-todo-text">
                    <strong>{t.title}</strong>
                    <span>{t.meta}</span>
                  </div>
                  <Link href={t.href} className="btn btn-ghost idag-todo-go">
                    {t.action}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="idag-side">
          <section className="idag-card">
            <div className="idag-card-head">
              <h2>Projekt</h2>
              <Link href="/admin/projekt">Alla</Link>
            </div>
            {d.projects.length === 0 ? (
              <p className="idag-empty">Inga pågående projekt.</p>
            ) : (
              d.projects.map((p) => (
                <Link key={p.id} href={`/admin/projekt/${p.id}`} className="idag-project">
                  <span className="idag-project-top">
                    <strong>{p.name}</strong>
                    <span className={p.late ? "idag-late" : "idag-ok"}>{p.status}</span>
                  </span>
                  <span className="idag-project-phase">{p.phase}</span>
                  <span className="idag-bar" aria-hidden="true">
                    <span style={{ width: `${p.percent}%` }} className={p.late ? "idag-bar-late" : undefined} />
                  </span>
                </Link>
              ))
            )}
          </section>
          {d.recent.length > 0 && (
            <section className="idag-card">
              <div className="idag-card-head">
                <h2>Senast</h2>
                <Link href="/admin/ekonomi">Ekonomi</Link>
              </div>
              <ul className="idag-recent">
                {d.recent.map((r, i) => (
                  <li key={i}>
                    <span>{r.text}</span>
                    <time dateTime={r.at}>{formatWhen(r.at)}</time>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}
