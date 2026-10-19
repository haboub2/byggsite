import "server-only";

/**
 * Swish QR codes for "Swish Företag": the customer scans the code on the
 * PDF or in the portal and the app opens with number, amount and the OCR
 * message filled in and locked. The image comes from Swish's public QR
 * service (no agreement or certificate needed for the image itself; the
 * Swish number must of course belong to the company). Swish Handel, with
 * callbacks that settle the invoice in real time, is a later step.
 *
 * Checked 2026-10-19: POST https://mpc.getswish.net/qrg-swish/api/v1/prefilled
 * with {format, size, payee, amount, message} returns the PNG. Sizes below
 * 300 px are refused with 400 ("Image too small"), so smaller is clamped.
 */

const MIN_SIZE = 300;
const ENDPOINT = "https://mpc.getswish.net/qrg-swish/api/v1/prefilled";
// Successful images only, so a timeout is retried on the next request. Bounded; oldest out first.
const cache = new Map<string, Buffer>();
const CACHE_MAX = 200;

export type SwishQrInput = { payee: string; amountOre: number; message: string };

/** The request body, kept separate so it can be tested without the network. */
export function swishQrRequest(input: SwishQrInput, size = 300) {
  const payee = input.payee.replace(/\D/g, "");
  const amount = Math.round(input.amountOre / 100);
  return {
    format: "png",
    size: Math.max(MIN_SIZE, Math.round(size)),
    payee: { value: payee, editable: false },
    amount: { value: amount, editable: false },
    message: { value: input.message.slice(0, 50), editable: false },
  };
}

/** Valid Swish number: 10 digits starting with 123 (företag) or a mobile number. */
export function isSwishNumber(value: string): boolean {
  const d = value.replace(/\D/g, "");
  return /^123\d{7}$/.test(d) || /^(0|46)7\d{8}$/.test(d);
}

export async function fetchSwishQrPng(input: SwishQrInput, size = 300): Promise<Buffer | null> {
  if (!isSwishNumber(input.payee) || input.amountOre <= 0) return null;
  const body = JSON.stringify(swishQrRequest(input, size));
  const hit = cache.get(body);
  if (hit) return hit;
  try {
    const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Swish svarade ${res.status}`);
    const png = Buffer.from(await res.arrayBuffer());
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(body, png);
    return png;
  } catch (err) {
    console.error("[swish] QR could not be fetched:", err instanceof Error ? err.message : err);
    return null;
  }
}
