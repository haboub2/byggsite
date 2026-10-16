import Link from "next/link";
import { notFound } from "next/navigation";
import { createHash } from "node:crypto";
import CaseEditor from "@/components/admin/content/CaseEditor";
import DeleteCase from "@/components/admin/content/DeleteCase";
import { getCaseForAdmin } from "@/lib/cases";

export default async function EditCase({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sparat?: string }>;
}) {
  const { slug } = await params;
  const { sparat } = await searchParams;
  const kase = await getCaseForAdmin(slug);
  if (!kase) notFound();
  // Remount the editor when the saved case changes (e.g. after a save elsewhere).
  const version = createHash("sha1").update(JSON.stringify(kase)).digest("hex").slice(0, 12);

  return (
    <section className="sec sec--tight">
      <div className="container">
        <Link href="/admin/innehall/case" className="link-quiet">
          ← Alla case
        </Link>
        <div className="inbox-head" style={{ marginTop: 16 }}>
          <div>
            <h1 className="admin-h1">{kase.title}</h1>
            <p className="admin-shown">
              {kase.published ? (
                <>
                  Publicerad:{" "}
                  <Link href={`/mjukvara/case/${kase.slug}`} target="_blank" className="link-quiet">
                    visa på sajten
                  </Link>
                </>
              ) : (
                "Utkast — syns inte på sajten än."
              )}
            </p>
          </div>
        </div>
        {sparat && <p className="admin-flash">Caset är sparat.</p>}
        <CaseEditor key={version} initial={kase} original={kase.slug} />
        <DeleteCase slug={kase.slug} title={kase.title} />
      </div>
    </section>
  );
}
