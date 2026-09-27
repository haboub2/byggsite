/**
 * Best-effort in-memory rate limiter, per PLAN.md §7.1 ("or a simple
 * in-memory limiter per IP"). Resets on cold start / redeploy and isn't
 * shared across serverless instances — good enough to blunt casual abuse,
 * not a real defense. Upgrade to @upstash/ratelimit if abuse becomes real.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit = 5, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= limit) {
    buckets.set(key, timestamps);
    return false;
  }

  timestamps.push(now);
  buckets.set(key, timestamps);
  return true;
}
