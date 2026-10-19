import Link from "next/link";
import { notFound } from "next/navigation";
import { createHash } from "node:crypto";
import QuoteEditor from "@/components/admin/quotes/QuoteEditor";
import { QuoteStatusControl, SendQuoteForm, SaveTemplateForm, DeleteQuote } from "@/components/admin/quotes/QuoteTools";
import { duplicateQuote } from "@/app/admin/quote-actions";
import { getQuote } from "@/lib/quotes/store";
import { getLead } from "@/lib/leads";
import { QUOTE_DIVISION_LABEL, QUOTE_STATUS_LABEL } from "@/lib/quotes/schema";
import { formatDateTime } from "@/lib/admin-format";
import { COVER_CHOICES } from "@/lib/quotes/cover";
import { resolveImage } from "@/lib/images";

/** Small previews of the cover photos for the picker in the editor. */
function coverPreviews(): Record<string, string> {
  return Object.fromEntries(
    COVER_CHOICES.flatMap((c) => {
      const src = resolveImage(c.slot);
      return src ? [[c.slot, src.replace(/w=\d+/, "w=240")]] : [];
    })
  );
}

export default async function EditQuote({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kopia?: string }>;
}) {
  const { id } = await params;
  const { kopia } = await searchParams;
  const quote = await getQuote(id);
  if (!quote) notFound();
  const lead = quote.data.leadId ? await getLead(quote.data.leadId) : null;
  const version = createHash("sha1").update(JSON.stringify(quote.data)).digest("hex").slice(0, 12);
  const mailReady = Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

  return (
    <section className="sec sec--tight">
      <div className="container">
        <Link href="/admin/offerter" className="link-quiet">
          ← Alla offerter
        </Link>
        <div className="inbox-head" style={{ marginTop: 16 }}>
          <div>
            <span className="eyebrow">
              Offert {quote.number} · {QUOTE_DIVISION_LABEL[quote.data.division]} · {QUOTE_STATUS_LABEL[quote.status]}
              {quote.sent_at ? ` ${formatDateTime(quote.sent_at)}` : ""}
            </span>
            <h1 className="admin-h1">{quote.data.title || "Offert utan rubrik"}</h1>
            {lead && (
              <p className="admin-shown">
                Från förfrågan:{" "}
                <Link href={`/admin/leads/${lead.id}`} className="link-quiet">
                  {lead.name || lead.email}
                </Link>
              </p>
            )}
          </div>
          <div className="lead-quick">
            <a href={`/admin/offerter/${quote.id}/pdf`} target="_blank" rel="noopener" className="btn btn-primary">
              Visa PDF
            </a>
            <a href={`/admin/offerter/${quote.id}/pdf?ladda-ner=1`} className="btn btn-ghost">
              Ladda ner
            </a>
          </div>
        </div>
        {kopia && <p className="admin-flash">Kopian är skapad som ett nytt utkast med dagens datum.</p>}

        <div className="quote-layout">
          <QuoteEditor key={version} id={quote.id} initial={quote.data} coverPreviews={coverPreviews()} />

          <aside className="lead-aside quote-aside">
            <div className="lead-status">
              <h2 className="lead-h2">Status</h2>
              <QuoteStatusControl id={quote.id} status={quote.status} />
            </div>
            <div>
              <h2 className="lead-h2">Skicka till kund</h2>
              <SendQuoteForm id={quote.id} email={quote.data.customer.email} ready={mailReady} />
            </div>
            <div>
              <h2 className="lead-h2">Återanvänd</h2>
              <form action={duplicateQuote} style={{ marginBottom: 14 }}>
                <input type="hidden" name="id" value={quote.id} />
                <button type="submit" className="btn btn-ghost quote-aside-btn">
                  Duplicera som nytt utkast
                </button>
              </form>
              <SaveTemplateForm id={quote.id} />
            </div>
            <DeleteQuote id={quote.id} number={quote.number} />
          </aside>
        </div>
      </div>
    </section>
  );
}
