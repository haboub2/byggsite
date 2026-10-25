/**
 * Rate limits per API key (docs/fakturering.md, avsnitt 5). The counting is
 * done in Postgres by api_check_rate() (0029_api_usage.sql): one row per key
 * and window, locked and incremented in one call, so every serverless
 * instance sees the same count. Demo mode and the tests use
 * MemoryRateLimiter, which follows the same rules:
 *
 * - a calendar minute and a calendar day (UTC);
 * - a refused call is not counted, so a client that gets 429 does not use
 *   up its day;
 * - the headers describe the window closest to its limit.
 */

export const DEFAULT_RATE_LIMITS = { perMinute: 600, perDay: 20_000 } as const;
export type RateLimits = { perMinute: number; perDay: number };

export type RateDecision = {
  allowed: boolean;
  limitMinute: number;
  remainingMinute: number;
  /** Seconds until the minute window starts over. */
  resetMinute: number;
  limitDay: number;
  remainingDay: number;
  /** Seconds until the day window (UTC) starts over. */
  resetDay: number;
  /** Seconds to wait when refused; 0 when allowed. */
  retryAfter: number;
};

/** What api_check_rate() returns, as a decision. Null when the shape is not recognised. */
export function decisionFromRpc(value: unknown): RateDecision | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const n = (k: string) => (typeof v[k] === "number" ? (v[k] as number) : Number.NaN);
  const d: RateDecision = {
    allowed: v.allowed === true,
    limitMinute: n("limit_minute"),
    remainingMinute: n("remaining_minute"),
    resetMinute: n("reset_minute"),
    limitDay: n("limit_day"),
    remainingDay: n("remaining_day"),
    resetDay: n("reset_day"),
    retryAfter: n("retry_after"),
  };
  return Object.values(d).every((x) => typeof x === "boolean" || Number.isFinite(x)) ? d : null;
}

/** X-RateLimit-* for the window closest to its limit (the minute on a tie), and Retry-After when refused. */
export function rateLimitHeaders(d: RateDecision): Record<string, string> {
  const day = d.remainingDay < d.remainingMinute || (!d.allowed && d.remainingDay === 0);
  const headers: Record<string, string> = {
    "x-ratelimit-limit": String(day ? d.limitDay : d.limitMinute),
    "x-ratelimit-remaining": String(day ? d.remainingDay : d.remainingMinute),
    "x-ratelimit-reset": String(day ? d.resetDay : d.resetMinute),
  };
  if (!d.allowed) headers["retry-after"] = String(Math.max(1, d.retryAfter));
  return headers;
}

const MINUTE = 60_000;
const DAY = 86_400_000;

/** The same counting as api_check_rate(), in memory: for demo mode and tests. */
export class MemoryRateLimiter {
  private counters = new Map<string, { minuteStart: number; minute: number; dayStart: number; day: number }>();

  check(keyId: string, limits: RateLimits, now = Date.now()): RateDecision {
    const minuteStart = Math.floor(now / MINUTE) * MINUTE;
    const dayStart = Math.floor(now / DAY) * DAY;
    const c = this.counters.get(keyId) ?? { minuteStart, minute: 0, dayStart, day: 0 };
    if (c.minuteStart < minuteStart) Object.assign(c, { minuteStart, minute: 0 });
    if (c.dayStart < dayStart) Object.assign(c, { dayStart, day: 0 });
    this.counters.set(keyId, c);

    const allowed = c.minute < limits.perMinute && c.day < limits.perDay;
    if (allowed) {
      c.minute++;
      c.day++;
    }
    const resetMinute = Math.max(1, Math.ceil((minuteStart + MINUTE - now) / 1000));
    const resetDay = Math.max(1, Math.ceil((dayStart + DAY - now) / 1000));
    return {
      allowed,
      limitMinute: limits.perMinute,
      remainingMinute: Math.max(0, limits.perMinute - c.minute),
      resetMinute,
      limitDay: limits.perDay,
      remainingDay: Math.max(0, limits.perDay - c.day),
      resetDay,
      retryAfter: allowed ? 0 : c.day >= limits.perDay ? resetDay : resetMinute,
    };
  }
}
