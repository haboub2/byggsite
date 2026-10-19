/**
 * One response shape for /api/v1. Errors are `{ error: { code, message } }`
 * with an HTTP status; successes are the resource or `{ data }`.
 */

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "idempotency_conflict"
  | "rate_limited"
  | "conflict"
  | "internal";

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation_error: 422,
  idempotency_conflict: 422,
  rate_limited: 429,
  conflict: 409,
  internal: 500,
};

export function apiError(code: ApiErrorCode, message: string, details?: unknown): Response {
  return Response.json({ error: { code, message, ...(details !== undefined ? { details } : {}) } }, { status: STATUS[code] });
}

export function apiJson(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return Response.json(data, { status: init.status ?? 200, headers: { "cache-control": "no-store", ...init.headers } });
}

export const API_VERSION = "v1";
