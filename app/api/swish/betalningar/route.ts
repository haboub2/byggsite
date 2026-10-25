import type { NextRequest } from "next/server";
import { z } from "zod";
import { getInvoiceByToken } from "@/lib/core/invoices/public";
import { getInvoice } from "@/lib/core/invoices/store";
import { getPortalUser } from "@/lib/portal/auth";
import { getProject } from "@/lib/portal/store";
import { SwishInputError } from "@/lib/core/payments/swish-commerce";
import { startSwishPayment } from "@/lib/core/payments/swish-store";

const bodySchema = z.union([
  z.object({ token: z.string().regex(/^[a-f0-9]{32}$/), payer: z.string().max(40).optional() }),
  z.object({ invoiceId: z.string().min(1).max(64), projectId: z.string().min(1).max(64), payer: z.string().max(40).optional() }),
]);

/**
 * "Betala med Swish": a payment request for what is left on an invoice.
 * Either from the public invoice page (the invoice's token is the key) or
 * from the portal (the signed-in customer must see the project the invoice
 * belongs to). Without `payer` the request is m-commerce and the answer has
 * the token that opens the Swish app; with it, Swish pushes it to that phone.
 */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig begäran." }, { status: 400 });
  const input = parsed.data;

  let invoice;
  let createdBy: string;
  if ("token" in input) {
    invoice = await getInvoiceByToken(input.token);
    createdBy = "Fakturalänken";
  } else {
    const user = await getPortalUser();
    if (!user) return Response.json({ error: "Logga in först." }, { status: 401 });
    const project = await getProject(input.projectId);
    const inv = project ? await getInvoice(input.invoiceId).catch(() => null) : null;
    invoice = project && inv && inv.projectId === project.id ? inv : null;
    createdBy = `Portalen (${user.email})`;
  }
  if (!invoice) return Response.json({ error: "Fakturan finns inte." }, { status: 404 });

  try {
    const started = await startSwishPayment(invoice, { payerAlias: input.payer?.trim() || null, createdBy });
    return Response.json(started, { status: 201 });
  } catch (err) {
    if (err instanceof SwishInputError) return Response.json({ error: err.message }, { status: 422 });
    console.error("[swish] start failed:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Swish kunde inte nås." }, { status: 502 });
  }
}
