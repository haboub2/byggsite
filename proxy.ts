import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { adminLandingPath, canOpenAdminPath, canOpenSelfPath, isOpenAdminPath, isRole, isSelfPath, isSiteAdminPath, type Role } from "./lib/core/org/roles";
import {
  SESSION_TTL_MS,
  forwardHeaders,
  pickMembership,
  sessionSecret,
  signSession,
  type SessionMembership,
} from "./lib/core/org/request-session";

// Same name as ORG_COOKIE in lib/core/org/current.ts (server-only, so not imported here).
const ORG_COOKIE = "org";

type Supabase = ReturnType<typeof createServerClient>;
type Cookie = { name: string; value: string; options?: CookieOptions };

/**
 * Gate the two signed-in areas:
 *   /admin/*        — members of an organisation (memberships). Accountants and
 *                     read-only members only reach Ekonomi, fakturor, kunder and
 *                     ROT (lib/core/org/roles.ts), Personal is for owners, admins
 *                     and accountants, and an employee (0035) reaches no admin
 *                     page and lands in the portal; a signed-in user without a
 *                     membership is sent to the portal, except to accept an
 *                     invitation, start an organisation or finish a
 *                     registration (/admin itself shows that choice). The website's
 *                     content (/admin/innehall) is only for owners and admins
 *                     of the organisation that owns the site (default_org()).
 *                     Nobody signed out gets past /admin/login.
 *   /mitt-projekt/* — any signed-in user; RLS then limits customers to their
 *                     own projects. Admins may look too.
 *   /min-tid/*      — the employee's own time (role employee, 0037); owners
 *                     and admins may open it to try it. Anyone else signed in
 *                     goes where their role lands; signed out, to the admin
 *                     login, which brings them back.
 * Without a Supabase project configured, development runs on sample data
 * (demo mode) and production refuses everything behind a login.
 *
 * What the proxy learns (user, memberships, the site's organisation) goes on
 * to layouts, pages and actions in a signed request header, so they need not
 * ask Supabase again (lib/core/org/request-session.ts, lib/core/org/session.ts).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdmin = pathname.startsWith("/admin");
  const isSelf = isSelfPath(pathname);
  const login = isAdmin || isSelf ? "/admin/login" : "/mitt-projekt/login";

  // Every response that lets the request through drops whatever the browser
  // sent under the session header's name; only the proxy's own value passes.
  const pass = (signed: string | null = null) => NextResponse.next({ request: { headers: forwardHeaders(request.headers, signed) } });

  // Pages that must stay reachable without a session.
  if (pathname === "/admin/login" || pathname === "/mitt-projekt/login" || pathname === "/mitt-projekt/callback") {
    return pass();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (process.env.NODE_ENV === "development") return pass();
    return NextResponse.redirect(new URL(login, request.url));
  }

  // A refreshed session updates the request's cookies (seen by everything
  // after the proxy) and is set on whatever response goes back.
  const refreshed: Cookie[] = [];
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Cookie[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        refreshed.push(...cookiesToSet);
      },
    },
  });
  const withCookies = (response: NextResponse) => {
    refreshed.forEach(({ name, value, options }) => response.cookies.set(name, value, options ?? {}));
    return response;
  };

  const user = await verifiedUser(supabase, request.method);

  if (!user) {
    // An invitation link shows its own sign-in for the invited address; the
    // registration landing sends to the login with its token kept (0033).
    if (pathname.startsWith("/admin/inbjudan/") || pathname === "/admin/registrera" || pathname.startsWith("/admin/registrera/")) return withCookies(pass());
    const to = new URL(login, request.url);
    if ((isAdmin && pathname !== "/admin") || isSelf) to.searchParams.set("next", pathname);
    return withCookies(NextResponse.redirect(to));
  }

  // One round trip each, side by side; default_org() is remembered between requests.
  const [memberships, siteOrgId] = await Promise.all([loadMemberships(supabase, user.userId), siteOrg(supabase)]);

  if (isAdmin && !isOpenAdminPath(pathname)) {
    // Customers are ordinary users too; only memberships tell them apart.
    // The cookie picks among the user's own memberships, never beyond them.
    const current = pickMembership(memberships ?? [], request.cookies.get(ORG_COOKIE)?.value);
    // Without a membership, /admin itself shows the choice to start an organisation
    // (the layout); everything else goes to the portal, where customers belong.
    if (!current) return withCookies(pathname === "/admin" ? pass() : NextResponse.redirect(new URL("/mitt-projekt", request.url)));
    const site = isSiteAdminPath(pathname) && siteOrgId === current.orgId;
    if (!canOpenAdminPath(current.role, pathname, site)) return withCookies(NextResponse.redirect(new URL(adminLandingPath(current.role), request.url)));
  }

  if (isSelf) {
    // The same choice of organisation as admin; a customer has no membership and goes to the portal.
    const current = pickMembership(memberships ?? [], request.cookies.get(ORG_COOKIE)?.value);
    if (!current) return withCookies(NextResponse.redirect(new URL("/mitt-projekt", request.url)));
    if (!canOpenSelfPath(current.role)) return withCookies(NextResponse.redirect(new URL(adminLandingPath(current.role), request.url)));
  }

  // Without the secret, or when the memberships could not be read, nothing is
  // handed on and the server asks Supabase itself.
  const secret = sessionSecret();
  const signed =
    secret && memberships ? await signSession({ ...user, memberships, siteOrgId, exp: Date.now() + SESSION_TTL_MS }, secret) : null;
  return withCookies(pass(signed));
}

/**
 * Who is signed in. Reads (GET, HEAD) verify the access token's signature
 * locally with getClaims(): the project signs with an asymmetric key (ES256),
 * whose public half (JWKS) supabase-js fetches once and keeps for ten
 * minutes, so there is no round trip to Auth. Everything else (server
 * actions, uploads) asks the Auth server with getUser(), which also catches a
 * session signed out elsewhere or a removed user before the token expires;
 * several actions go on to use the service role (lib/supabase/admin.ts).
 */
