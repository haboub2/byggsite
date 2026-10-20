import type { NextRequest } from "next/server";
import { CSV_KINDS, csvFileName, customersCsv, invoicesCsv, paymentsCsv, type CsvKind } from "@/lib/core/export/csv";
import { exportOrgName, loadCustomers, loadInvoices, loadPayments, logExport } from "@/lib/core/export/load";
import { parseDateRange } from "@/lib/core/export/model";
import { downloadHeaders, exportCaller } from "@/lib/core/export/route-helpers";
import { todayIso } from "@/lib/quotes/schema";

/**
 * GET ?typ=kunder|fakturor|betalningar[&fran=ÅÅÅÅ-MM-DD][&till=ÅÅÅÅ-MM-DD]:
 * one CSV for Excel (lib/core/export/csv.ts). The interval filters invoices
 * on the invoice date and payments on the payment date; customers are always
 * all. Any member, accountants included. Logged as export.csv.
 */
export async function GET(request: NextRequest) {
  const caller = await exportCaller();
  if (!caller) return new Response("Saknar behörighet.", { status: 403 });
  const kind = request.nextUrl.searchParams.get("typ") as CsvKind | null;
  if (!kind || !CSV_KINDS.includes(kind)) return new Response(`Ange typ: ${CSV_KINDS.join(", ")}.`, { status: 400 });
  const range = parseDateRange(request.nextUrl.searchParams);
  const orgId = caller.check.orgId;

  let text: string;
  let rows: number;
  try {
    if (kind === "kunder") {
      const customers = await loadCustomers(orgId);
      text = customersCsv(customers);
    } else if (kind === "fakturor") {
      text = invoicesCsv(await loadInvoices(orgId), range);
    } else {
      const [payments, invoices] = await Promise.all([loadPayments(orgId), loadInvoices(orgId)]);
      text = paymentsCsv(payments, invoices, range);
    }
    rows = text.split("\r\n").length - 2;
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Kunde inte skapa CSV-filen.", { status: 500 });
  }
  const fileName = csvFileName(await exportOrgName(orgId).catch(() => caller.check.orgName), kind, range, todayIso());
  await logExport(orgId, "export.csv", { kind, from: range.from ?? null, to: range.to ?? null, rows, file: fileName }, caller.actor);
  return new Response(text, { headers: downloadHeaders("text/csv; charset=utf-8", fileName) });
}
