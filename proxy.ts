import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canOpenAdminPath, isOpenAdminPath, isRole, isSiteAdminPath, type Role } from "./lib/core/org/roles";

// Same name as ORG_COOKIE in lib/core/org/current.ts (server-only, so not imported here).
const ORG_COOKIE = "org";

/**
 * Gate the two signed-in areas:
 *   /admin/*        — members of an organisation (memberships). Accountants and
 *                     read-only members only reach Ekonomi, fakturor, kunder and
 *                     ROT (lib/core/org/roles.ts); a signed-in user without a
 *                     membership is sent to the portal, except to accept an
 *                     invitation or start an organisation. The website's
 *                     content (/admin/innehall) is only for owners and admins
 *                     of the organisation that owns the site (default_org()).
 *                     Nobody signed out gets past /admin/login.
 *   /mitt-projekt/* — any signed-in user; RLS then limits customers to their
 *                     own projects. Admins may look too.
 * Without a Supabase project configured, development runs on sample data
 * (demo mode) and production refuses everything behind a login.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdmin = pathname.startsWith("/admin");
  const login = isAdmin ? "/admin/login" : "/mitt-projekt/login";

  // Pages that must stay reachable without a session.
  if (pathname === "/admin/login" || pathname === "/mitt-projekt/login" || pathname === "/mitt-projekt/callback") {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (process.env.NODE_ENV === "development") return NextResponse.next();
    return NextResponse.redirect(new URL(login, request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options ?? {})
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // An invitation link shows its own sign-in for the invited address.
    if (pathname.startsWith("/admin/inbjudan/")) return response;
    const to = new URL(login, request.url);
    if (isAdmin && pathname !== "/admin") to.searchParams.set("next", pathname);
    return NextResponse.redirect(to);
  }

  if (isAdmin && !isOpenAdminPath(pathname)) {
    // Customers are ordinary users too; only memberships tell them apart.
    // The cookie picks among the user's own memberships, never beyond them.
    const { data } = await supabase.from("memberships").select("org_id, role").eq("user_id", user.id).order("created_at");
    const rows = (data ?? []) as { org_id: string; role: string }[];
    const wanted = request.cookies.get(ORG_COOKIE)?.value;
    const current = rows.find((r) => r.org_id === wanted) ?? rows[0];
    if (!current || !isRole(current.role)) return NextResponse.redirect(new URL("/mitt-projekt", request.url));
    // default_org() is security definer: the site's organisation, whichever the user can see.
    const siteOrg = isSiteAdminPath(pathname) && (await supabase.rpc("default_org")).data === current.org_id;
    if (!canOpenAdminPath(current.role as Role, pathname, siteOrg)) return NextResponse.redirect(new URL("/admin/ekonomi", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/mitt-projekt/:path*"],
};
