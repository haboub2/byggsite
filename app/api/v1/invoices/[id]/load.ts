import "server-only";
import { ApiProblem } from "@/lib/api/route";
import { getInvoice, type InvoiceRecord } from "@/lib/core/invoices/store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The invoice in the key's organisation, or a 404. */
export async function loadInvoice(id: string | undefined): Promise<InvoiceRecord> {
  const inv = id && UUID.test(id) ? await getInvoice(id) : null;
  if (!inv) throw new ApiProblem("not_found", "Fakturan finns inte.");
  return inv;
}