async function verifiedUser(supabase: Supabase, method: string) {
  if (method === "GET" || method === "HEAD") {
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims?.sub) return null;
    const meta = claims.user_metadata as Record<string, unknown> | undefined;
    return {
      userId: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
      name: typeof meta?.name === "string" ? meta.name : "",
      authChecked: false,
    };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return {
    userId: user.id,
    email: user.email ?? null,
    name: typeof user.user_metadata?.name === "string" ? user.user_metadata.name : "",
    authChecked: true,
  };
}

/** The user's memberships, in join order; null when they could not be read. */
async function loadMemberships(supabase: Supabase, userId: string): Promise<SessionMembership[] | null> {
  const { data, error } = await supabase
    .from("memberships")
    .select("org_id, role, created_at, organizations(name, slug, org_nr)")
    .eq("user_id", userId)
    .order("created_at");
  if (error) {
    console.error("[proxy] memberships lookup failed:", error.message);
    return null;
  }
  type Joined = { org_id: string; role: string; created_at: string; organizations: { name: string; slug: string; org_nr: string } | null };
  return ((data ?? []) as unknown as Joined[])
    .filter((r) => isRole(r.role))
    .map((r) => ({
      orgId: r.org_id,
      role: r.role as Role,
      name: r.organizations?.name ?? "Organisation",
      slug: r.organizations?.slug ?? "",
      orgNr: r.organizations?.org_nr ?? "",
      joinedAt: r.created_at,
    }));
}

// default_org() is the oldest organisation and never changes in practice, so
// each server instance remembers it for a while.
const SITE_ORG_TTL_MS = 10 * 60 * 1000;
let siteOrgMemo: { id: string | null; at: number } | null = null;

async function siteOrg(supabase: Supabase): Promise<string | null> {
  if (siteOrgMemo && Date.now() - siteOrgMemo.at < SITE_ORG_TTL_MS) return siteOrgMemo.id;
  // Security definer: the site's organisation, whichever the user can see.
  const { data, error } = await supabase.rpc("default_org");
  if (error) {
    console.error("[proxy] default_org failed:", error.message);
    return null;
  }
  siteOrgMemo = { id: (data as string | null) ?? null, at: Date.now() };
  return siteOrgMemo.id;
}

export const config = {
  matcher: ["/admin/:path*", "/mitt-projekt/:path*", "/min-tid", "/min-tid/:path*"],
};
