import "server-only";
import { z } from "zod";
import { asSystem } from "../core/db";
import { createAdminClient } from "../supabase/admin";
import type { Actor } from "../core/events";
import { isDemo } from "../leads";
import type { ApiScope } from "./keys";
import { apiFrameDeps, type ApiPrincipal } from "./auth";
import { demoApiState } from "./demo";
import { runApiFrame } from "./frame";
import { idempotencyKeySchema, replayDecision, requestHash, type StoredResponse } from "./idempotency";
import { apiError, apiJson } from "./respond";
import { issuesToDetailsPure } from "./validation";

/**
 * The frame every /api/v1 route runs in: authenticate the key, count it
 * against the key's rate limit, check its scope (lib/api/frame.ts), then run
 * the handler as the system *for the key's organisation*
 * (asSystem(fn, orgId)), so every store filters and writes on that org_id
 * with the service-role client. Writing routes also go through
 * Idempotency-Key. Errors come out in the one shape from respond.ts; every
 * response has X-Request-Id and every call is logged in api_requests.
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
  return async (request: Request, route: HandlerRoute): Promise<Response> =>
    runApiFrame(request, scope, apiFrameDeps(), async (principal) => {
      const actor: Actor = { kind: "api_key", id: principal.keyId, name: principal.name };
      const params = (await route?.params) ?? {};
      try {
        return await asSystem(() => handler({ principal, actor, request, params }), principal.orgId);
      } catch (err) {
        return toResponse(err);
      }
    });
}

/** Where Idempotency-Key rows live: idempotency_keys, or memory in demo mode. */
type IdempotencyStore = {
  /** Writes the placeholder row (status 0). False when the key is already taken. */
  claim(org: string, key: string, hash: string): Promise<boolean>;
  read(org: string, key: string): Promise<StoredResponse | null>;
  finish(org: string, key: string, status: number, response: unknown): Promise<void>;
  drop(org: string, key: string): Promise<void>;
};

function idempotencyStore(): IdempotencyStore {
  if (isDemo()) {
    const rows = demoApiState().idempotency;
    const id = (org: string, key: string) => `${org}:${key}`;
    return {
      async claim(org, key, hash) {
        if (rows.has(id(org, key))) return false;
        rows.set(id(org, key), { status: 0, response: {}, requestHash: hash });
        return true;
      },
      async read(org, key) {
        return rows.get(id(org, key)) ?? null;
      },
      async finish(org, key, status, response) {
        const row = rows.get(id(org, key));
        if (row) Object.assign(row, { status, response });
      },
      async drop(org, key) {
        rows.delete(id(org, key));
      },
    };
  }
  const db = createAdminClient();
  return {
    async claim(org, key, hash) {
      const { error } = await db.from("idempotency_keys").insert({ org_id: org, key, request_hash: hash, status: 0, response: {} });
      if (!error) return true;
      if (error.code === "23505") return false;
      throw new ApiProblem("internal", "Kunde inte registrera Idempotency-Key.");
    },
    async read(org, key) {
      const { data } = await db.from("idempotency_keys").select("status, response, request_hash").eq("org_id", org).eq("key", key).maybeSingle();
      return data ? { status: data.status as number, response: data.response, requestHash: data.request_hash as string } : null;
    },
    async finish(org, key, status, response) {
      await db.from("idempotency_keys").update({ status, response }).eq("org_id", org).eq("key", key);
    },
    async drop(org, key) {
      await db.from("idempotency_keys").delete().eq("org_id", org).eq("key", key);
    },
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
  return async (request: Request, route: HandlerRoute): Promise<Response> =>
    runApiFrame(request, scope, apiFrameDeps(), async (principal) => {
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
      const store = idempotencyStore();

      let claimed: boolean;
      try {
        claimed = await store.claim(principal.orgId, key, hash);
      } catch (err) {
        return toResponse(err);
      }
      if (!claimed) {
        const stored = await store.read(principal.orgId, key);
        if (!stored) return apiError("conflict", "Försök igen.");
        if (replayDecision(stored, hash) === "conflict") return apiError("idempotency_conflict", "Idempotency-Key är redan använd för ett annat anrop.");
        if (stored.status === 0) return apiError("conflict", "Ett anrop med samma Idempotency-Key pågår.");
        return apiJson(stored.response, { status: stored.status, headers: { "idempotent-replayed": "true" } });
      }

      let response: Response;
      try {
        response = await asSystem(() => handler({ principal, actor, request, params, body }), principal.orgId);
      } catch (err) {
        response = toResponse(err);
      }

      if (response.status >= 500) {
        await store.drop(principal.orgId, key);
      } else {
        const payload = await response.clone().json().catch(() => ({}));
        await store.finish(principal.orgId, key, response.status, payload);
      }
      return response;
    });
}
