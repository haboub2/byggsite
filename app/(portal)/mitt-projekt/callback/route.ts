import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Only our own pages may be the target after login: the portal, or a member invitation in admin. */
function safeNext(next: string | null): string {
  if (next && /^\/admin\/inbjudan\/[a-f0-9]{48}$/.test(next)) return next;
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
  if (next.startsWith("/admin/")) return NextResponse.redirect(new URL(`${next}?lank=1`, request.url));
  // The link was already used (some mail apps open links to check them) or has
  // expired. The code in the same e-mail still works on the login page.
  return NextResponse.redirect(new URL("/mitt-projekt/login?lank=1", request.url));
}
