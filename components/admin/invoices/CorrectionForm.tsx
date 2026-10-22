"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { correctInvoiceAction, type CorrectionState } from "@/app/admin/invoice-actions";
import type { InvoiceDocument } from "@/lib/core/documents/invoice";
import { applyCorrectionEdits, correctionChanges, correctionNoteText, type CorrectionEdits } from "@/lib/core/invoices/correction";

/**
 * Rätta uppgifter: the details staff may change on an issued invoice, and
 * the change text the change invoice will carry, generated as they type.
 * Amounts, VAT, ROT and terms are shown but cannot be edited.
 */
export function CorrectionForm({
  id,
  base,
  originalNumber,
  previousNumber,
  lineFacts,
}: {
  id: string;
  /** The latest version of the details: the original, or its latest change invoice. */
  base: InvoiceDocument;
  originalNumber: string;
  previousNumber: string | null;
  /** "10 tim · 1 250,00 kr" per line id, read-only. */
  lineFacts: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<CorrectionState, FormData>(correctInvoiceAction, {});
  const [edits, setEdits] = useState<CorrectionEdits>(() => ({
    buyer: { name: base.buyer.name, street: base.buyer.street, postalCode: base.buyer.postalCode, city: base.buyer.city, reference: base.buyer.reference },
    orderReference: base.references.orderReference ?? "",
    ourReference: base.references.ourReference,
    title: base.title,
    note: base.note,
    lines: base.lines.map((l) => ({ id: l.id, description: l.description })),
  }));
  const changes = useMemo(() => correctionChanges(base, applyCorrectionEdits(base, edits)), [base, edits]);
  const text = changes.length ? correctionNoteText(originalNumber, changes, previousNumber) : "";
  const err = (path: string) => state.fieldErrors?.[path];

  const setBuyer = (k: keyof CorrectionEdits["buyer"]) => (e: React.ChangeEvent<HTMLInputElement>) => setEdits((p) => ({ ...p, buyer: { ...p.buyer, [k]: e.target.value } }));
  const set = (k: "orderReference" | "ourReference" | "title" | "note") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEdits((p) => ({ ...p, [k]: e.target.value }));
  const setLine = (i: number) => (e: React.ChangeEvent<HTMLInputElement>) => setEdits((p) => ({ ...p, lines: p.lines.map((l, j) => (j === i ? { ...l, description: e.target.value } : l)) }));

  const field = (label: string, path: string, value: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, wide = false) => (
    <div className={`efield${wide ? " efield--wide" : ""}${err(path) ? " has-error" : ""}`}>
      <label htmlFor={`c-${path}`}>{label}</label>
      <input id={`c-${path}`} value={value} onChange={onChange} />
      {err(path) && <span className="efield-error">{err(path)}</span>}
    </div>
  );

  return (
    <form
      action={action}
      className="lead-note"
      style={{ display: "grid", gap: 18 }}
      onSubmit={(e) => {
        if (!changes.length) {
          e.preventDefault();
          return;
        }
        if (!window.confirm(`Utfärda en ändringsfaktura med nästa nummer? Den ersätter uppgifterna på faktura ${originalNumber} och kan skickas till kunden. Beloppet ändras inte.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="payload" value={JSON.stringify(edits)} />

      <fieldset className="efieldset">
        <legend>Kund</legend>
        <div className="egrid">
          {field("Namn", "buyer.name", edits.buyer.name, setBuyer("name"), true)}
          {field("Gatuadress", "buyer.street", edits.buyer.street, setBuyer("street"), true)}
          {field("Postnummer", "buyer.postalCode", edits.buyer.postalCode, setBuyer("postalCode"))}
          {field("Ort", "buyer.city", edits.buyer.city, setBuyer("city"))}
        </div>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Referenser, rubrik och text</legend>
        <div className="egrid">
          {field("Er referens", "buyer.reference", edits.buyer.reference, setBuyer("reference"))}
          {field("Ert ordernummer", "orderReference", edits.orderReference, set("orderReference"))}
          {field("Vår referens", "ourReference", edits.ourReference, set("ourReference"))}
          {field("Rubrik", "title", edits.title, set("title"), true)}
          <div className={`efield efield--wide${err("note") ? " has-error" : ""}`}>
            <label htmlFor="c-note">Text under rubriken</label>
            <textarea id="c-note" rows={3} value={edits.note} onChange={set("note")} />
            {err("note") && <span className="efield-error">{err("note")}</span>}
          </div>
        </div>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Radernas benämning</legend>
        <p className="efield-hint">Antal, pris, moms och ROT ändras inte här. Är ett belopp fel, använd Rätta belopp på fakturan.</p>
        <div className="inv-correct-lines">
          {edits.lines.map((l, i) => (
            <div key={l.id} className={`inv-correct-line${err(`lines.${i}.description`) ? " has-error" : ""}`}>
              <div className="efield">
                <label htmlFor={`c-line-${l.id}`}>Rad {i + 1}</label>
                <input id={`c-line-${l.id}`} value={l.description} onChange={setLine(i)} />
                {err(`lines.${i}.description`) && <span className="efield-error">{err(`lines.${i}.description`)}</span>}
              </div>
              <span className="inv-muted">{lineFacts[l.id] ?? ""}</span>
            </div>
          ))}
        </div>
      </fieldset>

      <div style={{ display: "grid", gap: 8 }}>
        <span className="lead-h2" style={{ margin: 0 }}>
          Texten på ändringsfakturan
        </span>
        {text ? <p className="inv-correct-preview">{text}</p> : <p className="efield-hint">Ändra någon uppgift ovan; texten om vad som ändrats skrivs här.</p>}
      </div>

      {state.error && (
        <span className="form-feedback error" role="status">
          {state.error}
        </span>
      )}
      <div className="inv-dialog-actions">
        <button type="submit" className="btn btn-primary" disabled={pending || !changes.length}>
          {pending ? "Utfärdar…" : "Utfärda ändringsfaktura"}
        </button>
        <Link href={`/admin/fakturor/${id}`} className="btn btn-ghost">
          Avbryt
        </Link>
      </div>
    </form>
  );
}
