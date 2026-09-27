import Link from "next/link";
import ProjectEditor from "@/components/admin/content/ProjectEditor";
import { emptyProject } from "@/lib/project-schema";
import { listAllProjects } from "@/lib/projects";
import { services } from "@/lib/placeholder";

export default async function NewProject() {
  const count = (await listAllProjects()).length;
  return (
    <section className="sec sec--tight">
      <div className="container">
        <Link href="/admin/innehall/projekt" className="link-quiet">
          ← Alla projekt
        </Link>
        <h1 className="admin-h1" style={{ marginTop: 16 }}>
          Nytt projekt
        </h1>
        <p className="admin-intro">
          Sparas som utkast tills du bockar i Publicerad. Du kan spara halvfärdigt och fortsätta senare.
        </p>
        <ProjectEditor
          initial={emptyProject(count * 10)}
          original={null}
          services={services.map((s) => ({ slug: s.slug, title: s.title }))}
        />
      </div>
    </section>
  );
}
