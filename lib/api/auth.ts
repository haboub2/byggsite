import "server-only";
import { after } from "next/server";
import { createAdminClient } from "../supabase/admin";
import { isDemo } from "../leads";
import { DEMO_ORG_ID } from "../core/org/current";
import { hashApiKey } from "./keys";
import { demoApiDeps } from "./demo";
import { decisionFromRpc } from "./rate-limit";
import { toRow } from "./request-log";
import type { FrameDeps } from "./frame";

/**
 * Who is calling /api/v1, against the database. Only API keys for now; a
 * session-cookie path is added when the admin UI starts calling the same
 * routes. The key is looked up by hash with the service-role client
 * (api_keys has no anon policy), then every query the route makes is scoped
 * to the key's `orgId` explicitly. The rate limit is api_check_rate() (also
 * sets last_used_at); the log row is written after the response is sent.
 *
 * The limiter fails open: if api_check_rate() cannot be called (say, before
 * 0029 is run), the call goes through without X-RateLimit headers and the
 * error is logged. The limit protects the service; it is not access control.
 */

export type { ApiPrincipal } from "./frame";

function databaseDeps(): FrameDeps {
  const db = createAdminClient();
  return {
    async findKey(token) {
      const { data, error } = await db.from("api_keys").select("id, org_id, scopes, name, revoked_at").eq("key_hash", hashApiKey(token)).maybeSingle();
      if (error) throw new Error(`Kunde inte kontrollera nyckeln: ${error.message}`);
      if (!data) return null;
      return { id: data.id as string, orgId: data.org_id as string, scopes: data.scopes as string[], name: data.name as string, revokedAt: data.revoked_at as string | null };
    },
    async checkRate(key) {
      const { data, error } = await db.rpc("api_check_rate", { p_key: key.id });
      const decision = error ? null : decisionFromRpc(data);
      if (!decision) console.error("[api] api_check_rate:", error?.message ?? "unexpected result");
      return decision;
    },
    log(entry) {
      after(async () => {
        const { error } = await db.from("api_requests").insert(toRow(entry));
        if (error) console.error("[api] api_requests:", error.message);
      });
    },
  };
}

/** The frame's dependencies: the database, or memory in demo mode. */
export function apiFrameDeps(): FrameDeps {
  return isDemo() ? demoApiDeps(DEMO_ORG_ID) : databaseDeps();
}
