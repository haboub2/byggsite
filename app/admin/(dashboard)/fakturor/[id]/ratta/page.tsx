import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { checkAdmin } from "@/lib/admin";
import { CorrectionForm } from "@/components/admin/invoices/CorrectionForm";
import { correctionBase, correctionBlocker, getInvoice } from "@/lib/core/invoices/store";
import { invoiceTotals } from "@/lib/core/invoices/totals";
import { formatOre } from "@/lib/core/money";
import type { InvoiceDocument } from "@/lib/core/documents/invoice";

/**
 * Rätta uppgifter: the form for a change invoice (ändringsfaktura). Only the
 * details that do not affect amounts can be edited; saving issues the change
 * invoice at once with the next number.
 */
export default async function CorrectInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const check = await checkAdmin();
  if (!check.ok) redirect("/admin/login");
  const { id } = await params;
  const inv = await getInvoice(id);
  if (!inv) notFound();
  const blocked = correctionBlocker(inv);
  const base = await correctionBase(inv);
  // The browser gets the details, not the encrypted personal numbers.
  const doc: InvoiceDocument = base.document.se.rot
    ? { ...base.document, se: { ...base.document.se, rot: { ...base.document.se.rot, buyers: base.document.se.rot.buyers.map((b) => ({ ...b, personalNumberSealed: undefined })) } } }
    : base.document;
  const totals = invoiceTotals(doc);
  const lineFacts = Object.fromEntries(
    doc.lines.map((l) => [l.id, `${l.quantity.toLocaleString("sv-SE")} ${l.unit} · ${formatOre(totals.lines[l.id]?.net ?? 0, { currency: true })} exkl. moms`])
  );

  return (
    <section className="sec sec--tight">
      <div className="container" style={{ maxWidth: 860 }}>
        <Link href={`/admin/fakturor/${inv.id}`} className="link-quiet">
          ← Faktura {inv.number}
        </Link>
        <div className="inbox-head" style={{ marginTop: 16 }}>
          <div>
            <span className="eyebrow">Ändringsfaktura</span>
            <h1 className="admin-h1">Rätta uppgifter på faktura {inv.number}</h1>
            <p className="admin-shown">
              En utfärdad faktura ändras aldrig. Rättade uppgifter blir en ändringsfaktura med nästa nummer i serien, samma belopp, OCR och förfallodag, och en text om vad som ändrats och vilken
              faktura den ersätter (momslagen 17 kap. 22 §).
              {base.previousNumber ? ` Faktura ${inv.number} är redan rättad med ändringsfaktura ${base.previousNumber}; du utgår från den.` : ""}
            </p>
          </div>
        </div>
        {blocked ? (
          <p className="inv-banner" data-kind="void" style={{ marginTop: 18 }}>
            {blocked}
          </p>
        ) : (
          <div style={{ marginTop: 18 }}>
            <CorrectionForm id={inv.id} base={doc} originalNumber={inv.number ?? ""} previousNumber={base.previousNumber} lineFacts={lineFacts} />
          </div>
        )}
      </div>
    </section>
  );
}
