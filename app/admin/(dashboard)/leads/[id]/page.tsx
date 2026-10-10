import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusControl, NoteForm } from "@/components/admin/LeadControls";
import { getLead, KIND_LABEL, DIVISION_LABEL, STATUS_LABEL } from "@/lib/leads";
import { formatDateTime } from "@/lib/admin-format";
import { site } from "@/lib/placeholder";

export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();

  const firstName = lead.name?.split(" ")[0] ?? "";
  const subject = encodeURIComponent(
    lead.kind === "brief" ? "Din brief till Binaafy Software" : "Din förfrågan till Binaafy"
  );
  const body = encodeURIComponent(`Hej ${firstName},\n\nTack för din förfrågan.\n\n\nVänliga hälsningar\n${site.brand}`);

  const rows: [string, string | null | undefined][] = [
    ["Tjänst", lead.service],
    ["Budget", lead.budget],
    ["Önskad start", lead.timeline],
    ...Object.entries(lead.details ?? {}).map(([k, v]) => [k, v] as [string, string]),
  ];
  const source: [string, string | null | undefined][] = [
    ["Sida", lead.source?.page],
    ["Kom från", lead.source?.referrer],
    ["UTM-källa", lead.source?.utm_source],
    ["UTM-medium", lead.source?.utm_medium],
    ["UTM-kampanj", lead.source?.utm_campaign],
  ];

  return (
    <section className="sec sec--tight">
      <div className="container">
        <Link href="/admin" className="link-quiet">
          ← Alla förfrågningar
        </Link>

        <div className="lead-head">
          <div>
            <span className="eyebrow">
              {KIND_LABEL[lead.kind]} · {DIVISION_LABEL[lead.division]} ·{" "}
              <time dateTime={lead.created_at}>{formatDateTime(lead.created_at)}</time>
            </span>
            <h1>{lead.name || lead.email || "Utan namn"}</h1>
          </div>
          <div className="lead-quick">
            {lead.phone && (
              <a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} className="btn btn-primary">
                Ring {lead.phone}
              </a>
            )}
            {lead.email && (
              <a href={`mailto:${lead.email}?subject=${subject}&body=${body}`} className="btn btn-ghost">
                Mejla
              </a>
            )}
          </div>
        </div>

        <div className="lead-grid">
          <div>
            <h2 className="lead-h2">Meddelande</h2>
            <p className="lead-message">{lead.message || "—"}</p>

            <dl className="lead-dl">
              {rows
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              <div>
                <dt>E-post</dt>
                <dd>{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : "—"}</dd>
              </div>
              <div>
                <dt>Telefon</dt>
                <dd>{lead.phone || "—"}</dd>
              </div>
            </dl>

            <h2 className="lead-h2">Varifrån</h2>
            <dl className="lead-dl">
              {source
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd className="lead-break">{v}</dd>
                  </div>
                ))}
              <div>
                <dt>Samtycke</dt>
                <dd>{lead.consent_at ? formatDateTime(lead.consent_at) : "—"}</dd>
              </div>
            </dl>
          </div>

          <aside className="lead-aside">
            <h2 className="lead-h2">Status: {STATUS_LABEL[lead.status]}</h2>
            <StatusControl id={lead.id} status={lead.status} />
            <NoteForm id={lead.id} note={lead.note} />
          </aside>
        </div>
      </div>
    </section>
  );
}
