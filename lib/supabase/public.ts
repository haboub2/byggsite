import { createClient } from "@supabase/supabase-js";

/** Anon client without cookies, for public reads (RLS: published rows only).
 *  Not using cookies() keeps pages that read content statically rendered. */
export function createPublicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}
