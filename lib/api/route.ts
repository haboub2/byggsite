import "server-only";
import { z } from "zod";
import { asSystem } from "../core/db";
import { createAdminClient } from "../supabase/admin";
import type { Actor } from "../core/events";
import type { ApiScope } from "./keys";
import { authenticateApiRequest, isPrincipal, type ApiPrincipal } from "./auth";
import { idempotencyKeySchema, replayDecision, requestHash } from "./idempotency";
import { apiError, apiJson } from "./respond";
import { issuesToDetailsPure } from "./validation";

/**
 * The frame every /api/v1 route runs in: authenticate the key, check its
 * scope, then run the handler as the system *for the key's organisation*
 * (asSystem(fn, orgId)), so every store filters and writes on that org_id
 * with the service-role client. Writing routes also go through
 * Idempotency-Key. Errors come out in the one shape from respond.ts.
 */

export type ApiContext = { principal: ApiPrincipal; actor: Actor; request: Request; params: Record<string, string> };
type HandlerRoute = { params: Promise<Record<string, string>> };

export class ApiProblem extends Error {
  constructor(
    readonly code: Parameters<typeof apiError>[0],
    message: string,
    readonly details?: unknown
  ) {
    super(message);
  }
}

/** zod issues as { path: message }, like the admin forms. */
export const issuesToDetails = issuesToDetailsPure;

export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new ApiProblem("validation_error", "Anropet innehåller fel.", issuesToDetails(r.error));
  return r.data;
}

export function queryObject(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams);
}

function toResponse(err: unknown): Response {
  if (err instanceof ApiProblem) return apiError(err.code, err.message, err.details);
  const message = err instanceof Error ? err.message : String(err);
  // Store errors are written for people; the ones that mean "not here" become 404.
  if (/finns inte/i.test(message)) return apiError("not_found", message);
  if (/kan inte|redan|saknar|måste|kräver/i.test(message)) return apiError("conflict", message);
  console.error("[api] unexpected:", err);
  return apiError("internal", "Något gick fel. Försök igen.");
}

/** A reading route. */
export function apiGet(scope: ApiScope, handler: (ctx: ApiContext) => Promise<Response>) {
  return async (request: Request, route: HandlerRoute): Promise<Response> => {
    const principal = await authenticateApiRequest(request, scope);
    if (!isPrincipal(principal)) return principal;
    const actor: Actor = { kind: "api_key", id: principal.keyId, name: principal.name };
    const params = (await route?.params) ?? {};
    try {
      return await asSystem(() => handler({ principal, actor, request, params }), principal.orgId);
    } catch (err) {
      return toResponse(err);
    }
  };
}

/**
 * A writing route with Idempotency-Key (required). The first call's
 * response is stored per organisation and key; a retry with the same body
 * gets it back, a retry with another body is refused. A placeholder row is
 * written first so two concurrent calls with the same key cannot both run.
 * Server errors are not stored, so the client can retry them.
 */
export function apiPost(scope: ApiScope, handler: (ctx: ApiContext & { body: unknown }) => Promise<Response>) {
  return async (request: Request, route: HandlerRoute): Promise<Response> => {
    const principal = await authenticateApiRequest(request, scope);
    if (!isPrincipal(principal)) return principal;
    const actor: Actor = { kind: "api_key", id: principal.keyId, name: principal.name };
    const params = (await route?.params) ?? {};

    const keyParsed = idempotencyKeySchema.safeParse(request.headers.get("idempotency-key") ?? "");
    if (!keyParsed.success) return apiError("validation_error", "Skrivande anrop kräver headern Idempotency-Key (8–128 tecken: bokstäver, siffror, _ - : .).");
    const key = keyParsed.data;

    const raw = await request.text();
    let body: unknown = {};
    if (raw.trim()) {
      try {
        body = JSON.parse(raw);
      } catch {
        return apiError("validation_error", "Kroppen är inte giltig JSON.");
      }
    }
    const hash = requestHash(request.method, new URL(request.url).pathname, raw);
    const db = createAdminClient();

    const { error: insertError } = await db.from("idempotency_keys").insert({ org_id: principal.orgId, key, request_hash: hash, status: 0, response: {} });
    if (insertError) {
      if (insertError.code !== "23505") return apiError("internal", "Kunde inte registrera Idempotency-Key.");
      const { data: stored } = await db.from("idempotency_keys").select("status, response, request_hash").eq("org_id", principal.orgId).eq("key", key).maybeSingle();
      if (!stored) return apiError("conflict", "Försök igen.");
      const decision = replayDecision({ status: stored.status as number, response: stored.response, requestHash: stored.request_hash as string }, hash);
      if (decision === "conflict") return apiError("idempotency_conflict", "Idempotency-Key är redan använd för ett annat anrop.");
      if (stored.status === 0) return apiError("conflict", "Ett anrop med samma Idempotency-Key pågår.");
      return apiJson(stored.response, { status: stored.status as number, headers: { "idempotent-replayed": "true" } });
    }

    let response: Response;
    try {
      response = await asSystem(() => handler({ principal, actor, request, params, body }), principal.orgId);
    } catch (err) {
      response = toResponse(err);
    }

    if (response.status >= 500) {
      await db.from("idempotency_keys").delete().eq("org_id", principal.orgId).eq("key", key);
    } else {
      const payload = await response.clone().json().catch(() => ({}));
      await db.from("idempotency_keys").update({ status: response.status, response: payload }).eq("org_id", principal.orgId).eq("key", key);
    }
    return response;
  };
}
