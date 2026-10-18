import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Gate the two signed-in areas:
 *   /admin/*        — admins only (a session AND a row in `admins`); a signed-in
 *                     customer is sent to the portal, nobody else to /admin/login.
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
    return NextResponse.redirect(new URL(login, request.url));
  }

  if (isAdmin) {
    // Customers are ordinary users too; only the admins table tells them apart.
    const { data: admin } = await supabase.rpc("is_admin");
    if (!admin) return NextResponse.redirect(new URL("/mitt-projekt", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/mitt-projekt/:path*"],
};
