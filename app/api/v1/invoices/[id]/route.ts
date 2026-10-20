import { apiGet } from "@/lib/api/route";
import { apiJson } from "@/lib/api/respond";
import { invoiceResource } from "@/lib/api/resources";
import { loadInvoice } from "./load";

/** GET /api/v1/invoices/{id} — with the full document. */
export const GET = apiGet("read", async ({ params }) => apiJson(invoiceResource(await loadInvoice(params.id))));
