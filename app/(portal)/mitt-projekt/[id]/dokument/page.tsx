import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fileHref } from "@/lib/portal/files-href";
import { formatDay } from "@/lib/portal/format";
import { DOCUMENT_KIND_LABEL } from "@/lib/portal/schema";
import { getProjectBundle } from "@/lib/portal/store";

export const metadata: Metadata = { title: "Dokument" };

export default async function PortalDocuments({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getProjectBundle(id);
  if (!bundle) notFound();
  const { project, documents } = bundle;

  return (
    <div className="portal-stack">
      <section className="portal-card">
        <h2>Dokument</h2>
        {documents.length === 0 ? (
          <p>Inga dokument än. Offert, fakturor, intyg och garantibevis samlas här.</p>
        ) : (
          <ul className="portal-docs">
            {documents.map((d) => (
              <li key={d.id}>
                <span className="etag">{DOCUMENT_KIND_LABEL[d.kind]}</span>
                <a href={fileHref(d.path, project.id)} target="_blank" rel="noreferrer">
                  {d.title}
                </a>
                <time dateTime={d.created_at}>{formatDay(d.created_at)}</time>
                <a href={fileHref(d.path, project.id, true)} className="link-quiet" aria-label={`Ladda ner ${d.title}`}>
                  Ladda ner
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="portal-note">Spara gärna garantibevis och intyg: de behövs om du säljer bostaden eller vid ett försäkringsärende.</p>
      </section>
    </div>
  );
}
