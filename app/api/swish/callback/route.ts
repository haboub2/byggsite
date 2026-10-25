import type { NextRequest } from "next/server";
import { SwishCallbackError } from "@/lib/core/payments/swish-commerce";
import { handleSwishCallback } from "@/lib/core/payments/swish-store";

/**
 * Swish's callback (Swish Handel). Swish POSTs the payment request object
 * here when it is paid, declined, cancelled or failed. The URL carries the
 * request id and our HMAC of it; the callbackIdentifier header must match
 * the one we sent. A PAID result is registered on the invoice as a payment
 * from the system (settle_swish_payment, 0032); the same callback twice
 * changes nothing. Swish only needs a 2xx; an error status makes it retry.
 */
export async function POST(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Ogiltig JSON.", { status: 400 });
  }
  try {
    const result = await handleSwishCallback({
      id: params.get("id"),
      sig: params.get("sig"),
      callbackIdentifier: request.headers.get("callbackidentifier"),
      body,
    });
    return Response.json({ ok: true, outcome: result.outcome });
  } catch (err) {
    if (err instanceof SwishCallbackError) {
      console.warn("[swish] callback refused:", err.httpStatus, err.message);
      return new Response(err.message, { status: err.httpStatus });
    }
    console.error("[swish] callback failed:", err);
    return new Response("Kunde inte ta emot callbacken.", { status: 500 });
  }
}
