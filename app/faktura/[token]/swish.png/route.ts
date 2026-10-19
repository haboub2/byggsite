import { getInvoiceByToken } from "@/lib/core/invoices/public";
import { fetchSwishQrPng } from "@/lib/core/payments/swish";

/** The Swish QR for the public invoice page: amount, number and OCR locked. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await getInvoiceByToken(token);
  if (!inv || !inv.document.paymentMeans.swish) return new Response("Ingen Swish.", { status: 404 });
  const png = await fetchSwishQrPng({ payee: inv.document.paymentMeans.swish, amountOre: inv.payableOre - inv.paidOre, message: inv.ocr ?? inv.number ?? "" });
  if (!png) return new Response("QR-koden kunde inte hämtas.", { status: 502 });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" } });
}
