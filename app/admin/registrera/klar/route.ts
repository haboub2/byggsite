import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/leads";
import { ORG_COOKIE } from "@/lib/core/org/current";
import { completeRegistration } from "@/lib/core/org/registration-store";
import { REGISTRATION_TOKEN, registrationDonePath } from "@/lib/core/org/registration";

const cookieOptions = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 365, secure: process.env.NODE_ENV === "production" };

/**
 * Where the registration's sign-in link lands (0033), after the callback has
 * made the session: create the organisation (complete_registration checks
 * the token and that the signed-in address is the registered one), pick it,
 * and go to the start guide. A route handler, since picking the organisation
 * sets a cookie. Problems go to /admin/registrera?fel=…, a visitor without a
 * session to the login with the way back kept.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("r") ?? "";
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));
  if (!REGISTRATION_TOKEN.test(token)) return to("/admin/registrera?fel=lank");

  let email: string | null = "demo@localhost";
  if (!isDemo()) {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (!user) {
      const login = new URL("/admin/login", request.url);
      login.searchParams.set("next", registrationDonePath(token));
      login.searchParams.set("lank", "1");
      return NextResponse.redirect(login);
    }
    email = user.email ?? null;
  }

  const result = await completeRegistration(token, email);
  if (!result.ok) return to(`/admin/registrera?fel=${result.problem}`);

  const response = to("/admin/kom-igang?ny=1");
  response.cookies.set(ORG_COOKIE, result.orgId, cookieOptions);
  revalidatePath("/admin", "layout");
  return response;
}
