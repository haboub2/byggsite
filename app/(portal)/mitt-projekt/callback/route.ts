import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Where the e-mail link (invite or login) lands: swap the code for a session, then into the portal. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/mitt-projekt", request.url));
  }
  // The link was already used (some mail apps open links to check them) or has
  // expired. The code in the same e-mail still works on the login page.
  return NextResponse.redirect(new URL("/mitt-projekt/login?lank=1", request.url));
}
