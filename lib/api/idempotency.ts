import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Idempotency for writing API calls (grundkrav 5). A client sends
 * `Idempotency-Key: <its own id>`; the first call's response is stored in
 * idempotency_keys and every retry with the same key and the same request
 * gets the same response back, so a resent call never creates two invoices.
 * The same key with a different body is an error, not a silent replay.
 */

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8, "Idempotency-Key: minst 8 tecken.")
  .max(128, "Idempotency-Key: högst 128 tecken.")
  .regex(/^[A-Za-z0-9_\-:.]+$/, "Idempotency-Key: bokstäver, siffror, _ - : . ");

/** Hash of what the request does, so a replay with another body is detected. */
export function requestHash(method: string, path: string, body: string): string {
  return createHash("sha256").update(`${method.toUpperCase()} ${path}\n${body}`, "utf8").digest("hex");
}

export type StoredResponse = { status: number; response: unknown; requestHash: string };

/** What to do with a stored row for this key. */
export function replayDecision(stored: StoredResponse | null, hash: string): "fresh" | "replay" | "conflict" {
  if (!stored) return "fresh";
  return stored.requestHash === hash ? "replay" : "conflict";
}
