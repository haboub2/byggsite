import "server-only";
import { createAdminClient } from "../supabase/admin";
import { isDemo } from "../leads";
import { bearerToken, hashApiKey, hasScope, isApiKeyFormat, type ApiScope } from "./keys";
import { apiError } from "./respond";

/**
 * Who is calling /api/v1. Only API keys for now; a session-cookie path is
 * added when the admin UI starts calling the same routes. The key is looked
 * up by hash with the service-role client (api_keys has no anon policy),
 * then every query the route makes is scoped to `orgId` explicitly.
 */

export type ApiPrincipal = { orgId: string; keyId: string; scopes: string[]; name: string };

export async function authenticateApiRequest(request: Request, needed: ApiScope): Promise<ApiPrincipal | Response> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token || !isApiKeyFormat(token)) return apiError("unauthorized", "Ange en giltig API-nyckel som Bearer.");
  if (isDemo()) return apiError("unauthorized", "API:et kräver en databas; demo-läget har ingen.");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, org_id, scopes, name, revoked_at")
    .eq("key_hash", hashApiKey(token))
    .maybeSingle();
  if (error) return apiError("internal", "Kunde inte kontrollera nyckeln.");
  if (!data || data.revoked_at) return apiError("unauthorized", "Nyckeln är okänd eller återkallad.");
  if (!hasScope(data.scopes as string[], needed)) return apiError("forbidden", `Nyckeln saknar behörigheten "${needed}".`);

  void supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { orgId: data.org_id as string, keyId: data.id as string, scopes: data.scopes as string[], name: data.name as string };
}

export function isPrincipal(x: ApiPrincipal | Response): x is ApiPrincipal {
  return !(x instanceof Response);
}
