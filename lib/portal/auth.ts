import "server-only";
import { cookies } from "next/headers";
import { getRequestSession } from "../core/org/session";
import { isDemo } from "../leads";

/**
 * Who is signed in to the portal. Customers are ordinary Supabase users who
 * got their account from "Bjud in kund" in /admin and sign in with a one-time
 * code. In demo mode (local, no Supabase) the "session" is just a cookie with
 * the e-mail typed on the login page, and everyone sees the example project.
 */

export type PortalUser = { id: string; email: string; name: string; demo: boolean };

export const DEMO_COOKIE = "binaafy-portal-demo";

export async function getPortalUser(): Promise<PortalUser | null> {
  if (isDemo()) {
    const email = (await cookies()).get(DEMO_COOKIE)?.value;
    return email ? { id: email, email, name: "", demo: true } : null;
  }
  // The proxy's check for this request (lib/core/org/session.ts).
  const session = await getRequestSession();
  if (!session?.email) return null;
  return { id: session.userId, email: session.email, name: session.name, demo: false };
}
