import { isInstructionId } from "@/lib/core/payments/swish-commerce";
import { cancelSwishPayment, getSwishStatus } from "@/lib/core/payments/swish-store";

/**
 * The status the waiting page polls, and cancel. The id is the request's
 * instructionUUID (128 random bits, only known to the page that started
 * it); the answer has no personal data.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isInstructionId(id)) return Response.json({ error: "Ogiltigt id." }, { status: 400 });
  const status = await getSwishStatus(id);
  if (!status) return Response.json({ error: "Okänd betalning." }, { status: 404 });
  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isInstructionId(id)) return Response.json({ error: "Ogiltigt id." }, { status: 400 });
  try {
    await cancelSwishPayment(id);
  } catch (err) {
    console.error("[swish] cancel failed:", err);
    return Response.json({ error: "Kunde inte avbryta hos Swish." }, { status: 502 });
  }
  return Response.json((await getSwishStatus(id)) ?? { status: "CANCELLED" });
}
