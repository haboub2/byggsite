import { bearerToken, hasScope, isApiKeyFormat, scopeText, type ApiScope } from "./keys";
import { apiError } from "./respond";
import { rateLimitHeaders, type RateDecision } from "./rate-limit";
import { newRequestId, requestLogEntry, type ApiRequestLog } from "./request-log";

/**
 * What every /api/v1 call goes through before and after its handler, with
 * the database behind `FrameDeps` so the same steps run against Supabase
 * (lib/api/auth.ts), demo mode's memory and the tests:
 *
 *   key → rate limit (429) → scope (403) → handler → headers → log
 *
 * Every response gets X-Request-Id; once the key is known, also
 * X-RateLimit-Limit/-Remaining/-Reset, and Retry-After on 429. Every call
 * made with a known key (also refused ones) is logged, without body, query
 * or key. A call without a valid key belongs to no organisation and is not
 * logged.
 */

export type ApiPrincipal = { orgId: string; keyId: string; scopes: string[]; name: string };
export type ApiKeyRecord = { id: string; orgId: string; name: string; scopes: string[]; revokedAt: string | null };

export type FrameDeps = {
  /** The key with this token (by hash), or null. Throws when the lookup fails. */
  findKey(token: string): Promise<ApiKeyRecord | null>;
  /** Counts the call. Null when the limiter is unavailable: the call is let through. */
  checkRate(key: ApiKeyRecord): Promise<RateDecision | null>;
  /** Stores the row, typically after the response is sent. Must not throw. */
  log(entry: ApiRequestLog): void;
  now?: () => number;
};

/** The same response with extra headers (a new Response, so it works whatever made the first one). */
export function withHeaders(response: Response, extra: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function runApiFrame(
  request: Request,
  scope: ApiScope | readonly ApiScope[],
  deps: FrameDeps,
  handler: (principal: ApiPrincipal) => Promise<Response>
): Promise<Response> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const requestId = newRequestId();
  let key: ApiKeyRecord | null = null;
  let decision: RateDecision | null = null;
  let response: Response;

  try {
    const token = bearerToken(request.headers.get("authorization"));
    if (!token || !isApiKeyFormat(token)) {
      response = apiError("unauthorized", "Ange en giltig API-nyckel som Bearer.");
    } else {
      key = await deps.findKey(token);
      if (!key || key.revokedAt) {
        response = apiError("unauthorized", "Nyckeln är okänd eller återkallad.");
      } else {
        decision = await deps.checkRate(key);
        if (decision && !decision.allowed) {
          response = apiError("rate_limited", `För många anrop med nyckeln. Försök igen om ${Math.max(1, decision.retryAfter)} sekunder.`, {
            limitPerMinute: decision.limitMinute,
            limitPerDay: decision.limitDay,
            retryAfter: Math.max(1, decision.retryAfter),
          });
        } else if (!hasScope(key.scopes, scope)) {
          response = apiError("forbidden", `Nyckeln saknar behörigheten "${scopeText(scope)}".`);
        } else {
          response = await handler({ orgId: key.orgId, keyId: key.id, scopes: key.scopes, name: key.name });
        }
      }
    }
  } catch (err) {
    console.error("[api] frame:", err);
    response = apiError("internal", "Något gick fel. Försök igen.");
  }

  response = withHeaders(response, { "x-request-id": requestId, ...(decision ? rateLimitHeaders(decision) : {}) });
  if (key) {
    try {
      deps.log(requestLogEntry({ orgId: key.orgId, keyId: key.id, requestId, request, status: response.status, startedAt, finishedAt: now() }));
    } catch (err) {
      console.error("[api] log:", err);
    }
  }
  return response;
}
