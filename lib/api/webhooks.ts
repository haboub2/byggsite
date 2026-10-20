import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhooks (grundkrav 5). A delivery is one POST of JSON to the endpoint's
 * URL, signed so the receiver can tell it came from us and was not changed:
 *
 *   X-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>" with the endpoint secret>
 *
 * The timestamp is inside the signed string so an old delivery cannot be
 * replayed later; receivers should reject t older than five minutes.
 * Failed deliveries are retried with exponential backoff, at most
 * MAX_WEBHOOK_ATTEMPTS times.
 */

export const MAX_WEBHOOK_ATTEMPTS = 8;
export const SIGNATURE_HEADER = "X-Signature";

export function signWebhook(secret: string, body: string, timestamp: number): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

/** What a receiver does: recompute and compare in constant time, and check the age. */
export function verifyWebhook(secret: string, body: string, header: string | null, now: number = Math.floor(Date.now() / 1000), toleranceSeconds = 300): boolean {
  const m = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(header ?? "");
  if (!m) return false;
  const t = Number(m[1]);
  if (Math.abs(now - t) > toleranceSeconds) return false;
  const expected = Buffer.from(signWebhook(secret, body, t).split("v1=")[1], "hex");
  const given = Buffer.from(m[2], "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * When to try again after `attempt` failed tries (1 = the first failed):
 * 1, 2, 4 … minutes, capped at 12 hours; null once the attempts are spent.
 */
export function nextAttemptAt(attempt: number, from: Date): Date | null {
  if (attempt >= MAX_WEBHOOK_ATTEMPTS) return null;
  const minutes = Math.min(2 ** (attempt - 1), 12 * 60);
  return new Date(from.getTime() + minutes * 60_000);
}

export type WebhookPayload = {
  id: string;
  type: string;
  created_at: string;
  data: Record<string, unknown>;
  aggregate: { type: string; id: string };
};

export function webhookPayload(event: { id: string; type: string; created_at: string; data: unknown; aggregate_type: string; aggregate_id: string }): WebhookPayload {
  return {
    id: event.id,
    type: event.type,
    created_at: event.created_at,
    data: (event.data ?? {}) as Record<string, unknown>,
    aggregate: { type: event.aggregate_type, id: event.aggregate_id },
  };
}

/** Only http(s) URLs, and https outside development; never our own private network by name. */
export function webhookUrlProblem(raw: string, production = process.env.NODE_ENV === "production"): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Ange en fullständig adress, https://…";
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && !production)) return "Adressen måste börja med https://.";
  if (production && /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[::1\])/.test(url.hostname)) return "Adressen får inte peka på ett internt nät.";
  return null;
}
