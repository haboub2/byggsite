import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  SESSION_HEADER,
  forwardHeaders,
  pickMembership,
  sessionSecret,
  signSession,
  verifySession,
  type RequestSession,
} from "./request-session";
import { proxy } from "../../../proxy";

const SECRET = "test-service-role-key";
const NOW = Date.parse("2026-10-26T12:00:00Z");

const session = (patch: Partial<RequestSession> = {}): RequestSession => ({
  userId: "11111111-1111-4111-8111-111111111111",
  email: "ibrahim@example.se",
  name: "Ibrahim Å",
  memberships: [
    { orgId: "org-a", role: "accountant", name: "Bergs Bygg AB", slug: "bergs", orgNr: "559123-4567", joinedAt: "2026-01-01T00:00:00Z" },
    { orgId: "org-b", role: "owner", name: "Åkessons Måleri", slug: "akesson", orgNr: "", joinedAt: "2026-02-01T00:00:00Z" },
  ],
  siteOrgId: "org-b",
  authChecked: false,
  exp: NOW + 60_000,
  ...patch,
});

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");

test("a value signed by the proxy reads back unchanged, non-ASCII names included", async () => {
  const value = await signSession(session(), SECRET);
  assert.match(value, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/); // header-safe
  assert.deepEqual(await verifySession(value, SECRET, NOW), session());
});

test("a header the browser made up never verifies", async () => {
  // Plain JSON, base64 without a signature, an empty or garbled signature.
  assert.equal(await verifySession(JSON.stringify(session()), SECRET, NOW), null);
  assert.equal(await verifySession(b64(session()), SECRET, NOW), null);
  assert.equal(await verifySession(`${b64(session())}.`, SECRET, NOW), null);
  assert.equal(await verifySession(`${b64(session())}.AAAA`, SECRET, NOW), null);
  assert.equal(await verifySession(`${b64(session())}.%%%`, SECRET, NOW), null);
  assert.equal(await verifySession("", SECRET, NOW), null);
  assert.equal(await verifySession("a.b.c", SECRET, NOW), null);
  assert.equal(await verifySession(null, SECRET, NOW), null);
});

test("signed with another key: refused", async () => {
  const value = await signSession(session(), "some-other-key");
  assert.equal(await verifySession(value, SECRET, NOW), null);
});

test("a changed body under a valid signature is refused (no promoting oneself to owner)", async () => {
  const value = await signSession(session(), SECRET);
  const sig = value.split(".")[1];
  const promoted = session({ memberships: [{ ...session().memberships[0], role: "owner" }] });
  assert.equal(await verifySession(`${b64(promoted)}.${sig}`, SECRET, NOW), null);
  const otherUser = session({ userId: "22222222-2222-4222-8222-222222222222" });
  assert.equal(await verifySession(`${b64(otherUser)}.${sig}`, SECRET, NOW), null);
});

test("an expired value is refused, so it falls back to asking Supabase", async () => {
  const value = await signSession(session({ exp: NOW - 1 }), SECRET);
  assert.equal(await verifySession(value, SECRET, NOW), null);
  const fresh = await signSession(session(), SECRET);
  assert.equal(await verifySession(fresh, SECRET, NOW + 60_001), null);
});

test("without the server secret nothing is trusted", async () => {
  const value = await signSession(session(), SECRET);
  assert.equal(await verifySession(value, null, NOW), null);
  assert.equal(sessionSecret({}), null);
  assert.equal(sessionSecret({ SUPABASE_SERVICE_ROLE_KEY: "" }), null);
  assert.equal(sessionSecret({ SUPABASE_SERVICE_ROLE_KEY: SECRET }), SECRET);
});

test("a signed value with an unknown role or a malformed body is refused", async () => {
  const badRole = session({ memberships: [{ ...session().memberships[0], role: "superuser" as never }] });
  assert.equal(await verifySession(await signSession(badRole, SECRET), SECRET, NOW), null);
  const noUser = session({ userId: "" });
  assert.equal(await verifySession(await signSession(noUser, SECRET), SECRET, NOW), null);
});

test("forwardHeaders drops whatever the browser sent under the header's name", () => {
  const incoming = new Headers({ "X-Binaafy-Session": "forged", cookie: "a=1", accept: "text/html" });
  const none = forwardHeaders(incoming, null);
  assert.equal(none.get(SESSION_HEADER), null);
  assert.equal(none.get("cookie"), "a=1");
  assert.equal(none.get("accept"), "text/html");

  const ours = forwardHeaders(incoming, "signed-by-proxy");
  assert.equal(ours.get(SESSION_HEADER), "signed-by-proxy");
  // The incoming headers themselves are left alone.
  assert.equal(incoming.get(SESSION_HEADER), "forged");
});

test("the org cookie picks among the user's own memberships only", () => {
  const { memberships } = session();
  assert.equal(pickMembership(memberships, "org-b")?.orgId, "org-b");
  assert.equal(pickMembership(memberships, "someone-elses-org")?.orgId, "org-a");
  assert.equal(pickMembership(memberships, undefined)?.orgId, "org-a");
  assert.equal(pickMembership([], "org-a"), null);
});

/** What NextResponse.next({ request: { headers } }) hands on, as Next encodes it. */
const forwarded = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`);

test("the proxy strips a forged session header on paths it lets through without a check", async () => {
  const forged = await signSession(session({ memberships: [{ ...session().memberships[1], role: "owner" }] }), "guessed-key");
  for (const path of ["/admin/login", "/mitt-projekt/login", "/mitt-projekt/callback"]) {
    const res = await proxy(new NextRequest(`http://localhost${path}`, { headers: { [SESSION_HEADER]: forged, accept: "text/html" } }));
    // The request headers are replaced as a whole, and the forged one is not among them.
    const passed = (res.headers.get("x-middleware-override-headers") ?? "").split(",");
    assert.ok(passed.includes("accept"), path);
    assert.ok(!passed.includes(SESSION_HEADER), path);
    assert.equal(forwarded(res, SESSION_HEADER), null, path);
  }
});

test("demo mode (no Supabase, development) also strips it", async () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, mode: env.NODE_ENV };
  delete env.NEXT_PUBLIC_SUPABASE_URL;
  delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  env.NODE_ENV = "development";
  try {
    const res = await proxy(new NextRequest("http://localhost/admin/fakturor", { headers: { [SESSION_HEADER]: "forged" } }));
    assert.equal(forwarded(res, SESSION_HEADER), null);
  } finally {
    if (saved.url !== undefined) env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    if (saved.key !== undefined) env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key;
    env.NODE_ENV = saved.mode;
  }
});

test("signed out on an invitation or registration link: let through, without the forged header", async () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  // No session cookie, so supabase-js answers "signed out" without a request.
  env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  try {
    for (const path of ["/admin/inbjudan/abc", "/admin/registrera"]) {
      const res = await proxy(new NextRequest(`http://localhost${path}`, { headers: { [SESSION_HEADER]: "forged" } }));
      assert.equal(res.headers.get("location"), null, path);
      assert.equal(forwarded(res, SESSION_HEADER), null, path);
    }
    // Anywhere else, signed out means the login page, header or not.
    const res = await proxy(new NextRequest("http://localhost/admin/fakturor", { headers: { [SESSION_HEADER]: "forged" } }));
    assert.equal(new URL(res.headers.get("location") ?? "", "http://localhost").pathname, "/admin/login");
  } finally {
    env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key;
    if (saved.url === undefined) delete env.NEXT_PUBLIC_SUPABASE_URL;
    if (saved.key === undefined) delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
});
