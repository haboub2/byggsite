import Link from "next/link";
import { listAllProjects } from "@/lib/projects";
import { moveProject } from "@/app/admin/project-actions";
import { publicUrl } from "@/lib/storage-url";
import { services } from "@/lib/placeholder";

export default async function ProjectsAdmin() {
  const projects = await listAllProjects();
  return (
    <section className="sec sec--tight">
      <div className="container">
        <div className="inbox-head">
          <div>
            <span className="eyebrow">Innehåll</span>
            <h1 className="admin-h1">Projekt</h1>
            <p className="admin-intro">
              Era egna jobb, med före- och efterbilder. Ett projekt syns på sajten när det är publicerat och har en
              omslagsbild. Projektsidan, projektlistan och tjänstesidan för samma tjänst uppdateras direkt.
            </p>
          </div>
          <Link href="/admin/innehall/projekt/ny" className="btn btn-primary">
            Nytt projekt
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="inbox-empty">
            <p>Inga projekt än. Börja med ett jobb ni är stolta över och har bra bilder från.</p>
          </div>
        ) : (
          <ol className="project-list">
            {projects.map((p, i) => {
              const cover = publicUrl(p.cover?.path);
              return (
                <li key={p.slug}>
                  <div className="project-thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {cover ? <img src={cover} alt="" /> : <span>Ingen bild</span>}
                  </div>
                  <Link href={`/admin/innehall/projekt/${p.slug}`} className="project-main">
                    <strong>{p.title}</strong>
                    <span className="inbox-meta">
                      {[services.find((s) => s.slug === p.service)?.title, p.location, p.year].filter(Boolean).join(" · ")}
                    </span>
                  </Link>
                  <span className="project-flags">
                    <span className={`pill ${p.published ? "pill--on" : ""}`}>{p.published ? "Publicerad" : "Utkast"}</span>
                    {p.featured && <span className="pill">Utvald</span>}
                  </span>
                  <span className="project-order">
                    <form action={moveProject}>
                      <input type="hidden" name="slug" value={p.slug} />
                      <input type="hidden" name="dir" value="up" />
                      <button type="submit" aria-label={`Flytta ${p.title} upp`} disabled={i === 0}>
                        ↑
                      </button>
                    </form>
                    <form action={moveProject}>
                      <input type="hidden" name="slug" value={p.slug} />
                      <input type="hidden" name="dir" value="down" />
                      <button type="submit" aria-label={`Flytta ${p.title} ner`} disabled={i === projects.length - 1}>
                        ↓
                      </button>
                    </form>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
