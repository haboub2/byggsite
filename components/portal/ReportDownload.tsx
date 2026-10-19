import { formatDay } from "@/lib/portal/format";
import type { PortalProject } from "@/lib/portal/schema";

/** "Ladda ner projektdokumentation (PDF)", and the zip once it is locked. Also on Dokument. */
export default function ReportDownload({ project }: { project: Pick<PortalProject, "id" | "archived_at"> }) {
  const base = `/mitt-projekt/${project.id}/dokumentation`;
  return (
    <div className="doc-download">
      <a href={`${base}/pdf`} className="btn btn-primary">
        Ladda ner projektdokumentation (PDF)
      </a>
      {project.archived_at && (
        <a href={`${base}/zip`} className="btn btn-ghost">
          Ladda ner allt (zip)
        </a>
      )}
      <p className="portal-when">
        {project.archived_at
          ? `Slutversionen, låst ${formatDay(project.archived_at)}. Zip-filen har rapporten och alla originalfoton i mappar per fas och dag.`
          : "Dokumentationen så här långt. När projektet är klart får du slutversionen här."}
      </p>
    </div>
  );
}
