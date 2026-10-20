import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/admin";
import { hasAccess } from "@/lib/core/org/roles";
import { getInvoice } from "@/lib/core/invoices/store";
import { getCustomer } from "@/lib/core/customers/store";
import { peppolFileName, renderPeppolInvoice, validatePeppol } from "@/lib/render/ubl/peppol-bis-billing-3";
import { peppolProvider } from "@/lib/core/peppol/provider";
import { getDb } from "@/lib/core/db";

/**
 * GET /admin/fakturor/{id}/peppol.xml — the issued invoice as Peppol BIS
 * Billing 3 (UBL 2.1), rendered from the frozen document. The buyer's
 * electronic address comes from the document, else the customer's Peppol id
 * in the register, else 0007 + org nr. With what Peppol requires missing,
 * the answer is 422 listing it; `?trots=1` downloads anyway (to inspect).
 * A download by staff or higher goes through the configured access point
 * (lib/core/peppol/provider.ts; "manual" only logs) and is logged as
 * invoice.einvoiced.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireRole("read");
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });
  const { id } = await params;
  const inv = await getInvoice(id);
  if (!inv) return new Response("Fakturan finns inte.", { status: 404 });

  const customer = !inv.document.buyer.peppolId && inv.customerId ? await getCustomer(inv.customerId).catch(() => null) : null;
  const opts = { buyerEndpoint: inv.document.buyer.peppolId || customer?.peppolId || null };
  const problems = validatePeppol(inv.document, opts);
  const force = request.nextUrl.searchParams.has("trots");
  if (problems.length && !force) {
    return new Response(`Peppol-filen kan inte skapas än:\n\n- ${problems.join("\n- ")}\n\nLägg till ?trots=1 i adressen för att ladda ner den ändå och granska den.\n`, {
      status: 422,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const xml = renderPeppolInvoice(inv.document, opts);
  if (!problems.length && !check.demo && hasAccess(check.role, "write")) {
    try {
      const provider = peppolProvider();
      const sent = await provider.send(xml, { invoiceId: inv.id, number: inv.number ?? "", receiver: opts.buyerEndpoint ?? "" });
      const supabase = await getDb();
      await supabase.from("events").insert({
        org_id: inv.orgId,
        aggregate_type: "invoice",
        aggregate_id: inv.id,
        type: "invoice.einvoiced",
        data: { number: inv.number, provider: provider.name, status: sent.status, id: sent.id },
        actor: { kind: "user", id: check.email ?? "", name: check.email ?? "admin" },
      });
    } catch (err) {
      console.error("[peppol] provider or event:", err);
    }
  }
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${peppolFileName(inv.document)}"`,
      "Cache-Control": "no-store",
      ...(problems.length ? { "X-Peppol-Problems": encodeURIComponent(problems.join(" | ")) } : {}),
    },
  });
}
