import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeAdminNext } from "@/lib/core/org/roles";

/** Only our own pages may be the target after login: the portal, or admin (an invitation, the registration landing, a sign-in link). */
function safeNext(next: string | null): string {
  const admin = safeAdminNext(next);
  if (admin) return admin;
  if (next && /^\/mitt-projekt(\/[\w\-/]*)?$/.test(next)) return next;
  return "/mitt-projekt";
}

/** Where the e-mail link (invite or login) lands: swap the code for a session, then into the portal (or `next`). */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  if (next.startsWith("/admin/")) {
    const to = new URL(next, request.url);
    to.searchParams.set("lank", "1");
    return NextResponse.redirect(to);
  }
  // The link was already used (some mail apps open links to check them) or has
  // expired. The code in the same e-mail still works on the login page.
  return NextResponse.redirect(new URL("/mitt-projekt/login?lank=1", request.url));
}
