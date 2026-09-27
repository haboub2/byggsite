"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser client — anon key, RLS enforced. Call fresh where needed, don't module-cache. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
