import { createHash, randomBytes } from "node:crypto";

/**
 * API keys for /api/v1 (docs/fakturering.md, grundkrav 5). The key is shown
 * once when created; only its SHA-256 hash is stored (api_keys.key_hash),
 * so a database leak gives nobody access. The prefix is kept in clear so a
 * key can be recognised in the admin list.
 *
 * Format: bf_<env>_<32 base62 chars>, e.g. bf_live_8Kx…  (env: live | test)
 */

export type ApiKeyEnv = "live" | "test";
export const API_SCOPES = ["read", "write", "admin"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const KEY_RE = /^bf_(live|test)_[0-9A-Za-z]{32}$/;

function randomBase62(length: number): string {
  const bytes = randomBytes(length * 2);
  let out = "";
  for (let i = 0; i < bytes.length && out.length < length; i++) {
    const b = bytes[i];
    if (b < 248) out += ALPHABET[b % 62]; // skip the biased tail
  }
  return out.length === length ? out : out + randomBase62(length - out.length);
}

export function hashApiKey(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isApiKeyFormat(token: string): boolean {
  return KEY_RE.test(token);
}

/** A fresh key: give `token` to the user once, store `hash` and `prefix`. */
export function generateApiKey(env: ApiKeyEnv = "live"): { token: string; prefix: string; hash: string } {
  const token = `bf_${env}_${randomBase62(32)}`;
  return { token, prefix: token.slice(0, 12), hash: hashApiKey(token) };
}

/** Pull a bearer token out of an Authorization header, or null. */
export function bearerToken(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return m ? m[1] : null;
}

/** True when the key's scopes cover what the route needs. "admin" implies everything, "write" implies "read". */
export function hasScope(granted: readonly string[], needed: ApiScope): boolean {
  if (granted.includes("admin")) return true;
  if (needed === "read") return granted.includes("read") || granted.includes("write");
  return granted.includes(needed);
}
