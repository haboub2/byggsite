import Link from "next/link";
import { notFound } from "next/navigation";
import { createHash } from "node:crypto";
import ProjectEditor from "@/components/admin/content/ProjectEditor";
import DeleteProject from "@/components/admin/content/DeleteProject";
import { getProjectForAdmin } from "@/lib/projects";
import { services } from "@/lib/placeholder";

export default async function EditProject({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sparat?: string }>;
}) {
  const { slug } = await params;
  const { sparat } = await searchParams;
  const project = await getProjectForAdmin(slug);
  if (!project) notFound();
  // Remount the editor when the saved project changes (e.g. after a save elsewhere).
  const version = createHash("sha1").update(JSON.stringify(project)).digest("hex").slice(0, 12);

  return (
    <section className="sec sec--tight">
      <div className="container">
        <Link href="/admin/innehall/projekt" className="link-quiet">
          ← Alla projekt
        </Link>
        <div className="inbox-head" style={{ marginTop: 16 }}>
          <div>
            <h1 className="admin-h1">{project.title}</h1>
            <p className="admin-shown">
              {project.published && project.cover ? (
                <>
                  Publicerad:{" "}
                  <Link href={`/bygg/projekt/${project.slug}`} target="_blank" className="link-quiet">
                    visa på sajten
                  </Link>
                </>
              ) : (
                "Utkast — syns inte på sajten än."
              )}
            </p>
          </div>
        </div>
        {sparat && <p className="admin-flash">Projektet är sparat.</p>}
        <ProjectEditor
          key={version}
          initial={project}
          original={project.slug}
          services={services.map((s) => ({ slug: s.slug, title: s.title }))}
        />
        <DeleteProject slug={project.slug} title={project.title} />
      </div>
    </section>
  );
}
