import "server-only";
import { createAdminClient } from "../../supabase/admin";
import { isDemo } from "../../leads";
import { asSystem } from "../db";
import { getInvoice, type InvoiceRecord } from "./store";

/**
 * The public invoice page: /faktura/<token>. The token is random and long,
 * so the link works as the "view online" link in the mail for customers
 * without a portal account. Read with the service role, since the visitor
 * has no session; only issued invoices are served, never drafts.
 */
export async function getInvoiceByToken(token: string): Promise<InvoiceRecord | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  if (isDemo()) {
    const g = globalThis as unknown as { __binaafyInvoices?: { invoices: { id: string; public_token?: string | null }[] } };
    const row = g.__binaafyInvoices?.invoices.find((x) => x.public_token === token);
    const inv = row ? await getInvoice(row.id) : null;
    return inv && inv.status !== "draft" ? inv : null;
  }
  const { data, error } = await createAdminClient().from("invoices").select("id").eq("public_token", token).neq("status", "draft").maybeSingle();
  if (error || !data) return null;
  return asSystem(() => getInvoice(data.id as string));
}

export function publicInvoiceUrl(token: string | null): string | null {
  if (!token) return null;
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  return `${base}/faktura/${token}`;
}
