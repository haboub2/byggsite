import { hashApiKey, isApiKeyFormat, type ApiScope } from "./keys";
import type { ApiKeyRecord, FrameDeps } from "./frame";
import { DEFAULT_RATE_LIMITS, MemoryRateLimiter, type RateLimits } from "./rate-limit";
import { MemoryRequestLog } from "./request-log";

/**
 * The API in demo mode (no database, `npm run dev` without Supabase): keys,
 * rate counters and the request log live in memory, like the rest of the
 * demo stores. Any well-formed key works and is registered on first use
 * with read and write; keys made on the admin page are registered with what
 * was chosen there. The tests use the same state, with their own limits.
 */

export type DemoApiKey = ApiKeyRecord & { prefix: string; limits: RateLimits; createdAt: string; lastUsedAt: string | null };
type StoredIdempotency = { status: number; response: unknown; requestHash: string };
type DemoApiState = { keys: Map<string, DemoApiKey>; limiter: MemoryRateLimiter; log: MemoryRequestLog; idempotency: Map<string, StoredIdempotency> };

const g = globalThis as unknown as { __binaafyApi?: DemoApiState };
export const demoApiState = (): DemoApiState => (g.__binaafyApi ??= { keys: new Map(), limiter: new MemoryRateLimiter(), log: new MemoryRequestLog(), idempotency: new Map() });

/** Forget every demo key, counter and log row (tests). */
export function resetDemoApi(): void {
  g.__binaafyApi = undefined;
}

/** A stable uuid-shaped id from the key's hash. */
function idFromHash(hash: string): string {
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function registerDemoApiKey(
  token: string,
  input: { orgId: string; name?: string; scopes?: ApiScope[]; limits?: Partial<RateLimits> }
): DemoApiKey {
  const hash = hashApiKey(token);
  const key: DemoApiKey = {
    id: idFromHash(hash),
    orgId: input.orgId,
    name: input.name ?? "Demo-nyckel",
    scopes: input.scopes ?? ["read", "write"],
    revokedAt: null,
    prefix: token.slice(0, 12),
    limits: { ...DEFAULT_RATE_LIMITS, ...input.limits },
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  demoApiState().keys.set(hash, key);
  return key;
}

export function demoApiDeps(orgId: string, now: () => number = Date.now): FrameDeps {
  return {
    async findKey(token) {
      const known = demoApiState().keys.get(hashApiKey(token));
      if (known) return known;
      return isApiKeyFormat(token) ? registerDemoApiKey(token, { orgId }) : null;
    },
    async checkRate(key) {
      const demoKey = [...demoApiState().keys.values()].find((k) => k.id === key.id);
      const decision = demoApiState().limiter.check(key.id, demoKey?.limits ?? DEFAULT_RATE_LIMITS, now());
      if (decision.allowed && demoKey) demoKey.lastUsedAt = new Date(now()).toISOString();
      return decision;
    },
    log(entry) {
      demoApiState().log.add(entry);
    },
    now,
  };
}
