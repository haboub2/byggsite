import { isRole, type Role } from "./roles";

/**
 * The proxy (proxy.ts) checks who is signed in once per request and hands the
 * result to layouts, pages, server actions and route handlers in a request
 * header, so they need not ask Supabase again (lib/core/org/session.ts).
 *
 * A request header can also come from the browser, so the value is only
 * trusted when it carries an HMAC made with a server-only secret, and has not
 * expired. On every path it matches, the proxy removes whatever came in under
 * this name before it sets its own (`forwardHeaders`). Requests the proxy
 * never sees (a server action posted to another URL, /api) carry no valid
 * header and fall back to asking Supabase. A missing, forged or expired
 * header never grants anything; it only costs the full check.
 *
 * Pure (no Next or server-only imports) so the proxy and the tests use it.
 */

export const SESSION_HEADER = "x-binaafy-session";

/** Long enough for one request with a slow render, short enough that a leaked value is useless. */
export const SESSION_TTL_MS = 2 * 60 * 1000;

export type SessionMembership = { orgId: string; role: Role; name: string; slug: string; orgNr: string; joinedAt: string };

export type RequestSession = {
  userId: string;
  email: string | null;
  /** user_metadata.name, for the portal. */
  name: string;
  /** In join order (memberships.created_at). */
  memberships: SessionMembership[];
  /** default_org(): the organisation that owns the website (lib/core/org/site.ts). */
  siteOrgId: string | null;
  /** True when the Auth server confirmed the session (getUser), not only the JWT's signature. */
  authChecked: boolean;
  /** Epoch ms after which the value is no longer accepted. */
  exp: number;
};

/**
 * The HMAC key: SUPABASE_SERVICE_ROLE_KEY is already a server-only secret
 * that the proxy and the server share. Without it the header is never set
 * and every check asks Supabase.
 */
export function sessionSecret(env: Record<string, string | undefined> = process.env): string | null {
  return env.SUPABASE_SERVICE_ROLE_KEY || null;
}

// Domain separation: the key signs nothing else in this format.
const CONTEXT = "binaafy-request-session-v1.";

const keys = new Map<string, Promise<CryptoKey>>();
function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    keys.set(secret, key);
  }
  return key;
}

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

async function mac(body: string, secret: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(CONTEXT + body));
  return b64url(new Uint8Array(sig));
}

export async function signSession(session: RequestSession, secret: string): Promise<string> {
  const body = b64url(new TextEncoder().encode(JSON.stringify(session)));
  return `${body}.${await mac(body, secret)}`;
}

function parseMemberships(v: unknown): SessionMembership[] | null {
  if (!Array.isArray(v)) return null;
  const out: SessionMembership[] = [];
  for (const m of v) {
    if (!m || typeof m !== "object") return null;
    const r = m as Record<string, unknown>;
    if (typeof r.orgId !== "string" || !isRole(r.role)) return null;
    const str = (x: unknown) => (typeof x === "string" ? x : "");
    out.push({ orgId: r.orgId, role: r.role, name: str(r.name), slug: str(r.slug), orgNr: str(r.orgNr), joinedAt: str(r.joinedAt) });
  }
  return out;
}

/** The session in a header value, or null unless it is signed with `secret` and unexpired. */
export async function verifySession(value: string | null | undefined, secret: string | null, now = Date.now()): Promise<RequestSession | null> {
  if (!value || !secret) return null;
  const dot = value.indexOf(".");
  if (dot <= 0 || dot !== value.lastIndexOf(".")) return null;
  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), Buffer.from(sig, "base64url"), new TextEncoder().encode(CONTEXT + body));
  } catch {
    return null;
  }
  if (!ok) return null;

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.exp !== "number" || raw.exp <= now) return null;
  if (typeof raw.userId !== "string" || !raw.userId) return null;
  const memberships = parseMemberships(raw.memberships);
  if (!memberships) return null;
  return {
    userId: raw.userId,
    email: typeof raw.email === "string" ? raw.email : null,
    name: typeof raw.name === "string" ? raw.name : "",
    memberships,
    siteOrgId: typeof raw.siteOrgId === "string" ? raw.siteOrgId : null,
    authChecked: raw.authChecked === true,
    exp: raw.exp,
  };
}

/**
 * The request headers to pass on: the incoming ones without anything under
 * SESSION_HEADER (whatever the browser sent), plus the proxy's own value
 * when it has one. Every response the proxy lets through uses this.
 */
export function forwardHeaders(incoming: Headers, signed: string | null): Headers {
  const headers = new Headers(incoming);
  headers.delete(SESSION_HEADER);
  if (signed) headers.set(SESSION_HEADER, signed);
  return headers;
}

/**
 * The membership the session works in: the cookie's choice among the user's
 * own, else the first one that reaches admin. An employee membership (0035)
 * reaches no admin page, so it is chosen only when the user has nothing
 * else; otherwise a user who is employee in one organisation and owner in
 * another would be sent to the portal without a way back.
 */
export function pickMembership(memberships: SessionMembership[], wanted: string | null | undefined): SessionMembership | null {
  return memberships.find((m) => m.orgId === wanted) ?? memberships.find((m) => m.role !== "employee") ?? memberships[0] ?? null;
}
