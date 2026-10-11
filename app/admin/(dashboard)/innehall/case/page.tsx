import Link from "next/link";
import { listAllCases, BUILT_IN_CASE_SLUGS } from "@/lib/cases";
import { moveCase } from "@/app/admin/case-actions";
import { publicUrl } from "@/lib/storage-url";
import { areaTitle } from "@/lib/case-schema";

export default async function CasesAdmin() {
  const cases = await listAllCases();
  return (
    <section className="sec sec--tight">
      <div className="container">
        <div className="inbox-head">
          <div>
            <span className="eyebrow">Innehåll</span>
            <h1 className="admin-h1">Case</h1>
            <p className="admin-intro">
              System och sajter ni har byggt åt kunder. Ett case syns under Software → Case och på Referenser när det är
              publicerat. Den inbyggda referensen ”Binaafy.se — den här sajten” visas tills ni skapar ett case med
              adressen <code>{BUILT_IN_CASE_SLUGS[0]}</code>, som då ersätter den.
            </p>
          </div>
          <Link href="/admin/innehall/case/ny" className="btn btn-primary">
            Nytt case
          </Link>
        </div>

        {cases.length === 0 ? (
          <div className="inbox-empty">
            <p>Inga case än. Börja med en kund som är nöjd och som går med på att synas, till exempel Autobazar.</p>
          </div>
        ) : (
          <ol className="project-list">
            {cases.map((c, i) => {
              const cover = publicUrl(c.cover?.path);
              return (
                <li key={c.slug}>
                  <div className="project-thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {cover ? <img src={cover} alt="" /> : <span>Ingen bild</span>}
                  </div>
                  <Link href={`/admin/innehall/case/${c.slug}`} className="project-main">
                    <strong>{c.title}</strong>
                    <span className="inbox-meta">{[c.client, areaTitle(c.area)].filter(Boolean).join(" · ")}</span>
                  </Link>
                  <span className="project-flags">
                    <span className={`pill ${c.published ? "pill--on" : ""}`}>{c.published ? "Publicerad" : "Utkast"}</span>
                    {c.featured && <span className="pill">Utvald</span>}
                  </span>
                  <span className="project-order">
                    <form action={moveCase}>
                      <input type="hidden" name="slug" value={c.slug} />
                      <input type="hidden" name="dir" value="up" />
                      <button type="submit" aria-label={`Flytta ${c.title} upp`} disabled={i === 0}>
                        ↑
                      </button>
                    </form>
                    <form action={moveCase}>
                      <input type="hidden" name="slug" value={c.slug} />
                      <input type="hidden" name="dir" value="down" />
                      <button type="submit" aria-label={`Flytta ${c.title} ner`} disabled={i === cases.length - 1}>
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
